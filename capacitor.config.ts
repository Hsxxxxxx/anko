import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anko.app',
  appName: '安叩',
  webDir: 'dist/renderer',
  android: {
    // 首帧与 WebView 背景跟随应用纸色，避免开屏白闪
    backgroundColor: '#f2f5f4',
  },
};

export default config;
