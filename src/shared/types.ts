/** 提醒强度：strong 需要确认才能停，normal 到点后自动消失 */
export type ReminderStrength = 'strong' | 'normal';

/** 提醒项图标标识，自定义项统一使用 custom */
export type ReminderGlyph =
  | 'water'
  | 'eye'
  | 'stand'
  | 'stretch'
  | 'snack'
  | 'breathe'
  | 'custom';

export interface ReminderItem {
  id: string;
  name: string;
  glyph: ReminderGlyph;
  /** 提醒时展示的一句话 */
  message: string;
  intervalMinutes: number;
  /** 完成活动需要的秒数，0 表示不限时，到点即可确认完成 */
  durationSeconds: number;
  strength: ReminderStrength;
  enabled: boolean;
  /** 自定义项可以删除，预设项固定保留 */
  custom: boolean;
}

export interface QuietRange {
  id: string;
  /** 'HH:mm' */
  start: string;
  /** 'HH:mm' */
  end: string;
}

/** 最近一次响起的提醒，供桌面宠物展示 */
export interface LastReminder {
  name: string;
  glyph: ReminderGlyph;
  /** 响起时刻的时间戳 */
  at: number;
}

/** 下一条待响起的提醒，供桌面宠物与快捷面板展示 */
export interface NextReminder {
  id: string;
  name: string;
  glyph: ReminderGlyph;
  strength: ReminderStrength;
  /** 触发时刻的时间戳 */
  due: number;
  intervalMinutes: number;
}

/** 桌面宠物形象：小苗、小猫、小狗、小兔、小蘑菇 */
export type PetSpecies = 'sprout' | 'cat' | 'dog' | 'rabbit' | 'mushroom';

/** 活动计时进行中：供桌面宠物做对应的休息动作 */
export interface ActiveActivity {
  glyph: ReminderGlyph;
  remainingSeconds: number;
}

/** 提醒弹出位置：auto 跟随提醒类型，center 屏幕中间，其余固定角落 */
export type OverlayPosition = 'auto' | 'center' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface Settings {
  version: number;
  items: ReminderItem[];
  quietRanges: QuietRange[];
  soundEnabled: boolean;
  autoLaunch: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  /** 普通提醒自动消失的秒数 */
  normalDismissSeconds: number;
  /** 延后提醒的分钟数 */
  snoozeMinutes: number;
  /** 是否显示桌面宠物 */
  showFloatingBall: boolean;
  /** 桌面宠物形象 */
  petType: PetSpecies;
  /** 提醒弹出后直接开始计时，不用点「开始」 */
  autoStart: boolean;
  /** 提醒弹窗出现的角落 */
  overlayPosition: OverlayPosition;
  /** 用户拖动弹窗后的偏移量，null 表示仍在设置的位置 */
  overlayOffset: { dx: number; dy: number } | null;
}

export interface OverlayPayload {
  item: ReminderItem;
  /** 强提醒为 true：置顶小窗且必须确认 */
  strong: boolean;
  dismissSeconds: number;
  snoozeMinutes: number;
  soundEnabled: boolean;
  /** 自动开始：提醒弹出即开始计时 */
  autoStart: boolean;
  /** 队列中等待提醒的条数 */
  queueLength: number;
  /** 桌面宠物形象，用于底部的情感化文案 */
  petType: PetSpecies;
}

export type OverlayAction = 'complete' | 'snooze' | 'dismiss' | 'force' | 'force-confirmed';

/** 完成统计：主进程记录每次完成提醒的累计与明细，供主窗口展示与激励成长 */
export interface CompletionStats {
  total: number;
  /** 提醒项 id 到完成次数与名称的映射，名称用于已删除自定义项的展示 */
  byItem: Record<string, { name: string; glyph: ReminderGlyph; count: number }>;
  /** 最近完成的记录，最新的在前 */
  recent: { name: string; glyph: ReminderGlyph; at: number }[];
}

export interface SchedulerState {
  now: number;
  /** 暂停到该时间戳，null 表示未暂停 */
  pausedUntil: number | null;
  /** 提醒项 id 到下次触发时间戳的映射 */
  nextDue: Record<string, number>;
  /** 当前免打扰时段的结束时间戳 */
  quietUntil: number | null;
  /** 正在展示的提醒项 id */
  activeReminderId: string | null;
  /** 屏幕锁定中：调度冻结，解锁后重新计时 */
  screenLocked: boolean;
  /** 鼠标所在显示器有全屏应用：调度冻结，结束后重新计时 */
  fullscreenActive: boolean;
}

export interface AppInfo {
  version: string;
  /** 设置文件所在目录 */
  settingsDir: string;
  platform: string;
}

export interface AppState {
  scheduler: SchedulerState;
  /** 被强制停止的提醒次数 */
  forcedStops: number;
  /** 最近一次响起的提醒 */
  lastReminder: LastReminder | null;
  /** 下一条待响起的提醒 */
  nextReminder: NextReminder | null;
  /** 正在展示的提醒 */
  activeReminder: { name: string; glyph: ReminderGlyph } | null;
  /** 正在进行的活动计时，null 表示没有在计时 */
  activeActivity: ActiveActivity | null;
  /** 完成统计：累计次数、分项目计数与最近记录 */
  stats: CompletionStats;
  /** 桌面宠物形象 */
  petType: PetSpecies;
  /** 弹窗拖动留下的偏移，没有拖动过为空 */
  overlayOffset: { dx: number; dy: number } | null;
  /** 启动时的异常提示，正常为空 */
  notice: string | null;
}
