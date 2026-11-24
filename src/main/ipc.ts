import { ipcMain } from 'electron';
import type { OverlayAction, Settings } from '../shared/types';
import type { AppController } from './app';

/** 注册渲染进程可以调用的接口 */
export function registerIpc(controller: AppController): void {
  ipcMain.handle('settings:get', () => controller.store.get());
  ipcMain.handle('settings:save', (_event, next: Settings) => controller.updateSettings(next));
  ipcMain.handle('settings:reset', () => controller.resetSettings());
  ipcMain.handle('app:state', () => controller.getState());
  ipcMain.handle('app:info', () => controller.getAppInfo());
  ipcMain.handle('app:show-main', () => controller.showMainWindow());
  ipcMain.handle('app:preview-reminder', () => controller.previewReminder());
  ipcMain.handle('app:preview-item', (_event, itemId: string) => controller.previewItem(itemId));
  ipcMain.handle('app:pause', (_event, minutes: number) => controller.pause(minutes));
  ipcMain.handle('app:resume', () => controller.resume());
  ipcMain.handle('app:set-auto-launch', (_event, enabled: boolean) =>
    controller.setAutoLaunch(enabled),
  );
  ipcMain.handle('overlay:payload', () => controller.getOverlayPayload());
  ipcMain.on('overlay:action', (_event, action: OverlayAction) => controller.handleOverlayAction(action));
  ipcMain.on('overlay:activity', (_event, remainingSeconds: number) =>
    controller.handleOverlayActivity(remainingSeconds),
  );
  ipcMain.on('overlay:drag', (_event, phase: 'start' | 'move' | 'end', x: number, y: number) =>
    controller.handleOverlayDrag(phase, x, y),
  );
  ipcMain.on('pet:drag', (_event, phase: 'start' | 'move' | 'end', x: number, y: number) =>
    controller.handlePetDrag(phase, x, y),
  );
  ipcMain.handle('pet:panel', (_event, mode: 'toggle' | 'close') => controller.handlePetPanel(mode));
  ipcMain.handle('app:reset-pet-position', () => controller.resetPetPosition());
  ipcMain.handle('app:reset-overlay-position', () => controller.resetOverlayPosition());
  ipcMain.handle('app:snooze-next', () => controller.snoozeNext());
  ipcMain.handle('app:reset-timers', () => controller.resetTimers());
  ipcMain.handle('app:quit', () => controller.requestQuit());
}
