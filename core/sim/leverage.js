// @ts-check
import { TUNING } from '../../content/tuning.js';

/** @typedef {import('../domain/types.js').GameSnapshot} GameSnapshot */

/**
 * Leverage Index 近似值 —— 「這個局面有多關鍵」。
 *
 * 存在的理由是決策疲勞：如果每半局都問玩家一次要不要換投，玩家會關掉分頁。
 * 引擎自動推進，只在 LI 高的局面停下來問，每場硬上限 5 次。
 * 這個近似不追求統計精確，只要能把「9 局下滿壘一分差」排在
 * 「2 局上無人出局空壘」前面就達成目的。
 *
 * @param {GameSnapshot} s
 * @returns {number}
 */
export function leverageIndex(s) {
  // 局數越後面越關鍵
  const inningFactor = 0.45 + Math.min(s.inning, 9) * 0.19;

  // 分差越接近越關鍵
  const diff = Math.abs(s.runsUs - s.runsThem);
  const closeness = diff === 0 ? 1.7 : diff === 1 ? 1.6 : diff === 2 ? 1.15 : diff === 3 ? 0.75 : 0.35;

  // 壘上有人、尤其得點圈有人，越關鍵；兩出局稍微降一點
  const [b1, b2, b3] = s.bases;
  const scoringPos = (b2 ? 1 : 0) + (b3 ? 1 : 0);
  const baseFactor = 1 + (b1 ? 0.18 : 0) + scoringPos * 0.34;
  const outFactor = s.outs === 0 ? 1.05 : s.outs === 1 ? 1.12 : 0.86;

  return inningFactor * closeness * baseFactor * outFactor;
}

/**
 * 決定要不要在這個打席前暫停問玩家。
 *
 * @param {GameSnapshot} s
 * @param {number} usedPauses 本場已暫停次數
 * @param {number} remainingAtBats 本場預估剩餘打席（用來保證下限）
 * @returns {boolean}
 */
export function shouldPause(s, usedPauses, remainingAtBats) {
  const d = TUNING.decision;
  if (usedPauses >= d.maxPerGame) return false;

  // 投手球數超標一定問：這是遊戲的核心張力，不能因為 LI 不夠高就跳過。
  if (s.pitchCount >= d.forcePitchCount) return true;

  const li = leverageIndex(s);
  if (li >= d.leverageThreshold) return true;

  // 保底：快打完了還沒問滿下限，就放寬門檻，避免整場零決策。
  const need = d.minPerGame - usedPauses;
  if (need > 0 && remainingAtBats <= need * 3) return li >= d.leverageThreshold * 0.6;

  return false;
}
