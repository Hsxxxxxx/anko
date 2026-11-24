import assert from 'node:assert/strict';
import test from 'node:test';
import { decideDue, rescheduleFrom, tickProgress } from '../src/shared/schedule';

test('未到时间时保持等待', () => {
  const now = 1_000_000;
  const decision = decideDue({ dueAt: now + 5_000, intervalMinutes: 30, now, quietUntil: null });
  assert.equal(decision.fire, false);
  assert.equal(decision.deferred, false);
  assert.equal(decision.nextDue, now + 5_000);
});

test('到时间时触发并按原节奏安排下一次', () => {
  const now = 1_000_000;
  const dueAt = now - 1_000;
  const decision = decideDue({ dueAt, intervalMinutes: 30, now, quietUntil: null });
  assert.equal(decision.fire, true);
  assert.equal(decision.nextDue, dueAt + 30 * 60_000);
});

test('免打扰时段内到期的提醒被顺延到时段结束', () => {
  const now = 1_000_000;
  const dueAt = now - 1_000;
  const quietUntil = now + 600_000;
  const decision = decideDue({ dueAt, intervalMinutes: 30, now, quietUntil });
  assert.equal(decision.fire, false);
  assert.equal(decision.deferred, true);
  assert.equal(decision.nextDue, quietUntil + 60_000);
});

test('重新排期从当前时间开始', () => {
  assert.equal(rescheduleFrom(15, 1_000_000), 1_000_000 + 900_000);
});

test('刻度条按剩余时间推进', () => {
  const total = 100_000;
  assert.deepEqual(tickProgress(total, total, 4), [false, false, false, false]);
  assert.deepEqual(tickProgress(0, total, 4), [true, true, true, true]);
  assert.deepEqual(tickProgress(total / 2, total, 4), [true, true, false, false]);
});
