import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomItem, defaultSettings, normalizeSettings, presetItems } from '../src/shared/settings';

test('默认设置包含预设提醒项与免打扰时段', () => {
  const settings = defaultSettings();
  assert.equal(settings.items.length, presetItems().length);
  assert.equal(settings.quietRanges.length, 1);
  assert.equal(settings.items.filter((item) => item.enabled).length, 3);
  assert.equal(settings.overlayPosition, 'auto');
});

test('自定义提醒项使用 custom 图标并标记为可删除', () => {
  const item = createCustomItem({
    name: '喝茶',
    message: '泡一杯茶',
    intervalMinutes: 30,
    durationSeconds: 3,
    strength: 'strong',
  });
  assert.equal(item.glyph, 'custom');
  assert.equal(item.custom, true);
  assert.equal(item.enabled, true);
  assert.equal(item.intervalMinutes, 30);
  assert.equal(item.durationSeconds, 3);
});

test('预设提醒项带有各自的完成时长', () => {
  const items = presetItems();
  for (const item of items) {
    assert.ok(item.durationSeconds >= 0 && item.durationSeconds <= 600);
  }
  const durations = new Map(items.map((item) => [item.id, item.durationSeconds]));
  assert.equal(durations.get('preset-water'), 5);
  assert.equal(durations.get('preset-eye'), 20);
  assert.equal(durations.get('preset-stand'), 60);
  assert.equal(durations.get('preset-stretch'), 60);
  assert.equal(durations.get('preset-snack'), 5);
  assert.equal(durations.get('preset-breathe'), 5);
});

test('非法设置被清理成合法值', () => {
  const normalized = normalizeSettings({
    items: [
      { id: 'a', name: '喝水', intervalMinutes: 0, strength: 'weird', glyph: 'water' },
      { id: '', name: '缺少 id' },
      { id: 'b', name: '护眼', intervalMinutes: 5000, durationSeconds: 9999, strength: 'strong', glyph: 'eye', enabled: false },
      { id: 'c', name: '旧配置', intervalMinutes: 30, durationMinutes: 5, strength: 'normal', glyph: 'water' },
    ],
    quietRanges: [
      { id: 'q1', start: '24:00', end: '08:00' },
      { id: 'q2', start: '22:00', end: '08:00' },
      { id: 'q3', start: '09:00', end: '09:00' },
    ],
    soundEnabled: false,
    normalDismissSeconds: 900,
    snoozeMinutes: 0,
    overlayPosition: 'somewhere',
  });

  assert.equal(normalized.items.length, 3);
  assert.equal(normalized.items[0]?.intervalMinutes, 1);
  assert.equal(normalized.items[0]?.durationSeconds, 0);
  assert.equal(normalized.items[0]?.strength, 'normal');
  assert.equal(normalized.items[1]?.intervalMinutes, 1440);
  assert.equal(normalized.items[1]?.durationSeconds, 600);
  assert.equal(normalized.items[1]?.enabled, false);
  assert.equal(normalized.items[2]?.durationSeconds, 300);
  assert.equal(normalized.quietRanges.length, 1);
  assert.equal(normalized.quietRanges[0]?.id, 'q2');
  assert.equal(normalized.soundEnabled, false);
  assert.equal(normalized.normalDismissSeconds, 120);
  assert.equal(normalized.snoozeMinutes, 1);
  assert.equal(normalized.overlayPosition, 'auto');
});

test('空数据回到默认设置', () => {
  const normalized = normalizeSettings(null);
  assert.equal(normalized.items.length, presetItems().length);
  assert.equal(normalized.soundEnabled, true);
});

test('旧配置升级时补上预设项的默认等待时间', () => {
  const legacy = normalizeSettings({
    version: 1,
    items: [
      { id: 'preset-water', name: '喝水', intervalMinutes: 45, durationSeconds: 0, strength: 'strong', glyph: 'water' },
      { id: 'preset-eye', name: '护眼休息', intervalMinutes: 20, durationSeconds: 0, strength: 'strong', glyph: 'eye' },
      { id: 'preset-stand', name: '起身活动', intervalMinutes: 60, durationSeconds: 30, strength: 'normal', glyph: 'stand' },
      { id: 'custom-1', name: '自定义', intervalMinutes: 30, durationSeconds: 0, strength: 'normal', glyph: 'custom', custom: true },
    ],
  });
  const durations = new Map(legacy.items.map((item) => [item.id, item.durationSeconds]));
  assert.equal(durations.get('preset-water'), 5);
  assert.equal(durations.get('preset-eye'), 20);
  assert.equal(durations.get('preset-stand'), 30);
  assert.equal(durations.get('custom-1'), 0);
});

test('新配置里显式设成 0 的等待时间保持不变', () => {
  const current = normalizeSettings({
    version: 2,
    items: [
      { id: 'preset-water', name: '喝水', intervalMinutes: 45, durationSeconds: 0, strength: 'strong', glyph: 'water' },
    ],
  });
  assert.equal(current.items[0]?.durationSeconds, 0);
});

test('宠物形象与自动开始读出合法值', () => {
  const normalized = normalizeSettings({ petType: 'cat', autoStart: true });
  assert.equal(normalized.petType, 'cat');
  assert.equal(normalized.autoStart, true);
  const fallback = normalizeSettings({ petType: 'dragon', autoStart: 'yes' });
  assert.equal(fallback.petType, 'sprout');
  assert.equal(fallback.autoStart, false);
});

test('弹窗偏移量被清理成合法值', () => {
  assert.deepEqual(normalizeSettings({ overlayOffset: { dx: -40, dy: 12 } }).overlayOffset, { dx: -40, dy: 12 });
  assert.equal(normalizeSettings({ overlayOffset: { dx: 0, dy: 0 } }).overlayOffset, null);
  assert.equal(normalizeSettings({ overlayOffset: { dx: 10 } }).overlayOffset, null);
});
