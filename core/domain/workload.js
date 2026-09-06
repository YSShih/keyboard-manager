// @ts-check
import { TUNING } from '../../content/tuning.js';

/**
 * 投球負荷的領域規則。
 *
 * 這是「賽會內累積的球數，換算成本場的有效疲勞」——一條隊務層與模擬層都要用的規則，
 * 不是模擬內部的實作細節。放在 sim/atBat.js 裡會逼得 career/roster.js
 * 反向 import sim/，那是分層滲漏。
 */

/**
 * 賽會內累積下來、還沒被休息消化掉的球數，換算成本場的有效加成。
 * @param {import('./types.js').Workload} w
 * @returns {number}
 */
export function carryOverPitches(w) {
  // pitchesInEvent 已經在賽後處理時被休息消化過了，這裡只做權重換算。
  return Math.max(0, w.pitchesInEvent) * TUNING.fatigue.carryOverWeight;
}

/**
 * 這名投手該在幾球左右換下來。先發與後援的合理用量差很多。
 * @param {import('./types.js').Player} p
 * @returns {number}
 */
export function pullLimit(p) {
  const f = TUNING.fatigue;
  const base = p.primary === 'SP' ? f.pullLimitStarter : f.pullLimitReliever;
  return Math.round(base + ((p.ratings.pit.stamina - 50) / 25) * f.pullLimitStaminaSwing);
}
