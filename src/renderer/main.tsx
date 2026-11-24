import { createRoot } from 'react-dom/client';
import { App } from './App';
import './tokens.css';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到挂载节点 #root');
}
createRoot(container).render(<App />);
