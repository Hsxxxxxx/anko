export interface DueDecision {
  /** 是否应该立刻弹提醒 */
  fire: boolean;
  /** 下次触发的时间戳 */
  nextDue: number;
  /** 是否因为免打扰被顺延 */
  deferred: boolean;
}

/**
 * 判断某个提醒项此刻是否该弹窗，并给出下一次触发时间。
 * 免打扰时段内到期的提醒会顺延到时段结束后一分钟，不会积压成一次性轰炸。
 */
export function decideDue(params: {
  dueAt: number;
  intervalMinutes: number;
  now: number;
  /** 当前免打扰时段的结束时间戳，非免打扰时为 null */
  quietUntil: number | null;
}): DueDecision {
  const { dueAt, intervalMinutes, now, quietUntil } = params;
  if (now < dueAt) {
    return { fire: false, nextDue: dueAt, deferred: false };
  }
  if (quietUntil !== null && quietUntil > now) {
    return { fire: false, nextDue: quietUntil + 60_000, deferred: true };
  }
  return { fire: true, nextDue: dueAt + intervalMinutes * 60_000, deferred: false };
}

/** 新的间隔生效后，从当前时间重新计算下一次触发 */
export function rescheduleFrom(intervalMinutes: number, now: number): number {
  return now + intervalMinutes * 60_000;
}

/** 把刻度条切成 count 段，返回每段是否已经走完 */
export function tickProgress(remainingMs: number, totalMs: number, count: number): boolean[] {
  const safeCount = Math.max(1, Math.min(count, 60));
  if (totalMs <= 0) {
    return new Array<boolean>(safeCount).fill(true);
  }
  const elapsedRatio = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
  const filled = elapsedRatio * safeCount;
  return Array.from({ length: safeCount }, (_, index) => filled > index);
}
