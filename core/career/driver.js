// @ts-check
import { makeRng } from '../rng/rng.js';
import { runCareer, COACH_ATTRS, encodeAllocChoice } from './career.js';

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').CareerEvent} CareerEvent */
/** @typedef {import('../domain/types.js').DecisionPrompt} DecisionPrompt */
/** @typedef {import('../domain/types.js').DecisionResponse} DecisionResponse */

/**
 * 生涯層的決策策略（headless 用）。
 * 名單與分配這兩種決策的 optionId 是編碼字串而不是選項 id，所以要分開處理。
 * @typedef {object} CareerPolicy
 * @property {(p: DecisionPrompt, rng: import('../rng/rng.js').Rng) => string} decide
 */

/**
 * @param {import('../sim/driver.js').Policy} gamePolicy 場中決策策略
 * @param {'spread'|'focus'} allocStyle
 * @returns {CareerPolicy}
 */
export function makeCareerPolicy(gamePolicy, allocStyle = 'spread') {
  return {
    decide(prompt, rng) {
      if (prompt.kind === 'ROSTER') return prompt.options[0]?.id ?? '';
      if (prompt.kind === 'ALLOCATE') {
        const total = Number(/(\d+)/.exec(prompt.title)?.[1] ?? 0);
        if (total <= 0) return '';
        /** @type {Partial<Record<import('../domain/types.js').CoachAttrKey, number>>} */
        const alloc = {};
        if (allocStyle === 'focus') {
          const k = COACH_ATTRS[0];
          if (k) alloc[k] = total;
        } else {
          for (let i = 0; i < total; i++) {
            const k = COACH_ATTRS[i % COACH_ATTRS.length];
            if (k) alloc[k] = (alloc[k] ?? 0) + 1;
          }
        }
        return encodeAllocChoice(alloc);
      }
      return gamePolicy.decide(prompt, rng);
    },
  };
}

/**
 * 無介面跑完一整段生涯。
 * @param {CareerState} initial
 * @param {CareerPolicy} policy
 * @returns {{state: CareerState, events: CareerEvent[], decisions: {seq:number, anchor:string, choiceId:string}[]}}
 */
export function runCareerHeadless(initial, policy) {
  const it = runCareer(initial);
  /** @type {CareerEvent[]} */
  const events = [];
  /** @type {{seq:number, anchor:string, choiceId:string}[]} */
  const decisions = [];
  /** @type {DecisionResponse|undefined} */
  let input = undefined;
  let seq = 0;

  for (let guard = 0; guard < 200000; guard++) {
    const step = it.next(input);
    input = undefined;
    if (step.done) return { state: step.value, events, decisions };
    events.push(step.value);
    if (step.value.t === 'DECISION') {
      const prompt = step.value.prompt;
      const choiceId = policy.decide(prompt, makeRng(initial.seed, `${prompt.rngKey}/policy`));
      decisions.push({ seq: seq++, anchor: prompt.rngKey, choiceId });
      input = { promptKey: prompt.rngKey, optionId: choiceId };
    }
  }
  throw new Error('生涯未在步數上限內結束');
}
