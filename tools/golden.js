// @ts-check
/**
 * 產生 tests/determinism.test.js 裡的 GOLDEN 區塊。
 *
 * 只有在你「刻意」要讓舊種子失效時才跑這支，並且要在 commit 訊息裡寫清楚原因。
 * 平常 golden 測試紅燈時，正確反應是去查為什麼變了，不是直接跑這支蓋掉。
 *
 *   node tools/golden.js
 */
import { newCareer } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';
import { POLICY_GREEDY } from '../core/sim/driver.js';

const SEEDS = [11111, 20260905, 777777];

const rows = SEEDS.map((seed) => {
  const { state } = runCareerHeadless(newCareer(seed, '測試教頭'), makeCareerPolicy(POLICY_GREEDY));
  return {
    seed,
    seedCode: state.seedCode,
    ending: state.ending?.id,
    record: state.tournament?.results
      .map((r) => `${r.opponent}${r.win ? 'W' : 'L'}${r.runsFor}-${r.runsAgainst}`).join(' '),
    approval: state.coach.meters.publicApproval,
  };
});

console.log('const GOLDEN = [');
for (const r of rows) {
  console.log('  {');
  console.log(`    seed: ${r.seed},`);
  console.log(`    seedCode: '${r.seedCode}',`);
  console.log(`    ending: '${r.ending}',`);
  console.log(`    record: '${r.record}',`);
  console.log(`    approval: ${r.approval},`);
  console.log('  },');
}
console.log('];');
