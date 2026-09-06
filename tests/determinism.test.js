// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';
import { runGameHeadless, POLICY_GREEDY, POLICY_FIRST, POLICY_RANDOM } from '../core/sim/driver.js';
import { generatePool } from '../core/career/generate.js';
import { suggestRoster, gameSquad } from '../core/career/roster.js';
import { nation } from '../content/data/nations.js';
import { DECISION_TEMPLATES } from '../content/data/decisions.js';
import { makeSave, replaySave } from '../core/save/save.js';

/**
 * 穩定序列化（key 排序），讓比對不受屬性順序影響。
 * @param {unknown} v
 * @returns {string}
 */
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const obj = /** @type {Record<string, unknown>} */ (v);
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

/**
 * Golden seeds —— 釘住的快照。
 *
 * 這些值不是「正確答案」，而是「已經發生過的事實」。任何引擎改動只要讓這裡紅燈，
 * 就代表既有的種子碼會跑出不同的人生：朋友貼給你的種子碼會失效。
 * 那不一定是 bug，但一定需要一個人親自判斷要不要接受，而不是預設放行。
 *
 * 要有意更新時：跑 `node tools/golden.js` 產生新的區塊貼上來，並在 commit 訊息裡說明原因。
 *
 * 更新紀錄：
 * - 2026-09-05 遊玩機制調整後更新。變動包含：每場比賽新增賽前調度（選先發、
 *   定跑壘方針）、跑壘方針實際影響推進與被觸殺機率、新增盜壘動作、
 *   補上兩張寬觸發決策模板（原本 11.6% 的比賽零決策）、每場賽後即時給點並分配、
 *   傷病機率只套用在實際上場的球員（原本連板凳都算，一屆傷 11 人）。
 * - 2026-09-05 修正比賽規則後更新。變動包含：再見安打（原本九局下超前後還會繼續打完
 *   半局）、延長賽突破僵局制（原本 2% 的比賽以平手收場並被判為敗）、依角色分開的
 *   換投門檻（原本後援也被留到破百球，整屆只用得到一個後援）、傷兵不得出賽、
 *   投球負荷跨場次累積。這些都改變了比賽的進行方式，舊種子碼必然跑出不同結果。
 */
const GOLDEN = [
  {
    seed: 11111,
    seedCode: '0800-002P-SYM',
    ending: 'ticket',
    record: 'CZEW8-2 CHNW6-4 AUSL7-10 NEDW6-4 KORL1-5 MEXW2-1 PURW10-7 USAW8-5 JPNW9-8 VENL3-5',
    approval: 86,
  },
  {
    seed: 20260905,
    seedCode: '0800-4TJG-AFH',
    ending: 'early_out',
    record: 'CZEL1-3 CHNW3-2 AUSW6-4 NEDL3-4 KORW4-3 MEXL3-5 PURL10-14',
    approval: 26,
  },
  {
    seed: 777777,
    seedCode: '0800-05XW-CDT',
    ending: 'so_close',
    record: 'CZEW11-4 CHNW9-8 AUSL1-4 NEDW9-1 KORL4-5 MEXL3-6 PURW8-6 USAL5-6 JPNL4-5',
    approval: 34,
  },
];

/** @param {number} seed @param {string} policyName */
function runCareerFor(seed, policyName = 'greedy') {
  const pol = { greedy: POLICY_GREEDY, first: POLICY_FIRST, random: POLICY_RANDOM }[policyName] ?? POLICY_GREEDY;
  return runCareerHeadless(newCareer(seed, '測試教頭'), makeCareerPolicy(pol));
}

test('同種子＋同選擇 → 完全相同的一段生涯', () => {
  for (const seed of [11111, 20260905, 777777]) {
    const a = runCareerFor(seed);
    const b = runCareerFor(seed);
    assert.equal(canonical(a.state), canonical(b.state), `種子 ${seed} 兩次結果不同`);
    assert.equal(canonical(a.decisions), canonical(b.decisions));
  }
});

test('不同種子會產生不同人生（否則種子根本沒作用）', () => {
  const a = runCareerFor(11111);
  const b = runCareerFor(22222);
  assert.notEqual(canonical(a.state), canonical(b.state));
});

