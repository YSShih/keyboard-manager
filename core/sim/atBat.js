// @ts-check
import { TUNING } from '../../content/tuning.js';
import { clamp } from '../odds/odds.js';
import { carryOverPitches, pullLimit } from '../domain/workload.js';

/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PaOutcome} PaOutcome */
/** @typedef {import('../domain/types.js').GameSnapshot} GameSnapshot */
/** @typedef {import('../domain/types.js').CoachAttr} CoachAttr */
/** @typedef {import('../rng/rng.js').Rng} Rng */

/**
 * 打席解算。
 *
 * 模型：每個結果有一個聯盟基準率，再乘上一串「相對百分比」修正
 *   weight(結果) = base(結果) × Π(1 + points_i / 100)
 * 最後正規化成機率分布抽樣。
 *
 * 為什麼是乘法而不是加法：加法會讓基準率低的結果（全壘打 3%）被一個 +10 直接翻倍到
 * 13%，而基準率高的（滾地出局 24.5%）幾乎沒感覺。乘法的語意才是對的——
 * 「這名打者的長打力讓他的全壘打率比聯盟高 40%」。
 *
 * 每一條修正都帶著給玩家看的中文 label，賽後「這球為什麼」面板直接攤開。
 */

// 這兩個是領域規則，實作在 core/domain/workload.js；這裡轉出以保持既有 import 可用。
export { carryOverPitches, pullLimit };

/** @type {readonly PaOutcome[]} */
export const OUTCOMES = ['K', 'BB', 'HBP', 'OUT_G', 'OUT_F', '1B', '2B', '3B', 'HR', 'ERR'];

/** @type {Record<PaOutcome, string>} */
export const OUTCOME_LABEL = {
  K: '三振', BB: '四壞', HBP: '觸身球',
  OUT_G: '滾地出局', OUT_F: '飛球出局',
  '1B': '一壘安打', '2B': '二壘安打', '3B': '三壘安打', HR: '全壘打', ERR: '失誤上壘',
};

/**
 * 投手疲勞造成的能力衰減。
 * @param {number} pitchCount 本場球數（呼叫端可加上跨場次累積）
 * @param {number} stamina
 * @param {number} conditioning 教頭體能管理
 * @returns {{penalty:number, label:string}}
 */
export function fatiguePenalty(pitchCount, stamina, conditioning) {
  const f = TUNING.fatigue;
  const shift = ((stamina - 50) / 25) * f.staminaShift;
  const relief = 1 - ((conditioning - 50) / 25) * f.conditioningRelief;
  let penalty = 0;
  for (let i = 0; i < f.thresholds.length; i++) {
    const th = (f.thresholds[i] ?? 0) + shift;
    const step = f.penaltyPerStep[i] ?? 0;
    if (pitchCount > th) penalty += (pitchCount - th) * step;
  }
  penalty = Math.max(0, penalty * Math.max(0.2, relief));
  return { penalty, label: `投手球數 ${pitchCount} 球` };
}

/**
 * 能力值換算成相對百分比修正。
 * @param {number} rating
 * @param {number} weight 能力每高於 50 共 25 點時的百分比
 * @returns {number}
 */
function pts(rating, weight) {
  return ((rating - 50) / 25) * weight;
}

/**
 * @typedef {object} PaInput
 * @property {Player} batter
 * @property {Player} pitcher
 * @property {number} defenseField 我方（或對方）守備均值
 * @property {number} opponentStrength 對手國家實力 0..100
 * @property {CoachAttr} coach
 * @property {boolean} weAreBatting 決定 opponentStrength 與教頭品質往哪邊修正
 * @property {number} pitchCount
 */

/**
 * @typedef {object} PaResult
 * @property {PaOutcome} outcome
 * @property {number} runsScoredHint 供敘事用
 * @property {{outcome:PaOutcome, p:number}[]} distribution
 * @property {{label:string, detail:string}[]} reasons 給玩家看的主要成因
 */

/**
 * @param {PaInput} input
 * @param {Rng} rng
 * @returns {PaResult}
 */
