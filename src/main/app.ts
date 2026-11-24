import { BrowserWindow, app, globalShortcut, powerMonitor, screen } from 'electron';
import type { AppInfo, AppState, NextReminder, OverlayAction, OverlayPayload, ReminderItem, Settings } from '../shared/types';
import { normalizeSettings } from '../shared/settings';
import { ICON_PROXIMITY_WINDOW_MS, iconStageFile, iconStageForProximity } from '../shared/icon';
import { SettingsStore } from './store';
import { StatsStore } from './stats';
import { Scheduler } from './scheduler';
import { ReminderOverlay } from './overlay';
import { TrayController } from './tray';
import { DesktopPet } from './deskpet';
import { FullscreenWatcher } from './fullscreen';
import { QuickPanel } from './panel';
import { createMainWindow } from './windows';
import { resourcePath } from './resources';

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 应用主控：串起设置、调度、弹窗、桌面宠物、托盘与主窗口 */
export class AppController {
  readonly store: SettingsStore;
  readonly scheduler: Scheduler;
  readonly overlay: ReminderOverlay;
  readonly stats: StatsStore;
  private tray: TrayController | null = null;
  private pet: DesktopPet | null = null;
  private panel: QuickPanel | null = null;
  private fullscreen: FullscreenWatcher | null = null;
  private mainWindow: BrowserWindow | null = null;
  private lastReminder: { name: string; glyph: ReminderItem['glyph']; at: number } | null = null;
  private previewedItemId: string | null = null;
  // 正在计时活动的剩余秒数，提醒窗口的渲染进程每秒上报
  private activityRemaining: number | null = null;
  private forcedStops = 0;
  private quitting = false;

  constructor() {
    this.store = new SettingsStore(app.getPath('userData'));
    this.stats = new StatsStore(app.getPath('userData'));
    this.scheduler = new Scheduler();
    this.overlay = new ReminderOverlay({
      getSettings: () => this.store.get(),
      onComplete: (item) => {
        this.stats.record(item);
        // 手动弹出的提醒按已完成处理：间隔从当前时间重新起算
        if (item.id === this.previewedItemId) {
          this.previewedItemId = null;
          this.scheduler.completeItem(item.id);
        }
        this.broadcastState();
      },
      onSnooze: (itemId, minutes) => {
        if (itemId === this.previewedItemId) {
          this.previewedItemId = null;
        }
        this.scheduler.snooze(itemId, minutes);
      },
      onForceStop: (itemId) => {
        if (itemId === this.previewedItemId) {
          this.previewedItemId = null;
        }
        this.forcedStops += 1;
        this.broadcastState();
      },
      onDismiss: () => this.broadcastState(),
      onDragged: (offset) => {
        this.store.save({ ...this.store.get(), overlayOffset: offset });
        this.broadcastState();
      },
    });
    this.scheduler.onDue = (item) => this.presentReminder(item);
    this.scheduler.onState = () => this.broadcastState();
  }

  start(): void {
    this.scheduler.applySettings(this.store.get());
    this.scheduler.start();
    // 屏幕锁定（或合盖休眠）时暂停调度，解锁后重新计时
    powerMonitor.on('lock-screen', () => this.onScreenLock());
    powerMonitor.on('unlock-screen', () => this.onScreenUnlock());
    powerMonitor.on('suspend', () => this.onScreenLock());
    powerMonitor.on('resume', () => this.onScreenUnlock());
    this.applyAutoLaunch(this.store.get().autoLaunch);
    this.tray = new TrayController({
      showMainWindow: () => this.showMainWindow(),
      toggleMainWindow: () => this.toggleMainWindow(),
      pause: (minutes) => {
        this.scheduler.pause(minutes);
        this.tray?.refreshMenu();
      },
      resume: () => {
        this.scheduler.resume();
        this.tray?.refreshMenu();
      },
      isPaused: () => this.scheduler.isPaused(),
      previewReminder: () => this.previewReminder(),
      requestQuit: () => this.requestQuit(),
    });
    this.createMainWindow();
    this.applyDesktopPet(this.store.get().showFloatingBall);
    // 全屏应用（游戏、放映）避让：鼠标所在显示器全屏时冻结调度，宠物与弹窗收起
    this.fullscreen = new FullscreenWatcher();
    this.fullscreen.onSample = () => this.onFullscreenSample();
    this.fullscreen.start();
    // 全局快捷键：主窗口收起时也能立即弹一次提醒；被其他程序占用时该功能停用
    globalShortcut.register('Control+Alt+R', () => this.previewReminder());
  }

