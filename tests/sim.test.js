// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../core/rng/rng.js';
import { advanceRunners, applyBunt } from '../core/sim/advance.js';
import { leverageIndex, shouldPause } from '../core/sim/leverage.js';
import { resolvePlateAppearance, fatiguePenalty, OUTCOMES } from '../core/sim/atBat.js';
import { generatePool } from '../core/career/generate.js';
import { suggestRoster, gameSquad } from '../core/career/roster.js';
import { runGameHeadless, POLICY_GREEDY } from '../core/sim/driver.js';
import { nation } from '../content/data/nations.js';
import { DECISION_TEMPLATES } from '../content/data/decisions.js';
import { TUNING } from '../content/tuning.js';

const rng = (k = 'x') => makeRng(1, k);

test('全壘打把所有跑者送回本壘', () => {
  const r = advanceRunners([true, true, true], 'HR', 0, 50, rng());
  assert.equal(r.runs, 4);
  assert.deepEqual(r.bases, [false, false, false]);
  assert.equal(r.outsAdded, 0);
});

test('滿壘保送只擠回一分', () => {
  const r = advanceRunners([true, true, true], 'BB', 1, 50, rng());
  assert.equal(r.runs, 1);
  assert.deepEqual(r.bases, [true, true, true]);
});

test('空壘保送不會亂推進', () => {
  const r = advanceRunners([false, false, true], 'BB', 0, 50, rng());
  assert.equal(r.runs, 0);
  assert.deepEqual(r.bases, [true, false, true]);
});

test('三振與飛球出局各增加一個出局數', () => {
  assert.equal(advanceRunners([false, false, false], 'K', 0, 50, rng()).outsAdded, 1);
  assert.equal(advanceRunners([false, false, false], 'OUT_F', 0, 50, rng()).outsAdded, 1);
});

test('兩出局時不會有高飛犧牲打', () => {
  for (let i = 0; i < 60; i++) {
    const r = advanceRunners([false, false, true], 'OUT_F', 2, 50, rng(`sf/${i}`));
    assert.equal(r.runs, 0, '兩出局的飛球不該有人回來得分');
  }
});

test('兩出局時不會發生雙殺（因為第三個出局數已經結束半局）', () => {
  for (let i = 0; i < 60; i++) {
    const r = advanceRunners([true, false, false], 'OUT_G', 2, 50, rng(`dp/${i}`));
    assert.equal(r.outsAdded, 1);
  }
});

test('雙殺會發生，而且跑者速度越快越不容易被雙殺', () => {
  const rate = (/** @type {number} */ speed) => {
    let dp = 0;
    for (let i = 0; i < 600; i++) {
      if (advanceRunners([true, false, false], 'OUT_G', 0, speed, rng(`dp2/${speed}/${i}`)).outsAdded === 2) dp++;
    }
    return dp / 600;
  };
  const slow = rate(20), fast = rate(85);
  assert.ok(slow > 0.3 && slow < 0.7, `慢腳雙殺率 ${slow}`);
  assert.ok(fast < slow, `快腳(${fast}) 應該比慢腳(${slow}) 難被雙殺`);
});

test('觸擊成功＝跑者推進、打者出局；失敗＝前位跑者被封殺', () => {
  const ok = applyBunt([true, false, false], true);
  assert.deepEqual(ok.bases, [false, true, false]);
  assert.equal(ok.outsAdded, 1);
  const fail = applyBunt([true, true, false], false);
  assert.deepEqual(fail.bases, [true, true, false]);
  assert.equal(fail.outsAdded, 1);
});

test('Leverage：關鍵局面的值必須高於垃圾時間', () => {
  const snap = (/** @type {any} */ o) => ({ inning: 1, half: 'top', outs: 0, bases: [false, false, false], runsUs: 0, runsThem: 0, pitcher: null, batter: null, pitchCount: 0, ...o });
  const garbage = leverageIndex(snap({ inning: 2, runsUs: 9, runsThem: 0 }));
  const clutch = leverageIndex(snap({ inning: 9, outs: 1, bases: [true, true, true], runsUs: 4, runsThem: 5 }));
  assert.ok(clutch > garbage * 5, `關鍵 ${clutch} vs 垃圾時間 ${garbage}`);
});

