import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { AppState } from '../shared/types';

const PANEL_WIDTH = 232;
const PANEL_HEIGHT = 284;

export interface PanelHooks {
  previewReminder(): void;
  snoozeNext(): void;
  pause(minutes: number): void;
  resume(): void;
  isPaused(): boolean;
  showMainWindow(): void;
  requestQuit(): void;
}

/** 桌面宠物左键弹出的快捷面板，不打开主窗口就能处理高频操作 */
export class QuickPanel {
  private win: BrowserWindow | null = null;
  private hooks: PanelHooks;
  // 桌面宠物按下到抬起的窗口期内屏蔽失焦收起，保证单击能真正切换面板
  private interactionAt = 0;

  constructor(hooks: PanelHooks) {
    this.hooks = hooks;
  }

  /** 桌面宠物开始交互时调用 */
  markInteraction(): void {
    this.interactionAt = Date.now();
  }

  get visible(): boolean {
    return this.win !== null;
  }

  toggle(anchor: { x: number; y: number }): void {
    if (this.win !== null) {
      this.hide();
      return;
    }
    this.show(anchor);
  }

  hide(): void {
    if (this.win === null || this.win.isDestroyed()) {
      this.win = null;
      return;
    }
    this.win.destroy();
    this.win = null;
  }

  pushState(state: AppState): void {
    if (this.win !== null && !this.win.isDestroyed()) {
      this.win.webContents.send('app:state', state);
    }
  }

  handleAction(action: string): void {
    switch (action) {
      case 'preview':
        this.hooks.previewReminder();
        break;
      case 'snooze':
        this.hooks.snoozeNext();
        break;
      case 'pause':
        this.hooks.pause(30);
        break;
      case 'resume':
        this.hooks.resume();
        break;
      case 'show-main':
        this.hooks.showMainWindow();
        break;
      case 'quit':
        this.hooks.requestQuit();
        break;
      default:
        break;
    }
    this.hide();
  }

  private show(anchor: { x: number; y: number }): void {
    const display = screen.getDisplayNearestPoint(anchor);
    const area = display.workArea;
    const petW = 120;
    const petH = 140;
    // 优先出现在桌面宠物左侧，放不下再换到右侧
    let x = anchor.x - PANEL_WIDTH - 10;
    if (x < area.x + 8) {
      x = anchor.x + petW + 10;
    }
    let y = anchor.y + petH / 2 - PANEL_HEIGHT / 2;
    y = Math.max(area.y + 8, Math.min(y, area.y + area.height - PANEL_HEIGHT - 8));
    x = Math.max(area.x + 8, Math.min(x, area.x + area.width - PANEL_WIDTH - 8));

    const win = new BrowserWindow({
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.win = win;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.on('blur', () => {
      // 点去别处面板自动收起；从桌面宠物点过来的焦点切换除外
      if (this.win === win && Date.now() - this.interactionAt > 1500) {
        this.hide();
      }
    });
    win.webContents.on('did-finish-load', () => win.webContents.send('panel:ready'));
    void win.loadFile(path.join(__dirname, '../renderer/panel.html'));
    win.once('ready-to-show', () => win.show());
  }
}
