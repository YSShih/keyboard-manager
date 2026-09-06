// @ts-check
/**
 * 棒球規則與投手調度。
 *
 * 這些測試對應的都是實際發生過的錯誤，不是假想的邊界情況：
 * 再見分後還繼續打、延長賽平手被判為敗、傷兵照常先發、
 * 整屆賽事只用得到一個後援投手。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePool } from '../core/career/generate.js';
import { suggestRoster, gameSquad } from '../core/career/roster.js';
import { runGameHeadless, POLICY_GREEDY } from '../core/sim/driver.js';
import { newCareer } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';
import { nation } from '../content/data/nations.js';
import { DECISION_TEMPLATES } from '../content/data/decisions.js';
import { pullLimit, carryOverPitches } from '../core/sim/atBat.js';
import { TUNING } from '../content/tuning.js';

const COACH = { bullpen: 35, scouting: 35, communication: 35, conditioning: 35, intel: 35 };

/** @param {number} seed @param {string} opp @param {boolean} home */
function playGame(seed, opp = 'KOR', home = true) {
  const { players, poolOrder } = generatePool(seed);
  const roster = suggestRoster(players, poolOrder);
  const squad = gameSquad(players, roster, 0);
  return runGameHeadless({
    seed, key: `rules/${seed}`, index: 0, stageId: 'r',
    lineup: squad.lineup, bench: squad.bench, pitchers: squad.pitchers,
    coach: COACH, nation: nation(opp), weAreHome: home, templates: DECISION_TEMPLATES,
  }, POLICY_GREEDY);
}

test('比賽不會以平手收場', () => {
  for (let s = 0; s < 150; s++) {
    const { result } = playGame(6000 + s, ['CZE', 'KOR', 'JPN'][s % 3], s % 2 === 0);
    assert.notEqual(result.runsFor, result.runsAgainst,
      `種子 ${6000 + s} 打成平手 ${result.runsFor}:${result.runsAgainst}`);
  }
});

test('再見分之後不會再有打席', () => {
  for (let s = 0; s < 150; s++) {
    const home = s % 2 === 0;
    const { events } = playGame(7000 + s, 'AUS', home);
    /** @type {Map<string, {leadAt:number, last:number}>} */
    const halves = new Map();
    let idx = 0;
    for (const e of events) {
      if (e.t !== 'PLAY') continue;
      const sn = e.snapshot;
      if (sn.half !== 'bot' || sn.inning < 9) continue;
      const key = `${sn.inning}`;
      const homeAhead = home ? sn.runsUs > sn.runsThem : sn.runsThem > sn.runsUs;
      const rec = halves.get(key) ?? { leadAt: -1, last: -1 };
      if (homeAhead && rec.leadAt < 0) rec.leadAt = idx;
      rec.last = idx;
      halves.set(key, rec);
      idx++;
    }
    for (const [inn, rec] of halves) {
      if (rec.leadAt >= 0) {
        assert.equal(rec.last, rec.leadAt,
          `種子 ${7000 + s} 的 ${inn} 局下，主隊超前後還打了 ${rec.last - rec.leadAt} 個打席`);
      }
    }
  }
});

test('主隊在九局上結束時已領先，就不會再打九局下', () => {
  for (let s = 0; s < 120; s++) {
    const home = s % 2 === 0;
    const { events } = playGame(7500 + s, 'CZE', home);
    /** @type {{us:number, them:number}|null} */
    let afterTop9 = null;
    let playedBot9 = false;
    for (const e of events) {
      if (e.t === 'HALF_END' && e.snapshot.inning === 9 && e.snapshot.half === 'top') {
        afterTop9 = { us: e.snapshot.runsUs, them: e.snapshot.runsThem };
      }
      if (e.t === 'PLAY' && e.snapshot.inning === 9 && e.snapshot.half === 'bot') playedBot9 = true;
    }
    if (afterTop9 && playedBot9) {
      const homeLed = home ? afterTop9.us > afterTop9.them : afterTop9.them > afterTop9.us;
      assert.equal(homeLed, false, `種子 ${7500 + s}：主隊已領先卻仍打九局下`);
    }
  }
});

test('換投門檻依角色分開：先發撐得比後援久', () => {
  const { players, poolOrder } = generatePool(4242);
  const all = poolOrder.map((id) => players[id]).filter(/** @returns {p is import('../core/domain/types.js').Player} */ (p) => !!p);
  const sp = all.find((p) => p.primary === 'SP');
  const rp = all.find((p) => p.primary === 'RP');
  assert.ok(sp && rp);
  assert.ok(pullLimit(sp) > 70, `先發門檻 ${pullLimit(sp)} 太低`);
  assert.ok(pullLimit(rp) < 45, `後援門檻 ${pullLimit(rp)} 太高，後援不該投到這麼多球`);
  assert.ok(pullLimit(sp) > pullLimit(rp));
});