  private createMainWindow(): void {
    if (this.mainWindow !== null) {
      return;
    }
    const win = createMainWindow({ startMinimized: this.store.get().startMinimized });
    win.on('close', (event) => {
      if (this.quitting) {
        return;
      }
      if (this.overlay.hasActiveStrongReminder && !this.overlay.isSuppressed()) {
        event.preventDefault();
        this.overlay.presentForceFocus();
        return;
      }
      if (this.store.get().closeToTray) {
        event.preventDefault();
        win.hide();
        return;
      }
      this.quitting = true;
      app.quit();
    });
    win.on('closed', () => {
      this.mainWindow = null;
    });
    this.mainWindow = win;
  }

  showMainWindow(): void {
    this.createMainWindow();
    if (this.mainWindow === null) {
      return;
    }
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private toggleMainWindow(): void {
    if (this.mainWindow !== null && this.mainWindow.isVisible()) {
      this.mainWindow.hide();
      return;
    }
    this.showMainWindow();
  }

  /** 记录一次响起的提醒，用于桌面宠物展示最近提醒时间 */
  private presentReminder(item: ReminderItem): void {
    this.lastReminder = { name: item.name, glyph: item.glyph, at: Date.now() };
    this.broadcastState();
    this.overlay.present(item);
  }

  /** 立刻弹一次提醒，用于确认提醒效果；完成后按已完成重排间隔 */
  previewReminder(): void {
    if (this.scheduler.isScreenLocked()) {
      return;
    }
    // 前台有全屏应用时不弹，避免打断游戏或放映
    if (this.fullscreen?.isCursorDisplayFullscreen()) {
      return;
    }
    // 弹「下一次提醒」卡片上展示的那一项：卡片写什么，点击就弹什么
    const item = this.leadingItem();
    if (item === undefined) {
      return;
    }
    this.previewedItemId = item.id;
    this.presentReminder(item);
  }

  /** 预览「接下来的提醒」列表里指定的一项 */
  previewItem(itemId: string): void {
    if (this.scheduler.isScreenLocked()) {
      return;
    }
    if (this.fullscreen?.isCursorDisplayFullscreen()) {
      return;
    }
    const item = this.store.get().items.find((candidate) => candidate.id === itemId && candidate.enabled);
    if (item === undefined) {
      return;
    }
    this.previewedItemId = item.id;
    this.presentReminder(item);
  }

  /** 启用项中到期最早的一项，即「下一次提醒」卡片展示的项目 */
  private leadingItem(): ReminderItem | undefined {
    const nextDue = this.scheduler.getState().nextDue;
    let leader: ReminderItem | undefined;
    let leaderDue = Number.POSITIVE_INFINITY;
    for (const item of this.store.get().items) {
      if (!item.enabled) {
        continue;
      }
      const due = nextDue[item.id];
      if (due === undefined) {
        continue;
      }
      if (due < leaderDue) {
        leader = item;
        leaderDue = due;
      }
    }
    return leader;
  }

  /** 屏幕锁定：冻结调度并收掉正在展示的提醒（不记完成），人不在屏幕前，提醒留不住也等不起 */
  private onScreenLock(): void {
    if (this.scheduler.isScreenLocked()) {
      return;
    }
    console.log('[app] screen locked, freezing scheduler');
    this.scheduler.setScreenLocked(true);
    this.overlay.closeAll();
    this.previewedItemId = null;
    this.activityRemaining = null;
    this.tray?.refreshMenu();
    this.broadcastState();
  }

  /** 屏幕解锁：全部提醒项从解锁时刻重新计一个完整间隔，避免积压的提醒集中弹出 */
  private onScreenUnlock(): void {
    if (!this.scheduler.isScreenLocked()) {
      return;
    }
    console.log('[app] screen unlocked, rescheduling from now');
    this.scheduler.setScreenLocked(false);
    this.tray?.refreshMenu();
    this.broadcastState();
  }

  /** 全屏侦测每轮采样后同步避让状态 */
  private onFullscreenSample(): void {
    const watcher = this.fullscreen;
    if (watcher === null) {
      return;
    }
    // 前台是锁屏界面：锁定状态以它为准（覆盖进程启动时屏幕已锁定的场景），
    // 期间不套用全屏避让，解锁后调度随之恢复
    if (watcher.isLockScreen()) {
      if (!this.scheduler.isScreenLocked()) {
        this.onScreenLock();
      }
      return;
    }
    if (this.scheduler.isScreenLocked()) {
      this.onScreenUnlock();
    }
    this.scheduler.setFullscreen(watcher.isCursorDisplayFullscreen());
    this.syncFullscreenSuppression();
    this.tray?.refreshMenu();
    this.broadcastState();
  }

  /** 收起落在全屏显示器上的弹窗与桌面宠物，离开全屏后各自恢复 */
  private syncFullscreenSuppression(): void {
    const watcher = this.fullscreen;
    if (watcher === null) {
      return;
    }
    const overlayDisplayId = this.displayOf(this.overlay.window);
    if (overlayDisplayId !== null) {
      this.overlay.setSuppressed(watcher.isDisplayFullscreen(overlayDisplayId));
    }
    const petDisplayId = this.pet === null ? null : this.displayOf(this.pet.win);
    if (petDisplayId !== null) {
      this.pet?.setSuppressed(watcher.isDisplayFullscreen(petDisplayId));
      if (watcher.isDisplayFullscreen(petDisplayId)) {
        this.panel?.hide();
      }
    }
  }

  /** 窗口中心所在的显示器，窗口不存在时返回 null */
  private displayOf(win: BrowserWindow | null): number | null {
    if (win === null || win.isDestroyed()) {
      return null;
    }
    const bounds = win.getBounds();
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    return screen.getDisplayNearestPoint(center).id;
  }

  /** 延后当前最早到期的提醒项 */
  snoozeNext(): void {
    this.previewedItemId = null;
    this.scheduler.snoozeNext(this.store.get().snoozeMinutes);
    this.broadcastState();
  }

  /** 所有提醒项从当前时间重新起算 */
  resetTimers(): void {
    this.previewedItemId = null;
    this.scheduler.resetTimers();
    this.broadcastState();
  }

  pause(minutes: number): void {
    this.scheduler.pause(minutes);
    this.tray?.refreshMenu();
    this.broadcastState();
  }

  resume(): void {
    this.scheduler.resume();
    this.tray?.refreshMenu();
    this.broadcastState();
  }

  updateSettings(next: Settings): Settings {
    // 弹窗偏移量由主进程掌握：拖动弹窗会改它，设置页保存其它内容时不能把它抹掉
    const merged: Settings = { ...next, overlayOffset: this.store.get().overlayOffset };
    const normalized = this.store.save(normalizeSettings(merged));
    this.scheduler.applySettings(normalized);
    this.applyAutoLaunch(normalized.autoLaunch);
    this.applyDesktopPet(normalized.showFloatingBall);
    this.broadcastState();
    this.tray?.refreshMenu();
    return normalized;
  }

  /** 弹窗回到配置的位置，取消拖动留下的偏移 */
  resetOverlayPosition(): void {
    this.store.save({ ...this.store.get(), overlayOffset: null });
    this.overlay.resetPosition();
    this.broadcastState();
  }

  resetSettings(): Settings {
    const defaults = this.store.reset();
    this.scheduler.applySettings(defaults);
    this.applyAutoLaunch(defaults.autoLaunch);
    this.applyDesktopPet(defaults.showFloatingBall);
    this.broadcastState();
    this.tray?.refreshMenu();
    return defaults;
  }

  private applyDesktopPet(enabled: boolean): void {
    if (enabled && this.pet === null) {
      if (this.panel === null) {
        this.panel = new QuickPanel({
          previewReminder: () => this.previewReminder(),
          snoozeNext: () => this.snoozeNext(),
          pause: (minutes) => this.pause(minutes),
          resume: () => this.resume(),
          isPaused: () => this.scheduler.isPaused(),
          showMainWindow: () => this.showMainWindow(),
          requestQuit: () => this.requestQuit(),
        });
      }
      this.pet = new DesktopPet(
        app.getPath('userData'),
        {
          openMain: () => this.showMainWindow(),
          togglePause: () => {
            if (this.scheduler.isPaused()) {
              this.resume();
            } else {
              this.pause(30);
            }
          },
          isPaused: () => this.scheduler.isPaused(),
          isScreenLocked: () => this.scheduler.isScreenLocked(),
          hasActiveReminder: () => this.overlay.activeReminderId !== null,
          previewReminder: () => this.previewReminder(),
          resetTimers: () => this.resetTimers(),
          requestQuit: () => this.requestQuit(),
        },
        this.panel,
      );
    } else if (!enabled && this.pet !== null) {
      this.pet.destroy();
      this.pet = null;
      this.panel?.hide();
      this.panel = null;
    }
  }

  /** 桌面宠物左键呼出快捷面板，右键菜单与面板共用同一套动作 */
  handlePetPanel(mode: 'toggle' | 'close'): void {
    if (this.pet === null || this.panel === null) {
      return;
    }
    if (mode === 'close') {
      this.panel.hide();
      return;
    }
    const anchor = this.pet.revealForPanel();
    this.panel.toggle(anchor);
  }

  /** 桌面宠物被拖出屏幕后移回默认位置 */
  resetPetPosition(): void {
    this.pet?.resetPosition();
  }

  /** 桌面宠物的拖拽事件，坐标换算在 DesktopPet 内部完成 */
  handlePetDrag(phase: 'start' | 'move' | 'end', x: number, y: number): void {
    this.pet?.handleDrag(phase, x, y);
  }

  /** 提醒弹窗拖拽：坐标换算在 ReminderOverlay 内部完成 */
  handleOverlayDrag(phase: 'start' | 'move' | 'end', x: number, y: number): void {
    this.overlay.handleDrag(phase, x, y);
  }

  getState(): AppState {
    const scheduler = this.scheduler.getState();
    return {
      scheduler: { ...scheduler, activeReminderId: this.overlay.activeReminderId },
      forcedStops: this.forcedStops,
      lastReminder: this.lastReminder,
      nextReminder: this.nextReminder(scheduler),
      activeReminder: (() => {
        const active = this.overlay.activeItem;
        return active === null ? null : { name: active.name, glyph: active.glyph };
      })(),
      activeActivity: (() => {
        const active = this.overlay.activeItem;
        if (active === null || this.activityRemaining === null) {
          return null;
        }
        return { glyph: active.glyph, remainingSeconds: this.activityRemaining };
      })(),
      stats: this.stats.get(),
      petType: this.store.get().petType,
      overlayOffset: this.store.get().overlayOffset,
      notice: this.store.notice,
    };
  }

  /** 最早到期且已启用的提醒项 */
  private nextReminder(scheduler: { nextDue: Record<string, number> }): NextReminder | null {
    let next: NextReminder | null = null;
    for (const item of this.store.get().items) {
      if (!item.enabled) {
        continue;
      }
      const due = scheduler.nextDue[item.id];
      if (due === undefined) {
        continue;
      }
      if (next === null || due < next.due) {
        next = {
          id: item.id,
          name: item.name,
          glyph: item.glyph,
          strength: item.strength,
          due,
          intervalMinutes: item.intervalMinutes,
        };
      }
    }
    return next;
  }

  getAppInfo(): AppInfo {
    return {
      version: app.getVersion(),
      settingsDir: app.getPath('userData'),
      platform: process.platform,
    };
  }

  handleOverlayAction(action: OverlayAction): void {
    this.overlay.handleAction(action);
  }

  /** 提醒窗口上报活动计时剩余秒数，桌面宠物据此做休息动作 */
  handleOverlayActivity(remainingSeconds: number): void {
    this.activityRemaining = remainingSeconds > 0 ? remainingSeconds : null;
    this.broadcastState();
  }

  getOverlayPayload(): OverlayPayload | null {
    return this.overlay.getPayload();
  }

  setAutoLaunch(enabled: boolean): void {
    this.applyAutoLaunch(enabled);
  }

  /** 强提醒进行中时不允许直接退出，退出请求会把提醒重新拉到前台；被全屏收起时直接放行 */
  requestQuit(): void {
    if (this.overlay.hasActiveStrongReminder && !this.overlay.isSuppressed()) {
      this.overlay.presentForceFocus();
      return;
    }
    this.quitting = true;
    app.quit();
  }

  prepareQuit(): void {
    this.quitting = true;
    this.overlay.setQuitting();
    this.scheduler.stop();
    this.fullscreen?.destroy();
    this.fullscreen = null;
    globalShortcut.unregisterAll();
    this.pet?.destroy();
    this.pet = null;
    this.panel?.hide();
    this.panel = null;
    this.tray?.destroy();
  }

  private applyAutoLaunch(enabled: boolean): void {
    // 开发模式下登记的是 electron 可执行文件，开机自启没有意义
    if (!app.isPackaged) {
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
  }

  private broadcastState(): void {
    const state = this.getState();
    if (this.mainWindow !== null && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('app:state', state);
    }
    this.pet?.pushState(state);
    this.applyReminderVisuals(state);
    this.tray?.setTooltip(this.tooltipText(state));
    this.tray?.refreshMenu();
  }

  /** 图标与托盘提示随提醒状态变化：提醒进行中是正圆，越接近提醒时间越圆 */
  private applyReminderVisuals(state: AppState): void {
    const stage = iconStageForProximity(this.reminderProximity(state));
    this.tray?.setStage(stage);
    if (this.mainWindow !== null && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setIcon(resourcePath(iconStageFile(stage)));
    }
  }

  /** 0 表示离提醒还早，1 表示提醒正在进行 */
  private reminderProximity(state: AppState): number {
    if (state.scheduler.activeReminderId !== null) {
      return 1;
    }
    let earliest: number | null = null;
    for (const due of Object.values(state.scheduler.nextDue)) {
      if (earliest === null || due < earliest) {
        earliest = due;
      }
    }
    if (earliest === null) {
      return 0;
    }
    const remaining = earliest - state.scheduler.now;
    if (remaining <= 0) {
      return 1;
    }
    if (remaining >= ICON_PROXIMITY_WINDOW_MS) {
      return 0;
    }
    return 1 - remaining / ICON_PROXIMITY_WINDOW_MS;
  }

  private tooltipText(state: AppState): string {
    if (state.scheduler.activeReminderId !== null) {
      return '安叩 · 提醒进行中';
    }
    if (state.scheduler.screenLocked) {
      return '安叩 · 屏幕锁定中，提醒已暂停';
    }
    if (state.scheduler.fullscreenActive) {
      return '安叩 · 全屏应用中，提醒暂缓';
    }
    const pausedUntil = state.scheduler.pausedUntil;
    if (pausedUntil !== null && pausedUntil > state.scheduler.now) {
      return `安叩 · 暂停中，${formatClock(pausedUntil)} 恢复`;
    }
    if (state.scheduler.quietUntil !== null) {
      return '安叩 · 免打扰中';
    }
    let earliest: number | null = null;
    let name = '';
    for (const item of this.store.get().items) {
      const due = state.scheduler.nextDue[item.id];
      if (due === undefined) {
        continue;
      }
      if (earliest === null || due < earliest) {
        earliest = due;
        name = item.name;
      }
    }
    if (earliest === null) {
      return '安叩 · 运行中';
    }
    return `安叩 · 下次提醒 ${formatClock(earliest)}（${name}）`;
  }
}
