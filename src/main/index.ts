import { app } from 'electron';
import { AppController } from './app';
import { registerIpc } from './ipc';

const controller = new AppController();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => controller.showMainWindow());
  app.on('before-quit', () => controller.prepareQuit());
  app.on('window-all-closed', () => {
    // 常驻托盘，主窗口关闭后应用继续运行
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.anko.app');
    registerIpc(controller);
    controller.start();
  });
}
