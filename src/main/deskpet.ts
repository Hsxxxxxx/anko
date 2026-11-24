import { BrowserWindow, Menu, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppState } from '../shared/types';
import type { QuickPanel } from './panel';

const PET_W = 120;
const PET_H = 140;
const PET_CHAR = 84;
const PET_MARGIN = 28;
// 普通提醒卡片停在右下角，桌面宠物默认悬在它上方，两者不互相遮挡
const CARD_CLEARANCE = 280 + 28 + 16;
// 触发收纳的边距、展开后收起等待、展开触发区域的周边边距
const SNAP_THRESHOLD = 16;
const HIDE_DELAY_MS = 800;
const DOCK_ZONE_MARGIN = 8;
// 收起后形象向边缘挪 60 像素，屏幕上露出的半张脸宽 60-(120-84)/2=42 像素、高 84 像素
const SLIVER_W = 60 - (PET_W - PET_CHAR) / 2;
const SLIVER_TOP = PET_H - 2 - PET_CHAR;
const DOCK_POLL_MS = 150;
// 闲逛：每步位移、步与步的间隔、随机检查周期
const STROLL_STEP = 14;
const STROLL_STEP_MS = 230;
const STROLL_CHECK_MS = 5000;
const STROLL_COOLDOWN_MS = 18_000;

interface PetBounds {
  x: number;
  y: number;
}

export interface PetHooks {
  openMain(): void;
  togglePause(): void;
  isPaused(): boolean;
  isScreenLocked(): boolean;
  hasActiveReminder(): boolean;
  previewReminder(): void;
  resetTimers(): void;
  requestQuit(): void;
}

interface DockState {
  side: 'left' | 'right';
  outX: number;
  outY: number;
}

/** 桌面宠物：置顶小窗里的一只小伙伴，可拖动、贴边收纳，偶尔在屏幕上闲逛 */
export class DesktopPet {
  readonly win: BrowserWindow;
  private boundsFile: string;
  private lastBounds: PetBounds;
  private lastMovedAt = 0;
  private dirty = false;
  private persistTimer: NodeJS.Timeout;
  private dockTimer: NodeJS.Timeout;
  private strollTimer: NodeJS.Timeout | null = null;
  private strollRunning = false;
  private lastStrollAt = 0;
  private dragStart: { x: number; y: number; winX: number; winY: number } | null = null;
  private dock: DockState | null = null;
  private dockedHidden = false;
  private zoneOccupied = false;
  private hideTimer: NodeJS.Timeout | null = null;
  // 所在显示器有全屏应用时窗口被隐藏
  private suppressed = false;

  constructor(userDataDir: string, private hooks: PetHooks, private panel: QuickPanel) {
    this.boundsFile = path.join(userDataDir, 'pet.json');
    this.win = new BrowserWindow({
      width: PET_W,
      height: PET_H,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // 默认落在鼠标所在的显示器，多屏时宠物不出现在用户看不到的主屏上
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    this.lastBounds = this.loadBounds() ?? {
      x: area.x + area.width - PET_W - PET_MARGIN,
      y: area.y + area.height - PET_H - PET_MARGIN - CARD_CLEARANCE,
    };
    this.win.setBounds({
      x: this.lastBounds.x,
      y: this.lastBounds.y,
      width: PET_W,
      height: PET_H,
    });

    void this.win.loadFile(path.join(__dirname, '../renderer/pet.html'));
    this.win.webContents.on('did-finish-load', () => this.notifyDock());
    this.win.once('ready-to-show', () => {
      this.ensureOnScreen();
      this.win.show();
      this.tryDock();
    });
    // 拔掉显示器后宠物可能停在已不存在的屏幕上，挪回可见区域
    screen.on('display-removed', () => {
      if (!this.win.isDestroyed() && this.win.isVisible()) {
        this.ensureOnScreen();
      }
    });
    this.win.webContents.on('context-menu', (_event, params) => this.popupMenu(params.x, params.y));
    this.persistTimer = setInterval(() => this.persistWhenStable(), 1000);
    this.dockTimer = setInterval(() => this.pollDock(), DOCK_POLL_MS);
    this.scheduleStroll();
  }

  /** 把最新状态推给桌面宠物与快捷面板；悬停提示由渲染进程的 title 属性提供 */
  pushState(state: AppState): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('app:state', state);
    }
    this.panel.pushState(state);
  }

