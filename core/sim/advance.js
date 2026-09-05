// @ts-check
/** @typedef {import('../domain/types.js').PaOutcome} PaOutcome */
/** @typedef {import('../rng/rng.js').Rng} Rng */
/** @typedef {[boolean, boolean, boolean]} Bases */

/**
 * 跑壘推進。把「打席結果」翻譯成「壘包狀態變化 + 得分 + 出局數」。
 *
 * 這裡的規則刻意簡化（不模擬個別跑者速度、不模擬牽制與盜壘），
 * 但保留了所有會影響決策的東西：雙殺、高飛犧牲打、得點圈的跑者能不能回來。
 *
 * @param {Bases} bases
 * @param {PaOutcome} outcome
 * @param {number} outs 目前出局數
 * @param {number} runnerSpeed 跑者平均速度 0..99（影響雙殺與多推進）
 * @param {Rng} rng
 * @returns {{bases: Bases, runs: number, outsAdded: number, note: string}}
 */
export function advanceRunners(bases, outcome, outs, runnerSpeed, rng) {
  const [b1, b2, b3] = bases;
  /** @type {Bases} */
  let nb = [false, false, false];
  let runs = 0;
  let outsAdded = 0;
  let note = '';

  const speedBonus = (runnerSpeed - 50) / 200; // ±0.25

  switch (outcome) {
    case 'K':
      outsAdded = 1;
      nb = [b1, b2, b3];
      break;

    case 'OUT_F': {
      outsAdded = 1;
      nb = [b1, b2, b3];
      // 高飛犧牲打
      if (b3 && outs < 2 && rng.bool(0.55 + speedBonus)) {
        runs += 1;
        nb[2] = false;
        note = '高飛犧牲打';
      }
      break;
    }

    case 'OUT_G': {
      outsAdded = 1;
      // 雙殺：一壘有人且未滿兩出局
      if (b1 && outs < 2 && rng.bool(0.42 - speedBonus)) {
        outsAdded = 2;
        note = '雙殺打';
        nb = [false, false, b3];
        if (b2) nb[2] = true;
        if (b3 && outs === 0) { /* 三壘跑者留在原地 */ }
      } else {
        // 一般滾地出局，跑者推進一個壘包
        nb = [false, b1, b2];
        if (b3) runs += 1;
      }
      break;
    }

    case 'BB':
    case 'HBP': {
      // 保送只推進被擠壓的跑者
      nb = [true, b2, b3];
      if (b1) {
        nb[1] = true;
        if (b2) {
          nb[2] = true;
          if (b3) runs += 1;
        } else {
          nb[2] = b3;
        }
      } else {
        nb[1] = b2;
        nb[2] = b3;
      }
      break;
    }

    case '1B':
    case 'ERR': {
      nb = [true, false, false];
      if (b3) runs += 1;
      if (b2) {
        if (rng.bool(0.55 + speedBonus)) runs += 1;
        else nb[2] = true;
      }
      if (b1) {
        if (rng.bool(0.28 + speedBonus)) nb[2] = true;
        else nb[1] = true;
      }
      break;
    }

    case '2B': {
      nb = [false, true, false];
      if (b3) runs += 1;
      if (b2) runs += 1;
      if (b1) {
        if (rng.bool(0.45 + speedBonus)) runs += 1;
        else nb[2] = true;
      }
      break;
    }

    case '3B': {
      runs += (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0);
      nb = [false, false, true];
      break;
    }

    case 'HR': {
      runs += 1 + (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0);
      nb = [false, false, false];
      note = runs === 4 ? '滿貫全壘打' : runs > 1 ? `${runs} 分砲` : '陽春砲';
      break;
    }
  }

  return { bases: nb, runs, outsAdded, note };
}

/**
 * 觸擊結果。
 * @param {Bases} bases
 * @param {boolean} success
 * @returns {{bases: Bases, runs: number, outsAdded: number}}
 */
export function applyBunt(bases, success) {
  const [b1, b2, b3] = bases;
  if (success) {
    // 打者出局，跑者各推進一個壘包
    let runs = 0;
    if (b3) runs += 1;
    return { bases: [false, b1, b2], runs, outsAdded: 1 };
  }
  // 失敗：前位跑者被封殺，打者上一壘
  if (b2) return { bases: [true, b1, b3], runs: 0, outsAdded: 1 };
  return { bases: [true, false, b3], runs: 0, outsAdded: 1 };
}
