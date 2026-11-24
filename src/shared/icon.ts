/** 图标档位数量，与 scripts/make-icon.mjs 生成的文件数一致 */
export const ICON_STAGES = 9;

/** 提醒开始前多久的范围内，图标会从方正逐渐变圆 */
export const ICON_PROXIMITY_WINDOW_MS = 5 * 60_000;

/** 按“接近程度” 0..1 取最接近的图标档位 */
export function iconStageForProximity(proximity: number): number {
  const clamped = Math.max(0, Math.min(1, proximity));
  return Math.round(clamped * (ICON_STAGES - 1));
}

/** 运行期档位图标文件名（256px） */
export function iconStageFile(stage: number): string {
  return `icon-stage-${stage}.png`;
}
