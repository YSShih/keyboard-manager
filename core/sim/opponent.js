// @ts-check
import { makeRng } from '../rng/rng.js';
import { clamp } from '../odds/odds.js';
import { namePool } from '../../content/data/opponentNames.js';

/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').NationDef} NationDef */
/** @typedef {import('../domain/types.js').Position} Position */

/**
 * 對手陣容。
 *
 * 刻意不生成完整的 28 人對手名單：這個遊戲模擬的是「你的決策」，
 * 對手只要有一批能力值合理、且隨國家實力浮動的球員就夠了。
 * 用固定 key 生成，所以同一場比賽的對手陣容永遠一樣。
 */

const LINEUP_POS = /** @type {readonly Position[]} */ ([
  'CF', '2B', 'RF', '1B', 'DH', 'LF', '3B', 'SS', 'C',
]);

/**
 * @param {number} seed
 * @param {string} key
 * @param {NationDef} nation
 * @returns {{lineup: Player[], pitchers: Player[]}}
 */
export function makeOpponentSquad(seed, key, nation) {
  const rng = makeRng(seed, `${key}/squad`);

  /**
   * 國家實力 → 個別球員能力平均值。
   *
   * ⚠️ 不是 1:1 對應。直接拿 strength 當每一項能力的平均值，等於這個國家
   * 從一到九棒、從先發到牛棚全部一樣強，比任何真實球隊都均勻，
   * 強隊會變得不可能打贏。壓縮係數讓強隊仍然強，但打線有上下段落差可以攻擊。
   */
  const center = 50 + (nation.strength - 50) * 0.72;
  /** @param {number} bias @returns {number} */
  const r = (bias) => Math.round(clamp(rng.normal(center + bias, 11), 15, 97));

  // 一支隊伍內姓氏盡量不重複。用完就重新填滿再抽 —— 寧可偶爾同姓，
  // 也不要退回「捷克 捷克 捷克」那種一眼就出戲的字串。
  const source = namePool(nation.code);
  let pool = source.slice();
  /** @returns {string} */
  const takeName = () => {
    if (pool.length === 0) pool = source.slice();
    if (pool.length === 0) return nation.name;
    const i = rng.int(0, pool.length);
    return pool.splice(i, 1)[0] ?? nation.name;
  };

  /** @param {string} id @param {Position} pos @param {number} bias @returns {Player} */
  const make = (id, pos, bias) => ({
    id: /** @type {any} */ (`${nation.code}_${id}`),
    name: takeName(),
    number: 0,
    age: 27,
    bats: rng.bool(0.3) ? 'L' : 'R',
    throws: rng.bool(0.25) ? 'L' : 'R',
    primary: pos,
    secondary: [],
    league: 'MLB',
    club: nation.name,
    archetypeId: 'OPPONENT',
    archetypeLabel: nation.name,
    ratings: {
      bat: { contact: r(bias), power: r(bias), eye: r(bias), speed: r(bias), field: r(bias), arm: r(bias) },
      pit: { velo: r(bias), control: r(bias), stuff: r(bias), stamina: r(bias) },
    },
    potential: {
      bat: { contact: 99, power: 99, eye: 99, speed: 99, field: 99, arm: 99 },
      pit: { velo: 99, control: 99, stuff: 99, stamina: 99 },
    },
    growth: { peakAge: 27, growthRate: 1, declineRate: 1, durability: 60 },
    condition: {
      fatigue: 0, form: 0, injury: null,
      workload: { pitchesThisGame: 0, pitchesInEvent: 0, daysRest: 3 },
    },
    traits: [],
    loyalty: 100,
    fame: 60,
  });

  // 打線中段稍強、末段稍弱，讓「該不該敬遠」這種決策有意義。
  // 中心打線強、棒次末端弱 —— 這個落差是「該不該敬遠」「換投對決誰」的意義來源。
  const lineup = LINEUP_POS.map((pos, i) => make(`B${i}`, pos, i >= 2 && i <= 4 ? 9 : i >= 6 ? -11 : 0));
  const pitchers = [
    make('SP', 'SP', 6),   // 先發比平均稍強
    make('RP1', 'RP', -3),
    make('RP2', 'RP', 0),
    make('CP', 'CP', 8),   // 終結者最強
  ];
  return { lineup, pitchers };
}
