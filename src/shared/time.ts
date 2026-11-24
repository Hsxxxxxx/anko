export interface ClockRange {
  start: string;
  end: string;
}

export interface QuietWindow {
  /** 当前是否处于免打扰时段 */
  active: boolean;
  /** 当前免打扰时段的开始时间戳 */
  start: number | null;
  /** 当前免打扰时段的结束时间戳 */
  end: number | null;
  /** 下一个免打扰时段的开始时间戳 */
  nextStart: number | null;
}

/** 解析 'HH:mm' 为当天第几分钟，格式非法时返回 null */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/** 把当天第几分钟格式化为 'HH:mm' */
export function formatClock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function atMinute(base: Date, minutes: number): number {
  const midnight = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  return midnight.getTime() + minutes * 60_000;
}

/**
 * 解析当前所处的免打扰时段。
 * 跨零点的区间（例如 22:00 到 08:00）会被当作一个连续时段处理。
 */
export function resolveQuietWindow(now: Date, ranges: ClockRange[]): QuietWindow {
  const nowMs = now.getTime();
  let activeStart: number | null = null;
  let activeEnd: number | null = null;
  let nextStart: number | null = null;

  for (const range of ranges) {
    const startMinutes = parseClock(range.start);
    const endMinutes = parseClock(range.end);
    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      continue;
    }
    for (const dayOffset of [-1, 0, 1]) {
      const dayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
      const start = atMinute(dayBase, startMinutes);
      const end = atMinute(dayBase, endMinutes) + (endMinutes <= startMinutes ? 86_400_000 : 0);
      if (start <= nowMs && nowMs < end) {
        activeStart = start;
        activeEnd = end;
      } else if (start > nowMs && (nextStart === null || start < nextStart)) {
        nextStart = start;
      }
    }
  }

  return {
    active: activeEnd !== null,
    start: activeStart,
    end: activeEnd,
    nextStart,
  };
}

/** 距离目标时间戳还剩多少毫秒，已经过期返回 0 */
export function remainingMs(target: number, now: number): number {
  return Math.max(0, target - now);
}

/** 把毫秒时长格式化成 '1 小时 05 分' 这样的中文描述 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes <= 0) {
    return '不到 1 分钟';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} 分钟`;
  }
  if (minutes === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${String(minutes).padStart(2, '0')} 分`;
}

/** 把毫秒时长格式化成 '05:32' 这样的倒计时文本 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 活动要求时长的剩余毫秒数，不限时或已走满返回 0 */
export function remainingActivityMs(durationSeconds: number, elapsedMs: number): number {
  if (durationSeconds <= 0) {
    return 0;
  }
  return Math.max(0, durationSeconds * 1000 - elapsedMs);
}
