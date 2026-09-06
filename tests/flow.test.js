// @ts-check
/**
 * 遊玩流程：賽前調度 → 比賽 → 賽後結果 → 分配。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, autoAllocate, applyGrowth, COACH_ATTRS, encodePregameChoice } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';
import { POLICY_GREEDY } from '../core/sim/driver.js';
import { generatePool } from '../core/career/generate.js';
import { suggestRoster, gameSquad } from '../core/career/roster.js';
import { runGameHeadless } from '../core/sim/driver.js';
import { nation } from '../content/data/nations.js';
import { DECISION_TEMPLATES } from '../content/data/decisions.js';
import { TUNING } from '../content/tuning.js';

/** @param {number} seed */
function career(seed) {
  return runCareerHeadless(newCareer(seed, '測試教頭'), makeCareerPolicy(POLICY_GREEDY));
}

test('每一場比賽前都有一次賽前調度', () => {
  const { events } = career(31337);
  let games = 0, pregames = 0;
  for (const e of events) {
    if (e.t === 'GAME_START') games++;
    if (e.t === 'DECISION' && e.prompt.kind === 'PREGAME') pregames++;
  }
  assert.ok(games > 0);
  assert.equal(pregames, games, `${games} 場比賽只有 ${pregames} 次賽前調度`);
});

test('賽前調度會提供可選的先發投手，且附上賽會累積球數', () => {
  const { events } = career(31337);
  const pre = events.find((e) => e.t === 'DECISION' && e.prompt.kind === 'PREGAME');
  assert.ok(pre && pre.t === 'DECISION');
  const starters = pre.prompt.extra?.starters ?? [];
  assert.ok(starters.length >= 2, `只有 ${starters.length} 個先發可選`);
  for (const s of starters) {
    assert.ok(typeof s.load === 'number' && s.load >= 0, '缺少賽會累積球數');
    assert.ok(typeof s.overall === 'number' && s.overall > 0);
  }
});

test('每一場比賽後都會提示結果並給能力點', () => {
  const { events } = career(31337);
  let games = 0, results = 0, allocs = 0;
  for (const e of events) {
    if (e.t === 'GAME_START') games++;
    if (e.t === 'PHASE' && /^(勝|敗)　/.test(e.title)) results++;
    if (e.t === 'DECISION' && e.prompt.kind === 'ALLOCATE') allocs++;
  }
  assert.equal(results, games, `${games} 場比賽只有 ${results} 個賽後結果畫面`);
  // 每場一次 ＋ 賽事結束的名次獎勵一次
  assert.equal(allocs, games + 1, `分配次數應為 ${games + 1}，實得 ${allocs}`);
});

test('賽後結果畫面帶著比分、獲得點數，有傷兵時也會講', () => {
  const { events } = career(90001);
  /** @type {{title:string, body:string}[]} */
  const cards = [];
  for (const e of events) {
    if (e.t === 'PHASE' && /^(勝|敗)　/.test(e.title)) cards.push({ title: e.title, body: e.body });
  }
  assert.ok(cards.length > 0);
  for (const c of cards) {
    assert.match(c.title, /^(勝|敗)　\d+ : \d+　vs .+/, `標題格式不對：${c.title}`);
    assert.match(c.body, /獲得能力點 \d+ 點/, `沒有講獲得幾點：${c.body}`);
  }
});

test('每場給的點數符合設定（勝多敗少）', () => {
  const { events } = career(90002);
  let wins = 0, losses = 0, awarded = 0;
  for (const e of events) {
    if (e.t === 'GAME_END') { if (e.result.win) wins++; else losses++; }
    if (e.t === 'PHASE' && /^(勝|敗)　/.test(e.title)) {
      awarded += Number(/獲得能力點 (\d+) 點/.exec(e.body)?.[1] ?? 0);
    }
  }
  const expected = wins * TUNING.reward.pointsPerWinGame + losses * TUNING.reward.pointsPerLossGame;
  assert.equal(awarded, expected, `${wins}勝${losses}敗應給 ${expected} 點，實得 ${awarded}`);
});

test('自動配置：花完所有點數、不碰已達上限的能力、結果是決定性的', () => {
  const st = newCareer(1234, '測試教頭');

  for (const pts of [1, 3, 8, 20]) {
    const a = autoAllocate(st.coach, pts);
    const spent = Object.values(a).reduce((s, v) => s + (v ?? 0), 0);
    assert.equal(spent, pts, `${pts} 點只花了 ${spent} 點`);
  }

  // 決定性
  assert.deepEqual(autoAllocate(st.coach, 9), autoAllocate(st.coach, 9));

  // 已滿上限的項目不該再拿到點數
  const capped = { ...st.coach, attrs: { ...st.coach.attrs, bullpen: st.coach.caps.bullpen } };
  assert.equal(autoAllocate(capped, 6).bullpen, undefined, '把點數配給已達上限的能力');

  // 全部都滿了就停手，不會無窮迴圈也不會硬塞
  const allCapped = { ...st.coach, attrs: { ...st.coach.caps } };
  assert.deepEqual(autoAllocate(allCapped, 5), {});
});

