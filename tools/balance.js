// @ts-check
/**
 * 平衡測試 harness（headless，node 直跑，不需 build）。
 *
 *   node tools/balance.js games --n 500 --vs JPN,KOR,AUS,CZE
 *   node tools/balance.js games --n 500 --policy random
 *
 * 用的是跟玩家完全同一支 simulateGame —— 這是「這裡量到的就是玩家玩到的」的保證。
 * 平衡最終是設計判斷，這支工具只負責把失控抓出來給人看。
 */
import { generatePool, overall } from '../core/career/generate.js';
import { suggestRoster, gameSquad } from '../core/career/roster.js';
import { runGameHeadless, POLICY_GREEDY, POLICY_RANDOM, POLICY_FIRST } from '../core/sim/driver.js';
import { nation, NATIONS } from '../content/data/nations.js';
import { DECISION_TEMPLATES } from '../content/data/decisions.js';
import { TUNING } from '../content/tuning.js';
import { newCareer } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a && a.startsWith('--')) {
      const next = argv[i + 1];
      out[a.slice(2)] = next && !next.startsWith('--') ? next : 'true';
      if (next && !next.startsWith('--')) i++;
    }
  }
  return out;
}

const POLICIES = { greedy: POLICY_GREEDY, random: POLICY_RANDOM, first: POLICY_FIRST };

/**
 * @param {object} o
 * @param {number} o.n
 * @param {string[]} o.opponents
 * @param {import('../core/sim/driver.js').Policy} o.policy
 * @param {number} o.coachAttr
 */
function runGames({ n, opponents, policy, coachAttr }) {
  const coach = {
    bullpen: coachAttr, scouting: coachAttr, communication: coachAttr,
    conditioning: coachAttr, intel: coachAttr,
  };

  /** @type {Record<string, {w:number, n:number, rf:number, ra:number}>} */
  const tally = {};
  let plays = 0, ks = 0, bbs = 0, hrs = 0, decisions = 0, innings = 0;

  for (let i = 0; i < n; i++) {
    const seed = 100000 + i;
    const { players, poolOrder } = generatePool(seed);
    const roster = suggestRoster(players, poolOrder);
    for (const code of opponents) {
      const squad = gameSquad(players, roster, i % 4);
      const { result, events } = runGameHeadless({
        seed,
        key: `bal/${seed}/${code}`,
        index: i, stageId: 'bal',
        lineup: squad.lineup, bench: squad.bench, pitchers: squad.pitchers,
        coach, nation: nation(code), weAreHome: i % 2 === 0,
        templates: DECISION_TEMPLATES,
      }, policy);

      const t = (tally[code] ??= { w: 0, n: 0, rf: 0, ra: 0 });
      t.n++; t.rf += result.runsFor; t.ra += result.runsAgainst;
      if (result.win) t.w++;

      for (const e of events) {
        if (e.t === 'PLAY') { plays++; if (e.outcome === 'K') ks++; if (e.outcome === 'BB') bbs++; if (e.outcome === 'HR') hrs++; }
        if (e.t === 'DECISION') decisions++;
        if (e.t === 'HALF_END') innings += 0.5;
      }
    }
  }

  const games = Object.values(tally).reduce((s, t) => s + t.n, 0);
  console.log(`\n教頭能力 ${coachAttr}　共 ${games} 場\n`);
  console.log('對手      勝率     平均比分     樣本');
  console.log('─'.repeat(46));
  for (const code of opponents) {
    const t = tally[code];
    if (!t) continue;
    const wr = (t.w / t.n * 100);
    const bar = '█'.repeat(Math.round(wr / 5)).padEnd(20, '░');
    console.log(
      `${nation(code).name.padEnd(6)}(${String(nation(code).strength).padStart(2)})　${wr.toFixed(1).padStart(5)}%　` +
      `${(t.rf / t.n).toFixed(1)}:${(t.ra / t.n).toFixed(1)}　${bar}`,
    );
  }
  console.log('─'.repeat(46));
  console.log(`每場打席 ${(plays / games).toFixed(1)}　每場決策 ${(decisions / games).toFixed(2)}　每場半局 ${(innings / games).toFixed(1)}`);
  console.log(`三振率 ${(ks / plays * 100).toFixed(1)}%　四壞率 ${(bbs / plays * 100).toFixed(1)}%　全壘打率 ${(hrs / plays * 100).toFixed(1)}%`);

  // ── 護欄 ──
  /** @type {string[]} */
  const fails = [];
  /** @param {string} label @param {boolean} ok @param {string} detail */
  const check = (label, ok, detail) => { if (!ok) fails.push(`${label}：${detail}`); };
  const jp = tally['JPN'], au = tally['AUS'], cz = tally['CZE'];
  if (jp) check('vs 日本勝率', jp.w / jp.n >= 0.15 && jp.w / jp.n <= 0.42, `${(jp.w / jp.n * 100).toFixed(1)}%（期望 15–42%）`);
  if (au) check('vs 澳洲勝率', au.w / au.n >= 0.5 && au.w / au.n <= 0.78, `${(au.w / au.n * 100).toFixed(1)}%（期望 50–78%）`);
  if (cz) check('vs 捷克勝率', cz.w / cz.n >= 0.62 && cz.w / cz.n <= 0.9, `${(cz.w / cz.n * 100).toFixed(1)}%（期望 62–90%）`);
  check('三振率', ks / plays >= 0.15 && ks / plays <= 0.3, `${(ks / plays * 100).toFixed(1)}%（期望 15–30%）`);
  check('每場決策數', decisions / games >= TUNING.decision.minPerGame - 0.5 && decisions / games <= TUNING.decision.maxPerGame,
    `${(decisions / games).toFixed(2)}（期望 ${TUNING.decision.minPerGame}–${TUNING.decision.maxPerGame}）`);

  console.log();
  if (fails.length === 0) {
    console.log('✅ 全部護欄通過');
  } else {
    console.log('❌ 護欄未通過：');
    for (const f of fails) console.log('   ' + f);
    process.exitCode = 1;
  }
}

