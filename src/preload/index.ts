import { contextBridge, ipcRenderer } from 'electron';
import type { AppInfo, AppState, OverlayAction, OverlayPayload, Settings } from '../shared/types';

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (next: Settings): Promise<Settings> => ipcRenderer.invoke('settings:save', next),
  resetSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:reset'),
  getState: (): Promise<AppState> => ipcRenderer.invoke('app:state'),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  showMainWindow: (): Promise<void> => ipcRenderer.invoke('app:show-main'),
  previewReminder: (): Promise<void> => ipcRenderer.invoke('app:preview-reminder'),
  previewItem: (itemId: string): Promise<void> => ipcRenderer.invoke('app:preview-item', itemId),
  pause: (minutes: number): Promise<void> => ipcRenderer.invoke('app:pause', minutes),
  resume: (): Promise<void> => ipcRenderer.invoke('app:resume'),
  setAutoLaunch: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:set-auto-launch', enabled),
  getOverlayPayload: (): Promise<OverlayPayload | null> => ipcRenderer.invoke('overlay:payload'),
  sendOverlayAction: (action: OverlayAction): void => ipcRenderer.send('overlay:action', action),
  sendOverlayActivity: (remainingSeconds: number): void =>
    ipcRenderer.send('overlay:activity', remainingSeconds),
  sendOverlayDrag: (phase: 'start' | 'move' | 'end', x: number, y: number): void =>
    ipcRenderer.send('overlay:drag', phase, x, y),
  sendPetDrag: (phase: 'start' | 'move' | 'end', x: number, y: number): void =>
    ipcRenderer.send('pet:drag', phase, x, y),
  togglePetPanel: (): Promise<void> => ipcRenderer.invoke('pet:panel', 'toggle'),
  closePetPanel: (): Promise<void> => ipcRenderer.invoke('pet:panel', 'close'),
  resetPetPosition: (): Promise<void> => ipcRenderer.invoke('app:reset-pet-position'),
  resetOverlayPosition: (): Promise<void> => ipcRenderer.invoke('app:reset-overlay-position'),
  snoozeNext: (): Promise<void> => ipcRenderer.invoke('app:snooze-next'),
  resetTimers: (): Promise<void> => ipcRenderer.invoke('app:reset-timers'),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  onState: (handler: (state: AppState) => void): void => {
    ipcRenderer.on('app:state', (_event, state: AppState) => handler(state));
  },
  onPetMotion: (handler: (step: { dx: number }) => void): void => {
    ipcRenderer.on('app:pet-step', (_event, step: { dx: number }) => handler(step));
  },
  onPetDock: (handler: (dock: { side: 'left' | 'right' | null; hidden: boolean }) => void): void => {
    ipcRenderer.on(
      'app:pet-dock',
      (_event, dock: { side: 'left' | 'right' | null; hidden: boolean }) => handler(dock),
    );
  },
  onOverlayPayload: (handler: (payload: OverlayPayload) => void): void => {
    ipcRenderer.on('overlay:payload', (_event, payload: OverlayPayload) => handler(payload));
  },
  onOverlaySuppressed: (handler: (suppressed: boolean) => void): void => {
    ipcRenderer.on('overlay:suppressed', (_event, suppressed: boolean) => handler(suppressed));
  },
};

contextBridge.exposeInMainWorld('anko', api);

export type AnkoApi = typeof api;