test('自動配置在一整屆下來會照顧到每一項能力', () => {
  const st = newCareer(1234, '測試教頭');
  let coach = st.coach;
  /** @type {Record<string, number>} */
  const got = {};
  // 模擬一屆：10 場各 2 點，最後名次獎勵 13 點
  for (const pts of [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 13]) {
    const a = autoAllocate(coach, pts);
    /** @type {any} */
    const attrs = { ...coach.attrs };
    for (const k of COACH_ATTRS) {
      if (a[k]) { attrs[k] = applyGrowth(attrs[k], coach.caps[k], a[k]); got[k] = (got[k] ?? 0) + a[k]; }
    }
    coach = { ...coach, attrs };
  }
  const ignored = COACH_ATTRS.filter((k) => !got[k]);
  assert.deepEqual(ignored, [], `這些能力一整屆都沒被自動配置照顧到：${ignored.join(', ')}`);
});

test('賽前指定的先發投手會真的登板', () => {
  const { players, poolOrder } = generatePool(4242);
  const roster = suggestRoster(players, poolOrder);
  const all = gameSquad(players, roster, 0);
  // 挑一個「不是預設」的先發
  const alt = all.rotationOptions[2];
  assert.ok(alt, '輪值不足以測試');
  const forced = gameSquad(players, roster, 0, alt.id);
  assert.equal(forced.pitchers[0]?.id, alt.id, '指定的先發沒有被採用');
  assert.notEqual(all.pitchers[0]?.id, alt.id, '測試選到的正好是預設先發，測不出差異');
});

test('跑壘方針會改變比賽結果，而且不是免費加成', () => {
  /** @param {'aggressive'|'balanced'|'conservative'} stance */
  const run = (stance) => {
    let runs = 0, outsOnBases = 0, games = 0;
    for (let s = 0; s < 60; s++) {
      const { players, poolOrder } = generatePool(7700 + s);
      const roster = suggestRoster(players, poolOrder);
      const sq = gameSquad(players, roster, 0);
      const { result, events } = runGameHeadless({
        seed: 7700 + s, key: `st/${s}`, index: 0, stageId: 's',
        lineup: sq.lineup, bench: sq.bench, pitchers: sq.pitchers,
        coach: { bullpen: 40, scouting: 40, communication: 40, conditioning: 40, intel: 40 },
        nation: nation('AUS'), weAreHome: true, templates: DECISION_TEMPLATES, stance,
      }, POLICY_GREEDY);
      runs += result.runsFor;
      games++;
      for (const e of events) if (e.t === 'PLAY' && /被觸殺/.test(e.narrative)) outsOnBases++;
    }
    return { runs: runs / games, thrownOut: outsOnBases / games };
  };

  const agg = run('aggressive');
  const con = run('conservative');
  assert.notEqual(agg.runs.toFixed(2), con.runs.toFixed(2), '不同方針打出完全一樣的得分，設定沒有進入模擬');
  assert.ok(agg.thrownOut > con.thrownOut,
    `積極(${agg.thrownOut.toFixed(2)}) 應該比保守(${con.thrownOut.toFixed(2)}) 更常被觸殺，否則就是免費加成`);
});

test('每場比賽至少要有一次玩家可以下判斷的地方', () => {
  // 賽中關鍵局面可能因為局勢而沒有觸發，但賽前調度是每場都有的，
  // 所以「整場只能看」不該再發生。
  const { events } = career(90003);
  let games = 0, gamesWithInput = 0, cur = 0;
  for (const e of events) {
    if (e.t === 'DECISION' && e.prompt.kind === 'PREGAME') { cur = 1; }
    if (e.t === 'GAME_END') { games++; if (cur > 0) gamesWithInput++; cur = 0; }
    if (e.t === 'DECISION' && !['ALLOCATE', 'ROSTER'].includes(e.prompt.kind)) cur++;
  }
  assert.equal(gamesWithInput, games, `${games} 場中有 ${games - gamesWithInput} 場玩家完全沒有輸入`);
});

test('賽前調度的編碼可以往返', () => {
  const enc = encodePregameChoice(/** @type {any} */ ('P07'), 'aggressive');
  assert.match(enc, /^sp:P07\|stance:aggressive$/);
});
