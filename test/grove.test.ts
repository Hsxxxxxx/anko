import assert from 'node:assert/strict';
import test from 'node:test';
import { groveStageInfo, SPECIES_STAGE_NAMES } from '../src/shared/grove';

test('成长阶段随完成次数推进', () => {
  assert.equal(groveStageInfo(0).name, '种子');
  assert.equal(groveStageInfo(4).name, '种子');
  assert.equal(groveStageInfo(5).name, '发芽');
  assert.equal(groveStageInfo(14).name, '发芽');
  assert.equal(groveStageInfo(15).name, '幼苗');
  assert.equal(groveStageInfo(39).name, '幼苗');
  assert.equal(groveStageInfo(40).name, '小树');
  assert.equal(groveStageInfo(99).name, '小树');
  assert.equal(groveStageInfo(100).name, '大树');
  assert.equal(groveStageInfo(9999).name, '大树');
});

test('进度与下一阶段信息正确', () => {
  const atZero = groveStageInfo(0);
  assert.equal(atZero.index, 0);
  assert.equal(atZero.nextAt, 5);
  assert.equal(atZero.nextName, '发芽');
  assert.equal(atZero.progress, 0);

  const midway = groveStageInfo(25);
  assert.equal(midway.name, '幼苗');
  assert.equal(midway.progress, (25 - 15) / (40 - 15));

  const maxed = groveStageInfo(100);
  assert.equal(maxed.index, 4);
  assert.equal(maxed.nextAt, null);
  assert.equal(maxed.nextName, null);
  assert.equal(maxed.progress, 1);
});

test('每个形象有自己的阶段叫法', () => {
  assert.equal(groveStageInfo(0, 'cat').name, '猫崽');
  assert.equal(groveStageInfo(5, 'cat').name, '小猫');
  assert.equal(groveStageInfo(15, 'cat').name, '大猫');
  assert.equal(groveStageInfo(40, 'cat').name, '招财猫');
  assert.equal(groveStageInfo(100, 'cat').name, '猫大王');
  assert.equal(groveStageInfo(100, 'cat').nextName, null);

  assert.equal(groveStageInfo(0, 'dog').name, '狗崽');
  assert.equal(groveStageInfo(15, 'dog').name, '大狗');
  assert.equal(groveStageInfo(15, 'dog').nextName, '猎犬');
  assert.equal(groveStageInfo(5, 'rabbit').name, '小兔');
  assert.equal(groveStageInfo(5, 'mushroom').name, '菌芽');
});

test('阶段名覆盖到每个形象的五个阶段', () => {
  for (const names of Object.values(SPECIES_STAGE_NAMES)) {
    assert.equal(names.length, 5);
    assert.equal(new Set(names).size, 5);
  }
});
