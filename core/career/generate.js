// @ts-check
import { makeRng } from '../rng/rng.js';
import { clamp } from '../odds/odds.js';
import { TUNING } from '../../content/tuning.js';
import { NAMES, BLOCKED_NAME_SET } from '../../content/v1/names.js';
import { ARCHETYPES, TRAITS } from '../../content/v1/archetypes.js';

/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').Position} Position */
/** @typedef {import('../domain/types.js').Archetype} Archetype */
/** @typedef {import('../domain/types.js').Ratings} Ratings */
/** @typedef {import('../rng/rng.js').Rng} Rng */

/**
 * 40 人池的守位配額。
 *
 * 為什麼用配額而不是純加權隨機：純隨機有機率生出「只有 2 個先發投手」的池，
 * 那時 28 人名單根本排不出來。配額保證任何種子都能組出合法陣容，
 * 隨機性留在「每個位置上的人是誰、多強」。
 */
const POSITION_QUOTA = /** @type {const} */ ([
  ['SP', 8], ['RP', 7], ['CP', 2], ['C', 3],
  ['1B', 2], ['2B', 3], ['3B', 3], ['SS', 3],
  ['LF', 3], ['CF', 3], ['RF', 3],
]);

/** 空能力值（非該類型的欄位仍存在，但很低）。 */
const FLOOR = 18;

/**
 * @param {Rng} rng
 * @param {number} mean
 * @param {number} sd
 * @returns {number}
 */
function sampleRating(rng, mean, sd) {
  return Math.round(clamp(rng.normal(mean, sd), FLOOR, 97));
}

/**
 * @param {Rng} rng
 * @param {Archetype} a
 * @returns {Ratings}
 */
function rollRatings(rng, a) {
  /** @param {Partial<Record<string,[number,number]>>} table @param {string} key */
  const get = (table, key) => {
    const spec = table[key];
    return spec ? sampleRating(rng, spec[0], spec[1]) : sampleRating(rng, FLOOR + 6, 5);
  };
  return {
    bat: {
      contact: get(a.batMean, 'contact'),
      power: get(a.batMean, 'power'),
      eye: get(a.batMean, 'eye'),
      speed: get(a.batMean, 'speed'),
      field: get(a.batMean, 'field'),
      arm: get(a.batMean, 'arm'),
    },
    pit: {
      velo: get(a.pitMean, 'velo'),
      control: get(a.pitMean, 'control'),
      stuff: get(a.pitMean, 'stuff'),
      stamina: get(a.pitMean, 'stamina'),
    },
  };
}

/**
 * 潛力 = 現值 + 剩餘成長空間。年輕球員空間大，老將幾乎沒有。
 * @param {Rng} rng
 * @param {Ratings} r
 * @param {number} age
 * @param {number} peakAge
 * @returns {Ratings}
 */
function rollPotential(rng, r, age, peakAge) {
  const yearsLeft = Math.max(0, peakAge - age);
  /** @param {number} v */
  const up = (v) => Math.round(clamp(v + yearsLeft * rng.next() * 3.2 + rng.next() * 4, v, 99));
  return {
    bat: {
      contact: up(r.bat.contact), power: up(r.bat.power), eye: up(r.bat.eye),
      speed: up(r.bat.speed), field: up(r.bat.field), arm: up(r.bat.arm),
    },
    pit: {
      velo: up(r.pit.velo), control: up(r.pit.control),
      stuff: up(r.pit.stuff), stamina: up(r.pit.stamina),
    },
  };
}

/**
 * 產生一個不在黑名單上的姓名。
 *
 * 撞到黑名單就換一條子流重抽（而不是在同一條流上多抽一次），
 * 這樣「黑名單多加一個名字」不會讓後面所有球員的隨機序列位移。
 *
 * @param {number} seed
 * @param {string} keyPrefix
 * @param {Set<string>} used
 * @returns {string}
 */
function rollName(seed, keyPrefix, used) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const rng = makeRng(seed, `${keyPrefix}/name/${attempt}`);
    const surname = rng.weighted(NAMES.surnames.map((x) => ({ item: x.s, w: x.w })));
    const len = rng.bool(0.9) ? 2 : 1;
    let given = '';
    for (let i = 0; i < len; i++) {
      let ch = rng.pick(NAMES.givenChars);
      // 不要疊字（「諒諒」），也不要跟姓氏同字。
      for (let g = 0; g < 8 && (given.includes(ch) || ch === surname); g++) {
        ch = rng.pick(NAMES.givenChars);
      }
      given += ch;
    }
    const full = surname + given;
    if (!BLOCKED_NAME_SET.has(full) && !used.has(full)) return full;
  }
  // 極端情況的保底：加一個罕用字，仍然是虛構姓名。
  return `${makeRng(seed, `${keyPrefix}/name/fallback`).pick(NAMES.surnames).s}逸凡`;
}

