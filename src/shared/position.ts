import type { OverlayPosition } from './types';

/** 弹窗与屏幕边缘的间距 */
export const OVERLAY_MARGIN = 28;

/** 拖动时窗口左上角留在工作区内的最小余量，保证标题区始终抓得到 */
export const OVERLAY_KEEP = 80;

/**
 * 弹窗位置：auto 强提醒在右上角、普通卡片在右下角，center 屏幕中间，
 * 其余固定在四个角落。
 */
export function resolveOverlayPosition(
  area: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  strong: boolean,
  position: OverlayPosition,
): { x: number; y: number } {
  if (position === 'center') {
    return {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
    };
  }
  const left = position === 'top-left' || position === 'bottom-left';
  const top = position === 'auto' ? strong : position === 'top-right' || position === 'top-left';
  const x = left ? area.x + OVERLAY_MARGIN : area.x + area.width - width - OVERLAY_MARGIN;
  const y = top ? area.y + OVERLAY_MARGIN : area.y + area.height - height - OVERLAY_MARGIN;
  return { x, y };
}

/** 拖动时把窗口左上角约束在工作区内，标题区不会被拖出屏幕 */
export function clampOverlayPosition(
  x: number,
  y: number,
  area: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const maxX = area.x + area.width - OVERLAY_KEEP;
  const maxY = area.y + area.height - OVERLAY_KEEP;
  return {
    x: Math.round(Math.max(area.x, Math.min(maxX, x))),
    y: Math.round(Math.max(area.y, Math.min(maxY, y))),
  };
}
