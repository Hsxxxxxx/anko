import assert from 'node:assert/strict';
import test from 'node:test';
import { formatClock, formatCountdown, formatDuration, parseClock, remainingActivityMs, resolveQuietWindow } from '../src/shared/time';

test('parseClock 接受合法时刻并拒绝非法写法', () => {
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('7:05'), 425);
  assert.equal(parseClock('23:59'), 1439);
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('12:60'), null);
  assert.equal(parseClock('12-30'), null);
  assert.equal(parseClock('abc'), null);
});

test('formatClock 把分钟数还原成时刻', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(425), '07:05');
  assert.equal(formatClock(1440), '00:00');
});

test('普通时段内的免打扰判断正确', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0);
  const window = resolveQuietWindow(now, [{ start: '09:00', end: '18:00' }]);
  assert.equal(window.active, true);
  assert.equal(window.start, new Date(2026, 10, 20, 9, 0, 0).getTime());
  assert.equal(window.end, new Date(2026, 10, 20, 18, 0, 0).getTime());
});

test('跨零点时段在午夜前后都算免打扰', () => {
  const lateNight = new Date(2026, 10, 20, 23, 30, 0);
  const late = resolveQuietWindow(lateNight, [{ start: '22:00', end: '08:00' }]);
  assert.equal(late.active, true);
  assert.equal(late.end, new Date(2026, 10, 21, 8, 0, 0).getTime());

  const afterMidnight = new Date(2026, 10, 21, 3, 0, 0);
  const early = resolveQuietWindow(afterMidnight, [{ start: '22:00', end: '08:00' }]);
  assert.equal(early.active, true);
  assert.equal(early.start, new Date(2026, 10, 20, 22, 0, 0).getTime());
  assert.equal(early.end, new Date(2026, 10, 21, 8, 0, 0).getTime());
});

test('不在免打扰时段时给出下一次开始时间', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0);
  const window = resolveQuietWindow(now, [{ start: '22:00', end: '08:00' }]);
  assert.equal(window.active, false);
  assert.equal(window.nextStart, new Date(2026, 10, 20, 22, 0, 0).getTime());
});

test('开始时间与结束时间相同的时段被忽略', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0);
  const window = resolveQuietWindow(now, [{ start: '09:00', end: '09:00' }]);
  assert.equal(window.active, false);
  assert.equal(window.nextStart, null);
});

test('时长与倒计时文本可读', () => {
  assert.equal(formatDuration(0), '不到 1 分钟');
  assert.equal(formatDuration(45 * 60_000), '45 分钟');
  assert.equal(formatDuration(60 * 60_000), '1 小时');
  assert.equal(formatDuration(65 * 60_000), '1 小时 05 分');
  assert.equal(formatCountdown(65_000), '01:05');
  assert.equal(formatCountdown(3_725_000), '01:02:05');
});

test('所需时长的剩余时间随已用时间递减', () => {
  assert.equal(remainingActivityMs(0, 60_000), 0);
  assert.equal(remainingActivityMs(120, 0), 120_000);
  assert.equal(remainingActivityMs(120, 90_000), 30_000);
  assert.equal(remainingActivityMs(120, 120_000), 0);
  assert.equal(remainingActivityMs(120, 200_000), 0);
  assert.equal(remainingActivityMs(120, -5_000), 125_000);
});
