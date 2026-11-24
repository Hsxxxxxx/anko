import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { OverlayAction, OverlayPayload, OverlayPosition, ReminderItem, Settings } from '../shared/types';
import { clampOverlayPosition, resolveOverlayPosition } from '../shared/position';

export interface OverlayHooks {
  getSettings(): Settings;
  onComplete(item: ReminderItem): void;
  onSnooze(itemId: string, minutes: number): void;
  onForceStop(itemId: string): void;
  onDismiss(): void;
  /** 用户拖动弹窗后的偏移量，null 表示拖回原位 */
  onDragged(offset: { dx: number; dy: number } | null): void;
}

const CARD_WIDTH = 380;
const CARD_HEIGHT = 230;
const CARD_MARGIN = 28;
const STRONG_WIDTH = 420;
const STRONG_HEIGHT = 330;

/**
 * 提醒弹窗。
 * 强提醒是置顶的白色小窗，无法用关闭按钮或 Alt+F4 关掉，
 * 只能通过界面上的操作结束；普通提醒是右下角的小卡片，到点自动消失。
 */
export class ReminderOverlay {
  private win: BrowserWindow | null = null;
  private current: ReminderItem | null = null;
  private payload: OverlayPayload | null = null;
  private queue: ReminderItem[] = [];
  // 只允许这一扇窗口走 close 流程，按窗口区分避免延迟触发的 closed 误伤新窗口
  private closeAllowedWin: BrowserWindow | null = null;
  private mode: 'strong' | 'normal' | null = null;
  private quitting = false;
  private hooks: OverlayHooks;
  // 弹窗落在有全屏应用的显示器上时被收起，提醒状态保留
  private suppressed = false;
  // 弹窗按设置算出的基准位置，用户拖动后的偏移量单独记录
  private anchor: { x: number; y: number } | null = null;
  private dragStart: { x: number; y: number; winX: number; winY: number } | null = null;

  constructor(hooks: OverlayHooks) {
    this.hooks = hooks;
  }

  /** 应用退出时不再重建强提醒窗口 */
  setQuitting(): void {
    this.quitting = true;
  }

  /** 当前是否有正在展示的强提醒 */
  get hasActiveStrongReminder(): boolean {
    return this.win !== null && this.current !== null && this.current.strength === 'strong';
  }

  /** 当前展示的提醒项 id */
  get activeReminderId(): string | null {
    return this.current?.id ?? null;
  }

  /** 当前正在展示的提醒项 */
  get activeItem(): ReminderItem | null {
    return this.current;
  }

  /** 正在展示的弹窗窗口，供外部判断它落在哪个显示器上 */
  get window(): BrowserWindow | null {
    return this.win;
  }

  /** 弹窗是否因全屏应用被收起 */
  isSuppressed(): boolean {
    return this.suppressed;
  }

  /** 全屏应用开始时收起弹窗（保留提醒状态与队列），结束后恢复展示 */
  setSuppressed(suppressed: boolean): void {
    if (suppressed === this.suppressed) {
      return;
    }
    this.suppressed = suppressed;
    if (this.win === null || this.win.isDestroyed()) {
      return;
    }
    if (suppressed) {
      console.log(`[overlay] suppressed by fullscreen current=${this.current?.id ?? 'null'}`);
      this.win.webContents.send('overlay:suppressed', true);
      this.win.hide();
    } else if (this.current !== null) {
      console.log(`[overlay] restored after fullscreen current=${this.current.id}`);
      this.win.webContents.send('overlay:suppressed', false);
      this.applyFocus();
    }
  }

  present(item: ReminderItem): void {
    this.queue.push(item);
    console.log(`[overlay] present ${item.id}(${item.strength}) win=${this.win !== null} queue=${this.queue.length}`);
    if (this.win === null) {
      this.presentNext();
    }
  }

  getPayload(): OverlayPayload | null {
    return this.payload;
  }

  /** 把正在展示的提醒重新拉到前台，被全屏收起时不拉起以免打扰 */
  presentForceFocus(): void {
    if (this.suppressed) {
      return;
    }
    this.applyFocus();
  }

  handleAction(action: OverlayAction): void {
    const item = this.current;
    if (item === null) {
      return;
    }
    console.log(`[overlay] action ${action} current=${item.id}`);
    // 先收尾当前提醒再走钩子，钩子里的状态广播才能读到已清空的展示状态
    this.finishCurrent();
    if (action === 'snooze') {
      this.hooks.onSnooze(item.id, this.hooks.getSettings().snoozeMinutes);
    } else if (action === 'force-confirmed') {
      this.hooks.onForceStop(item.id);
    } else if (action === 'complete') {
      this.hooks.onComplete(item);
    } else {
      this.hooks.onDismiss();
    }
  }

  private presentNext(): void {
    const item = this.queue.shift();
    if (item === undefined) {
      this.payload = null;
      this.closeWindow();
      return;
    }
    this.current = item;
    const settings = this.hooks.getSettings();
    const strong = item.strength === 'strong';
    const mode: 'strong' | 'normal' = strong ? 'strong' : 'normal';
    this.payload = {
      item,
      strong,
      dismissSeconds: settings.normalDismissSeconds,
      snoozeMinutes: settings.snoozeMinutes,
      soundEnabled: settings.soundEnabled,
      autoStart: settings.autoStart,
      queueLength: this.queue.length,
      petType: settings.petType,
    };

    if (this.win === null) {
      console.log(`[overlay] create ${mode}`);
      this.createWindow(strong, settings.overlayPosition);
      return;
    }
    if (this.mode !== mode) {
      console.log(`[overlay] recreate ${this.mode} -> ${mode}`);
      this.recreateWindow(strong, settings.overlayPosition);
      return;
    }
    console.log(`[overlay] push payload to existing ${mode} window`);
    this.win.webContents.send('overlay:payload', this.payload);
    this.applyFocus();
  }

