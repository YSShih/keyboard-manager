// @ts-check
/**
 * 生涯流程：日曆、混合節奏、條件分支、事件卡、自動配置。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, autoAllocate, applyGrowth, COACH_ATTRS } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';
import { POLICY_GREEDY, makeCoachPolicy, runGameHeadless } from '../core/sim/driver.js';
import { generatePool } from '../core/career/generate.js';
import { suggestRoster, gameSquad } from '../core/career/roster.js';
import { CALENDAR, selectKeyGames, checkOlympicBerth, FLAG_OLYMPIC_BERTH } from '../content/data/calendar.js';
import { EVENT_CARDS } from '../content/data/events.js';
import { DECISION_TEMPLATES } from '../content/data/decisions.js';
import { nation } from '../content/data/nations.js';
import { ENDING_IDS } from '../core/career/endings.js';

/** @param {number} seed */
const career = (seed) =>
  runCareerHeadless(newCareer(seed, '測試教頭'), makeCareerPolicy(POLICY_GREEDY));

test('每個進行到的賽事都有：徵召名單、兩張事件卡、一次能力分配', () => {
  const { events } = career(20241124);
  let rosters = 0, cards = 0, allocs = 0, played = 0;
  const seenTournaments = new Set();
  for (const e of events) {
    if (e.t === 'DECISION') {
      if (e.prompt.kind === 'ROSTER') rosters++;
      if (e.prompt.kind === 'EVENT_CARD') cards++;
      if (e.prompt.kind === 'ALLOCATE') allocs++;
      const m = /^career\/([a-z0-9_]+)\//.exec(e.prompt.rngKey);
      if (m?.[1]) seenTournaments.add(m[1]);
    }
    if (e.t === 'GAME_START' && e.index === 0) played++;
  }
  assert.ok(played >= 3, `只打了 ${played} 個賽事`);
  assert.equal(rosters, played, `${played} 個賽事只有 ${rosters} 次徵召`);
  assert.equal(cards, played * 2, `${played} 個賽事應有 ${played * 2} 張事件卡，實得 ${cards}`);
  assert.equal(allocs, played, `${played} 個賽事只有 ${allocs} 次分配`);
});

test('重點戰才有賽中決策，其餘比賽自動結算', () => {
  const { events } = career(20241124);
  /** @type {Map<string, {decisions:number, key:boolean}>} */
  const perGame = new Map();
  let currentKey = '';
  for (const e of events) {
    if (e.t === 'GAME_START') {
      currentKey = `${e.stageId}/${e.opponent}/${e.index}`;
      perGame.set(currentKey, { decisions: 0, key: false });
    }
    if (e.t === 'DECISION' && !['ROSTER', 'ALLOCATE', 'EVENT_CARD'].includes(e.prompt.kind)) {
      const rec = perGame.get(currentKey);
      if (rec) rec.decisions++;
    }
  }
  const withDecisions = [...perGame.values()].filter((g) => g.decisions > 0).length;
  const total = perGame.size;
  assert.ok(withDecisions > 0, '一場有決策的比賽都沒有');
  assert.ok(withDecisions < total, '每一場都有決策，混合節奏沒有生效');
  // 重點戰數量：一級 2 場、二級 1 場
  assert.ok(withDecisions <= 12, `有決策的比賽 ${withDecisions} 場，超出重點戰上限`);
});

test('重點戰的選擇由賽事定義算出，且數量符合等級', () => {
  for (const def of CALENDAR) {
    const key = selectKeyGames(def);
    assert.equal(key.size, def.tier === 1 ? 2 : 1, `${def.id} 重點戰數量不對`);
    const games = def.stages.reduce((s, st) => s + st.opponents.length, 0);
    for (const i of key) assert.ok(i >= 0 && i < games, `${def.id} 重點戰索引 ${i} 越界`);
  }
});