test('一場比賽會用到多位投手，牛棚不是只有一個人在投', () => {
  const seen = new Set();
  let totalPitchers = 0, games = 0;
  for (let s = 0; s < 20; s++) {
    const { result } = playGame(8000 + s, 'KOR', s % 2 === 0);
    const ids = Object.keys(result.pitchCounts);
    ids.forEach((id) => seen.add(id));
    totalPitchers += ids.length;
    games++;
    assert.ok(ids.length >= 2, `種子 ${8000 + s} 整場只用了 ${ids.length} 個投手`);
  }
  assert.ok(totalPitchers / games >= 3, `平均每場只用 ${(totalPitchers / games).toFixed(1)} 個投手`);
});

test('一整屆賽事下來，牛棚的每個人都有機會登板', () => {
  const st0 = newCareer(31337, '測試教頭');
  const { state, events } = runCareerHeadless(st0, makeCareerPolicy(POLICY_GREEDY));
  /** @type {Set<string>} */
  const used = new Set();
  for (const e of events) {
    if (e.t === 'GAME_END') Object.keys(e.result.pitchCounts).forEach((id) => used.add(id));
  }
  const bullpen = state.roster?.bullpen ?? [];
  const idle = bullpen.filter((id) => !used.has(id));
  assert.ok(idle.length <= 1,
    `牛棚有 ${idle.length} 個人整屆一球沒投（總共 ${bullpen.length} 人）`);
});

test('傷兵不會出現在先發打線或牛棚', () => {
  const { players, poolOrder } = generatePool(555);
  const roster = suggestRoster(players, poolOrder);
  const hurtIds = /** @type {import('../core/domain/types.js').PlayerId[]} */ (
    [roster.lineup[2], roster.rotation[0], roster.bullpen[0]].filter(Boolean)
  );
  /** @type {any} */
  const injured = { ...players };
  for (const id of hurtIds) {
    injured[id] = {
      ...injured[id],
      condition: { ...injured[id].condition, injury: { code: 'X', gamesOut: 2, severity: 1 } },
    };
  }
  const squad = gameSquad(injured, roster, 0);
  for (const id of hurtIds) {
    assert.ok(!squad.lineup.some((p) => p.id === id), `傷兵 ${id} 還在打線裡`);
    assert.ok(!squad.pitchers.some((p) => p.id === id), `傷兵 ${id} 還在投手表裡`);
  }
  assert.equal(squad.lineup.length, TUNING.pool.lineupSize, '遞補後打線人數不對');
  assert.equal(squad.unavailable.length, hurtIds.length);
});

test('投球負荷會累積，也會因為休息而消化掉', () => {
  const st0 = newCareer(50003, '測試教頭');
  const { state, events } = runCareerHeadless(st0, makeCareerPolicy(POLICY_GREEDY));
  const pitcherIds = [...(state.roster?.rotation ?? []), ...(state.roster?.bullpen ?? [])];
  const pitchers = pitcherIds
    .map((id) => state.players[id])
    .filter(/** @returns {p is import('../core/domain/types.js').Player} */ (p) => !!p);
  const loads = pitchers.map((p) => p.condition.workload.pitchesInEvent);

  assert.ok(loads.some((v) => v > 0), '完全沒有人累積到投球負荷，跨場次疲勞是死的');
  assert.ok(Math.max(...loads) < 400,
    `最大累積 ${Math.max(...loads)} 球，休息沒有在消化負荷`);

  // 有投球的人負荷會轉成有效球數加成
  for (const p of pitchers.filter((x) => x.condition.workload.pitchesInEvent > 60)) {
    assert.ok(carryOverPitches(p.condition.workload) > 0, `${p.name} 的累積沒有換算成疲勞`);
  }
  assert.ok(events.length > 0);
});

test('傷病會在一屆賽事中實際發生', () => {
  let injured = 0;
  for (let s = 0; s < 20; s++) {
    const { state } = runCareerHeadless(newCareer(60000 + s, '測試教頭'), makeCareerPolicy(POLICY_GREEDY));
    injured += (state.roster?.members ?? []).filter((id) => state.players[id]?.condition.injury).length;
  }
  assert.ok(injured > 0, '20 段生涯裡一個傷兵都沒有，傷病系統沒在運作');
});

test('場中決策會推動球員士氣', () => {
  const moves = new Set();
  for (let s = 0; s < 20; s++) {
    const { state } = runCareerHeadless(newCareer(70000 + s, '測試教頭'), makeCareerPolicy(POLICY_GREEDY));
    moves.add(state.coach.meters.playerMorale);
  }
  assert.ok(moves.size > 3, `士氣只出現 ${moves.size} 種值，看起來沒有被決策影響`);
  for (const m of moves) assert.ok(Number.isInteger(m), `士氣出現非整數：${m}`);
});
