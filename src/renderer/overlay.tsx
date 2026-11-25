import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX, MouseEvent as ReactMouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { OverlayAction, OverlayPayload } from '../shared/types';
import { PET_SPECIES_LABELS } from '../shared/settings';
import { formatCountdown, remainingActivityMs } from '../shared/time';
import { BellIcon, Glyph } from './icons';
import { createAlerter } from './sound';
import type { Alerter } from './sound';
import './tokens.css';
import './styles.css';
import './overlay.css';

/** Android 应用内弹窗以 iframe 形式嵌在主页面里，能力直接复用主页面的桥接 */
function adoptParentBridge(): void {
  if (window.parent !== window && window.parent.anko !== undefined) {
    window.anko = window.parent.anko;
  }
}

const SILENT_ALERTER: Alerter = {
  start: (): void => undefined,
  beepOnce: (): void => undefined,
  ding: (): void => undefined,
  stop: (): void => undefined,
  setMuted: (): void => undefined,
};

/** iframe 内播放的提示音由主页面桥接统一负责，页面自身静音避免双响 */
function createPageAlerter(): Alerter {
  if (window.parent !== window) {
    return SILENT_ALERTER;
  }
  return createAlerter();
}

const TICK_COUNT = 28;
const FORCE_CONFIRM_SECONDS = 3;
// 卡片在活动计时走满后多留的宽限时间：完成叮声播完、完成按钮解锁后仍有时间点按
const CARD_GRACE_MS = 3000;

