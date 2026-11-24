import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { createAlerter } from '../renderer/sound';
import type { Alerter } from '../renderer/sound';
import { decideDue, rescheduleFrom } from '../shared/schedule';
import { normalizeSettings } from '../shared/settings';
import type { AnkoApi } from '../shared/anko-api';
import { resolveQuietWindow } from '../shared/time';
import type {
  AppInfo,
  AppState,
  CompletionStats,
  LastReminder,
  OverlayPayload,
  ReminderGlyph,
  ReminderItem,
  Settings,
} from '../shared/types';

const SETTINGS_KEY = 'anko-settings';
const STATS_KEY = 'anko-stats';
const DUE_KEY = 'anko-due';
const TICK_MS = 1000;
const MAX_RECENT = 20;
/** 只把 24 小时内的到期时间排成系统通知，更远的由回到前台时的 tick 兜底 */
const MAX_NOTIFY_AHEAD_MS = 24 * 60 * 60_000;

const GLYPH_VALUES: ReminderGlyph[] = ['water', 'eye', 'stand', 'stretch', 'snack', 'breathe', 'custom'];

function toGlyph(value: unknown): ReminderGlyph {
  return GLYPH_VALUES.includes(value as ReminderGlyph) ? (value as ReminderGlyph) : 'custom';
}

export function isAndroidPlatform(): boolean {
  return window.Capacitor?.isNativePlatform() === true;
}

interface DueSnapshot {
  dueMap: Record<string, number>;
  pausedUntil: number | null;
}

/** 提醒项 id 到稳定通知 id 的映射，保证同一提醒项的通知可被取消与更新 */
function notificationIdFor(itemId: string): number {
  let hash = 0;
  for (const ch of itemId) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return (hash % 900_000) + 1000;
}

function emptyStats(): CompletionStats {
  return { total: 0, byItem: {}, recent: [] };
}

function normalizeStats(raw: unknown): CompletionStats {
  if (typeof raw !== 'object' || raw === null) {
    return emptyStats();
  }
  const record = raw as Record<string, unknown>;
  const total = typeof record.total === 'number' && record.total >= 0 ? Math.round(record.total) : 0;
  const byItem: CompletionStats['byItem'] = {};
  if (typeof record.byItem === 'object' && record.byItem !== null) {
    for (const [id, entry] of Object.entries(record.byItem as Record<string, unknown>)) {
      if (typeof entry === 'object' && entry !== null) {
        const value = entry as Record<string, unknown>;
        byItem[id] = {
          name: typeof value.name === 'string' ? value.name : '提醒',
          glyph: toGlyph(value.glyph),
          count: typeof value.count === 'number' ? Math.max(0, Math.round(value.count)) : 0,
        };
      }
    }
  }
  const recent: CompletionStats['recent'] = Array.isArray(record.recent)
    ? record.recent
        .filter((entry): entry is { name: string; glyph: string; at: number } => {
          if (typeof entry !== 'object' || entry === null) {
            return false;
          }
          const value = entry as Record<string, unknown>;
          return typeof value.name === 'string' && typeof value.at === 'number';
        })
        .map((entry) => ({ name: entry.name, glyph: toGlyph(entry.glyph), at: entry.at }))
        .slice(0, MAX_RECENT)
    : [];
  return { total, byItem, recent };
}

/**
 * Android 桥接：在 WebView 内实现与 Electron preload 相同形状的安叩能力。
 * 调度逻辑与主进程 Scheduler 一致；应用退到后台时由系统本地通知接管提醒，
 * 回到前台时取消对应通知并改在应用内弹窗。
 */
