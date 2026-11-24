import assert from 'node:assert/strict';
import test from 'node:test';
import { Scheduler } from '../src/main/scheduler';
import { normalizeSettings } from '../src/shared/settings';
import type { Settings } from '../src/shared/types';

const baseItem = {
  id: 'water',
  name: '喝水',
  glyph: 'water',
  message: '喝水',
  intervalMinutes: 1,
  durationSeconds: 1,
  strength: 'strong',
  enabled: true,
  custom: false,
} as const;

function settingsWith(overrides: Partial<Settings> = {}): Settings {
  return normalizeSettings({
    items: [baseItem],
    quietRanges: [],
    ...overrides,
  });
}

test('到达间隔后触发提醒', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const fired: string[] = [];
  const scheduler = new Scheduler();
  scheduler.onDue = (item) => fired.push(item.id);
  scheduler.applySettings(settingsWith());
  scheduler.start();

  t.mock.timers.tick(60_000);
  assert.deepEqual(fired, ['water']);
  scheduler.stop();
});

test('免打扰时段内不触发，顺延到时段结束之后', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const fired: string[] = [];
  const scheduler = new Scheduler();
  scheduler.onDue = (item) => fired.push(item.id);
  scheduler.applySettings(
    settingsWith({ quietRanges: [{ id: 'q', start: '00:00', end: '23:59' }] }),
  );
  scheduler.start();

  t.mock.timers.tick(60_000);
  assert.deepEqual(fired, []);

  const state = scheduler.getState();
  const quietUntil = state.quietUntil;
  assert.ok(quietUntil !== null);
  assert.ok((state.nextDue['water'] ?? 0) > quietUntil);
  scheduler.stop();
});

test('间隔不变时保留原来的触发时间', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const scheduler = new Scheduler();
  const settings = settingsWith();
  scheduler.applySettings(settings);
  const first = scheduler.getState().nextDue['water'];
  scheduler.applySettings(settings);
  const second = scheduler.getState().nextDue['water'];
  assert.equal(first, second);
  scheduler.stop();
});

test('间隔变化时从当前时间重新计时', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const scheduler = new Scheduler();
  scheduler.applySettings(settingsWith());
  const first = scheduler.getState().nextDue['water'] ?? 0;
  t.mock.timers.tick(30_000);
  scheduler.applySettings(settingsWith({ items: [{ ...baseItem, intervalMinutes: 10 }] }));
  const second = scheduler.getState().nextDue['water'] ?? 0;
  assert.ok(second > first);
  scheduler.stop();
});

test('取消启用的提醒项不再计时', () => {
  const scheduler = new Scheduler();
  scheduler.applySettings(settingsWith());
  assert.ok(scheduler.getState().nextDue['water'] !== undefined);
  scheduler.applySettings(settingsWith({ items: [{ ...baseItem, enabled: false }] }));
  assert.equal(scheduler.getState().nextDue['water'], undefined);
});

test('延后会把触发时间推迟到指定分钟之后', () => {
  const scheduler = new Scheduler();
  scheduler.applySettings(settingsWith());
  const now = Date.now();
  scheduler.snooze('water', 5);
  const after = scheduler.getState().nextDue['water'] ?? 0;
  assert.ok(after >= now + 5 * 60_000 - 1000);
  assert.ok(after <= Date.now() + 5 * 60_000);
});

test('屏幕锁定期间冻结调度，解锁后从解锁时刻重新计一个完整间隔', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const fired: string[] = [];
  const scheduler = new Scheduler();
  scheduler.onDue = (item) => fired.push(item.id);
  scheduler.applySettings(settingsWith());
  scheduler.start();

  t.mock.timers.tick(30_000);
  scheduler.setScreenLocked(true);
  assert.equal(scheduler.getState().screenLocked, true);
  t.mock.timers.tick(60_000);
  assert.deepEqual(fired, [], '锁定期间不应触发提醒');

  scheduler.setScreenLocked(false);
  const now = Date.now();
  const nextDue = scheduler.getState().nextDue['water'] ?? 0;
  assert.ok(nextDue >= now + 60_000 - 1000 && nextDue <= now + 60_000 + 1000, '解锁后应重新计一个完整间隔');

  t.mock.timers.tick(59_000);
  assert.deepEqual(fired, [], '解锁后一个间隔内不应触发');
  t.mock.timers.tick(1_000);
  assert.deepEqual(fired, ['water']);
  scheduler.stop();
});

test('重复锁定与解锁保持幂等', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const scheduler = new Scheduler();
  scheduler.applySettings(settingsWith());
  scheduler.setScreenLocked(true);
  t.mock.timers.tick(30_000);
  scheduler.setScreenLocked(true);
  scheduler.setScreenLocked(false);
  const first = scheduler.getState().nextDue['water'] ?? 0;
  const now = Date.now();
  assert.ok(first >= now + 60_000 - 1000 && first <= now + 60_000 + 1000, '解锁后应重新计一个完整间隔');
  scheduler.setScreenLocked(false);
  assert.equal(scheduler.getState().nextDue['water'], first, '重复解锁不应再次重排');
});

test('全屏应用期间冻结调度，退出后从退出时刻重新计一个完整间隔', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const fired: string[] = [];
  const scheduler = new Scheduler();
  scheduler.onDue = (item) => fired.push(item.id);
  scheduler.applySettings(settingsWith());
  scheduler.start();

  t.mock.timers.tick(30_000);
  scheduler.setFullscreen(true);
  assert.equal(scheduler.getState().fullscreenActive, true);
  t.mock.timers.tick(60_000);
  assert.deepEqual(fired, [], '全屏期间不应触发提醒');

  scheduler.setFullscreen(false);
  const now = Date.now();
  const nextDue = scheduler.getState().nextDue['water'] ?? 0;
  assert.ok(nextDue >= now + 60_000 - 1000 && nextDue <= now + 60_000 + 1000, '退出全屏后应重新计一个完整间隔');

  t.mock.timers.tick(59_000);
  assert.deepEqual(fired, [], '退出全屏后一个间隔内不应触发');
  t.mock.timers.tick(1_000);
  assert.deepEqual(fired, ['water']);
  scheduler.stop();
});
