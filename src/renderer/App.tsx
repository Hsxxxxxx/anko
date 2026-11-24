import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type {
  AppInfo,
  AppState,
  OverlayPayload,
  OverlayPosition,
  ReminderItem,
  ReminderStrength,
  Settings,
} from '../shared/types';
import {
  createCustomItem,
  MAX_DURATION_SECONDS,
  MAX_INTERVAL_MINUTES,
  MIN_DURATION_SECONDS,
  MIN_INTERVAL_MINUTES,
  newId,
  PET_SPECIES,
  PET_SPECIES_LABELS,
} from '../shared/settings';
import { formatCountdown, formatDuration, resolveQuietWindow } from '../shared/time';
import { tickProgress } from '../shared/schedule';
import { groveStageInfo } from '../shared/grove';
import { BellIcon, Glyph } from './icons';
import { PetCharacter } from './pets';
import './character.css';

const SAVE_DELAY_MS = 400;
const HERO_TICKS = 24;

function clockText(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function Check({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className="check"
      data-on={on}
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2 6.3 4.6 8.9 10 3.2"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Switch({
  on,
  onToggle,
  label,
  disabled = false,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      className="switch"
      data-on={on}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
    </button>
  );
}

function StrengthToggle({
  value,
  onChange,
}: {
  value: ReminderStrength;
  onChange: (next: ReminderStrength) => void;
}): JSX.Element {
  return (
    <div className="seg" role="group" aria-label="提醒强度">
      <button
        type="button"
        data-strength="normal"
        data-active={value === 'normal'}
        onClick={() => onChange('normal')}
      >
        普通
      </button>
      <button
        type="button"
        data-strength="strong"
        data-active={value === 'strong'}
        onClick={() => onChange('strong')}
      >
        强提醒
      </button>
    </div>
  );
}

/** 弹出位置的小屏预览：强提醒卡片与普通卡片的落点，随选项实时变化 */
function PositionPreview({ position }: { position: OverlayPosition }): JSX.Element {
  const margin = 5;
  const gap = 4;
  const strongW = 40;
  const strongH = 26;
  const cardW = 36;
  const cardH = 22;
  let strong: CSSProperties;
  let card: CSSProperties;
  if (position === 'top-left' || position === 'top-right') {
    const edge: CSSProperties = position === 'top-left' ? { left: margin } : { right: margin };
    strong = { width: strongW, height: strongH, top: margin, ...edge };
    card = { width: cardW, height: cardH, top: margin + strongH + gap, ...edge };
  } else if (position === 'bottom-left' || position === 'bottom-right') {
    const edge: CSSProperties = position === 'bottom-left' ? { left: margin } : { right: margin };
    strong = { width: strongW, height: strongH, bottom: margin + cardH + gap, ...edge };
    card = { width: cardW, height: cardH, bottom: margin, ...edge };
  } else if (position === 'center') {
    strong = { width: strongW, height: strongH, top: 10, left: (132 - strongW) / 2 };
    card = { width: cardW, height: cardH, top: 10 + strongH + gap, left: (132 - cardW) / 2 };
  } else {
    // 跟随提醒类型：强提醒右上角，普通卡片右下角
    strong = { width: strongW, height: strongH, top: margin, right: margin };
    card = { width: cardW, height: cardH, bottom: margin, right: margin };
  }
  return (
    <div className="position-screen" aria-hidden="true">
      <div className="position-window position-window-strong" style={strong} />
      <div className="position-window position-window-card" style={card} />
    </div>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13.6a7.6 7.6 0 0 0 0-3.2l2-1.4-2-3.4-2.3 1a7.7 7.7 0 0 0-2.8-1.6l-.3-2.5H10.6l-.3 2.5a7.7 7.7 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3.2l-2 1.4 2 3.4 2.3-1a7.7 7.7 0 0 0 2.8 1.6l.3 2.5h3.4l.3-2.5a7.7 7.7 0 0 0 2.8-1.6l2.3 1 2-3.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.5 5.5 8 12l6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TickStrip({
  progress,
}: {
  progress: boolean[];
}): JSX.Element {
  return (
    <div className="ticks" aria-hidden="true">
      {progress.map((on, index) => (
        <span key={index} className="tick" data-on={on} />
      ))}
    </div>
  );
}

function ItemForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: {
    name: string;
    message: string;
    intervalMinutes: number;
    durationSeconds: number;
    strength: ReminderStrength;
  };
  submitLabel: string;
  onSubmit: (value: {
    name: string;
    message: string;
    intervalMinutes: number;
    durationSeconds: number;
    strength: ReminderStrength;
  }) => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState(initial.name);
  const [message, setMessage] = useState(initial.message);
  const [intervalMinutes, setIntervalMinutes] = useState(initial.intervalMinutes);
  const [durationSeconds, setDurationSeconds] = useState(initial.durationSeconds);
  const [strength, setStrength] = useState<ReminderStrength>(initial.strength);

  return (
    <div className="form">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="item-name">名称</label>
          <input
            id="item-name"
            value={name}
            maxLength={24}
            placeholder="例如：喝水"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="item-message">提醒文案</label>
          <input
            id="item-message"
            value={message}
            maxLength={60}
            placeholder="提醒时显示的一句话"
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="item-interval">间隔（分钟）</label>
          <input
            id="item-interval"
            type="number"
            min={MIN_INTERVAL_MINUTES}
            max={MAX_INTERVAL_MINUTES}
            step={5}
            value={intervalMinutes}
            onChange={(event) =>
              setIntervalMinutes(
                Math.min(
                  MAX_INTERVAL_MINUTES,
                  Math.max(MIN_INTERVAL_MINUTES, Math.round(Number(event.target.value) || MIN_INTERVAL_MINUTES)),
                ),
              )
            }
          />
        </div>
        <div className="field">
          <label htmlFor="item-duration">所需时长（秒，0 不限时）</label>
          <input
            id="item-duration"
            type="number"
            min={MIN_DURATION_SECONDS}
            max={MAX_DURATION_SECONDS}
            step={1}
            value={durationSeconds}
            onChange={(event) =>
              setDurationSeconds(
                Math.min(
                  MAX_DURATION_SECONDS,
                  Math.max(MIN_DURATION_SECONDS, Math.round(Number(event.target.value) || MIN_DURATION_SECONDS)),
                ),
              )
            }
          />
        </div>
        <div className="field">
          <label>强度</label>
          <StrengthToggle value={strength} onChange={setStrength} />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            onSubmit({
              name: name.trim(),
              message: message.trim(),
              intervalMinutes,
              durationSeconds,
              strength,
            })
          }
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const [draft, setDraft] = useState<Settings | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clock, setClock] = useState(clockText());
  // 主页与设置页切换，设置内容由顶栏的设置图标打开
  const [view, setView] = useState<'home' | 'settings'>('home');
  // 提醒弹出载荷：Android 下据此在页面内弹出全屏提醒层
  const [overlayPayload, setOverlayPayload] = useState<OverlayPayload | null>(null);
  const isAndroid = window.anko.platform === 'android';

  useEffect(() => {
    void window.anko.getSettings().then(setDraft);
    void window.anko.getState().then(setAppState);
    void window.anko.getAppInfo().then(setInfo);
    window.anko.onState(setAppState);
    if (isAndroid) {
      // 应用内全屏提醒层是安卓形态，Windows 的弹窗由独立窗口承载
      window.anko.onOverlayPayload(setOverlayPayload);
      void window.anko.getOverlayPayload().then(setOverlayPayload);
    }
    const timer = window.setInterval(() => setClock(clockText()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (draft === null) {
      return;
    }
    setSaving(true);
    const timer = window.setTimeout(() => {
      void window.anko.saveSettings(draft).then(() => setSaving(false));
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const update = useCallback((mutate: (previous: Settings) => Settings) => {
    setDraft((previous) => (previous === null ? previous : mutate(previous)));
  }, []);

  const enabledItems = useMemo(
    () => (draft?.items ?? []).filter((item) => item.enabled),
    [draft],
  );

  const nextDue = appState?.scheduler.nextDue ?? {};
  const now = appState?.scheduler.now ?? Date.now();

  const upcoming = useMemo(() => {
    return enabledItems
      .map((item) => ({ item, due: nextDue[item.id] ?? now }))
      .sort((left, right) => left.due - right.due);
  }, [enabledItems, nextDue, now]);

  const leading = upcoming[0];

  // 成长阶段提升：完成统计里的形象弹一下
  const groveIndex = draft === null ? 0 : groveStageInfo(appState?.stats.total ?? 0, draft.petType).index;
  const [grovePop, setGrovePop] = useState(false);
  const prevGroveRef = useRef(groveIndex);
  useEffect(() => {
    const prev = prevGroveRef.current;
    if (groveIndex <= prev) {
      prevGroveRef.current = groveIndex;
      return;
    }
    prevGroveRef.current = groveIndex;
    setGrovePop(true);
    const timer = window.setTimeout(() => setGrovePop(false), 1200);
    return () => window.clearTimeout(timer);
  }, [groveIndex]);

  if (draft === null) {
    return <div className="app" />;
  }

  const paused = appState?.scheduler.pausedUntil ?? null;
  const isPaused = paused !== null && paused > now;
  const quietWindow = resolveQuietWindow(new Date(now), draft.quietRanges);
  const quietUntil = appState?.scheduler.quietUntil ?? null;
  const hasActiveReminder = (appState?.scheduler.activeReminderId ?? null) !== null;
  const isScreenLocked = appState?.scheduler.screenLocked ?? false;

  const pillTone = hasActiveReminder ? 'alert' : isScreenLocked || isPaused ? 'paused' : quietUntil ? 'quiet' : 'running';
  const pillText = hasActiveReminder
    ? '提醒进行中'
    : isScreenLocked
      ? '屏幕锁定中'
      : isPaused
        ? '已暂停'
        : quietUntil
          ? '免打扰中'
          : '运行中';

  const heroRemaining = leading === undefined ? 0 : Math.max(0, leading.due - now);
  const heroTotal = leading === undefined ? 0 : leading.item.intervalMinutes * 60_000;
  const heroTicks = tickProgress(heroRemaining, heroTotal, HERO_TICKS);
  const stats = appState?.stats ?? { total: 0, byItem: {}, recent: [] };
  const grove = groveStageInfo(stats.total, draft.petType);
  const lastCompletion = stats.recent[0];

  return (
    <div className="app" data-view={view}>
      <header className="topbar">
        <div className="brand">
          <svg className="brand-fish" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="10.56" cy="12" rx="5.04" ry="3.48" fill="currentColor" />
            <path d="M14.4 12 18.96 8.52v6.96L14.4 12Z" fill="currentColor" />
            <circle cx="8.4" cy="10.8" r="0.79" fill="var(--paper)" />
            <circle cx="19.68" cy="4.8" r="1.32" fill="var(--coral)" />
          </svg>
          <span className="brand-name">安叩</span>
          <span className="brand-sub">到点轻叩，应了即止</span>
        </div>
        <div className="topbar-right">
          <span className="pill" data-tone={pillTone}>
            {pillText}
          </span>
          <span className="clock num">{clock}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={view === 'home' ? '设置' : '返回主页'}
            title={view === 'home' ? '设置' : '返回主页'}
            onClick={() => setView(view === 'home' ? 'settings' : 'home')}
          >
            {view === 'home' ? <GearIcon /> : <ArrowIcon />}
          </button>
        </div>
      </header>

      {appState?.notice ? <div className="notice">{appState.notice}</div> : null}

      <div className="layout">
        <section className="column">
          <div className="card home-only">
            <div className="card-head">
              <div>
                <span className="eyebrow">提醒项</span>
                <span className="card-note">
                  勾选 {enabledItems.length} / {draft.items.length} 项，可以同时提醒多项
                </span>
              </div>
              <div className="head-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => update((previous) => ({ ...previous, items: previous.items.map((item) => ({ ...item, enabled: true })) }))}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => update((previous) => ({ ...previous, items: previous.items.map((item) => ({ ...item, enabled: false })) }))}
                >
                  全不选
                </button>
                <button type="button" className="btn" onClick={() => setAdding((value) => !value)}>
                  添加自定义提醒项
                </button>
              </div>
            </div>

            <ul className="rows">
              {draft.items.map((item) => (
                <ReminderEntry
                  key={item.id}
                  item={item}
                  editing={editingId === item.id}
                  onToggle={() =>
                    update((previous) => ({
                      ...previous,
                      items: previous.items.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, enabled: !candidate.enabled }
                          : candidate,
                      ),
                    }))
                  }
                  onIntervalChange={(value) =>
                    update((previous) => ({
                      ...previous,
                      items: previous.items.map((candidate) =>
                        candidate.id === item.id ? { ...candidate, intervalMinutes: value } : candidate,
                      ),
                    }))
                  }
                  onDurationChange={(value) =>
                    update((previous) => ({
                      ...previous,
                      items: previous.items.map((candidate) =>
                        candidate.id === item.id ? { ...candidate, durationSeconds: value } : candidate,
                      ),
                    }))
                  }
                  onStrengthChange={(strength) =>
                    update((previous) => ({
                      ...previous,
                      items: previous.items.map((candidate) =>
                        candidate.id === item.id ? { ...candidate, strength } : candidate,
                      ),
                    }))
                  }
                  onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                  onDelete={() =>
                    update((previous) => ({
                      ...previous,
                      items: previous.items.filter((candidate) => candidate.id !== item.id),
                    }))
                  }
                  onSaveEdit={(value) => {
                    update((previous) => ({
                      ...previous,
                      items: previous.items.map((candidate) =>
                        candidate.id === item.id
                          ? {
                              ...candidate,
                              name: value.name,
                              message: value.message,
                              intervalMinutes: value.intervalMinutes,
                              durationSeconds: value.durationSeconds,
                              strength: value.strength,
                            }
                          : candidate,
                      ),
                    }));
                    setEditingId(null);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                />
              ))}
            </ul>

            {adding ? (
              <ItemForm
                initial={{ name: '', message: '', intervalMinutes: 45, durationSeconds: 0, strength: 'normal' }}
                submitLabel="添加提醒项"
                onCancel={() => setAdding(false)}
                onSubmit={(value) => {
                  if (value.name.length === 0) {
                    return;
                  }
                  const created = createCustomItem(value);
                  update((previous) => ({ ...previous, items: [...previous.items, created] }));
                  setAdding(false);
                }}
              />
            ) : null}
          </div>

          <div className="card home-only">
            <div className="card-head">
              <div>
                <span className="eyebrow">免打扰时段</span>
                <span className="card-note">这段时间内不会弹出提醒</span>
              </div>
              <div className="head-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    update((previous) => ({
                      ...previous,
                      quietRanges: [
                        ...previous.quietRanges,
                        { id: newId('quiet'), start: '22:00', end: '08:00' },
                      ],
                    }))
                  }
                >
                  添加时段
                </button>
              </div>
            </div>

            {draft.quietRanges.length === 0 ? (
              <div className="empty">还没有设置免打扰时段，提醒会在全天出现。</div>
            ) : (
              <ul className="rows">
                {draft.quietRanges.map((range) => (
                  <li key={range.id} className="quiet-row">
                    <input
                      type="time"
                      value={range.start}
                      aria-label="开始时间"
                      onChange={(event) =>
                        update((previous) => ({
                          ...previous,
                          quietRanges: previous.quietRanges.map((candidate) =>
                            candidate.id === range.id ? { ...candidate, start: event.target.value } : candidate,
                          ),
                        }))
                      }
                    />
                    <span className="quiet-hint">至</span>
                    <input
                      type="time"
                      value={range.end}
                      aria-label="结束时间"
                      onChange={(event) =>
                        update((previous) => ({
                          ...previous,
                          quietRanges: previous.quietRanges.map((candidate) =>
                            candidate.id === range.id ? { ...candidate, end: event.target.value } : candidate,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        update((previous) => ({
                          ...previous,
                          quietRanges: previous.quietRanges.filter((candidate) => candidate.id !== range.id),
                        }))
                      }
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="setting-row">
              <div>
                <div>当前状态</div>
                <div className="setting-desc">
                  {quietWindow.active
                    ? `免打扰中，${new Date(quietWindow.end ?? now).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} 之后恢复提醒`
                    : quietWindow.nextStart === null
                      ? '没有设置免打扰时段'
                      : `下次免打扰从 ${new Date(quietWindow.nextStart).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })} 开始`}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="column">
          <div className="card settings-only card-pet">
            <div className="card-head">
              <span className="eyebrow">{isAndroid ? '成长形象' : '桌面宠物'}</span>
              <span className="card-note">{PET_SPECIES_LABELS[draft.petType]}</span>
            </div>
            <div className="pet-preview">
              <PetCharacter species={draft.petType} stage={grove.index} size={96} />
              <div className="pet-preview-info">
                <div className="grove-stage">{grove.name}</div>
                <div className="setting-desc">
                  {grove.nextAt === null
                    ? '已经长到最高阶段，继续完成提醒陪它一起长大'
                    : `再完成 ${grove.nextAt - stats.total} 次提醒就能长成${grove.nextName}`}
                </div>
              </div>
            </div>
            <div className="species-picker">
              {PET_SPECIES.map((species) => (
                <button
                  key={species}
                  type="button"
                  className="species-btn"
                  data-active={draft.petType === species}
                  aria-label={`宠物形象 ${PET_SPECIES_LABELS[species]}`}
                  onClick={() => update((previous) => ({ ...previous, petType: species }))}
                >
                  <PetCharacter species={species} stage={3} size={40} />
                  <span>{PET_SPECIES_LABELS[species]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card home-only">
            <div className="card-head">
              <span className="eyebrow">下一次提醒</span>
            </div>
            <div className="hero">
              <div className="hero-value num">
                {isPaused ? '暂停' : leading === undefined ? '--:--' : formatCountdown(heroRemaining)}
              </div>
              <div className="hero-meta">
                {isPaused
                  ? '提醒已暂停，恢复后继续计时'
                  : leading === undefined
                    ? '勾选至少一个提醒项'
                    : `${leading.item.name} · ${
                        leading.item.strength === 'strong' ? '强提醒' : '普通提醒'
                      }`}
              </div>
              <div className="ticks-head">
                <span>本轮进度</span>
              </div>
              <TickStrip progress={heroTicks} />
              <div className="hero-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void window.anko.previewReminder()}
                >
                  立即提醒一次
                </button>
                <button
                  type="button"
                  className="btn"
                  title="暂停全部提醒项 30 分钟，到点自动恢复"
                  onClick={() => {
                    if (isPaused) {
                      void window.anko.resume();
                    } else {
                      void window.anko.pause(30);
                    }
                  }}
                >
                  {isPaused ? '恢复提醒' : '暂停 30 分钟'}
                </button>
              </div>
            </div>
          </div>

          <div className="card home-only">
            <div className="card-head">
              <span className="eyebrow">接下来的提醒</span>
              <span className="card-note">{enabledItems.length} 项已启用</span>
            </div>
            <ul className="next-list">
              {upcoming.length === 0 ? (
                <li className="quiet-hint">没有启用的提醒项</li>
              ) : (
                upcoming.slice(0, 6).map(({ item, due }) => (
                  <li key={item.id}>
                    <span className="next-name">
                      <Glyph glyph={item.glyph} size={16} />
                      {item.name}
                    </span>
                    <span className="next-time" data-soon={due - now < 60_000}>
                      {formatDuration(Math.max(0, due - now))}
                    </span>
                    <button
                      type="button"
                      className="next-preview"
                      aria-label={`立即提醒一次 ${item.name}`}
                      title="立即提醒一次"
                      onClick={() => void window.anko.previewItem(item.id)}
                    >
                      <BellIcon size={14} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="card home-only">
            <div className="card-head">
              <div>
                <span className="eyebrow">完成统计</span>
                <span className="card-note">累计完成 {stats.total} 次</span>
              </div>
              <div className="head-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  title="到设置页更换宠物形象"
                  onClick={() => setView('settings')}
                >
                  换形象
                </button>
              </div>
            </div>
            <div className={`grove${grovePop ? ' grove-pop' : ''}`}>
              <PetCharacter species={draft.petType} stage={grove.index} size={72} />
              <div className="grove-info">
                <div className="grove-stage">
                  {grove.name}
                  {grove.nextName === null || grove.nextAt === null
                    ? ''
                    : ` · 距${grove.nextName}还差 ${grove.nextAt - stats.total} 次`}
                </div>
                <div className="grove-bar">
                  <span style={{ width: `${(grove.progress * 100).toFixed(1)}%` }} />
                </div>
                <div className="setting-desc">完成提醒项喂养它长大，桌面宠物就是它本尊</div>
              </div>
            </div>
            <ul className="next-list">
              {draft.items
                .map((item) => ({ item, count: stats.byItem[item.id]?.count ?? 0 }))
                .filter(({ count }) => count > 0)
                .map(({ item, count }) => (
                  <li key={item.id}>
                    <span className="next-name">
                      <Glyph glyph={item.glyph} size={16} />
                      {item.name}
                    </span>
                    <span className="next-time num">{count} 次</span>
                  </li>
                ))}
              {stats.total === 0 ? <li className="quiet-hint">完成提醒后，它会在这里长大</li> : null}
            </ul>
            {lastCompletion !== undefined ? (
              <div className="setting-desc">
                最近完成：{lastCompletion.name} ·{' '}
                {new Date(lastCompletion.at).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            ) : null}
          </div>

          <div className="card settings-only card-global">
            <div className="card-head">
              <span className="eyebrow">全局设置</span>
            </div>
            <div className="setting-row">
              <div>
                <div>提醒提示音</div>
                <div className="setting-desc">强提醒每 4 秒重复一次提示音；点「开始」后停止，活动计时走满时播放完成叮声</div>
              </div>
              <Switch
                on={draft.soundEnabled}
                label="提醒提示音"
                onToggle={() =>
                  update((previous) => ({ ...previous, soundEnabled: !previous.soundEnabled }))
                }
              />
            </div>
            <div className="setting-row">
              <div>
                <div>自动开始</div>
                <div className="setting-desc">提醒弹出后直接开始计时，不用点「开始」</div>
              </div>
              <Switch
                on={draft.autoStart}
                label="自动开始"
                onToggle={() => update((previous) => ({ ...previous, autoStart: !previous.autoStart }))}
              />
            </div>
            {!isAndroid ? (
              <div className="setting-row">
                <div>
                  <div>桌面宠物</div>
                  <div className="setting-desc">屏幕上常驻一只会眨眼睛的小伙伴，鼠标移上去才显示气泡；可拖动、贴边收纳、偶尔在屏幕上闲逛，完成提醒会喂养它长大</div>
                </div>
                <div className="setting-row-actions">
                  {draft.showFloatingBall ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void window.anko.resetPetPosition()}
                    >
                      重置位置
                    </button>
                  ) : null}
                  <Switch
                    on={draft.showFloatingBall}
                    label="显示桌面宠物"
                    onToggle={() =>
                      update((previous) => ({ ...previous, showFloatingBall: !previous.showFloatingBall }))
                    }
                  />
                </div>
              </div>
            ) : null}
            {!isAndroid ? (
              <div className="setting-row">
                <div>
                  <div>开机自动启动</div>
                  <div className="setting-desc">登录 Windows 后自动在托盘运行</div>
                </div>
                <Switch
                  on={draft.autoLaunch}
                  label="开机自动启动"
                  onToggle={() => {
                    const next = !draft.autoLaunch;
                    update((previous) => ({ ...previous, autoLaunch: next }));
                    void window.anko.setAutoLaunch(next);
                  }}
                />
              </div>
            ) : null}
            {!isAndroid ? (
              <div className="setting-row">
                <div title={draft.autoLaunch ? undefined : '需开启开机自启后生效'}>
                  <div>启动后不显示主窗口</div>
                  <div className="setting-desc">开机自启时只驻留托盘，不弹出主窗口</div>
                </div>
                <Switch
                  on={draft.startMinimized}
                  label="启动后不显示主窗口"
                  disabled={draft.autoLaunch === false}
                  onToggle={() =>
                    update((previous) => ({ ...previous, startMinimized: !previous.startMinimized }))
                  }
                />
              </div>
            ) : null}
            {!isAndroid ? (
              <div className="setting-row">
                <div>
                  <div>关闭窗口时缩到托盘</div>
                  <div className="setting-desc">关闭主窗口后提醒继续运行</div>
                </div>
                <Switch
                  on={draft.closeToTray}
                  label="关闭窗口时缩到托盘"
                  onToggle={() =>
                    update((previous) => ({ ...previous, closeToTray: !previous.closeToTray }))
                  }
                />
              </div>
            ) : null}
            <div className="setting-row">
              <div>
                <div>普通提醒停留时间</div>
                <div className="setting-desc">普通提醒到点后自动消失</div>
              </div>
              <label className="number-field">
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={1}
                  value={draft.normalDismissSeconds}
                  aria-label="普通提醒停留秒数"
                  onChange={(event) =>
                    update((previous) => ({
                      ...previous,
                      normalDismissSeconds: Math.min(
                        120,
                        Math.max(5, Math.round(Number(event.target.value) || 5)),
                      ),
                    }))
                  }
                />
                秒
              </label>
            </div>
            <div className="setting-row">
              <div>
                <div>延后时长</div>
                <div className="setting-desc">提醒里点击延后推迟的时间</div>
              </div>
              <label className="number-field">
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={draft.snoozeMinutes}
                  aria-label="延后分钟数"
                  onChange={(event) =>
                    update((previous) => ({
                      ...previous,
                      snoozeMinutes: Math.min(60, Math.max(1, Math.round(Number(event.target.value) || 1))),
                    }))
                  }
                />
                分钟
              </label>
            </div>
            {!isAndroid ? (
              <div className="setting-row">
                <div>
                  <div>提醒弹出位置</div>
                  <div className="setting-desc">跟随提醒类型：强提醒在右上角，普通卡片在右下角；也可以放在屏幕中间或四个角落，两类弹窗一起出现在该位置</div>
                </div>
                <div className="setting-row-actions">
                  {appState?.overlayOffset === null || appState === null ? null : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void window.anko.resetOverlayPosition()}
                    >
                      归位
                    </button>
                  )}
                  <label className="position-field">
                    <select
                      value={draft.overlayPosition}
                      aria-label="提醒弹出位置"
                      onChange={(event) =>
                        update((previous) => ({
                          ...previous,
                          overlayPosition: event.target.value as OverlayPosition,
                        }))
                      }
                    >
                      <option value="auto">跟随提醒类型</option>
                      <option value="center">屏幕中间</option>
                      <option value="top-right">右上角</option>
                      <option value="top-left">左上角</option>
                      <option value="bottom-right">右下角</option>
                      <option value="bottom-left">左下角</option>
                    </select>
                  </label>
                  <PositionPreview position={draft.overlayPosition} />
                </div>
              </div>
            ) : null}
            <div className="setting-row">
              <div>
                <div>恢复默认设置</div>
                <div className="setting-desc">清空自定义提醒项与免打扰时段</div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void window.anko.resetSettings().then((next) => {
                    setDraft(next);
                    setAdding(false);
                    setEditingId(null);
                  });
                }}
              >
                恢复默认
              </button>
            </div>
          </div>
        </aside>
      </div>

      {isAndroid && overlayPayload !== null ? (
        <iframe className="inapp-overlay" src="overlay.html" title="提醒" />
      ) : null}

      <footer className="footer">
        <span>
          设置文件：{info === null ? '读取中' : info.settingsDir}
          {info === null ? '' : ` · 版本 ${info.version}`}
        </span>
        <span className="save-flag" data-dirty={saving}>
          {saving ? '正在保存' : '已保存'}
        </span>
        <span>强制停止 {appState?.forcedStops ?? 0} 次</span>
      </footer>
    </div>
  );
}

function ReminderEntry({
  item,
  editing,
  onToggle,
  onIntervalChange,
  onDurationChange,
  onStrengthChange,
  onEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
}: {
  item: ReminderItem;
  editing: boolean;
  onToggle: () => void;
  onIntervalChange: (value: number) => void;
  onDurationChange: (value: number) => void;
  onStrengthChange: (value: ReminderStrength) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveEdit: (value: {
    name: string;
    message: string;
    intervalMinutes: number;
    durationSeconds: number;
    strength: ReminderStrength;
  }) => void;
  onCancelEdit: () => void;
}): JSX.Element {
  return (
    <>
      <li className="row" data-enabled={item.enabled}>
        <Check on={item.enabled} onToggle={onToggle} label={`启用 ${item.name}`} />
        <span className="row-icon">
          <Glyph glyph={item.glyph} size={22} />
        </span>
        <div>
          <div className="row-name">
            {item.name}
            {item.custom ? <span className="tag">自定义</span> : null}
          </div>
          <div className="row-message" title={item.message}>
            {item.message}
          </div>
        </div>
        <label className="interval">
          每
          <input
            type="number"
            min={MIN_INTERVAL_MINUTES}
            max={MAX_INTERVAL_MINUTES}
            step={5}
            value={item.intervalMinutes}
            aria-label={`${item.name} 的提醒间隔`}
            onChange={(event) =>
              onIntervalChange(
                Math.min(
                  MAX_INTERVAL_MINUTES,
                  Math.max(MIN_INTERVAL_MINUTES, Math.round(Number(event.target.value) || MIN_INTERVAL_MINUTES)),
                ),
              )
            }
          />
          分钟
        </label>
        <label className="interval" title="完成活动需要的秒数：提醒弹出后点「开始」才计时，走满后「我已完成」才可点击，0 表示不限时">
          等待
          <input
            type="number"
            min={MIN_DURATION_SECONDS}
            max={MAX_DURATION_SECONDS}
            step={1}
            value={item.durationSeconds}
            aria-label={`${item.name} 等待的秒数`}
            onChange={(event) =>
              onDurationChange(
                Math.min(
                  MAX_DURATION_SECONDS,
                  Math.max(MIN_DURATION_SECONDS, Math.round(Number(event.target.value) || MIN_DURATION_SECONDS)),
                ),
              )
            }
          />
          秒
        </label>
        <StrengthToggle value={item.strength} onChange={onStrengthChange} />
        <span>
          {item.custom ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={onEdit}>
                编辑
              </button>
              <button type="button" className="btn-danger" onClick={onDelete}>
                删除
              </button>
            </>
          ) : null}
        </span>
      </li>
      {editing ? (
        <li>
          <ItemForm
            initial={{
              name: item.name,
              message: item.message,
              intervalMinutes: item.intervalMinutes,
              durationSeconds: item.durationSeconds,
              strength: item.strength,
            }}
            submitLabel="保存修改"
            onCancel={onCancelEdit}
            onSubmit={onSaveEdit}
          />
        </li>
      ) : null}
    </>
  );
}