export function resolvePlateAppearance(input, rng) {
  const { batter, pitcher, defenseField, opponentStrength, coach, weAreBatting, pitchCount } = input;
  const w = TUNING.atBat.weight;
  const bat = batter.ratings.bat;
  const pit = pitcher.ratings.pit;

  // 本場球數 ＋ 賽會內還沒消化掉的累積。連續出賽的牛棚投手會明顯變差。
  const carry = carryOverPitches(pitcher.condition.workload);
  const fat = fatiguePenalty(pitchCount + carry, pit.stamina, coach.conditioning);
  // 疲勞直接折損控球與球質，這是「換投時機」這個決策存在的理由。
  const control = clamp(pit.control - fat.penalty, 5, 99);
  const stuff = clamp(pit.stuff - fat.penalty * 0.7, 5, 99);

  // 對手實力：我方打擊時對手強 → 我方正面結果變少；我方投球時反過來。
  const oppSign = weAreBatting ? 1 : -1;
  const oppPts = ((opponentStrength - 50) / 25) * TUNING.atBat.nationStrength * oppSign;

  // 教頭品質：我方打擊時幫我方，我方投球時壓對方。
  // 這是教頭能力唯一「不透過決策選項」就生效的管道。
  const coachAvg = (coach.bullpen + coach.scouting + coach.communication
    + coach.conditioning + coach.intel) / 5;
  // 基準點是起始能力，不是刻度中點 —— 見 tuning.js 的說明。
  const coachPts = ((coachAvg - TUNING.coach.startAttr) / 25) * TUNING.atBat.coachQuality * oppSign;

  const form = batter.condition.form;
  const clutch = batter.traits.includes('CLUTCH') ? 6 : 0;

  /** @type {Record<PaOutcome, number>} */
  const adj = {
    K: pts(bat.contact, w.contactToK) + pts(stuff, w.stuffToK) + pts(pit.velo, w.veloToK),
    BB: pts(bat.eye, w.eyeToBB) + pts(control, w.controlToBB),
    HBP: pts(control, w.controlToBB) * 0.4,
    OUT_G: 0,
    OUT_F: 0,
    '1B': pts(bat.contact, w.contactTo1B) + pts(bat.speed, w.speedTo1B) + oppPts + coachPts + form + clutch,
    '2B': pts(bat.power, w.powerTo2B) + pts(bat.contact, w.contactTo2B) + oppPts + coachPts + form,
    '3B': pts(bat.speed, w.speedTo3B) + oppPts + coachPts,
    HR: pts(bat.power, w.powerToHR) + pts(control, w.controlToHR) + oppPts + coachPts + form + clutch,
    ERR: pts(defenseField, w.fieldToErr),
  };

  /** @type {{outcome:PaOutcome, weight:number}[]} */
  const weights = OUTCOMES.map((o) => ({
    outcome: o,
    weight: Math.max(1e-6, (TUNING.atBat.base[o] ?? 0) * (1 + (adj[o] ?? 0) / 100)),
  }));
  const total = weights.reduce((s, x) => s + x.weight, 0);

  const outcome = rng.weighted(weights.map((x) => ({ item: x.outcome, w: x.weight })));

  /** @type {{label:string, detail:string}[]} */
  const reasons = [];
  if (fat.penalty > 3) {
    reasons.push({
      label: carry > 5 ? `${fat.label}（含賽會累積 ${carry.toFixed(0)}）` : fat.label,
      detail: `控球 −${fat.penalty.toFixed(0)}`,
    });
  }
  if (Math.abs(oppPts) > 2) {
    reasons.push({ label: '對手整體實力', detail: `${oppPts > 0 ? '+' : ''}${oppPts.toFixed(0)}%` });
  }
  if (clutch) reasons.push({ label: '大心臟', detail: '關鍵時刻 +6%' });

  return {
    outcome,
    runsScoredHint: outcome === 'HR' ? 1 : 0,
    distribution: weights.map((x) => ({ outcome: x.outcome, p: x.weight / total })),
    reasons,
  };
}
