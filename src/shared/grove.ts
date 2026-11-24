import type { PetSpecies } from './types';

/** 成长阶段：完成提醒的次数驱动阶段推进，桌面宠物与主窗口共用 */
export const GROVE_STAGES = [
  { min: 0 },
  { min: 5 },
  { min: 15 },
  { min: 40 },
  { min: 100 },
] as const;

/** 各形象的阶段叫法，小苗按种子到大树，小猫小狗小兔小蘑菇各有自己的说法 */
export const SPECIES_STAGE_NAMES: Record<PetSpecies, readonly string[]> = {
  sprout: ['种子', '发芽', '幼苗', '小树', '大树'],
  cat: ['猫崽', '小猫', '大猫', '招财猫', '猫大王'],
  dog: ['狗崽', '小狗', '大狗', '猎犬', '犬王'],
  rabbit: ['兔崽', '小兔', '大兔', '垂耳兔', '玉兔'],
  mushroom: ['孢子', '菌芽', '小蘑菇', '伞菌', '巨型蘑菇'],
};

export interface GroveStageInfo {
  index: number;
  name: string;
  /** 进入下一阶段需要的累计完成次数，最高阶段为 null */
  nextAt: number | null;
  nextName: string | null;
  /** 当前阶段内的进度，0 到 1，最高阶段恒为 1 */
  progress: number;
}

export function groveStageInfo(total: number, species: PetSpecies = 'sprout'): GroveStageInfo {
  let index = 0;
  for (let i = 0; i < GROVE_STAGES.length; i += 1) {
    const stage = GROVE_STAGES[i];
    if (stage !== undefined && total >= stage.min) {
      index = i;
    }
  }
  const current = GROVE_STAGES[index];
  if (current === undefined) {
    throw new Error(`未知的成长阶段索引 ${index}`);
  }
  const next = GROVE_STAGES[index + 1];
  const names = SPECIES_STAGE_NAMES[species];
  const name = names[index];
  const nextName = next === undefined ? null : (names[index + 1] ?? null);
  if (name === undefined) {
    throw new Error(`${species} 缺少第 ${index} 阶段的名称`);
  }
  const progress = next === undefined ? 1 : (total - current.min) / (next.min - current.min);
  return {
    index,
    name,
    nextAt: next === undefined ? null : next.min,
    nextName,
    progress: Math.max(0, Math.min(1, progress)),
  };
}
