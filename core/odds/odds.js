// @ts-check
import { quantizeProb } from '../rng/rng.js';

/**
 * 機率帳本 — 「不能是黑箱」的架構保證。
 *
 * 遊戲裡任何一次擲骰，機率都必須由這裡算出來，因為 computeOdds 會把每一個影響因素
 * 連同「玩家看得懂的中文理由」一起留下。UI 直接把 modifiers 攤開給玩家看：
 *
 *     基準              50%
 *     王牌左投 vs 右打   +7
 *     投手球數 92 球     −11
 *     你的「用兵」42     +4
 *
 * 硬性規則：任何寫死的 `if (rng.next() < 0.3)` 都不准進 codebase，
 * 必須是 `rng.bool(computeOdds(base, mods).final)`。見 docs/CONTRIBUTING.md。
 *
 * 為什麼在 logit 空間相加：機率直接加減會爆出 [0,1] 之外，而且「90% 再 +10%」
 * 跟「50% 再 +10%」的意義天差地遠。logit 空間的加法是勝算比的乘法，
 * 邊界自然收斂，也才是「這個因素有多重要」的正確語意。
 */

/** 機率上下限。永遠不給 0% 或 100%，因為棒球裡沒有那種事。 */
export const P_MIN = 0.02;
export const P_MAX = 0.98;

/**
 * @typedef {object} Modifier
 * @property {string} source 內部來源代號，供測試與除錯用（例：'pitchCount'）
 * @property {string} label  給玩家看的中文說明（例：'投手球數 92 球'）
 * @property {number} delta  logit 空間的增減；正值有利
 */

/**
 * @typedef {object} Odds
 * @property {number} base            未經修正的基準機率
 * @property {readonly Modifier[]} modifiers 依影響力排序（大到小）
 * @property {number} final           量化後的最終機率
 */

/** @param {number} p @returns {number} */
function logit(p) {
  return Math.log(p / (1 - p));
}

/** @param {number} z @returns {number} */
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/** @param {number} x @param {number} lo @param {number} hi @returns {number} */
export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * @param {number} base 基準機率 (0,1)
 * @param {readonly Modifier[]} mods
 * @returns {Odds}
 */
export function computeOdds(base, mods = []) {
  const b = clamp(base, P_MIN, P_MAX);
  let z = logit(b);
  for (const m of mods) z += m.delta;
  const sorted = mods
    .filter((m) => m.delta !== 0)
    .slice()
    .sort((x, y) => {
      const d = Math.abs(y.delta) - Math.abs(x.delta);
      return d !== 0 ? d : (x.source < y.source ? -1 : x.source > y.source ? 1 : 0);
    });
  return {
    base: b,
    modifiers: sorted,
    final: quantizeProb(clamp(sigmoid(z), P_MIN, P_MAX)),
  };
}

/**
 * 建一個 modifier。delta 用「百分點感覺」表達再換算到 logit，
 * 讓內容作者不必自己算 log —— 傳 +7 就是「在 50% 基準上大約 +7 個百分點」。
 *
 * @param {string} source
 * @param {string} label
 * @param {number} points 百分點（正值有利）
 * @returns {Modifier}
 */
export function mod(source, label, points) {
  // 在 p=0.5 附近，dp/dz = 0.25，所以 1 個百分點 ≈ 0.04 logit。
  return { source, label, delta: (points / 100) / 0.25 };
}

/**
 * 把一項能力值（0..99，50 為中庸）換成 modifier。
 *
 * @param {string} source
 * @param {string} label 例：'你的「用兵」42'
 * @param {number} rating
 * @param {number} pointsPerStdev 能力每高於 50 共 25 點，給幾個百分點
 * @returns {Modifier}
 */
export function ratingMod(source, label, rating, pointsPerStdev) {
  return mod(source, label, ((rating - 50) / 25) * pointsPerStdev);
}

/**
 * 把 Odds 攤成給玩家看的行（UI tooltip 直接用）。
 * @param {Odds} odds
 * @returns {{label:string, value:string}[]}
 */
export function explainOdds(odds) {
  /** @type {{label:string, value:string}[]} */
  const rows = [{ label: '基準', value: `${Math.round(odds.base * 100)}%` }];
  for (const m of odds.modifiers) {
    // 換算回百分點顯示，跟 mod() 是同一個尺度。
    const points = Math.round(m.delta * 0.25 * 100);
    if (points === 0) continue;
    rows.push({ label: m.label, value: points > 0 ? `+${points}` : `${points}` });
  }
  return rows;
}