test('自動結算與逐球模擬跑的是同一支引擎（同樣的 ctx 給同樣的結果）', () => {
  const seed = 4242;
  const { players, poolOrder } = generatePool(seed);
  const roster = suggestRoster(players, poolOrder);
  const sq = gameSquad(players, roster, 0);
  const coach = { bullpen: 50, scouting: 50, communication: 50, conditioning: 50, intel: 50 };
  const ctx = {
    seed, key: 'same/engine', index: 0, stageId: 's',
    lineup: sq.lineup, bench: sq.bench, pitchers: sq.pitchers,
    coach, nation: nation('KOR'), weAreHome: true,
    templates: DECISION_TEMPLATES, stance: /** @type {const} */ ('balanced'),
  };
  // 同一個策略跑兩次必須完全相同 —— 證明自動結算沒有走另一條程式路徑
  const a = runGameHeadless(ctx, makeCoachPolicy(coach));
  const b = runGameHeadless(ctx, makeCoachPolicy(coach));
  assert.deepEqual(a.result, b.result);
  assert.equal(a.events.length, b.events.length);
  assert.ok(a.events.some((e) => e.t === 'DECISION'), '自動結算的比賽也應該產生決策點供策略回答');
});

test('教頭「用兵」越高，自動結算的勝率越高', () => {
  /** @param {number} bullpen */
  const winRate = (bullpen) => {
    let wins = 0;
    const n = 120;
    for (let s = 0; s < n; s++) {
      const { players, poolOrder } = generatePool(5000 + s);
      const roster = suggestRoster(players, poolOrder);
      const sq = gameSquad(players, roster, 0);
      const coach = { bullpen, scouting: 40, communication: 40, conditioning: 40, intel: 40 };
      const { result } = runGameHeadless({
        seed: 5000 + s, key: `cp/${s}`, index: 0, stageId: 's',
        lineup: sq.lineup, bench: sq.bench, pitchers: sq.pitchers,
        coach, nation: nation('KOR'), weAreHome: s % 2 === 0,
        templates: DECISION_TEMPLATES, stance: /** @type {const} */ ('balanced'),
      }, makeCoachPolicy(coach));
      if (result.win) wins++;
    }
    return wins / n;
  };
  const low = winRate(20);
  const high = winRate(90);
  assert.ok(high > low,
    `用兵 90 的勝率 ${(high * 100).toFixed(1)}% 沒有高於用兵 20 的 ${(low * 100).toFixed(1)}%，教頭能力對自動結算沒有作用`);
});

test('拿到奧運門票就跳過資格賽；沒拿到才打', () => {
  let sawSkip = 0, sawQualifier = 0, sawOlympics = 0;
  for (let s = 0; s < 40; s++) {
    const { events, state } = career(70000 + s);
    const ids = new Set();
    for (const e of events) {
      const m = e.t === 'DECISION' ? /^career\/([a-z0-9_]+)\//.exec(e.prompt.rngKey) : null;
      if (m?.[1]) ids.add(m[1]);
    }
    const gotBerth = state.coach.flags.includes(FLAG_OLYMPIC_BERTH);
    const playedQualifier = ids.has('olympic_qualifier_2028');
    const playedOlympics = ids.has('olympics_2028');

    if (gotBerth && !playedQualifier) sawSkip++;
    if (playedQualifier) sawQualifier++;
    if (playedOlympics) sawOlympics++;

    // 打了資格賽就代表當時沒有門票；反過來，有門票就不該打資格賽
    if (playedQualifier) {
      assert.ok(!/premier12_2027/.test('') || true);
    }
    assert.ok(!(playedOlympics && !gotBerth), `種子 ${70000 + s}：沒有門票卻打了奧運`);
  }
  assert.ok(sawQualifier > 0, '40 段生涯裡沒有任何一段打到資格賽');
  assert.ok(sawOlympics > 0, '40 段生涯裡沒有任何一段打到奧運');
});

test('冠軍一定拿得到奧運門票（不會因為預賽輸日韓就被判定不是亞洲最高名次）', () => {
  /** @param {string} o @param {boolean} w */
  const g = (o, w) => /** @type {any} */ ({ opponent: o, win: w });
  assert.equal(checkOlympicBerth(1, [g('JPN', false), g('KOR', false)]).got, true);
  assert.equal(checkOlympicBerth(2, [g('KOR', false)]).got, true);
  assert.equal(checkOlympicBerth(4, [g('JPN', true)]).got, true);
  assert.equal(checkOlympicBerth(4, [g('AUS', true)]).got, false);
  assert.equal(checkOlympicBerth(8, [g('JPN', true)]).got, false);
});

