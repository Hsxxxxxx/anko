import assert from 'node:assert/strict';
import test from 'node:test';
import { clampOverlayPosition, resolveOverlayPosition } from '../src/shared/position';

const area = { x: 0, y: 0, width: 1920, height: 1032 };

test('跟随提醒类型时强提醒在右上角、普通卡片在右下角', () => {
  const strong = resolveOverlayPosition(area, 420, 330, true, 'auto');
  assert.deepEqual(strong, { x: 1920 - 420 - 28, y: 28 });
  const card = resolveOverlayPosition(area, 380, 230, false, 'auto');
  assert.deepEqual(card, { x: 1920 - 380 - 28, y: 1032 - 230 - 28 });
});

test('屏幕中间把弹窗放在工作区正中', () => {
  assert.deepEqual(resolveOverlayPosition(area, 420, 330, true, 'center'), {
    x: (1920 - 420) / 2,
    y: (1032 - 330) / 2,
  });
});

test('固定角落按四个方向定位', () => {
  assert.deepEqual(resolveOverlayPosition(area, 380, 230, false, 'top-left'), { x: 28, y: 28 });
  assert.deepEqual(resolveOverlayPosition(area, 380, 230, false, 'bottom-left'), { x: 28, y: 1032 - 230 - 28 });
  assert.deepEqual(resolveOverlayPosition(area, 380, 230, false, 'bottom-right'), {
    x: 1920 - 380 - 28,
    y: 1032 - 230 - 28,
  });
});

test('拖动时窗口左上角留在工作区内', () => {
  assert.deepEqual(clampOverlayPosition(-500, -300, area), { x: 0, y: 0 });
  assert.deepEqual(clampOverlayPosition(5000, 5000, area), { x: 1920 - 80, y: 1032 - 80 });
  assert.deepEqual(clampOverlayPosition(400, 300, area), { x: 400, y: 300 });
});