  /** 渲染进程的拖拽事件：start/move/end 带屏幕坐标，位移换算成窗口位置 */
  handleDrag(phase: 'start' | 'move' | 'end', x: number, y: number): void {
    if (this.win.isDestroyed()) {
      return;
    }
    if (phase === 'start') {
      const bounds = this.win.getBounds();
      this.dragStart = { x, y, winX: bounds.x, winY: bounds.y };
      this.cancelDock();
      this.panel.markInteraction();
      return;
    }
    if (this.dragStart === null) {
      return;
    }
    if (phase === 'move') {
      this.win.setPosition(this.dragStart.winX + (x - this.dragStart.x), this.dragStart.winY + (y - this.dragStart.y));
      return;
    }
    this.dragStart = null;
    this.tryDock();
  }

  /** 快捷面板弹出前的锚点：收纳状态下先展开形象，返回完全可见的位置 */
  revealForPanel(): { x: number; y: number } {
    if (this.dock !== null && this.dockedHidden) {
      this.reveal();
    }
    if (this.dock !== null) {
      return { x: this.dock.outX, y: this.dock.outY };
    }
    const bounds = this.win.getBounds();
    return { x: bounds.x, y: bounds.y };
  }

  /** 移回鼠标所在显示器的默认位置，用于桌面宠物被拖出屏幕后找回 */
  resetPosition(): void {
    if (this.win.isDestroyed()) {
      return;
    }
    this.cancelDock();
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const x = area.x + area.width - PET_W - PET_MARGIN;
    const y = area.y + area.height - PET_H - PET_MARGIN - CARD_CLEARANCE;
    this.win.setPosition(x, y);
    this.lastBounds = { x, y };
    this.lastMovedAt = Date.now();
    this.dirty = true;
  }

  /** 所在显示器进入全屏应用时把窗口藏起来，结束后原样放回 */
  setSuppressed(suppressed: boolean): void {
    if (suppressed === this.suppressed) {
      return;
    }
    this.suppressed = suppressed;
    if (this.win.isDestroyed()) {
      return;
    }
    if (suppressed) {
      this.win.hide();
    } else {
      this.win.show();
    }
  }

