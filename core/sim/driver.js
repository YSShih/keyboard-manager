// @ts-check
import { makeRng } from '../rng/rng.js';
import { simulateGame } from './game.js';

/** @typedef {import('./game.js').GameContext} GameContext */
/** @typedef {import('../domain/types.js').GameResult} GameResult */
/** @typedef {import('../domain/types.js').SimEvent} SimEvent */
/** @typedef {import('../domain/types.js').DecisionPrompt} DecisionPrompt */

/**
 * 決策策略。互動模式由玩家扮演；批次平衡測試由程式扮演。
 * 兩者跑的是同一支 simulateGame，這是「平衡測試測到的就是玩家玩到的」的保證。
 *
 * @typedef {object} Policy
 * @property {(p: DecisionPrompt, rng: import('../rng/rng.js').Rng) => string} decide
 */

/** 總是選第一個選項。 */
export const POLICY_FIRST = {
  /** @param {DecisionPrompt} p */
  decide: (p) => p.options[0]?.id ?? '',
};

/** 總是選成功率最高的（貪婪）。 */
export const POLICY_GREEDY = {
  /** @param {DecisionPrompt} p */
  decide: (p) => {
    const usable = p.options.filter((o) => !o.lockedReason);
    const best = usable.slice().sort((a, b) => (b.odds?.final ?? 0) - (a.odds?.final ?? 0))[0];
    return best?.id ?? p.options[0]?.id ?? '';
  },
};

/**
 * 教頭代打的決策策略。自動結算的比賽用它，判斷品質由「用兵」決定。
 *
 * 沒有這個的話，自動結算的比賽等於用固定策略打完，教頭能力只影響那兩場重點戰 ——
 * 一屆十場裡有八場跟你是誰無關，那養成就沒有意義。
 *
 * @param {import('../domain/types.js').CoachAttr} coach
 * @returns {Policy}
 */
export function makeCoachPolicy(coach) {
  return {
    decide(prompt, rng) {
      const usable = prompt.options.filter((o) => !o.lockedReason);
      const list = usable.length > 0 ? usable : prompt.options;
      if (list.length <= 1) return list[0]?.id ?? '';

      // 期望值＝成功幅度 × 成功率 − 失敗幅度 × 失敗率。
      // 幅度由 baseRate 反推（引擎用 SWING_BASE × (1 − baseRate) 算幅度），
      // 所以低機率的選項賭得大、高機率的賭得小，EV 才有得比。
      const scored = list.map((o) => {
        const base = o.odds?.base ?? 0.5;
        const final = o.odds?.final ?? 0.5;
        const swing = 1 - base;
        return { id: o.id, ev: swing * (2 * final - 1) };
      }).sort((a, b) => b.ev - a.ev || (a.id < b.id ? -1 : 1));

      // 用兵決定會不會選到最好的那個。用兵 22 約 40% 選錯，用兵 90 約 16%。
      const mistake = Math.min(0.55, Math.max(0.05, 0.45 - ((coach.bullpen - 50) / 25) * 0.18));
      const pick = rng.bool(mistake) ? (scored[1] ?? scored[0]) : scored[0];
      return pick?.id ?? '';
    },
  };
}

/** 隨機選（用來看「亂玩」的下限在哪）。 */
export const POLICY_RANDOM = {
  /** @param {DecisionPrompt} p @param {import('../rng/rng.js').Rng} rng */
  decide: (p, rng) => {
    const usable = p.options.filter((o) => !o.lockedReason);
    return rng.pick(usable.length ? usable : p.options).id;
  },
};

/**
 * 無介面跑完一場，回傳結果與完整事件流。
 * @param {GameContext} ctx
 * @param {Policy} policy
 * @returns {{result: GameResult, events: SimEvent[]}}
 */
export function runGameHeadless(ctx, policy) {
  const it = simulateGame(ctx);
  /** @type {SimEvent[]} */
  const events = [];
  /** @type {import('../domain/types.js').DecisionResponse|undefined} */
  let input = undefined;

  for (let guard = 0; guard < 20000; guard++) {
    const step = it.next(input);
    input = undefined;
    if (step.done) return { result: step.value, events };
    events.push(step.value);
    if (step.value.t === 'DECISION') {
      const prompt = step.value.prompt;
      const optionId = policy.decide(prompt, makeRng(ctx.seed, `${prompt.rngKey}/policy`));
      input = { promptKey: prompt.rngKey, optionId };
    }
  }
  throw new Error(`比賽未在步數上限內結束 @ ${ctx.key}`);
}
