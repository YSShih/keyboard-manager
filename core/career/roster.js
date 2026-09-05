// @ts-check
import { overall } from './generate.js';
import { TUNING } from '../../content/tuning.js';

/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').Roster} Roster */
/** @typedef {import('../domain/types.js').Position} Position */

const PITCHER_POS = ['SP', 'RP', 'CP'];

/** @param {Player} p */
export const isPitcher = (p) => PITCHER_POS.includes(p.primary);

/** 打線的守位需求。DH 由剩下最強的打者遞補。 */
const LINEUP_NEEDS = /** @type {readonly Position[]} */ (['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']);

/**
 * 依能力自動建議名單。
 *
 * 玩家可以手動調整，但一定要有一份「按下開始就能打」的預設，
 * 否則第一次玩的人會卡在 40 個人名前面不知道要幹嘛。
 *
 * @param {Record<PlayerId, Player>} players
 * @param {readonly PlayerId[]} poolOrder 唯一權威的迭代順序
 * @returns {Roster}
 */
export function suggestRoster(players, poolOrder) {
  // 一律從 poolOrder 走，不要用 Object.keys —— 迭代順序必須是決定性的。
  const all = poolOrder.map((id) => players[id]).filter(/** @returns {p is Player} */ (p) => !!p);
  const byStrength = all.slice().sort((a, b) => (overall(b) - overall(a)) || (a.id < b.id ? -1 : 1));
  const healthy = byStrength.filter((p) => !p.condition.injury);

  const rotation = healthy.filter((p) => p.primary === 'SP').slice(0, TUNING.pool.rotationSize);
  const closers = healthy.filter((p) => p.primary === 'CP');
  const relievers = healthy.filter((p) => p.primary === 'RP');
  // 牛棚順序：前面是接替，最後一位是終結者。
  const bullpen = [
    ...relievers.slice(0, TUNING.pool.bullpenSize - 1),
    ...closers.slice(0, 1),
  ].filter(Boolean);

  /** @type {Player[]} */
  const lineup = [];
  /** @type {Record<PlayerId, Position>} */
  const assigned = {};
  const taken = new Set([...rotation, ...bullpen].map((p) => p.id));
  for (const p of rotation) assigned[p.id] = p.primary;
  for (const p of bullpen) assigned[p.id] = p.primary;

  for (const pos of LINEUP_NEEDS) {
    // 先找本職，找不到才用兼守 —— 讓游擊手去守一壘是最後手段，不是首選。
    const native = healthy.find((p) => !taken.has(p.id) && !isPitcher(p) && p.primary === pos);
    const best = native
      ?? healthy.find((p) => !taken.has(p.id) && !isPitcher(p) && p.secondary.includes(pos));
    if (best) { lineup.push(best); taken.add(best.id); assigned[best.id] = pos; }
  }
  // DH ＋ 補滿 9 棒
  while (lineup.length < TUNING.pool.lineupSize) {
    const best = healthy.find((p) => !taken.has(p.id) && !isPitcher(p));
    if (!best) break;
    lineup.push(best); taken.add(best.id); assigned[best.id] = 'DH';
  }

  // 打序：強棒集中在 2-4 棒，開路先鋒挑速度與選球好的。
  const ordered = orderLineup(lineup);

  const bench = healthy.filter((p) => !taken.has(p.id) && !isPitcher(p));
  for (const p of bench) assigned[p.id] = p.primary;
  const members = [
    ...ordered.map((p) => p.id),
    ...rotation.map((p) => p.id),
    ...bullpen.map((p) => p.id),
    ...bench.map((p) => p.id),
  ].slice(0, TUNING.pool.rosterSize);

  return {
    members,
    assigned,
    lineup: ordered.map((p) => p.id),
    rotation: rotation.map((p) => p.id),
    bullpen: bullpen.map((p) => p.id),
    declined: [],
  };
}

/**
 * 排打序。
 * @param {Player[]} lineup
 * @returns {Player[]}
 */
export function orderLineup(lineup) {
  const pool = lineup.slice();
  /** @param {(p:Player)=>number} score */
  const take = (score) => {
    const best = pool.slice().sort((a, b) => (score(b) - score(a)) || (a.id < b.id ? -1 : 1))[0];
    if (!best) throw new Error('打序排列時人數不足');
    pool.splice(pool.indexOf(best), 1);
    return best;
  };
  const leadoff = take((p) => p.ratings.bat.eye * 0.5 + p.ratings.bat.speed * 0.5);
  const second = take((p) => p.ratings.bat.contact);
  const third = take((p) => p.ratings.bat.contact * 0.5 + p.ratings.bat.power * 0.5);
  const cleanup = take((p) => p.ratings.bat.power);
  const fifth = take((p) => p.ratings.bat.power * 0.6 + p.ratings.bat.contact * 0.4);
  const rest = pool.slice().sort((a, b) => (overall(b) - overall(a)) || (a.id < b.id ? -1 : 1));
  return [leadoff, second, third, cleanup, fifth, ...rest];
}

/**
 * 從名單取出比賽用的陣容。
 * @param {Record<PlayerId, Player>} players
 * @param {Roster} roster
 * @param {number} gameIndex
 * @returns {{lineup: Player[], bench: Player[], pitchers: Player[]}}
 */
export function gameSquad(players, roster, gameIndex) {
  /** @param {readonly PlayerId[]} ids */
  const get = (ids) => ids.map((id) => players[id]).filter(/** @returns {p is Player} */ (p) => !!p);
  const lineup = get(roster.lineup);
  const rotation = get(roster.rotation);
  const bullpen = get(roster.bullpen);
  const starter = rotation[gameIndex % Math.max(1, rotation.length)];
  const benchIds = roster.members.filter(
    (id) => !roster.lineup.includes(id) && !roster.rotation.includes(id) && !roster.bullpen.includes(id),
  );
  return {
    lineup,
    bench: get(benchIds),
    pitchers: starter ? [starter, ...bullpen] : bullpen,
  };
}