export function installAndroidBridge(): void {
  let settings: Settings | null = null;
  let stats = emptyStats();
  let dueMap = new Map<string, number>();
  let pausedUntil: number | null = null;
  let quietUntil: number | null = null;
  let activeQueue: ReminderItem[] = [];
  let previewedItemId: string | null = null;
  let forcedStops = 0;
  let lastReminder: LastReminder | null = null;
  let activityRemaining: number | null = null;
  let tickTimer: number | null = null;
  let ready = false;
  let bootstrapPromise: Promise<void> | null = null;
  let appStateListener: PluginListenerHandle | null = null;
  let notificationListener: PluginListenerHandle | null = null;

  const alerter: Alerter = createAlerter();
  const stateListeners = new Set<(state: AppState) => void>();
  const payloadListeners = new Set<(payload: OverlayPayload | null) => void>();

  const persistDue = (): void => {
    const snapshot: DueSnapshot = {
      dueMap: Object.fromEntries(dueMap),
      pausedUntil,
    };
    void Preferences.set({ key: DUE_KEY, value: JSON.stringify(snapshot) });
  };

  const persistStats = (): void => {
    void Preferences.set({ key: STATS_KEY, value: JSON.stringify(stats) });
  };

  const refreshQuietWindow = (now: number): void => {
    if (settings === null) {
      quietUntil = null;
      return;
    }
    const window = resolveQuietWindow(new Date(now), settings.quietRanges);
    quietUntil = window.active ? window.end : null;
  };

  /** 与主进程 applySettings 相同：间隔未变且尚未到期的提醒项保留原触发时间 */
  const applySettings = (next: Settings): void => {
    const now = Date.now();
    const previous = settings;
    const kept = new Map<string, number>();
    for (const item of next.items) {
      if (!item.enabled) {
        continue;
      }
      const old = dueMap.get(item.id);
      const oldItem = previous?.items.find((candidate) => candidate.id === item.id);
      if (oldItem !== undefined && oldItem.intervalMinutes === item.intervalMinutes && old !== undefined && old > now) {
        kept.set(item.id, old);
      } else {
        kept.set(item.id, rescheduleFrom(item.intervalMinutes, now));
      }
    }
    settings = next;
    dueMap = kept;
    refreshQuietWindow(now);
    persistDue();
  };

  const buildPayload = (item: ReminderItem): OverlayPayload => {
    return {
      item,
      strong: item.strength === 'strong',
      dismissSeconds: settings?.normalDismissSeconds ?? 12,
      snoozeMinutes: settings?.snoozeMinutes ?? 5,
      soundEnabled: settings?.soundEnabled ?? true,
      autoStart: settings?.autoStart ?? false,
      queueLength: Math.max(0, activeQueue.length - 1),
      petType: settings?.petType ?? 'sprout',
    };
  };

  const emitPayload = (payload: OverlayPayload | null): void => {
    for (const listener of payloadListeners) {
      listener(payload);
    }
  };

  const recordCompletion = (item: ReminderItem): void => {
    stats = {
      total: stats.total + 1,
      byItem: {
        ...stats.byItem,
        [item.id]: {
          name: item.name,
          glyph: item.glyph,
          count: (stats.byItem[item.id]?.count ?? 0) + 1,
        },
      },
      recent: [{ name: item.name, glyph: item.glyph, at: Date.now() }, ...stats.recent].slice(0, MAX_RECENT),
    };
    persistStats();
  };

  const presentItem = (item: ReminderItem): void => {
    lastReminder = { name: item.name, glyph: item.glyph, at: Date.now() };
    const payload = buildPayload(item);
    activeQueue = [item];
    emitPayload(payload);
    if (payload.soundEnabled) {
      if (payload.strong) {
        alerter.start();
      } else {
        alerter.beepOnce();
      }
    }
    emitState();
  };

  /**
   * 结束当前提醒，与主进程 handleOverlayAction 相同：
   * complete 记入统计，仅预览弹层从当前时间重排间隔；force 只计强制停止；snooze 延后；dismiss 不动调度。
   */
  const clearActive = (reason: 'complete' | 'dismiss' | 'snooze' | 'force'): void => {
    const current = activeQueue[0];
    if (current === undefined || settings === null) {
      return;
    }
    const now = Date.now();
    const isPreview = current.id === previewedItemId;
    if (isPreview) {
      previewedItemId = null;
    }
    if (reason === 'complete') {
      recordCompletion(current);
      if (isPreview) {
        dueMap.set(current.id, rescheduleFrom(current.intervalMinutes, now));
      }
    } else if (reason === 'force') {
      forcedStops += 1;
    } else if (reason === 'snooze') {
      dueMap.set(current.id, now + settings.snoozeMinutes * 60_000);
    }
    persistDue();
    void cancelItemNotification(current.id);
    activeQueue = [];
    alerter.stop();
    activityRemaining = null;
    emitPayload(null);
    emitState();
    if (isBackground()) {
      schedulePendingNotifications();
    }
  };

  const getState = (): AppState => {
    const now = Date.now();
    const nextDue: Record<string, number> = {};
    for (const [id, due] of dueMap) {
      nextDue[id] = due;
    }
    const active = activeQueue[0];
    const nextReminder = (() => {
      let earliest: ReminderItem | null = null;
      let earliestDue = Number.POSITIVE_INFINITY;
      for (const item of settings?.items ?? []) {
        if (!item.enabled) {
          continue;
        }
        const due = dueMap.get(item.id);
        if (due === undefined || due >= earliestDue) {
          continue;
        }
        earliest = item;
        earliestDue = due;
      }
      if (earliest === null || earliestDue === Number.POSITIVE_INFINITY) {
        return null;
      }
      return {
        id: earliest.id,
        name: earliest.name,
        glyph: earliest.glyph,
        strength: earliest.strength,
        due: earliestDue,
        intervalMinutes: earliest.intervalMinutes,
      };
    })();
    return {
      scheduler: {
        now,
        pausedUntil,
        nextDue,
        quietUntil,
        activeReminderId: active?.id ?? null,
        screenLocked: false,
        fullscreenActive: false,
      },
      forcedStops,
      lastReminder,
      nextReminder,
      activeReminder: active === undefined ? null : { name: active.name, glyph: active.glyph },
      activeActivity: activityRemaining === null ? null : { glyph: active?.glyph ?? 'custom', remainingSeconds: activityRemaining },
      stats,
      petType: settings?.petType ?? 'sprout',
      overlayOffset: null,
      notice: null,
    };
  };

  const emitState = (): void => {
    const state = getState();
    for (const listener of stateListeners) {
      listener(state);
    }
  };

  const isBackground = (): boolean => {
    return document.visibilityState === 'hidden';
  };

  /** 把尚未到期的提醒排成系统通知，供应用退到后台时提醒用户 */
  const schedulePendingNotifications = (): void => {
    if (settings === null) {
      return;
    }
    const now = Date.now();
    for (const item of settings.items) {
      if (!item.enabled) {
        continue;
      }
      const due = dueMap.get(item.id);
      if (due === undefined) {
        continue;
      }
      const decision = decideDue({
        dueAt: due,
        intervalMinutes: item.intervalMinutes,
        now,
        quietUntil,
      });
      const fireAt = decision.fire ? now : decision.nextDue;
      if (fireAt - now > MAX_NOTIFY_AHEAD_MS) {
        continue;
      }
      void LocalNotifications.cancel({ notifications: [{ id: notificationIdFor(item.id) }] });
      void LocalNotifications.schedule({
        notifications: [
          {
            id: notificationIdFor(item.id),
            title: `安叩 · ${item.name}`,
            body: item.message,
            schedule: { at: new Date(fireAt) },
          },
        ],
      });
    }
  };

  const cancelItemNotification = async (itemId: string): Promise<void> => {
    await LocalNotifications.cancel({ notifications: [{ id: notificationIdFor(itemId) }] });
  };

  /** 回到前台：已经到期的提醒取消通知并改在应用内弹出，未到期的保留通知 */
  const syncAfterResume = (): void => {
    if (settings === null) {
      return;
    }
    const now = Date.now();
    for (const item of settings.items) {
      if (!item.enabled) {
        continue;
      }
      const due = dueMap.get(item.id);
      if (due === undefined || due > now) {
        continue;
      }
      void cancelItemNotification(item.id);
      if (activeQueue.length === 0) {
        presentItem(item);
      }
    }
    emitState();
  };

  const tick = (): void => {
    if (settings === null) {
      return;
    }
    const now = Date.now();
    refreshQuietWindow(now);
    if (pausedUntil !== null && now >= pausedUntil) {
      pausedUntil = null;
    }
    const paused = pausedUntil !== null && pausedUntil > now;
    if (!paused && activeQueue.length === 0) {
      for (const item of settings.items) {
        if (!item.enabled) {
          continue;
        }
        const dueAt = dueMap.get(item.id);
        if (dueAt === undefined) {
          continue;
        }
        const decision = decideDue({
          dueAt,
          intervalMinutes: item.intervalMinutes,
          now,
          quietUntil,
        });
        dueMap.set(item.id, decision.nextDue);
        if (decision.fire) {
          // 后台期间可能已排过同名系统通知，应用内弹出前先撤掉，避免双响
          void cancelItemNotification(item.id);
          presentItem(item);
          persistDue();
          break;
        }
      }
    } else if (!paused && dueMap.size > 0) {
      // 有提醒进行中时只推进免打扰窗口，不抢占当前提醒
    }
    emitState();
  };

  const startTick = (): void => {
    if (tickTimer !== null) {
      return;
    }
    tickTimer = window.setInterval(tick, TICK_MS);
    tick();
  };

  /** 应用内提示音需要一次用户交互解锁 WebView 的音频，首次触摸时预热 */
  const armAudioUnlock = (): void => {
    const unlock = (): void => {
      alerter.beepOnce();
      alerter.stop();
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('touchstart', unlock, { once: true });
  };

  const bootstrap = async (): Promise<void> => {
    const [settingsRaw, statsRaw, dueRaw] = await Promise.all([
      Preferences.get({ key: SETTINGS_KEY }),
      Preferences.get({ key: STATS_KEY }),
      Preferences.get({ key: DUE_KEY }),
    ]);
    const nextSettings = normalizeSettings(settingsRaw.value ? JSON.parse(settingsRaw.value) : null);
    stats = normalizeStats(statsRaw.value ? JSON.parse(statsRaw.value) : null);
    if (typeof dueRaw.value === 'string') {
      try {
        const snapshot = JSON.parse(dueRaw.value) as DueSnapshot;
        if (typeof snapshot === 'object' && snapshot !== null) {
          dueMap = new Map(Object.entries(snapshot.dueMap ?? {}).filter(([, due]) => typeof due === 'number'));
          pausedUntil = typeof snapshot.pausedUntil === 'number' ? snapshot.pausedUntil : null;
        }
      } catch {
        // 本地快照损坏时按新设置重新计时
      }
    }
    applySettings(nextSettings);
    ready = true;
    startTick();
    armAudioUnlock();
    void LocalNotifications.createChannel({ id: 'anko-reminders', name: '安叩提醒' });
    appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        syncAfterResume();
      } else {
        schedulePendingNotifications();
      }
    });
    notificationListener = await LocalNotifications.addListener('localNotificationActionPerformed', async () => {
      // 从通知进入应用需要一点时间完成切换，稍后再同步到期提醒
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      syncAfterResume();
    });
  };

  const api: AnkoApi = {
    platform: 'android',
    getSettings: async (): Promise<Settings> => {
      if (bootstrapPromise !== null) {
        await bootstrapPromise;
      }
      if (settings === null) {
        return normalizeSettings(null);
      }
      return settings;
    },
    saveSettings: async (next: Settings): Promise<Settings> => {
      const normalized = normalizeSettings(next);
      await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(normalized) });
      applySettings(normalized);
      if (isBackground()) {
        schedulePendingNotifications();
      }
      emitState();
      return normalized;
    },
    resetSettings: async (): Promise<Settings> => {
      const normalized = normalizeSettings(null);
      await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(normalized) });
      applySettings(normalized);
      emitState();
      return normalized;
    },
    getState: async (): Promise<AppState> => {
      if (bootstrapPromise !== null) {
        await bootstrapPromise;
      }
      return getState();
    },
    getAppInfo: async (): Promise<AppInfo> => ({
      version: '1.0.0',
      settingsDir: '手机本地存储',
      platform: 'android',
    }),
    showMainWindow: async (): Promise<void> => undefined,
    previewReminder: async (): Promise<void> => {
      if (!ready || settings === null || activeQueue.length > 0) {
        return;
      }
      let earliest: ReminderItem | null = null;
      let earliestDue = Number.POSITIVE_INFINITY;
      for (const item of settings.items) {
        if (!item.enabled) {
          continue;
        }
        const due = dueMap.get(item.id);
        if (due !== undefined && due < earliestDue) {
          earliest = item;
          earliestDue = due;
        }
      }
      if (earliest !== null) {
        previewedItemId = earliest.id;
        presentItem(earliest);
      }
    },
    previewItem: async (itemId: string): Promise<void> => {
      if (!ready || settings === null || activeQueue.length > 0) {
        return;
      }
      const item = settings.items.find((candidate) => candidate.id === itemId && candidate.enabled);
      if (item !== undefined) {
        previewedItemId = item.id;
        presentItem(item);
      }
    },
    pause: async (minutes: number): Promise<void> => {
      pausedUntil = Date.now() + minutes * 60_000;
      persistDue();
      if (isBackground()) {
        schedulePendingNotifications();
      }
      emitState();
    },
    resume: async (): Promise<void> => {
      pausedUntil = null;
      persistDue();
      emitState();
    },
    setAutoLaunch: async (): Promise<void> => undefined,
    getOverlayPayload: async (): Promise<OverlayPayload | null> => {
      const item = activeQueue[0];
      return item === undefined ? null : buildPayload(item);
    },
    sendOverlayAction: (action): void => {
      if (activeQueue.length === 0) {
        return;
      }
      if (action === 'complete') {
        clearActive('complete');
      } else if (action === 'dismiss') {
        clearActive('dismiss');
      } else if (action === 'snooze') {
        clearActive('snooze');
      } else {
        clearActive('force');
      }
    },
    sendOverlayActivity: (remainingSeconds: number): void => {
      const next = remainingSeconds > 0 ? remainingSeconds : null;
      if (activityRemaining !== null && next === null) {
        const current = activeQueue[0];
        if (current !== undefined && settings?.soundEnabled) {
          alerter.ding();
        }
      }
      activityRemaining = next;
      emitState();
    },
    sendOverlayDrag: (): void => undefined,
    sendPetDrag: (): void => undefined,
    togglePetPanel: async (): Promise<void> => undefined,
    closePetPanel: async (): Promise<void> => undefined,
    resetPetPosition: async (): Promise<void> => undefined,
    resetOverlayPosition: async (): Promise<void> => undefined,
    snoozeNext: async (): Promise<void> => {
      let earliestId: string | null = null;
      let earliest = Number.POSITIVE_INFINITY;
      for (const [id, due] of dueMap) {
        if (due < earliest) {
          earliest = due;
          earliestId = id;
        }
      }
      if (earliestId !== null) {
        dueMap.set(earliestId, Date.now() + (settings?.snoozeMinutes ?? 5) * 60_000);
        persistDue();
        if (isBackground()) {
          schedulePendingNotifications();
        }
        emitState();
      }
    },
    resetTimers: async (): Promise<void> => {
      const now = Date.now();
      for (const item of settings?.items ?? []) {
        if (item.enabled) {
          dueMap.set(item.id, rescheduleFrom(item.intervalMinutes, now));
        }
      }
      persistDue();
      if (isBackground()) {
        schedulePendingNotifications();
      }
      emitState();
    },
    quit: async (): Promise<void> => undefined,
    onState: (handler): void => {
      stateListeners.add(handler);
    },
    onPetMotion: (): void => undefined,
    onPetDock: (): void => undefined,
    onOverlayPayload: (handler): void => {
      payloadListeners.add(handler);
    },
    onOverlaySuppressed: (): void => undefined,
  };

  window.anko = api;
  bootstrapPromise = bootstrap();
}
