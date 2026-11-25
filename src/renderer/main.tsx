import { createRoot } from 'react-dom/client';
import { installAndroidBridge, isAndroidPlatform } from '../android/bridge';
import { App } from './App';
import './tokens.css';
import './styles.css';
import './mobile.css';

// Android WebView 下先装好桥接，页面才能通过 window.anko 访问安叩能力
if (isAndroidPlatform()) {
  installAndroidBridge();
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到挂载节点 #root');
}
createRoot(container).render(<App />);
