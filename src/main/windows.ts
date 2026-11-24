import { BrowserWindow } from 'electron';
import path from 'node:path';
import { resourcePath } from './resources';

export interface MainWindowOptions {
  startMinimized: boolean;
}

/** 创建主窗口：设置面板，关闭后缩到托盘 */
export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '安叩',
    icon: resourcePath('icon.png'),
    backgroundColor: '#f2f5f4',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => {
    if (!options.startMinimized) {
      win.show();
    }
  });

  void win.loadFile(path.join(__dirname, '../renderer/main.html'));
  return win;
}
