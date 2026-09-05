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
