import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppState } from '../shared/types';
import { PET_SPECIES_LABELS } from '../shared/settings';
import { groveStageInfo } from '../shared/grove';
import { Glyph } from './icons';
import { PetCharacter } from './pets';
import './tokens.css';
import './character.css';
import './pet.css';

const SOON_MS = 60_000;
const DRAG_THRESHOLD = 5;
const CLICK_DELAY_MS = 260;

// 升阶碎星的落点，相对形象中心的像素偏移
const EVOLVE_SPARKS = [
  { x: -30, y: -34 },
  { x: 28, y: -40 },
  { x: -18, y: -58 },
  { x: 34, y: -18 },
  { x: 0, y: -64 },
] as const;

type PetState = 'active' | 'locked' | 'paused' | 'quiet' | 'soon' | 'running' | 'idle';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function PauseIcon(): JSX.Element {
  return (
    <svg className="pet-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.5" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg className="pet-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function LockIcon(): JSX.Element {
  return (
    <svg className="pet-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PetView(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hop, setHop] = useState(false);
  const [jump, setJump] = useState(false);
  const [walk, setWalk] = useState(false);
  // 完成提醒后的庆祝：大跳同时冒出几颗小心
  const [celebrating, setCelebrating] = useState(false);
  // 气泡只在鼠标移上来时出现，平时不打扰
  const [hovered, setHovered] = useState(false);
  // 贴边收纳状态：滑出屏幕后形象挪到边缘，只留一部分可见
  const [dock, setDock] = useState<{ side: 'left' | 'right' | null; hidden: boolean }>({
    side: null,
    hidden: false,
  });
  // 升阶演出：阶段提升时先留旧形象，闪白后换成新阶段
  const [evolving, setEvolving] = useState(false);
  const [artStage, setArtStage] = useState(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const clickTimer = useRef<number | null>(null);
  const doubleArmed = useRef(false);
  const prevTotalRef = useRef(0);

  useEffect(() => {
    void window.anko.getState().then(setState);
    window.anko.onState(setState);
    window.anko.onPetDock(setDock);
    return () => {
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
      }
    };
  }, []);

  // 完成一次提醒：小苗庆祝大跳，累计完成数增加时触发
  useEffect(() => {
    const total = state === null ? 0 : state.stats.total;
    if (total <= prevTotalRef.current) {
      prevTotalRef.current = total;
      return;
    }
    prevTotalRef.current = total;
    setJump(true);
    setCelebrating(true);
    const timer = window.setTimeout(() => setJump(false), 1200);
    const heartTimer = window.setTimeout(() => setCelebrating(false), 2400);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(heartTimer);
    };
  }, [state]);

  // 走动：主进程逐步移动窗口，每步摆一下身体
  useEffect(() => {
    let clearTimer: number | null = null;
    const onStep = () => {
      setWalk(false);
      requestAnimationFrame(() => setWalk(true));
      if (clearTimer !== null) {
        window.clearTimeout(clearTimer);
      }
      clearTimer = window.setTimeout(() => setWalk(false), 250);
    };
    window.anko.onPetMotion(onStep);
    return () => {
      if (clearTimer !== null) {
        window.clearTimeout(clearTimer);
      }
    };
  }, []);

  const now = state === null ? Date.now() : state.scheduler.now;
  const next = state?.nextReminder ?? null;
  const pausedUntil = state?.scheduler.pausedUntil ?? null;
  const isPaused = pausedUntil !== null && pausedUntil > now;
  const isQuiet = (state?.scheduler.quietUntil ?? null) !== null;
  const isActive = (state?.scheduler.activeReminderId ?? null) !== null;
  const isLocked = state?.scheduler.screenLocked ?? false;
  const stageInfo = groveStageInfo(state?.stats.total ?? 0, state?.petType ?? 'sprout');
  const remaining = next === null ? null : next.due - now;
  const isSoon = remaining !== null && remaining >= 0 && remaining <= SOON_MS;

  // 阶段提升：保留旧形象 1 秒，闪白处换成新阶段，整段演出 2.2 秒
  const stageIndex = stageInfo.index;
  const prevStageRef = useRef(stageIndex);
  useEffect(() => {
    const prev = prevStageRef.current;
    if (stageIndex === prev) {
      return;
    }
    prevStageRef.current = stageIndex;
    if (stageIndex <= prev) {
      setArtStage(stageIndex);
      return;
    }
    setEvolving(true);
    const swap = window.setTimeout(() => setArtStage(stageIndex), 1050);
    const end = window.setTimeout(() => setEvolving(false), 2250);
    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(end);
    };
  }, [stageIndex]);

  let petState: PetState = 'idle';
  if (isActive) {
    petState = 'active';
  } else if (isLocked) {
    petState = 'locked';
  } else if (isPaused) {
    petState = 'paused';
  } else if (isQuiet) {
    petState = 'quiet';
  } else if (remaining === null) {
    petState = 'idle';
  } else if (isSoon) {
    petState = 'soon';
  } else {
    petState = 'running';
  }

  // 待机、正常倒计时时会偶尔原地小跳；锁定、免打扰、暂停、提醒进行中不跳
  useEffect(() => {
    if (petState !== 'idle' && petState !== 'running' && petState !== 'soon') {
      return;
    }
    let hopTimer: number | null = null;
    let hopClear: number | null = null;
    const schedule = () => {
      hopTimer = window.setTimeout(() => {
        setHop(true);
        hopClear = window.setTimeout(() => setHop(false), 550);
        schedule();
      }, 18_000 + Math.random() * 27_000);
    };
    schedule();
    return () => {
      if (hopTimer !== null) {
        window.clearTimeout(hopTimer);
      }
      if (hopClear !== null) {
        window.clearTimeout(hopClear);
      }
    };
  }, [petState]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (dragStart.current !== null) {
        window.anko.sendPetDrag('move', event.screenX, event.screenY);
      }
    };
    const onUp = (event: MouseEvent) => {
      const start = dragStart.current;
      if (start === null) {
        return;
      }
      dragStart.current = null;
      setDragging(false);
      window.anko.sendPetDrag('end', event.screenX, event.screenY);
      const moved = Math.abs(event.screenX - start.x) + Math.abs(event.screenY - start.y);
      if (moved >= DRAG_THRESHOLD) {
        return;
      }
      if (doubleArmed.current) {
        doubleArmed.current = false;
        if (clickTimer.current !== null) {
          window.clearTimeout(clickTimer.current);
          clickTimer.current = null;
        }
        void window.anko.showMainWindow();
        return;
      }
      doubleArmed.current = true;
      clickTimer.current = window.setTimeout(() => {
        doubleArmed.current = false;
        clickTimer.current = null;
        void window.anko.togglePetPanel();
      }, CLICK_DELAY_MS);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (state === null) {
    return <div className="pet-root pet-idle" />;
  }

  const active = state.activeReminder;
  const minutes = remaining === null ? 0 : Math.max(1, Math.ceil(remaining / 60_000));
  const stageTag = `${PET_SPECIES_LABELS[state.petType]} · ${stageInfo.name}`;

  let tooltip = `安叩 · ${stageTag} · 等待第一条提醒`;
  let bubble: JSX.Element;
  if (petState === 'active') {
    const activity = state.activeActivity;
    tooltip =
      activity === null
        ? `安叩 · ${stageTag} · 提醒进行中，请在提醒窗口确认`
        : `安叩 · ${stageTag} · 正在休息，${activity.remainingSeconds} 秒后完成`;
    bubble = (
      <div className="pet-bubble">
        <div className="pet-bubble-line" data-tone={activity === null ? 'alert' : undefined}>
          {activity === null ? '请确认' : '休息中'}
        </div>
        {active !== null ? (
          <div className="pet-bubble-name">
            {active.name}
            {activity !== null ? ` · ${activity.remainingSeconds}s` : ''}
          </div>
        ) : null}
      </div>
    );
  } else if (petState === 'locked') {
    tooltip = `安叩 · ${stageTag} · 屏幕锁定中，提醒已暂停`;
    bubble = (
      <div className="pet-bubble">
        <div className="pet-bubble-line" data-tone="soft">已锁定</div>
        <div className="pet-bubble-name">锁定期间暂停提醒</div>
      </div>
    );
  } else if (petState === 'paused' && pausedUntil !== null) {
    tooltip = `安叩 · ${stageTag} · 已暂停，${formatTime(pausedUntil)} 恢复`;
    bubble = (
      <div className="pet-bubble">
        <div className="pet-bubble-line" data-tone="soft">已暂停</div>
        <div className="pet-bubble-name">{formatTime(pausedUntil)} 恢复</div>
      </div>
    );
  } else if (petState === 'quiet') {
    tooltip = `安叩 · ${stageTag} · 免打扰中`;
    bubble = (
      <div className="pet-bubble">
        <div className="pet-bubble-line" data-tone="soft">免打扰中</div>
      </div>
    );
  } else if (next !== null) {
    tooltip = `安叩 · 下次：${next.name}，${minutes} 分钟后`;
    bubble = (
      <div className="pet-bubble">
        <div className="pet-bubble-line num" data-tone={petState === 'soon' ? 'alert' : undefined}>
          {minutes}分
        </div>
        <div className="pet-bubble-name">
          <Glyph glyph={next.glyph} size={11} />
          {next.name}
        </div>
      </div>
    );
  } else {
    bubble = (
      <div className="pet-bubble">
        <div className="pet-bubble-line" data-tone="soft">等待第一条提醒</div>
      </div>
    );
  }

  const activity = state.activeActivity;
  // 活动计时中做对应动作：喝水喝两口，护眼和深呼吸闭眼起伏，其余保持提醒中的轻跳
  const poseClass =
    petState === 'active'
      ? activity === null
        ? 'pet-active'
        : activity.glyph === 'water'
          ? 'pet-drinking'
          : activity.glyph === 'eye' || activity.glyph === 'breathe'
            ? 'pet-breathing'
            : 'pet-active'
      : petState === 'locked'
        ? 'pet-locked'
        : petState === 'paused'
          ? 'pet-paused'
          : petState === 'quiet'
            ? 'pet-quiet'
            : petState === 'soon'
              ? 'pet-soon'
              : 'pet-idle';
  const motionClass = jump ? 'pet-jump' : hop ? 'pet-hop' : walk ? 'pet-walk' : '';
  const evolveClass = evolving ? ' pet-evolving' : '';
  // 贴边滑出屏幕时把形象挪到边缘，只留一部分露在屏幕外
  const dockClass = dock.hidden && dock.side !== null ? ` pet-hide-${dock.side}` : '';
  // 升阶演出期间气泡让位给头顶的阶段名
  const bubbleVisible = hovered && !dragging && !dock.hidden && !evolving;

  return (
    <div
      className={`pet-root${dragging ? ' pet-dragging' : ''} ${poseClass} ${motionClass}${dockClass}${evolveClass}`.trim()}
      title={tooltip}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        dragStart.current = { x: event.screenX, y: event.screenY };
        setDragging(true);
        window.anko.sendPetDrag('start', event.screenX, event.screenY);
      }}
    >
      {bubbleVisible ? bubble : null}
      <div className="pet-shift">
        <div className="pet-character">
          <div className="pet-breathe">
            <PetCharacter species={state.petType} stage={artStage} size={84} />
          </div>
        </div>
      </div>
      {evolving ? (
        <>
          <div className="pet-evolve-ring" />
          {EVOLVE_SPARKS.map((spark) => (
            <span
              key={`${spark.x}:${spark.y}`}
              className="pet-evolve-spark"
              style={{ '--sx': `${spark.x}px`, '--sy': `${spark.y}px` } as CSSProperties}
            />
          ))}
          <div className="pet-evolve-label">长成了{stageInfo.name}</div>
        </>
      ) : null}
      {petState === 'locked' ? <span className="pet-zzz">zZ</span> : null}
      {celebrating ? (
        <span className="pet-hearts" aria-hidden="true">
          <span className="pet-heart" style={{ '--hx': '-14px', '--hd': '0s' } as CSSProperties} />
          <span className="pet-heart" style={{ '--hx': '12px', '--hd': '0.35s' } as CSSProperties} />
          <span className="pet-heart" style={{ '--hx': '-1px', '--hd': '0.7s' } as CSSProperties} />
        </span>
      ) : null}
      {petState === 'paused' ? <span className="pet-badge"><PauseIcon /></span> : null}
      {petState === 'quiet' ? <span className="pet-badge"><MoonIcon /></span> : null}
      {petState === 'locked' ? <span className="pet-badge pet-badge-lock"><LockIcon /></span> : null}
    </div>
  );
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到挂载节点 #root');
}
createRoot(container).render(<PetView />);
