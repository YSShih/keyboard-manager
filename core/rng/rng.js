// @ts-check
/**
 * 分流 PRNG — 整個遊戲決定論的根。
 *
 * 為什麼不是單一 mutable 流：
 * 單一流最常見的災難是「抽卡順序改了 / 多插一次 next()」，導致後面所有取值位移，
 * 所有既有種子碼全部失效。這裡改用 counter-based：由「主種子 + 結構化路徑字串」
 * 推導出彼此獨立的子流。加一張新事件卡只會影響那張卡自己的 key，
 * 比賽的逐球結果一顆都不會變。
 *
 * 規則（違反了不會報錯，只會靜默壞掉，見 docs/CONTRIBUTING.md）：
 *   1. 每個隨機來源有自己的命名 key，不共用父流
 *   2. 函式之間傳遞 key 前綴「字串」，不要傳 Rng 實例（實例會把消耗量耦合起來）
 *   3. 對集合做隨機迭代前，一律 .slice().sort(穩定全序比較器)
 *   4. 比較機率前量化到 1e-4，避免跨引擎浮點邊界疑慮
 */

/**
 * @typedef {string} RngKey
 * 結構化路徑，例：'career/2027/game/03/inn/07/top/ab/02'
 */

/**
 * @typedef {object} Rng
 * @property {() => number}                       next     [0,1)
 * @property {(lo:number, hiEx:number) => number} int      [lo, hiEx)
 * @property {(p:number) => boolean}              bool     以機率 p 為 true
 * @property {<T>(xs: readonly T[]) => T}         pick     均勻挑一個
 * @property {<T>(xs: readonly {item:T, w:number}[]) => T} weighted 加權挑一個
 * @property {(mean:number, sd:number) => number} normal   常態分布
 * @property {(sub:string) => Rng}                fork     衍生子流（與消耗量無關）
 * @property {RngKey}                             key      這條流的路徑
 */

/** 機率量化精度：所有機率比較前都對齊到這個網格。 */
export const PROB_GRID = 1e4;

/**
 * 把浮點機率量化成穩定值，消除跨引擎的最後幾個 bit 差異。
 * @param {number} p
 * @returns {number}
 */
export function quantizeProb(p) {
  return Math.round(p * PROB_GRID) / PROB_GRID;
}

/**
 * cyrb128 — 字串 → 4×uint32 種子。
 * @param {string} str
 * @returns {[number, number, number, number]}
 */
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/**
 * sfc32 — 小而快的 32-bit PRNG。全程整數運算，跨引擎位元級一致。
 * @param {number} a @param {number} b @param {number} c @param {number} d
 * @returns {() => number}
 */
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * 從「主種子 + 路徑」建立一條獨立的隨機流。
 *
 * 同樣的 (masterSeed, key) 永遠給出同樣的序列，且與其他 key 的消耗量完全無關。
 *
 * @param {number} masterSeed
 * @param {RngKey} key
 * @returns {Rng}
 */
export function makeRng(masterSeed, key) {
  const [a, b, c, d] = cyrb128(`${masterSeed}|${key}`);
  const next = sfc32(a, b, c, d);
  // 丟掉前幾個輸出，讓相近的 key 之間充分擴散。
  for (let i = 0; i < 8; i++) next();

  /** @type {Rng} */
  const rng = {
    key,
    next,
    int(lo, hiEx) {
      if (hiEx <= lo) return lo;
      return lo + Math.floor(next() * (hiEx - lo));
    },
    bool(p) {
      return next() < quantizeProb(p);
    },
    pick(xs) {
      if (xs.length === 0) throw new Error(`rng.pick: 空陣列 @ ${key}`);
      const item = xs[Math.floor(next() * xs.length)];
      if (item === undefined) throw new Error(`rng.pick: 取值越界 @ ${key}`);
      return item;
    },
    weighted(xs) {
      if (xs.length === 0) throw new Error(`rng.weighted: 空陣列 @ ${key}`);
      let total = 0;
      for (const x of xs) total += Math.max(0, x.w);
      if (total <= 0) throw new Error(`rng.weighted: 權重總和為 0 @ ${key}`);
      let roll = next() * total;
      for (const x of xs) {
        roll -= Math.max(0, x.w);
        if (roll < 0) return x.item;
      }
      const last = xs[xs.length - 1];
      if (last === undefined) throw new Error(`rng.weighted: 取值越界 @ ${key}`);
      return last.item;
    },
    normal(mean, sd) {
      // Box-Muller。固定消耗 2 次 next()，不要改成 rejection sampling
      // （那會讓消耗量隨值變動，破壞同一條流上後續取值的穩定性）。
      const u1 = Math.max(next(), Number.EPSILON);
      const u2 = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    fork(sub) {
      return makeRng(masterSeed, `${key}/${sub}`);
    },
  };
  return rng;
}

/**
 * 穩定全序比較器工廠。
 *
 * 為什麼需要：Array.prototype.sort 在比較器回傳 0 時不保證穩定順序，
 * 而 Object.keys / Set / Map 的迭代順序也不該被依賴。任何會餵給 rng 的集合，
 * 排序前都要有一個「不可能回傳 0」的比較器。
 *
 * @template T
 * @param {(x:T) => number} score 主要排序值（越小越前）
 * @param {(x:T) => string} id    決勝用的穩定 id
 * @returns {(a:T, b:T) => number}
 */
export function byScoreThenId(score, id) {
  return (a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    const ia = id(a), ib = id(b);
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  };
}
