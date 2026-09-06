// @ts-check
/**
 * 產生 tests/determinism.test.js 裡的 GOLDEN 區塊。
 *
 * 只有在你「刻意」要讓舊種子失效時才跑這支，並且要在 commit 訊息裡寫清楚原因。
 * 平常 golden 測試紅燈時，正確反應是去查為什麼變了，不是直接跑這支蓋掉。
 */
import { newCareer } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';
import { POLICY_GREEDY } from '../core/sim/driver.js';

const SEEDS = [11111, 20241124, 777777];

/** @param {number} seed */
export function goldenFor(seed) {
  const { state, events } = runCareerHeadless(newCareer(seed, '測試教頭'), makeCareerPolicy(POLICY_GREEDY));
  /** @type {string[]} */
  const path = [];
  for (const e of events) {
    if (e.t === 'PHASE' && /最終/.test(e.title)) {
      const m = /^(.+?)　最終(.+)$/.exec(e.title);
      if (m) path.push(`${m[1]?.slice(0, 6)}:${m[2]}`);
    }
  }
  return {
    seed,
    seedCode: state.seedCode,
    ending: state.ending?.id,
    path: path.join(' | '),
    prestige: state.coach.prestige,
    approval: state.coach.meters.publicApproval,
  };
}

if (process.argv[1]?.endsWith('golden.js')) {
  console.log('const GOLDEN = [');
  for (const seed of SEEDS) {
    const r = goldenFor(seed);
    console.log('  {');
    console.log(`    seed: ${r.seed},`);
    console.log(`    seedCode: '${r.seedCode}',`);
    console.log(`    ending: '${r.ending}',`);
    console.log(`    path: '${r.path}',`);
    console.log(`    prestige: ${r.prestige},`);
    console.log(`    approval: ${r.approval},`);
    console.log('  },');
  }
  console.log('];');
}