/**
 * @param {object} args
 * @param {number} args.seed
 * @param {string} args.keyPrefix
 * @param {PlayerId} args.id
 * @param {Position} args.position
 * @param {Archetype} args.archetype
 * @param {Set<string>} args.usedNames
 * @param {Set<number>} args.usedNumbers
 * @returns {Player}
 */
export function generatePlayer({ seed, keyPrefix, id, position, archetype, usedNames, usedNumbers }) {
  const rng = makeRng(seed, `${keyPrefix}/body`);
  const [ageLo, ageHi] = archetype.ageRange;
  const age = rng.int(ageLo, ageHi + 1);
  const peakAge = rng.int(26, 31);
  const ratings = rollRatings(rng, archetype);
  const potential = rollPotential(rng, ratings, age, peakAge);

  const name = rollName(seed, keyPrefix, usedNames);
  usedNames.add(name);

  let number = rng.int(1, 100);
  for (let i = 0; usedNumbers.has(number) && i < 200; i++) number = rng.int(1, 100);
  usedNumbers.add(number);

  const isPitcher = position === 'SP' || position === 'RP' || position === 'CP';
  /** @type {string[]} */
  const traits = [];
  if (rng.bool(0.32)) traits.push(rng.pick(TRAITS));
  if (age >= 32 && !traits.includes('VETERAN') && rng.bool(0.45)) traits.push('VETERAN');

  return {
    id,
    name,
    number,
    age,
    bats: isPitcher ? (rng.bool(0.7) ? 'R' : 'L') : rng.bool(0.28) ? 'L' : 'R',
    throws: rng.bool(archetype.id === 'MLB_LHP' ? 0.95 : 0.22) ? 'L' : 'R',
    primary: position,
    secondary: archetype.positions.filter((p) => p !== position).slice(0, 2),
    league: archetype.league,
    club: rng.pick(archetype.clubs),
    archetypeId: archetype.id,
    archetypeLabel: archetype.label,
    ratings,
    potential,
    growth: {
      peakAge,
      growthRate: clamp(rng.normal(1, 0.2), 0.6, 1.4),
      declineRate: clamp(rng.normal(1, 0.2), 0.6, 1.4),
      durability: sampleRating(rng, traits.includes('GLASS') ? 34 : 56, 12),
    },
    condition: {
      fatigue: 0,
      form: 0,
      injury: null,
      workload: { pitchesThisGame: 0, pitchesInEvent: 0, daysRest: 3 },
    },
    traits,
    loyalty: Math.round(clamp(rng.normal(100 - archetype.callupDifficulty * 0.6, 14), 5, 99)),
    fame: Math.round(clamp(rng.normal(archetype.league === 'MLB' ? 78 : archetype.league === 'NPB' ? 66 : 46, 16), 3, 99)),
  };
}

/**
 * 產生整個 40 人池。
 *
 * @param {number} seed
 * @returns {{players: Record<PlayerId, Player>, poolOrder: PlayerId[]}}
 */
export function generatePool(seed) {
  /** @type {Record<PlayerId, Player>} */
  const players = {};
  /** @type {PlayerId[]} */
  const poolOrder = [];
  const usedNames = new Set();
  const usedNumbers = new Set();

  let n = 0;
  for (const [position, count] of POSITION_QUOTA) {
    for (let i = 0; i < count; i++) {
      const id = /** @type {PlayerId} */ (`P${String(n).padStart(2, '0')}`);
      const keyPrefix = `career/init/pool/${id}`;
      // 只從「能守這個位置」的原型裡挑，權重照原型設定。
      const eligible = ARCHETYPES.filter((a) => a.positions.includes(position));
      const archetype = makeRng(seed, `${keyPrefix}/archetype`)
        .weighted(eligible.map((a) => ({ item: a, w: a.weight })));
      players[id] = generatePlayer({
        seed, keyPrefix, id, position, archetype, usedNames, usedNumbers,
      });
      poolOrder.push(id);
      n++;
    }
  }

  if (poolOrder.length !== TUNING.pool.size) {
    throw new Error(`球員池配額總和應為 ${TUNING.pool.size}，實得 ${poolOrder.length}`);
  }
  return { players, poolOrder };
}

/**
 * 綜合戰力（給 UI 排序與名單建議用）。
 * @param {Player} p
 * @returns {number}
 */
export function overall(p) {
  const isPitcher = p.primary === 'SP' || p.primary === 'RP' || p.primary === 'CP';
  const { bat, pit } = p.ratings;
  if (isPitcher) {
    const w = p.primary === 'SP' ? { velo: 0.25, control: 0.3, stuff: 0.28, stamina: 0.17 }
                                 : { velo: 0.3, control: 0.24, stuff: 0.36, stamina: 0.1 };
    return Math.round(pit.velo * w.velo + pit.control * w.control + pit.stuff * w.stuff + pit.stamina * w.stamina);
  }
  return Math.round(
    bat.contact * 0.28 + bat.power * 0.24 + bat.eye * 0.16 +
    bat.speed * 0.1 + bat.field * 0.14 + bat.arm * 0.08,
  );
}