test('不同選擇會導向不同結果（否則決策是裝飾）', () => {
  const a = runCareerFor(20260905, 'greedy');
  const b = runCareerFor(20260905, 'first');
  assert.notEqual(canonical(a.state.tournament?.results), canonical(b.state.tournament?.results),
    '兩種策略打出完全一樣的賽果，代表玩家的選擇沒有進入模擬');
});

/**
 * Golden seeds。
 *
 * 這些數字被釘住，不是因為它們「正確」，而是因為它們「已經發生過」。
 * 任何引擎改動只要動到這裡，就代表既有的種子碼會跑出不同的人生 ——
 * 那不一定是 bug，但一定需要一個人親自判斷要不要接受。
 */
test('golden seeds：釘住既有種子的結果', () => {
  const actual = [11111, 20260905, 777777].map((seed) => {
    const { state } = runCareerFor(seed);
    return {
      seed,
      seedCode: state.seedCode,
      ending: state.ending?.id,
      record: state.tournament?.results
        .map((r) => `${r.opponent}${r.win ? 'W' : 'L'}${r.runsFor}-${r.runsAgainst}`).join(' '),
      approval: state.coach.meters.publicApproval,
    };
  });

  assert.deepEqual(actual, GOLDEN);
});

test('加一張永遠不會觸發的決策模板，不改變任何一顆球的結果', () => {
  const seed = 4242;
  const { players, poolOrder } = generatePool(seed);
  const roster = suggestRoster(players, poolOrder);
  const squad = gameSquad(players, roster, 0);
  /** @param {readonly any[]} templates */
  const play = (templates) => runGameHeadless({
    seed, key: 'test/game/00', index: 0, stageId: 's',
    lineup: squad.lineup, bench: squad.bench, pitchers: squad.pitchers,
    coach: { bullpen: 40, scouting: 40, communication: 40, conditioning: 40, intel: 40 },
    nation: nation('KOR'), weAreHome: true, templates,
  }, POLICY_GREEDY);

  const before = play(DECISION_TEMPLATES);
  // 一張條件不可能成立的新卡：局數必須大於 999。
  const first = DECISION_TEMPLATES[0];
  assert.ok(first, '至少要有一個決策模板');
  const inert = { ...first, id: 'never_fires', trigger: { ...first.trigger, minInning: 999 } };
  const after = play([...DECISION_TEMPLATES, inert]);

  assert.equal(canonical(after.result), canonical(before.result),
    '新增內容改變了既有種子的比賽結果 —— RNG 分流失效了');
  assert.equal(after.events.length, before.events.length);
});

test('存檔重播出的狀態，與當初跑出來的一模一樣', () => {
  const seed = 20260905;
  const st0 = newCareer(seed, '測試教頭');
  const run = runCareerHeadless(st0, makeCareerPolicy(POLICY_GREEDY));
  const save = makeSave({ seedCode: st0.seedCode, coachName: '測試教頭', decisions: run.decisions });
  const replayed = replaySave(save);
  assert.equal(canonical(replayed.state), canonical(run.state));
});

test('被改過的存檔會被擋下，不會靜默跑出假的人生', () => {
  const st0 = newCareer(555, '測試教頭');
  const run = runCareerHeadless(st0, makeCareerPolicy(POLICY_GREEDY));
  const save = makeSave({ seedCode: st0.seedCode, coachName: '測試教頭', decisions: run.decisions });

  const tampered = { ...save, decisions: save.decisions.map((d, i) => (i === 2 ? { ...d, choiceId: 'xxx' } : d)) };
  assert.throws(() => replaySave(tampered), /校驗/);

  // 錨點對不上（模擬引擎改版後決策位置位移）
  const shifted = makeSave({
    seedCode: st0.seedCode, coachName: '測試教頭',
    decisions: save.decisions.map((d, i) => (i === 2 ? { ...d, anchor: 'career/9999/bogus' } : d)),
  });
  assert.throws(() => replaySave(shifted), /不相容/);
});

test('球員池的迭代順序是決定性的（不依賴 Object.keys）', () => {
  const a = generatePool(31337);
  const b = generatePool(31337);
  assert.deepEqual(a.poolOrder, b.poolOrder);
  assert.equal(canonical(a.players), canonical(b.players));
  assert.equal(new Set(a.poolOrder).size, a.poolOrder.length, '球員 id 有重複');
});
