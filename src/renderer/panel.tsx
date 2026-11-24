import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppState, Settings } from '../shared/types';
import { Glyph } from './icons';
import './tokens.css';
import './panel.css';

function PanelView(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void window.anko.getState().then(setState);
    void window.anko.getSettings().then(setSettings);
    window.anko.onState(setState);
  }, []);

  const now = state?.scheduler.now ?? Date.now();
  const pausedUntil = state?.scheduler.pausedUntil ?? null;
  const isPaused = pausedUntil !== null && pausedUntil > now;
  const next = state?.nextReminder ?? null;
  const remaining = next === null ? null : next.due - now;
  const minutes = remaining === null ? null : Math.max(1, Math.ceil(remaining / 60_000));

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="eyebrow">快捷操作</span>
        <button type="button" className="panel-close" aria-label="关闭面板" onClick={() => void window.anko.closePetPanel()}>
          ×
        </button>
      </div>

      <div className="panel-next">
        {next === null ? (
          <span className="panel-idle">没有启用的提醒项</span>
        ) : (
          <>
            <span className="panel-next-name">
              <Glyph glyph={next.glyph} size={15} />
              {next.name}
            </span>
            <span className="panel-next-time num">{minutes} 分钟</span>
          </>
        )}
      </div>

      <button type="button" className="btn btn-primary panel-btn" onClick={() => void window.anko.previewReminder()}>
        立即提醒一次
      </button>
      <button type="button" className="btn panel-btn" onClick={() => void window.anko.snoozeNext()}>
        延后 {settings?.snoozeMinutes ?? 5} 分钟
      </button>
      {isPaused ? (
        <button type="button" className="btn panel-btn" onClick={() => void window.anko.resume()}>
          恢复提醒
        </button>
      ) : (
        <button type="button" className="btn panel-btn" onClick={() => void window.anko.pause(30)}>
          暂停提醒 30 分钟
        </button>
      )}
      <button type="button" className="btn panel-btn" onClick={() => void window.anko.resetTimers()}>
        重置计时
      </button>

      <div className="panel-row">
        <button type="button" className="btn panel-btn" onClick={() => void window.anko.showMainWindow()}>
          打开主窗口
        </button>
        <button type="button" className="btn panel-btn panel-danger" onClick={() => void window.anko.quit()}>
          退出安叩
        </button>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到挂载节点 #root');
}
createRoot(container).render(<PanelView />);
