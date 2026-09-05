// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOdds, mod, ratingMod, explainOdds, clamp, P_MIN, P_MAX } from '../core/odds/odds.js';

test('沒有修正時，final 等於 base', () => {
  assert.equal(computeOdds(0.5).final, 0.5);
  assert.equal(computeOdds(0.35).final, 0.35);
});

test('修正在 logit 空間相加，永遠不會爆出 [0,1]', () => {
  assert.ok(computeOdds(0.5, [mod('x', '超大', 9999)]).final <= P_MAX);
  assert.ok(computeOdds(0.5, [mod('x', '超小', -9999)]).final >= P_MIN);
  assert.equal(computeOdds(0.999).final, P_MAX);
  assert.equal(computeOdds(0.0001).final, P_MIN);
});

test('正修正提高機率、負修正降低機率', () => {
  const base = computeOdds(0.5).final;
  assert.ok(computeOdds(0.5, [mod('x', '好事', 10)]).final > base);
  assert.ok(computeOdds(0.5, [mod('x', '壞事', -10)]).final < base);
});

test('在 50% 附近，mod(n) 大約就是 n 個百分點', () => {
  const got = computeOdds(0.5, [mod('x', '', 10)]).final;
  assert.ok(Math.abs(got - 0.6) < 0.015, `期望約 0.60，實得 ${got}`);
});

test('ratingMod：50 分無影響，高於 50 為正，低於 50 為負', () => {
  assert.equal(ratingMod('a', '', 50, 20).delta, 0);
  assert.ok(ratingMod('a', '', 75, 20).delta > 0);
  assert.ok(ratingMod('a', '', 25, 20).delta < 0);
});

test('modifiers 依影響力由大到小排序，並濾掉 0', () => {
  const o = computeOdds(0.5, [
    mod('small', '小', 2), mod('big', '大', -20), mod('zero', '無', 0), mod('mid', '中', 8),
  ]);
  assert.deepEqual(o.modifiers.map((m) => m.source), ['big', 'mid', 'small']);
});

test('explainOdds 產出玩家看得懂的行，第一行永遠是基準', () => {
  const rows = explainOdds(computeOdds(0.4, [ratingMod('bullpen', '你的「用兵」22', 22, 16)]));
  assert.equal(rows[0]?.label, '基準');
  assert.equal(rows[0]?.value, '40%');
  assert.equal(rows[1]?.label, '你的「用兵」22');
  assert.match(rows[1]?.value ?? '', /^-\d+$/);
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});
