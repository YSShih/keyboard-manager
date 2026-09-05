// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * core/ 必須是純邏輯：零 DOM、零 Math.random、零 Date.now。
 *
 * 這不是潔癖。一旦 core 裡出現一個 Math.random，決定論就破了，
 * 而且破得很安靜 —— 玩家只會回報「同一個種子碼跑出不同結果」，
 * 而你要從幾千行裡找出那一行。用測試擋在前面便宜太多。
 */

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const CORE_FILES = [...walk('core'), ...walk('content')];

test('core/ 與 content/ 裡沒有 Math.random', () => {
  const bad = CORE_FILES.filter((f) => /Math\.random/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, [], `這些檔案用了 Math.random，會破壞決定論：\n  ${bad.join('\n  ')}`);
});

test('core/ 與 content/ 裡沒有 Date.now / new Date', () => {
  const bad = CORE_FILES.filter((f) => /Date\.now|new Date\(/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, [], `這些檔案讀了時間，會破壞決定論：\n  ${bad.join('\n  ')}`);
});

test('core/ 裡沒有 DOM 存取', () => {
  const bad = walk('core').filter((f) => /\b(document|window|localStorage)\b/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, [], `core 不該碰 DOM：\n  ${bad.join('\n  ')}`);
});

test('core/ 沒有 import ui/ 或 app/', () => {
  const bad = walk('core').filter((f) => /from ['"][^'"]*\/(ui|app)\//.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, [], `core 不該依賴呈現層：\n  ${bad.join('\n  ')}`);
});

/**
 * 去掉註解與字串，避免掃描器被文件裡引用的反例騙到。
 * 掃描器自己不可信的話，它擋不住任何東西。
 * @param {string} src
 * @returns {string}
 */
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 區塊註解（含 JSDoc）
    .replace(/\/\/[^\n]*/g, ' ')           // 行註解
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")  // 單引號字串
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');   // 樣板字串
}

test('沒有裸露的 rng.next() 拿來跟寫死的機率比大小', () => {
  /** @type {string[]} */
  const bad = [];
  for (const f of walk('core')) {
    const src = stripCommentsAndStrings(readFileSync(f, 'utf8'));
    // rng.next() 用在取樣、洗牌是正常的；rng.bool(p) 是擲一次銅板的正規 API。
    // 被禁的是 `rng.next() < 0.3` 這種寫法 —— 它把一個機率藏在運算式裡，
    // 既不會出現在 Odds 帳本，也讓人以為那是「隨便寫的」而不是調過的參數。
    if (/\.next\(\)\s*[<>]=?\s*[\d.]/.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, [], `這些地方把機率藏在運算式裡：\n  ${bad.join('\n  ')}`);
});

test('所有 .sort() 都作用在新陣列上（不會就地改到來源）', () => {
  /** @type {string[]} */
  const bad = [];
  for (const f of walk('core')) {
    // 壓成單行後再掃，才抓得到跨行的鏈式呼叫（.slice()\n  .sort(...)）。
    const src = stripCommentsAndStrings(readFileSync(f, 'utf8')).replace(/\s+/g, ' ');
    for (const m of src.matchAll(/\.sort\(/g)) {
      const before = src.slice(Math.max(0, (m.index ?? 0) - 14), m.index);
      // .slice() / ] / ) 之後的 sort 都是作用在新陣列上
      if (!/\.slice\(\)\s*$|\]\s*$|\)\s*$/.test(before)) {
        bad.push(`${f}  …${before.trim()}.sort(`);
      }
    }
  }
  assert.deepEqual(bad, [], `就地排序會改到來源陣列：\n  ${bad.join('\n  ')}`);
});

test('把 Math.random 換成會 throw 的版本，整段生涯仍然跑得完', async () => {
  const original = Math.random;
  Math.random = () => { throw new Error('core 不該呼叫 Math.random'); };
  try {
    const { newCareer } = await import('../core/career/career.js');
    const { runCareerHeadless, makeCareerPolicy } = await import('../core/career/driver.js');
    const { POLICY_GREEDY } = await import('../core/sim/driver.js');
    const { state } = runCareerHeadless(newCareer(24680, '測試教頭'), makeCareerPolicy(POLICY_GREEDY));
    assert.ok(state.ending, '生涯應該要跑到結局');
  } finally {
    Math.random = original;
  }
});
