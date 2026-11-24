import type { AppInfo, AppState, OverlayAction, OverlayPayload, Settings } from './types';

/**
 * 渲染层可用的安叩能力。Windows 由 Electron preload 经 IPC 实现，
 * Android 由 src/android/bridge.ts 在 WebView 内实现，两边必须保持同一形状。
 */
export interface AnkoApi {
  /** 当前平台，界面据此隐藏平台专属功能 */
  platform: 'windows' | 'android';
  getSettings(): Promise<Settings>;
  saveSettings(next: Settings): Promise<Settings>;
  resetSettings(): Promise<Settings>;
  getState(): Promise<AppState>;
  getAppInfo(): Promise<AppInfo>;
  showMainWindow(): Promise<void>;
  previewReminder(): Promise<void>;
  previewItem(itemId: string): Promise<void>;
  pause(minutes: number): Promise<void>;
  resume(): Promise<void>;
  setAutoLaunch(enabled: boolean): Promise<void>;
  getOverlayPayload(): Promise<OverlayPayload | null>;
  sendOverlayAction(action: OverlayAction): void;
  sendOverlayActivity(remainingSeconds: number): void;
  sendOverlayDrag(phase: 'start' | 'move' | 'end', x: number, y: number): void;
  sendPetDrag(phase: 'start' | 'move' | 'end', x: number, y: number): void;
  togglePetPanel(): Promise<void>;
  closePetPanel(): Promise<void>;
  resetPetPosition(): Promise<void>;
  resetOverlayPosition(): Promise<void>;
  snoozeNext(): Promise<void>;
  resetTimers(): Promise<void>;
  quit(): Promise<void>;
  onState(handler: (state: AppState) => void): void;
  onPetMotion(handler: (step: { dx: number }) => void): void;
  onPetDock(handler: (dock: { side: 'left' | 'right' | null; hidden: boolean }) => void): void;
  /** 弹窗载荷变化；Android 下提醒结束会收到 null，Windows 下只发载荷 */
  onOverlayPayload(handler: (payload: OverlayPayload | null) => void): void;
  onOverlaySuppressed(handler: (suppressed: boolean) => void): void;
}
