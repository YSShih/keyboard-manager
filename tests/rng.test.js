// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, quantizeProb, byScoreThenId } from '../core/rng/rng.js';
import { encodeSeed, decodeSeed, seedFromPhrase, looksLikeSeedCode, SEED_CODE_VERSION } from '../core/rng/seedCode.js';

test('同一個 (種子, key) 永遠給出同一串數列', () => {
  const a = makeRng(12345, 'a/b/c');
  const b = makeRng(12345, 'a/b/c');
  for (let i = 0; i < 200; i++) assert.equal(a.next(), b.next());
});

test('不同 key 的數列彼此獨立', () => {
  const a = makeRng(12345, 'a/b/c');
  const b = makeRng(12345, 'a/b/d');
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 3, `兩條流太相似（${same}/100 相同）`);
});

test('子流不受父流消耗量影響 —— 這是「加內容不破舊種子」的根本', () => {
  const parentKey = 'career/2027/events';
  const before = makeRng(999, `${parentKey}/slot/1/resolve`).next();
  // 模擬「有人在中間多插了一次抽卡」：父層多消耗，子流不該變。
  const parent = makeRng(999, parentKey);
  for (let i = 0; i < 50; i++) parent.next();
  const after = makeRng(999, `${parentKey}/slot/1/resolve`).next();
  assert.equal(before, after);
});

test('分布落在合理範圍', () => {
  const rng = makeRng(7, 'dist');
  let sum = 0, min = 1, max = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) { const v = rng.next(); sum += v; min = Math.min(min, v); max = Math.max(max, v); }
  assert.ok(Math.abs(sum / N - 0.5) < 0.02, `平均值 ${sum / N}`);
  assert.ok(min >= 0 && max < 1);
});

test('bool(p) 的實際比例接近 p', () => {
  for (const p of [0.1, 0.35, 0.5, 0.8]) {
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (makeRng(3, `b/${p}/${i}`).bool(p)) hits++;
    assert.ok(Math.abs(hits / 20000 - p) < 0.02, `p=${p} 實得 ${hits / 20000}`);
  }
});

test('weighted 依權重取樣', () => {
  const items = [{ item: 'a', w: 1 }, { item: 'b', w: 3 }];
  let b = 0;
  for (let i = 0; i < 20000; i++) if (makeRng(5, `w/${i}`).weighted(items) === 'b') b++;
  assert.ok(Math.abs(b / 20000 - 0.75) < 0.02, `實得 ${b / 20000}`);
});

test('機率量化到 1e-4', () => {
  assert.equal(quantizeProb(0.123456789), 0.1235);
  assert.equal(quantizeProb(0.5), 0.5);
});

test('byScoreThenId 是全序（分數相同時不會回傳 0）', () => {
  const cmp = byScoreThenId((/** @type {any} */ x) => x.v, (/** @type {any} */ x) => x.id);
  assert.notEqual(cmp({ v: 1, id: 'a' }, { v: 1, id: 'b' }), 0);
  assert.equal(cmp({ v: 1, id: 'a' }, { v: 1, id: 'a' }), 0);
});

test('種子碼往返', () => {
  for (const seed of [0, 1, 12345, 2 ** 30, 2 ** 40 - 1]) {
    const code = encodeSeed({ version: SEED_CODE_VERSION, seed });
    assert.equal(decodeSeed(code).seed, seed, `seed ${seed} 往返失敗`);
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/);
  }
});

test('種子碼容錯：大小寫、連字號、I/L/O 手抄錯誤', () => {
  const code = encodeSeed({ version: SEED_CODE_VERSION, seed: 987654321 });
  const seed = decodeSeed(code).seed;
  assert.equal(decodeSeed(code.toLowerCase()).seed, seed);
  assert.equal(decodeSeed(code.replace(/-/g, '')).seed, seed);
  assert.equal(decodeSeed(` ${code} `).seed, seed);
  // 把 1 抄成 I、0 抄成 O 仍然解得回來
  assert.equal(decodeSeed(code.replace(/1/g, 'I').replace(/0/g, 'O')).seed, seed);
});

test('壞掉的種子碼會被 checksum 擋下，而不是靜默跑出別的人生', () => {
  assert.throws(() => decodeSeed('AAAA-AAAA-AAA'), /校驗/);
  assert.throws(() => decodeSeed('ABC'), /長度/);
  assert.throws(() => decodeSeed('AAAA-AAAA-AA!'), /長度|無效/);
});

test('自訂片語可以當種子，且穩定', () => {
  const a = seedFromPhrase('中華隊加油');
  const b = seedFromPhrase('中華隊加油');
  assert.equal(a.seed, b.seed);
  assert.notEqual(seedFromPhrase('中華隊加油').seed, seedFromPhrase('中華隊加油！').seed);
});

test('looksLikeSeedCode 分得出種子碼與片語', () => {
  assert.equal(looksLikeSeedCode(encodeSeed({ version: 1, seed: 42 })), true);
  assert.equal(looksLikeSeedCode('中華隊加油'), false);
  assert.equal(looksLikeSeedCode('hello'), false);
});