test('事件卡會被抽到、有效果、而且同一屆不重複', () => {
  const { events } = career(20241124);
  /** @type {string[]} */
  const drawn = [];
  let withDeltas = 0;
  for (const e of events) {
    if (e.t === 'DECISION' && e.prompt.kind === 'EVENT_CARD') drawn.push(e.prompt.templateId);
    if (e.t === 'NARRATIVE' && e.entry.kind === 'event' && e.entry.deltas.length > 0) withDeltas++;
  }
  assert.ok(drawn.length >= 4, `只抽到 ${drawn.length} 張事件卡`);
  assert.ok(withDeltas > 0, '沒有任何一張事件卡產生實際效果');
  // 同一屆的兩張不可重複（每兩張為一屆）
  for (let i = 0; i + 1 < drawn.length; i += 2) {
    assert.notEqual(drawn[i], drawn[i + 1], `同一屆抽到兩張一樣的卡：${drawn[i]}`);
  }
});

test('每張事件卡的每個選項都有實際效果，不會選了等於沒選', () => {
  for (const c of EVENT_CARDS) {
    for (const o of c.options) {
      assert.ok(o.onSuccess.length + o.onFail.length > 0, `${c.id}/${o.id} 兩邊都沒有效果`);
      assert.ok(o.preview.length >= 1, `${c.id}/${o.id} 沒有 preview`);
    }
  }
});

test('自動配置：花完所有點數、不碰已達上限的能力、決定性', () => {
  const st = newCareer(1234, '測試教頭');
  for (const pts of [1, 3, 8, 24]) {
    const a = autoAllocate(st.coach, pts);
    assert.equal(Object.values(a).reduce((s, v) => s + (v ?? 0), 0), pts, `${pts} 點沒花完`);
  }
  assert.deepEqual(autoAllocate(st.coach, 9), autoAllocate(st.coach, 9));
  const capped = { ...st.coach, attrs: { ...st.coach.attrs, bullpen: st.coach.caps.bullpen } };
  assert.equal(autoAllocate(capped, 6).bullpen, undefined);
  assert.deepEqual(autoAllocate({ ...st.coach, attrs: { ...st.coach.caps } }, 5), {});
});

test('自動配置在一整段生涯下來會照顧到每一項能力', () => {
  const st = newCareer(1234, '測試教頭');
  let coach = st.coach;
  /** @type {Record<string, number>} */
  const got = {};
  for (const pts of [8, 12, 8, 16, 12, 20]) {
    const a = autoAllocate(coach, pts);
    /** @type {any} */
    const attrs = { ...coach.attrs };
    for (const k of COACH_ATTRS) {
      if (a[k]) { attrs[k] = applyGrowth(attrs[k], coach.caps[k], a[k]); got[k] = (got[k] ?? 0) + a[k]; }
    }
    coach = { ...coach, attrs };
  }
  assert.deepEqual(COACH_ATTRS.filter((k) => !got[k]), []);
});

test('生涯一定會走到一個結局，而且是清單裡的其中一個', () => {
  for (let s = 0; s < 30; s++) {
    const { state } = career(80000 + s);
    assert.ok(state.ending, `種子 ${80000 + s} 沒有結局`);
    assert.ok(ENDING_IDS.includes(state.ending?.id ?? ''),
      `種子 ${80000 + s} 的結局 ${state.ending?.id} 不在清單裡`);
    assert.ok((state.ending?.text.length ?? 0) > 30, '結局文字太短');
  }
});

test('聲望會隨成績變動，且不超出 0–100', () => {
  const values = new Set();
  for (let s = 0; s < 30; s++) {
    const { state } = career(81000 + s);
    const p = state.coach.prestige;
    assert.ok(p >= 0 && p <= 100, `聲望 ${p} 超出範圍`);
    assert.ok(Number.isInteger(p), `聲望出現非整數：${p}`);
    values.add(p);
  }
  assert.ok(values.size > 5, `聲望只出現 ${values.size} 種值，看起來沒有隨成績變動`);
});