function clockText(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function OverlayView(): JSX.Element {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [countdown, setCountdown] = useState(FORCE_CONFIRM_SECONDS);
  const [now, setNow] = useState(clockText());
  // 所需时长计时从用户点「开始」起算，提醒展示本身不计时
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [presentAt, setPresentAt] = useState(Date.now());
  const alerter = useRef(createPageAlerter());
  const dingTimer = useRef<number | null>(null);
  const lastItemIdRef = useRef('');
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const send = useCallback((action: OverlayAction) => {
    window.anko.sendOverlayAction(action);
  }, []);

  /** 活动开始：提示音停止，所需时长从此刻计时，走满时播一次完成叮声 */
  const startActivity = useCallback((target: OverlayPayload, at: number) => {
    setStartedAt(at);
    if (target.soundEnabled) {
      alerter.current.stop();
    }
    if (dingTimer.current !== null) {
      window.clearTimeout(dingTimer.current);
      dingTimer.current = null;
    }
    dingTimer.current = window.setTimeout(() => {
      dingTimer.current = null;
      if (target.soundEnabled) {
        alerter.current.ding();
      }
    }, target.item.durationSeconds * 1000);
  }, []);

  const adoptPayload = useCallback(
    (next: OverlayPayload) => {
      const changed = next.item.id !== lastItemIdRef.current;
      if (changed) {
        lastItemIdRef.current = next.item.id;
        if (dingTimer.current !== null) {
          window.clearTimeout(dingTimer.current);
          dingTimer.current = null;
        }
        setStartedAt(null);
        setPresentAt(Date.now());
      }
      setPayload(next);
      setConfirming(false);
      // 打开自动开始时，提醒一出现就直接进入计时
      if (next.autoStart && next.item.durationSeconds > 0) {
        startActivity(next, Date.now());
      }
    },
    [startActivity],
  );

  useEffect(() => {
    let active = true;
    void window.anko.getOverlayPayload().then((initial) => {
      if (active && initial !== null) {
        adoptPayload(initial);
      }
    });
    window.anko.onOverlayPayload((next) => {
      if (next !== null) {
        adoptPayload(next);
      }
    });
    const timer = window.setInterval(() => setNow(clockText()), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (dingTimer.current !== null) {
        window.clearTimeout(dingTimer.current);
      }
    };
  }, [adoptPayload]);

  useEffect(() => {
    if (payload === null) {
      return;
    }
    // 应用内 iframe（安卓形态）额外加 mobile 类，桌面独立窗口样式保持不变
    const embedded = window.parent !== window;
    document.body.className = `${payload.strong ? 'overlay-body' : 'card-body'}${embedded ? ' mobile' : ''}`;
    if (!payload.soundEnabled) {
      return;
    }
    if (startedAt !== null) {
      // 自动开始时活动已经在计时，循环提示音不再响起
      return;
    }
    if (payload.strong) {
      alerter.current.start();
    } else {
      alerter.current.beepOnce();
    }
    return () => alerter.current.stop();
  }, [payload, startedAt]);

  useEffect(() => {
    // 全屏应用把弹窗收起时暂停提示音，恢复展示后继续
    window.anko.onOverlaySuppressed((suppressed) => {
      alerter.current.setMuted(suppressed);
    });
  }, []);

  // 拖动弹窗：按住标题区拖动，松开后记住位置
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (dragRef.current !== null) {
        window.anko.sendOverlayDrag('move', event.screenX, event.screenY);
      }
    };
    const onUp = (event: MouseEvent) => {
      if (dragRef.current === null) {
        return;
      }
      dragRef.current = null;
      window.anko.sendOverlayDrag('end', event.screenX, event.screenY);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    dragRef.current = { x: event.screenX, y: event.screenY };
    window.anko.sendOverlayDrag('start', event.screenX, event.screenY);
  }, []);

  // 强提醒不允许从页面关闭：本版本的 Electron 里渲染进程的 window.close()
  // 会绕过主进程 close 事件的拦截，页面层直接禁用，主进程的重建作第二道防线
  useEffect(() => {
    if (payload === null || !payload.strong) {
      return;
    }
    const original = window.close;
    window.close = () => {};
    return () => {
      window.close = original;
    };
  }, [payload]);

  // 卡片自动消失：未开始时按停留秒数；开始后保留到活动计时走满再加宽限时间
  useEffect(() => {
    if (payload === null || payload.strong) {
      return;
    }
    const durationMs = payload.item.durationSeconds * 1000;
    const base = presentAt + payload.dismissSeconds * 1000;
    const dismissAt = startedAt === null ? base : Math.max(base, startedAt + durationMs + CARD_GRACE_MS);
    const timer = window.setTimeout(() => send('dismiss'), Math.max(0, dismissAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [payload, startedAt, presentAt, send]);

  // 每秒向主进程上报活动计时剩余秒数：桌面宠物据此做喝水、深呼吸等休息动作
  useEffect(() => {
    if (payload === null || payload.item.durationSeconds === 0) {
      return;
    }
    const report = (): void => {
      if (startedAt === null) {
        window.anko.sendOverlayActivity(0);
        return;
      }
      const leftMs = remainingActivityMs(payload.item.durationSeconds, Date.now() - startedAt);
      window.anko.sendOverlayActivity(Math.max(0, Math.ceil(leftMs / 1000)));
    };
    report();
    const timer = window.setInterval(report, 1000);
    return () => {
      window.clearInterval(timer);
      window.anko.sendOverlayActivity(0);
    };
  }, [payload, startedAt]);

  useEffect(() => {
    if (!confirming) {
      return;
    }
    setCountdown(FORCE_CONFIRM_SECONDS);
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [confirming]);

  if (payload === null) {
    return <div className="overlay-shell" />;
  }

  const { item } = payload;
  const durationMs = item.durationSeconds * 1000;
  const hasActivity = item.durationSeconds > 0;
  const started = startedAt !== null;
  const activityLeftMs = hasActivity
    ? remainingActivityMs(item.durationSeconds, started ? Date.now() - startedAt : 0)
    : 0;
  const completeLocked = hasActivity && (started ? activityLeftMs > 0 : true);
  // 计时等待中：短时长按钮像水一样从左往右填满，长时长跟着深呼吸的节奏起伏
  const timingAnim: 'fill' | 'breathe' | undefined =
    hasActivity && started && activityLeftMs > 0 ? (item.durationSeconds <= 10 ? 'fill' : 'breathe') : undefined;
  const fillStyle: CSSProperties | undefined =
    timingAnim === 'fill' ? ({ '--fill-duration': `${item.durationSeconds}s` } as CSSProperties) : undefined;

  if (!payload.strong) {
    const nowMs = Date.now();
    let cardLeftSec: number;
    // 进度条按已用时间填充：等待开始时走自动消失的时长，开始后走活动时长
    let ratio: number;
    if (!hasActivity || !started) {
      cardLeftSec = Math.max(0, Math.ceil((presentAt + payload.dismissSeconds * 1000 - nowMs) / 1000));
      ratio =
        payload.dismissSeconds <= 0
          ? 0
          : Math.max(0, Math.min(1, (nowMs - presentAt) / (payload.dismissSeconds * 1000)));
    } else if (activityLeftMs > 0) {
      cardLeftSec = Math.ceil(activityLeftMs / 1000);
      ratio = Math.max(0, Math.min(1, 1 - activityLeftMs / durationMs));
    } else {
      cardLeftSec = Math.max(0, Math.ceil((startedAt + durationMs + CARD_GRACE_MS - nowMs) / 1000));
      ratio = 1;
    }
    const counter = !hasActivity
      ? `${cardLeftSec} 秒后自动消失`
      : !started
        ? '点开始计时'
        : activityLeftMs > 0
          ? `活动还需 ${formatCountdown(activityLeftMs)}`
          : `${cardLeftSec} 秒后自动消失`;
    return (
      <div className="card-shell">
        <div className="card-top drag-handle" onMouseDown={startDrag}>
          <span className="card-name">
            <span className="card-glyph">
              <Glyph glyph={item.glyph} size={18} />
            </span>
            {item.name}
          </span>
          <span className="card-count num">{counter}</span>
        </div>
        <p className="card-message">{item.message}</p>
        <div className="card-meter">
          <span style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
        </div>
        <div className="card-actions">
          {hasActivity && !started ? (
            <button className="btn btn-primary" onClick={() => startActivity(payload, Date.now())}>
              开始
            </button>
          ) : (
            <button
              className="btn btn-primary"
              data-anim={timingAnim}
              style={fillStyle}
              disabled={completeLocked}
              onClick={() => send('complete')}
            >
              {completeLocked ? `已完成 ${formatCountdown(activityLeftMs)}` : '已完成'}
            </button>
          )}
          <button className="btn" onClick={() => send('snooze')}>
            延后 {payload.snoozeMinutes} 分钟
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-shell">
      <div className="overlay-top drag-handle" onMouseDown={startDrag}>
        <span>
          安叩 <span className="tag-strong">强提醒</span>
        </span>
        <span className="clock num">{now}</span>
      </div>

      <div className="strong-head">
        <span className="overlay-glyph">
          <Glyph glyph={item.glyph} size={28} />
        </span>
        <h1 className="overlay-title">{item.name}</h1>
      </div>
      <p className="overlay-message">{item.message}</p>
      {hasActivity && !started ? (
        <p className="overlay-hint">
          点「开始」后计时 {formatCountdown(durationMs)}，「我已完成」才可点击
        </p>
      ) : null}

      <div className="overlay-ticks">
        <span className="overlay-ticks-label">时间到啦，该休息咯</span>
        <div className="overlay-ticks-row">
          {Array.from({ length: TICK_COUNT - 1 }, (_, index) => (
            <span
              key={index}
              className="tick"
              style={{ animationDelay: `${(index * 0.07).toFixed(2)}s` }}
            />
          ))}
          <span className="tick tick-bell" title="时间到啦">
            <BellIcon size={13} />
          </span>
        </div>
      </div>

      <div className="overlay-actions">
        {hasActivity && !started ? (
          <button className="obtn obtn-primary" onClick={() => startActivity(payload, Date.now())}>
            开始
          </button>
        ) : (
          <button
            className="obtn obtn-primary"
            data-anim={timingAnim}
            style={fillStyle}
            disabled={completeLocked}
            onClick={() => send('complete')}
          >
            {completeLocked ? `我已完成（${formatCountdown(activityLeftMs)}）` : '我已完成'}
          </button>
        )}
        <div className="obtn-row">
          <button className="obtn" onClick={() => send('snooze')}>
            延后 {payload.snoozeMinutes} 分钟
          </button>
          <button className="obtn obtn-danger" onClick={() => setConfirming(true)}>
            强制停止
          </button>
        </div>
      </div>

      <div className="overlay-foot">
        {payload.queueLength > 0
          ? `还有 ${payload.queueLength} 条提醒等待处理`
          : `太棒了！${PET_SPECIES_LABELS[payload.petType]} ${item.intervalMinutes} 分钟后再来提醒你~`}
      </div>

      {confirming ? (
        <div className="confirm-layer">
          <div className="confirm-card">
            <h2>强制停止这次提醒？</h2>
            <p>强制停止会中断本次提醒，程序不会记录你已经休息过。请确认你确实要跳过这条提醒。</p>
            <div className="confirm-actions">
              <button className="obtn" onClick={() => setConfirming(false)}>
                返回
              </button>
              <button
                className="obtn obtn-danger"
                disabled={countdown > 0}
                onClick={() => send('force-confirmed')}
              >
                {countdown > 0 ? `${countdown} 秒后可确认` : '仍然强制停止'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到挂载节点 #root');
}
adoptParentBridge();
createRoot(container).render(<OverlayView />);
