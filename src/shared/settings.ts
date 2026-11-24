import type {
  OverlayPosition,
  PetSpecies,
  QuietRange,
  ReminderGlyph,
  ReminderItem,
  ReminderStrength,
  Settings,
} from './types';
import { parseClock } from './time';

export const SETTINGS_VERSION = 2;

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 1440;
export const MIN_DURATION_SECONDS = 0;
export const MAX_DURATION_SECONDS = 600;

export const OVERLAY_POSITIONS: OverlayPosition[] = [
  'auto',
  'center',
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left',
];

export const PET_SPECIES: PetSpecies[] = ['sprout', 'cat', 'dog', 'rabbit', 'mushroom'];

export const PET_SPECIES_LABELS: Record<PetSpecies, string> = {
  sprout: '小苗',
  cat: '小猫',
  dog: '小狗',
  rabbit: '小兔',
  mushroom: '小蘑菇',
};

/** 预设项的默认完成时长，旧配置升级时按这个表补齐 */
export const PRESET_DURATION_SECONDS: Record<string, number> = {
  'preset-water': 5,
  'preset-eye': 20,
  'preset-stand': 60,
  'preset-stretch': 60,
  'preset-snack': 5,
  'preset-breathe': 5,
};

const GLYPHS: ReminderGlyph[] = [
  'water',
  'eye',
  'stand',
  'stretch',
  'snack',
  'breathe',
  'custom',
];

let idCounter = 0;

/** 生成界面与配置文件通用的短 id */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** 预设提醒项：名称、图标、间隔与提醒文案 */
export function presetItems(): ReminderItem[] {
  return [
    {
      id: 'preset-water',
      name: '喝水',
      glyph: 'water',
      message: '端起杯子，喝几口温水。',
      intervalMinutes: 45,
      durationSeconds: 5,
      strength: 'strong',
      enabled: true,
      custom: false,
    },
    {
      id: 'preset-eye',
      name: '护眼休息',
      glyph: 'eye',
      message: '看向 6 米外的地方保持 20 秒，再用力眨十次。',
      intervalMinutes: 20,
      durationSeconds: 20,
      strength: 'strong',
      enabled: true,
      custom: false,
    },
    {
      id: 'preset-stand',
      name: '起身活动',
      glyph: 'stand',
      message: '站起来走一走，接一杯水，顺便离开屏幕。',
      intervalMinutes: 60,
      durationSeconds: 60,
      strength: 'normal',
      enabled: true,
      custom: false,
    },
    {
      id: 'preset-stretch',
      name: '拉伸肩颈',
      glyph: 'stretch',
      message: '肩膀向后绕环 10 次，颈部左右各拉伸 15 秒。',
      intervalMinutes: 90,
      durationSeconds: 60,
      strength: 'normal',
      enabled: false,
      custom: false,
    },
    {
      id: 'preset-snack',
      name: '补充水果',
      glyph: 'snack',
      message: '吃点水果或坚果，把刚才消耗掉的注意力补回来。',
      intervalMinutes: 120,
      durationSeconds: 5,
      strength: 'normal',
      enabled: false,
      custom: false,
    },
    {
      id: 'preset-breathe',
      name: '深呼吸',
      glyph: 'breathe',
      message: '吸气 4 秒，屏住 4 秒，呼气 6 秒，重复 5 轮。',
      intervalMinutes: 30,
      durationSeconds: 5,
      strength: 'normal',
      enabled: false,
      custom: false,
    },
  ];
}

/** 新的自定义提醒项 */
export function createCustomItem(input: {
  name: string;
  message: string;
  intervalMinutes: number;
  durationSeconds: number;
  strength: ReminderStrength;
}): ReminderItem {
  return {
    id: newId('custom'),
    name: input.name,
    glyph: 'custom',
    message: input.message,
    intervalMinutes: input.intervalMinutes,
    durationSeconds: input.durationSeconds,
    strength: input.strength,
    enabled: true,
    custom: true,
  };
}

/** 出厂默认设置 */
export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    items: presetItems(),
    quietRanges: [{ id: newId('quiet'), start: '22:00', end: '08:00' }],
    soundEnabled: true,
    autoLaunch: false,
    startMinimized: false,
    closeToTray: true,
    normalDismissSeconds: 12,
    snoozeMinutes: 5,
    showFloatingBall: false,
    petType: 'sprout',
    autoStart: false,
    overlayPosition: 'auto',
    overlayOffset: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