test('球數超標一定觸發決策，即使 leverage 很低', () => {
  const blowout = { inning: 3, half: /** @type {const} */ ('top'), outs: 0, bases: /** @type {[boolean,boolean,boolean]} */ ([false, false, false]), runsUs: 12, runsThem: 0, pitcher: null, batter: null, pitchCount: TUNING.decision.forcePitchCount };
  assert.equal(shouldPause(blowout, 0, 30), true);
});

test('已問滿上限就不再打斷玩家', () => {
  const clutch = { inning: 9, half: /** @type {const} */ ('bot'), outs: 1, bases: /** @type {[boolean,boolean,boolean]} */ ([true, true, true]), runsUs: 4, runsThem: 5, pitcher: null, batter: null, pitchCount: 120 };
  assert.equal(shouldPause(clutch, TUNING.decision.maxPerGame, 10), false);
});

test('疲勞：球數越多懲罰越重，續航好的投手撐得久', () => {
  assert.equal(fatiguePenalty(50, 50, 50).penalty, 0);
  const a = fatiguePenalty(100, 50, 50).penalty;
  const b = fatiguePenalty(120, 50, 50).penalty;
  assert.ok(b > a && a > 0, `100球 ${a} / 120球 ${b}`);
  assert.ok(fatiguePenalty(110, 85, 50).penalty < fatiguePenalty(110, 25, 50).penalty, '續航高應該比較不累');
  assert.ok(fatiguePenalty(110, 50, 90).penalty < fatiguePenalty(110, 50, 20).penalty, '體能管理高應該減輕疲勞');
});

test('打席結果的機率分布總和為 1，且沒有 NaN', () => {
  const { players, poolOrder } = generatePool(9090);
  const batter = players[poolOrder[9] ?? ''];
  const pitcher = players[poolOrder[0] ?? ''];
  assert.ok(batter && pitcher);
  const r = resolvePlateAppearance({
    batter, pitcher, defenseField: 50, opponentStrength: 60,
    coach: { bullpen: 50, scouting: 50, communication: 50, conditioning: 50, intel: 50 },
    weAreBatting: true, pitchCount: 40,
  }, rng('pa'));
  const sum = r.distribution.reduce((s, d) => s + d.p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `總和 ${sum}`);
  assert.ok(r.distribution.every((d) => Number.isFinite(d.p) && d.p >= 0));
  assert.ok(OUTCOMES.includes(r.outcome));
});

test('一場比賽一定會結束，比分合理，決策數在設定範圍內', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { players, poolOrder } = generatePool(seed);
    const roster = suggestRoster(players, poolOrder);
    const squad = gameSquad(players, roster, 0);
    const { result, events } = runGameHeadless({
      seed, key: `t/${seed}`, index: 0, stageId: 's',
      lineup: squad.lineup, bench: squad.bench, pitchers: squad.pitchers,
      coach: { bullpen: 30, scouting: 30, communication: 30, conditioning: 30, intel: 30 },
      nation: nation('KOR'), weAreHome: seed % 2 === 0, templates: DECISION_TEMPLATES,
    }, POLICY_GREEDY);

    assert.notEqual(result.runsFor, result.runsAgainst, '不該以平手收場');
    assert.ok(result.runsFor >= 0 && result.runsFor < 40, `得分異常 ${result.runsFor}`);
    assert.ok(result.runsAgainst >= 0 && result.runsAgainst < 40);
    const decisions = events.filter((e) => e.t === 'DECISION').length;
    assert.ok(decisions <= TUNING.decision.maxPerGame, `決策 ${decisions} 超過上限`);
    assert.ok(events.some((e) => e.t === 'GAME_END'));
  }
});

test('名單建議一定排得出完整陣容', () => {
  for (let seed = 100; seed < 130; seed++) {
    const { players, poolOrder } = generatePool(seed);
    const roster = suggestRoster(players, poolOrder);
    assert.equal(roster.members.length, TUNING.pool.rosterSize, `種子 ${seed} 名單人數不對`);
    assert.equal(roster.lineup.length, TUNING.pool.lineupSize, `種子 ${seed} 打序不足`);
    assert.ok(roster.rotation.length >= 1, `種子 ${seed} 沒有先發投手`);
    assert.ok(roster.bullpen.length >= 3, `種子 ${seed} 牛棚太薄`);
    // 每個守位只指派一個人
    const positions = roster.lineup.map((id) => roster.assigned[id]);
    assert.equal(new Set(positions).size, positions.length, `種子 ${seed} 有守位重複：${positions.join(',')}`);
  }
});
