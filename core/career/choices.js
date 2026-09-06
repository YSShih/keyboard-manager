// @ts-check
/**
 * 決策 optionId 的編解碼。
 *
 * 名單、賽前調度、能力分配這三種決策的「選擇」不是單一選項 id，而是結構化資料。
 * 存檔只記 optionId 字串，所以這些編碼格式**就是存檔格式的一部分** ——
 * 改動會讓既有存檔無法重播。
 */
import { COACH_ATTRS } from './coach.js';
import { TUNING } from '../../content/tuning.js';

/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').CoachAttrKey} CoachAttrKey */
/** @typedef {import('../domain/types.js').CareerState} CareerState */

/**
 * 名單決策的 optionId 編碼：'auto' 或 'ids:P01,P05,...'
 * @param {readonly PlayerId[]} ids
 * @returns {string}
 */
export function encodeRosterChoice(ids) {
  return `ids:${ids.join(',')}`;
}

/**
 * 分配決策的 optionId 編碼：'bullpen:3,intel:2'
 * @param {Partial<Record<CoachAttrKey, number>>} alloc
 * @returns {string}
 */
export function encodeAllocChoice(alloc) {
  return COACH_ATTRS.filter((k) => (alloc[k] ?? 0) > 0)
    .map((k) => `${k}:${alloc[k]}`).join(',');
}

/**
 * @param {string|undefined} optionId
 * @param {readonly PlayerId[]} fallback
 * @param {CareerState} st
 * @returns {readonly PlayerId[]}
 */
export function decodeRosterChoice(optionId, fallback, st) {
  if (!optionId || !optionId.startsWith('ids:')) return fallback;
  const ids = /** @type {PlayerId[]} */ (optionId.slice(4).split(',').filter(Boolean));
  const valid = ids.filter((id) => st.players[id]);
  if (valid.length !== TUNING.pool.rosterSize) return fallback;
  return valid;
}

/**
 * 賽前調度的 optionId 編碼：'sp:P07|stance:aggressive'
 * @param {?PlayerId} starterId
 * @param {'aggressive'|'balanced'|'conservative'} stance
 * @returns {string}
 */
export function encodePregameChoice(starterId, stance) {
  return `sp:${starterId ?? ''}|stance:${stance}`;
}

/**
 * @param {string|undefined} optionId
 * @returns {{starterId: ?PlayerId, stance: 'aggressive'|'balanced'|'conservative'}}
 */
export function decodePregameChoice(optionId) {
  const out = { starterId: /** @type {?PlayerId} */ (null), stance: /** @type {any} */ ('balanced') };
  for (const part of (optionId ?? '').split('|')) {
    const [k, v] = part.split(':');
    if (k === 'sp' && v) out.starterId = /** @type {PlayerId} */ (v);
    if (k === 'stance' && ['aggressive', 'balanced', 'conservative'].includes(v ?? '')) out.stance = v;
  }
  return out;
}
