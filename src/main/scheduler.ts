import type { ReminderItem, SchedulerState, Settings } from '../shared/types';
import { decideDue, rescheduleFrom } from '../shared/schedule';
import { resolveQuietWindow } from '../shared/time';

const TICK_INTERVAL_MS = 1000;

/** 负责按间隔触发提醒，并在免打扰时段内顺延 */
export class Scheduler {
  private settings: Settings | null = null;
  private dueMap = new Map<string, number>();
  private pausedUntil: number | null = null;
  private quietUntil: number | null = null;
  private screenLocked = false;
  private fullscreen = false;
  private timer: NodeJS.Timeout | null = null;
  /** 提醒到期时回调 */
  onDue: ((item: ReminderItem) => void) | null = null;
  /** 每次时钟推进后回调，用于把最新状态推给界面 */
  onState: ((state: SchedulerState) => void) | null = null;

  start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * 应用新设置。间隔没变且尚未到期的提醒项保留原来的触发时间，
   * 其余情况从当前时间重新计时。
   */
  applySettings(settings: Settings): void {
    const now = Date.now();
    const previousSettings = this.settings;
    const previousDue = this.dueMap;
    const next = new Map<string, number>();

    for (const item of settings.items) {
      if (!item.enabled) {
        continue;
      }
      const old = previousDue.get(item.id);
      const oldItem = previousSettings?.items.find((candidate) => candidate.id === item.id);
      if (oldItem && oldItem.intervalMinutes === item.intervalMinutes && old !== undefined && old > now) {
        next.set(item.id, old);
      } else {
        next.set(item.id, rescheduleFrom(item.intervalMinutes, now));
      }
    }

    this.settings = settings;
    this.dueMap = next;
    this.refreshQuietWindow(now);
  }

  /** 延后某个提醒项 */
  snooze(itemId: string, minutes: number): void {
    this.dueMap.set(itemId, Date.now() + minutes * 60_000);
    this.emitState();
  }

  /** 把某个提醒项记为已完成，间隔从当前时间重新起算 */
  completeItem(itemId: string): void {
    const item = this.settings?.items.find((candidate) => candidate.id === itemId && candidate.enabled);
    if (item === undefined) {
      return;
    }
    this.dueMap.set(itemId, rescheduleFrom(item.intervalMinutes, Date.now()));
    this.emitState();
  }

  /** 延后当前最早到期的提醒项 */
  snoozeNext(minutes: number): void {
    let earliestId: string | null = null;
    let earliest = Number.POSITIVE_INFINITY;
    for (const [id, due] of this.dueMap) {
      if (due < earliest) {
        earliest = due;
        earliestId = id;
      }
    }
    if (earliestId !== null) {
      this.snooze(earliestId, minutes);
    }
  }

  /** 所有提醒项从当前时间重新起算 */
  resetTimers(): void {
    const now = Date.now();
    for (const item of this.settings?.items ?? []) {
      if (item.enabled) {
        this.dueMap.set(item.id, rescheduleFrom(item.intervalMinutes, now));
      }
    }
    this.emitState();
  }

  /** 暂停全部提醒 */
  pause(minutes: number): void {
    this.pausedUntil = Date.now() + minutes * 60_000;
    this.emitState();
  }

  /** 取消暂停 */
  resume(): void {
    this.pausedUntil = null;
    this.emitState();
  }

  isPaused(): boolean {
    return this.pausedUntil !== null && this.pausedUntil > Date.now();
  }

  isScreenLocked(): boolean {
    return this.screenLocked;
  }

  isFullscreenActive(): boolean {
    return this.fullscreen;
  }

  /**
   * 屏幕锁定期间冻结调度：不触发、不推进任何提醒项。
   * 解锁时全部提醒项从解锁时刻重新计一个完整间隔，避免积压的提醒集中弹出。
   */
  setScreenLocked(locked: boolean): void {
    if (this.screenLocked === locked) {
      return;
    }
    this.screenLocked = locked;
    if (!locked) {
      this.resetTimers();
    }
    this.emitState();
  }

  /**
   * 鼠标所在显示器有全屏应用（游戏、放映）时冻结调度：不触发、不推进，
   * 结束后全部提醒项从当前时刻重新计一个完整间隔，避免积压的提醒集中弹出。
   */
  setFullscreen(active: boolean): void {
    if (this.fullscreen === active) {
      return;
    }
    this.fullscreen = active;
    if (!active) {
      this.resetTimers();
    }
    this.emitState();
  }

  getState(): SchedulerState {
    const now = Date.now();
    const nextDue: Record<string, number> = {};
    for (const [id, due] of this.dueMap) {
      nextDue[id] = due;
    }
    return {
      now,
      pausedUntil: this.pausedUntil,
      nextDue,
      quietUntil: this.quietUntil,
      activeReminderId: null,
      screenLocked: this.screenLocked,
      fullscreenActive: this.fullscreen,
    };
  }

  private refreshQuietWindow(now: number): void {
    if (this.settings === null) {
      this.quietUntil = null;
      return;
    }
    const window = resolveQuietWindow(new Date(now), this.settings.quietRanges);
    this.quietUntil = window.active ? window.end : null;
  }

  private tick(): void {
    if (this.settings === null) {
      return;
    }
    const now = Date.now();
    this.refreshQuietWindow(now);

    if (this.pausedUntil !== null && now >= this.pausedUntil) {
      this.pausedUntil = null;
    }
    if (!this.isPaused() && !this.screenLocked && !this.fullscreen) {
      for (const item of this.settings.items) {
        if (!item.enabled) {
          continue;
        }
        const dueAt = this.dueMap.get(item.id);
        if (dueAt === undefined) {
          continue;
        }
        const decision = decideDue({
          dueAt,
          intervalMinutes: item.intervalMinutes,
          now,
          quietUntil: this.quietUntil,
        });
        this.dueMap.set(item.id, decision.nextDue);
        if (decision.fire && this.onDue) {
          this.onDue(item);
        }
      }
    }
    this.emitState();
  }

  private emitState(): void {
    if (this.onState) {
      this.onState(this.getState());
    }
  }
}