/**
 * 跑 N 段生涯，看結局分布與淘汰階段。
 * @param {object} o
 * @param {number} o.n
 * @param {import('../core/sim/driver.js').Policy} o.policy
 */
function runCareers({ n, policy }) {
  /** @type {Record<string, number>} */
  const endings = {};
  /** @type {Record<string, number>} */
  const exitStage = {};
  let berths = 0, totalPoints = 0, totalGames = 0, totalDecisions = 0;
  const approvals = [];

  for (let i = 0; i < n; i++) {
    const st0 = newCareer(300000 + i, '教頭');
    const { state, events, decisions } = runCareerHeadless(st0, makeCareerPolicy(policy));
    const id = state.ending?.id ?? '?';
    endings[id] = (endings[id] ?? 0) + 1;
    totalPoints += state.coach.unspentPoints;
    totalDecisions += decisions.length;
    approvals.push(state.coach.meters.publicApproval);

    let lastStage = 'opening';
    for (const e of events) {
      if (e.t === 'GAME_START') { lastStage = e.stageId; totalGames++; }
      if (e.t === 'PHASE' && e.body.includes('取得 2028')) berths++;
    }
    exitStage[lastStage] = (exitStage[lastStage] ?? 0) + 1;
  }

  console.log(`
${n} 段生涯
`);
  console.log('走到的最後階段');
  console.log('─'.repeat(46));
  for (const [k, v] of Object.entries(exitStage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}　${(v / n * 100).toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(v / n * 30))}`);
  }
  console.log('\n結局分布');
  console.log('─'.repeat(46));
  for (const [k, v] of Object.entries(endings).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}　${(v / n * 100).toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(v / n * 30))}`);
  }
  approvals.sort((a, b) => a - b);
  console.log(`
奧運門票取得率 ${(berths / n * 100).toFixed(1)}%`);
  console.log(`平均每段生涯 ${(totalGames / n).toFixed(1)} 場、${(totalDecisions / n).toFixed(1)} 個決策、獲得 ${(totalPoints / n).toFixed(1)} 點`);
  console.log(`民調中位數 ${approvals[Math.floor(n / 2)]}`);

  /** @type {string[]} */
  const fails = [];
  const champRate = (endings['champion'] ?? 0) / n;
  const earlyOut = (exitStage['opening'] ?? 0) / n;
  if (champRate > 0.12) fails.push(`冠軍率 ${(champRate * 100).toFixed(1)}%（期望 < 12%）`);
  if (earlyOut > 0.35) fails.push(`第一關就被淘汰 ${(earlyOut * 100).toFixed(1)}%（期望 < 35%）`);
  if (berths / n < 0.1 || berths / n > 0.45) fails.push(`奧運門票率 ${(berths / n * 100).toFixed(1)}%（期望 10–45%）`);
  // 每一種寫得出來的結局都必須真的有人碰得到，否則就是白寫的內容。
  const ALL_ENDINGS = ['champion', 'ticket', 'so_close', 'early_out', 'fired'];
  const missing = ALL_ENDINGS.filter((e) => !endings[e]);
  if (missing.length > 0) fails.push(`這些結局一次都沒出現，可能達不到：${missing.join(', ')}`);

  console.log();
  if (fails.length === 0) console.log('✅ 全部護欄通過');
  else { console.log('❌ 護欄未通過：'); for (const f of fails) console.log('   ' + f); process.exitCode = 1; }
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);

if (cmd === 'games') {
  const opponents = (args.vs ?? 'CZE,AUS,PAN,KOR,NED,MEX,USA,JPN,VEN').split(',');
  runGames({
    n: Number(args.n ?? 100),
    opponents,
    policy: POLICIES[/** @type {keyof typeof POLICIES} */ (args.policy ?? 'greedy')] ?? POLICY_GREEDY,
    coachAttr: Number(args.coach ?? TUNING.coach.startAttr),
  });
} else if (cmd === 'careers') {
  runCareers({
    n: Number(args.n ?? 100),
    policy: POLICIES[/** @type {keyof typeof POLICIES} */ (args.policy ?? 'greedy')] ?? POLICY_GREEDY,
  });
} else {
  console.log('用法：node tools/balance.js games   [--n 100] [--vs JPN,KOR] [--policy greedy|random|first] [--coach 22]');
  console.log('　　　node tools/balance.js careers [--n 100] [--policy greedy|random|first]');
  console.log('可用國家：' + NATIONS.map((x) => x.code).join(' '));
}