  /** 强弱模式不同的提醒需要换一扇窗口，普通卡片与强提醒小窗的样式不同 */
  private recreateWindow(strong: boolean, position: OverlayPosition): void {
    const previous = this.win;
    this.win = null;
    if (previous !== null) {
      previous.destroy();
    }
    this.createWindow(strong, position);
  }

  private createWindow(strong: boolean, position: OverlayPosition): void {
    this.mode = strong ? 'strong' : 'normal';
    const width = strong ? STRONG_WIDTH : CARD_WIDTH;
    const height = strong ? STRONG_HEIGHT : CARD_HEIGHT;
    // 弹窗跟随鼠标所在的显示器，多屏时不出现在用户看不到的主屏上
    const target = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const win = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.win = win;

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    win.on('close', (event) => {
      if (this.closeAllowedWin !== win) {
        event.preventDefault();
      }
    });

    win.webContents.on('before-input-event', (event, input) => {
      const blocked =
        input.key === 'F4' ||
        input.key === 'Escape' ||
        (input.control && (input.key === 'w' || input.key === 'q'));
      if (blocked) {
        event.preventDefault();
      }
    });

    win.on('closed', () => {
      console.log(
        `[overlay] closed approved=${this.closeAllowedWin === win} tracked=${this.win === win} current=${this.current?.id ?? 'null'} queue=${this.queue.length}`,
      );
      if (this.quitting) {
        return;
      }
      // 主进程主动关闭的窗口，安静收尾
      if (this.closeAllowedWin === win) {
        this.closeAllowedWin = null;
        return;
      }
      // 这扇窗口已被新窗口取代，延迟送达的 closed 不再触碰当前状态
      if (this.win !== win) {
        return;
      }
      this.win = null;
      this.mode = null;
      // 渲染进程或异常销毁了窗口，强提醒不允许就此消失，立即重建一扇。
      if (this.current !== null && this.current.strength === 'strong') {
        this.createWindow(true, this.hooks.getSettings().overlayPosition);
        return;
      }
      if (this.queue.length > 0) {
        this.presentNext();
      }
    });

    void win.loadFile(path.join(__dirname, '../renderer/overlay.html'));
    win.once('ready-to-show', () => {
      const area = target.workArea;
      const anchor = resolveOverlayPosition(area, width, height, strong, position);
      this.anchor = anchor;
      const offset = this.hooks.getSettings().overlayOffset;
      const x = anchor.x + (offset?.dx ?? 0);
      const y = anchor.y + (offset?.dy ?? 0);
      win.setBounds({ x, y, width, height });
      console.log(`[overlay] bounds ${this.mode} x=${x} y=${y} area=${area.x},${area.y},${area.width},${area.height}`);
      if (this.suppressed) {
        win.webContents.send('overlay:suppressed', true);
        win.hide();
        return;
      }
      this.applyFocus();
    });
  }

  /** 渲染进程的拖拽事件：按住标题区拖动弹窗，松开后记住偏移量 */
  handleDrag(phase: 'start' | 'move' | 'end', x: number, y: number): void {
    if (this.win === null || this.win.isDestroyed()) {
      return;
    }
    if (phase === 'start') {
      const bounds = this.win.getBounds();
      this.dragStart = { x, y, winX: bounds.x, winY: bounds.y };
      return;
    }
    if (this.dragStart === null) {
      return;
    }
    if (phase === 'move') {
      const area = screen.getDisplayNearestPoint(this.win.getBounds()).workArea;
      const moved = clampOverlayPosition(
        this.dragStart.winX + (x - this.dragStart.x),
        this.dragStart.winY + (y - this.dragStart.y),
        area,
      );
      this.win.setPosition(moved.x, moved.y);
      return;
    }
    const bounds = this.win.getBounds();
    const anchor = this.anchor;
    this.dragStart = null;
    if (anchor === null) {
      return;
    }
    const dx = bounds.x - anchor.x;
    const dy = bounds.y - anchor.y;
    this.hooks.onDragged(dx === 0 && dy === 0 ? null : { dx, dy });
  }

  /** 弹窗回到配置的位置，取消拖动留下的偏移 */
  resetPosition(): void {
    if (this.win === null || this.win.isDestroyed() || this.anchor === null) {
      return;
    }
    this.win.setPosition(this.anchor.x, this.anchor.y);
    console.log(`[overlay] reset position x=${this.anchor.x} y=${this.anchor.y}`);
  }

  private applyFocus(): void {
    if (this.win === null) {
      return;
    }
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.show();
    this.win.focus();
  }

  private finishCurrent(): void {
    this.current = null;
    this.payload = null;
    if (this.queue.length > 0) {
      this.presentNext();
    } else {
      this.closeWindow();
    }
  }

  /** 屏幕锁定等场景：收掉正在展示的提醒与队列，不记完成，解锁后由调度器重新计时 */
  closeAll(): void {
    if (this.win === null && this.queue.length === 0) {
      return;
    }
    console.log(`[overlay] closeAll current=${this.current?.id ?? 'null'} queue=${this.queue.length}`);
    this.current = null;
    this.payload = null;
    this.queue = [];
    this.closeWindow();
  }

  private closeWindow(): void {
    if (this.win === null) {
      return;
    }
    console.log('[overlay] closeWindow');
    this.closeAllowedWin = this.win;
    this.win.close();
    this.win = null;
    this.mode = null;
    this.anchor = null;
    this.suppressed = false;
  }
}