  /** 保存的位置可能落在已拔掉的显示器上，挪回鼠标所在显示器的默认位置 */
  private ensureOnScreen(): void {
    const bounds = this.win.getBounds();
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return (
        bounds.x < area.x + area.width &&
        bounds.x + bounds.width > area.x &&
        bounds.y < area.y + area.height &&
        bounds.y + bounds.height > area.y
      );
    });
    if (visible) {
      return;
    }
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const x = area.x + area.width - PET_W - PET_MARGIN;
    const y = area.y + area.height - PET_H - PET_MARGIN - CARD_CLEARANCE;
    this.win.setPosition(x, y);
    this.lastBounds = { x, y };
    this.lastMovedAt = Date.now();
    this.dirty = true;
  }

  destroy(): void {
    clearInterval(this.persistTimer);
    clearInterval(this.dockTimer);
    this.stopStrollTimer();
    this.stopHideTimer();
    if (!this.win.isDestroyed()) {
      this.win.destroy();
    }
  }

  private popupMenu(x: number, y: number): void {
    const menu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => this.hooks.openMain() },
      { type: 'separator' },
      this.hooks.isPaused()
        ? { label: '恢复提醒', click: () => this.hooks.togglePause() }
        : { label: '暂停提醒 30 分钟', click: () => this.hooks.togglePause() },
      { label: '立即提醒一次', click: () => this.hooks.previewReminder() },
      { label: '重置计时', click: () => this.hooks.resetTimers() },
      { type: 'separator' },
      { label: '退出安叩', click: () => this.hooks.requestQuit() },
    ]);
    menu.popup({ window: this.win, x, y });
  }

  /** 每隔几秒检查一次：条件合适时朝随机方向走几步，模拟在桌面上闲逛 */
  private scheduleStroll(): void {
    if (this.strollTimer !== null) {
      return;
    }
    this.strollTimer = setInterval(() => {
      if (this.win.isDestroyed()) {
        this.stopStrollTimer();
        return;
      }
      const now = Date.now();
      // 贴边收纳期间（含展开状态）窗口位置被边缘占用，闲逛会把窗口带离边缘，收起后形象就悬在半空
      const busy =
        this.strollRunning ||
        this.dragStart !== null ||
        this.dock !== null ||
        this.suppressed ||
        this.hooks.isScreenLocked() ||
        this.hooks.hasActiveReminder();
      if (busy || now - this.lastStrollAt < STROLL_COOLDOWN_MS) {
        return;
      }
      const direction = Math.random() < 0.5 ? -1 : 1;
      const steps = 2 + Math.floor(Math.random() * 3);
      const bounds = this.win.getBounds();
      const display = screen.getDisplayNearestPoint({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      });
      const area = display.workArea;
      const minX = area.x + 4;
      const maxX = area.x + area.width - PET_W - 4;
      if (bounds.x <= minX && direction === -1) {
        return;
      }
      if (bounds.x >= maxX && direction === 1) {
        return;
      }
      this.strollRunning = true;
      this.lastStrollAt = now;
      let remaining = steps;
      const stepOnce = () => {
        if (this.win.isDestroyed() || remaining <= 0) {
          this.strollRunning = false;
          return;
        }
        const current = this.win.getBounds();
        const nextX = Math.max(minX, Math.min(maxX, current.x + direction * STROLL_STEP));
        if (nextX === current.x) {
          this.strollRunning = false;
          this.win.webContents.send('app:pet-idle');
          return;
        }
        this.win.setPosition(nextX, current.y);
        this.win.webContents.send('app:pet-step', { dx: nextX - current.x });
        remaining -= 1;
        if (remaining > 0) {
          setTimeout(stepOnce, STROLL_STEP_MS);
        } else {
          setTimeout(() => {
            this.strollRunning = false;
            if (!this.win.isDestroyed()) {
              this.win.webContents.send('app:pet-idle');
            }
          }, STROLL_STEP_MS);
        }
      };
      setTimeout(stepOnce, 300);
    }, STROLL_CHECK_MS);
  }

  private stopStrollTimer(): void {
    if (this.strollTimer !== null) {
      clearInterval(this.strollTimer);
      this.strollTimer = null;
    }
  }

  /** 拖放结束后判断是否贴近屏幕边缘，是则贴边收纳 */
  private tryDock(): void {
    if (this.win.isDestroyed()) {
      return;
    }
    const bounds = this.win.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    });
    const area = display.workArea;
    const gapLeft = bounds.x - area.x;
    const gapRight = area.x + area.width - (bounds.x + bounds.width);
    let side: 'left' | 'right' | null = null;
    if (gapLeft <= SNAP_THRESHOLD && gapLeft <= gapRight) {
      side = 'left';
    } else if (gapRight <= SNAP_THRESHOLD && gapRight < gapLeft) {
      side = 'right';
    }
    if (side === null) {
      this.dock = null;
      this.dockedHidden = false;
      this.stopHideTimer();
      this.notifyDock();
      return;
    }
    this.dock = {
      side,
      outX: side === 'left' ? area.x + 2 : area.x + area.width - PET_W - 2,
      outY: bounds.y,
    };
    // 窗口停在屏幕边缘，形象在渲染进程里挪向边缘，屏幕上只留半张脸
    this.win.setPosition(this.dock.outX, this.dock.outY);
    this.dockedHidden = true;
    this.stopHideTimer();
    // 拖放刚结束时鼠标还停在边缘，先记下已占用，鼠标离开再回来才展开
    this.zoneOccupied = true;
    this.notifyDock();
  }

  /** 收纳状态告诉渲染进程：贴在哪一侧、是否已经收起 */
  private notifyDock(): void {
    if (this.win.isDestroyed()) {
      return;
    }
    this.win.webContents.send('app:pet-dock', {
      side: this.dock?.side ?? null,
      hidden: this.dockedHidden,
    });
  }

  private cancelDock(): void {
    this.dock = null;
    this.dockedHidden = false;
    this.zoneOccupied = false;
    this.stopHideTimer();
    this.notifyDock();
  }

  /** 贴边期间轮询鼠标：收起时鼠标要挪到露出的半张脸周边才展开，展开后鼠标在窗口范围内都不收起，离开后重新收起 */
  private pollDock(): void {
    if (this.win.isDestroyed() || this.dock === null || this.dragStart !== null || this.suppressed) {
      return;
    }
    const { outX, outY, side } = this.dock;
    const cursor = screen.getCursorScreenPoint();
    const m = DOCK_ZONE_MARGIN;
    const xMin = this.dockedHidden && side === 'right' ? outX + PET_W - SLIVER_W - m : outX - m;
    const xMax = this.dockedHidden && side === 'left' ? outX + SLIVER_W + m : outX + PET_W + m;
    const yMin = this.dockedHidden ? outY + SLIVER_TOP - m : outY - m;
    const yMax = outY + PET_H + m;
    const inZone = cursor.x >= xMin && cursor.x <= xMax && cursor.y >= yMin && cursor.y <= yMax;
    if (inZone) {
      this.stopHideTimer();
      if (this.dockedHidden && !this.zoneOccupied) {
        this.reveal();
      }
    } else {
      this.scheduleHide();
    }
    this.zoneOccupied = inZone;
  }

  /** 展开形象：贴边时把形象挪回窗口中央 */
  private reveal(): void {
    if (!this.dockedHidden) {
      return;
    }
    this.dockedHidden = false;
    this.stopHideTimer();
    this.notifyDock();
  }

  private scheduleHide(): void {
    if (this.hideTimer !== null) {
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.dock !== null && !this.dockedHidden && !this.win.isDestroyed()) {
        this.dockedHidden = true;
        this.notifyDock();
      }
    }, HIDE_DELAY_MS);
  }

  private stopHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private loadBounds(): PetBounds | null {
    try {
      const raw = JSON.parse(fs.readFileSync(this.boundsFile, 'utf8')) as Record<string, unknown>;
      if (typeof raw.x !== 'number' || typeof raw.y !== 'number' || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
        return null;
      }
      return { x: raw.x, y: raw.y };
    } catch {
      // 位置缓存损坏时回到默认位置，不影响主流程
      return null;
    }
  }

  private persistWhenStable(): void {
    if (this.win.isDestroyed()) {
      return;
    }
    // 收纳状态下记录的是滑出后的位置，下次启动按原位置贴边
    const bounds = this.win.getBounds();
    const logical = this.dock !== null ? { x: this.dock.outX, y: this.dock.outY } : { x: bounds.x, y: bounds.y };
    if (logical.x !== this.lastBounds.x || logical.y !== this.lastBounds.y) {
      this.lastBounds = logical;
      this.lastMovedAt = Date.now();
      this.dirty = true;
      return;
    }
    if (this.dirty && Date.now() - this.lastMovedAt >= 1500) {
      fs.writeFileSync(this.boundsFile, JSON.stringify(this.lastBounds), 'utf8');
      this.dirty = false;
    }
  }
}
