import { Menu, Tray, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
import { iconStageFile, ICON_STAGES } from '../shared/icon';
import { resourcePath } from './resources';

export interface TrayHooks {
  showMainWindow(): void;
  toggleMainWindow(): void;
  pause(minutes: number): void;
  resume(): void;
  isPaused(): boolean;
  previewReminder(): void;
  requestQuit(): void;
}

/** 系统托盘：图标随下次提醒的接近程度逐渐变圆，菜单提供常用操作 */
export class TrayController {
  private tray: Tray;
  private stageImages: NativeImage[];
  private currentStage = -1;

  constructor(private hooks: TrayHooks) {
    this.tray = new Tray(resourcePath(iconStageFile(0)));
    this.stageImages = Array.from({ length: ICON_STAGES }, (_, stage) =>
      nativeImage.createFromPath(resourcePath(iconStageFile(stage))),
    );
    this.tray.setToolTip('安叩');
    this.tray.on('click', () => this.hooks.toggleMainWindow());
    this.refreshMenu();
  }

  /** 按档位切换托盘图标，0 最方正，最高档为正圆 */
  setStage(stage: number): void {
    if (stage === this.currentStage) {
      return;
    }
    this.currentStage = stage;
    const image = this.stageImages[stage];
    if (image !== undefined) {
      this.tray.setImage(image);
    }
  }

  setTooltip(text: string): void {
    this.tray.setToolTip(text);
  }

  refreshMenu(): void {
    const paused = this.hooks.isPaused();
    const menu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => this.hooks.showMainWindow() },
      { type: 'separator' },
      paused
        ? { label: '恢复提醒', click: () => this.hooks.resume() }
        : { label: '暂停提醒 30 分钟', click: () => this.hooks.pause(30) },
      { label: '立即提醒一次', click: () => this.hooks.previewReminder() },
      { type: 'separator' },
      { label: '退出安叩', click: () => this.hooks.requestQuit() },
    ]);
    this.tray.setContextMenu(menu);
  }

  destroy(): void {
    this.tray.destroy();
  }
}