function normalizeItem(raw: unknown): ReminderItem | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (id === null || name.length === 0 || name.length > 24) {
    return null;
  }
  const glyph = GLYPHS.includes(raw.glyph as ReminderGlyph) ? (raw.glyph as ReminderGlyph) : 'custom';
  const strength: ReminderStrength = raw.strength === 'strong' ? 'strong' : 'normal';
  const message = typeof raw.message === 'string' ? raw.message.trim().slice(0, 60) : '';
  // 早期版本用分钟记录时长，读取旧配置时换算成秒
  const rawDuration =
    typeof raw.durationSeconds === 'number'
      ? raw.durationSeconds
      : typeof raw.durationMinutes === 'number'
        ? raw.durationMinutes * 60
        : undefined;
  return {
    id,
    name,
    glyph,
    message: message.length > 0 ? message : '现在停下手上的事，做一次短暂休息。',
    intervalMinutes: clampInteger(raw.intervalMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, 45),
    durationSeconds: clampInteger(rawDuration, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS, 0),
    strength,
    enabled: raw.enabled !== false,
    custom: raw.custom === true,
  };
}

function normalizeQuietRange(raw: unknown): QuietRange | null {
  if (!isRecord(raw)) {
    return null;
  }
  const start = typeof raw.start === 'string' ? raw.start : '';
  const end = typeof raw.end === 'string' ? raw.end : '';
  if (parseClock(start) === null || parseClock(end) === null || start === end) {
    return null;
  }
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : newId('quiet');
  return { id, start, end };
}

/** 旧配置里预设项的等待时间为 0，升级时补上各自的默认时长 */
function applyPresetDuration(item: ReminderItem, legacy: boolean): ReminderItem {
  if (!legacy || item.durationSeconds !== 0) {
    return item;
  }
  const preset = PRESET_DURATION_SECONDS[item.id];
  if (preset === undefined) {
    return item;
  }
  return { ...item, durationSeconds: preset };
}

function normalizeOffset(raw: unknown): { dx: number; dy: number } | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (typeof raw.dx !== 'number' || typeof raw.dy !== 'number') {
    return null;
  }
  if (!Number.isFinite(raw.dx) || !Number.isFinite(raw.dy)) {
    return null;
  }
  if (Math.abs(raw.dx) < 1 && Math.abs(raw.dy) < 1) {
    return null;
  }
  return { dx: Math.round(raw.dx), dy: Math.round(raw.dy) };
}

/**
 * 把任意来源的数据整理成合法设置。
 * 非法条目会被丢弃，其余字段补上默认值。
 */
export function normalizeSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (!isRecord(raw)) {
    return base;
  }
  // 配置版本低于 2 的老文件没有预设等待时间，按预设表补齐
  const legacy = typeof raw.version !== 'number' || raw.version < 2;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map(normalizeItem)
        .filter((item): item is ReminderItem => item !== null)
        .map((item) => applyPresetDuration(item, legacy))
    : base.items;
  const quietRanges = Array.isArray(raw.quietRanges)
    ? raw.quietRanges.map(normalizeQuietRange).filter((range): range is QuietRange => range !== null)
    : base.quietRanges;
  const overlayPosition = OVERLAY_POSITIONS.includes(raw.overlayPosition as OverlayPosition)
    ? (raw.overlayPosition as OverlayPosition)
    : 'auto';
  const petType = PET_SPECIES.includes(raw.petType as PetSpecies) ? (raw.petType as PetSpecies) : base.petType;
  return {
    version: SETTINGS_VERSION,
    items: items.length > 0 ? items : base.items,
    quietRanges,
    soundEnabled: raw.soundEnabled !== false,
    autoLaunch: raw.autoLaunch === true,
    startMinimized: raw.startMinimized === true,
    closeToTray: raw.closeToTray !== false,
    normalDismissSeconds: clampInteger(raw.normalDismissSeconds, 5, 120, base.normalDismissSeconds),
    snoozeMinutes: clampInteger(raw.snoozeMinutes, 1, 60, base.snoozeMinutes),
    showFloatingBall: raw.showFloatingBall === true,
    petType,
    autoStart: raw.autoStart === true,
    overlayPosition,
    overlayOffset: normalizeOffset(raw.overlayOffset),
  };
}
