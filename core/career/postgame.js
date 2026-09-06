// @ts-check
/**
 * 賽後處理：投球負荷、傷病、手感、士氣，以及賽事結束時的三條 meter 變化。
 */
import { makeRng } from '../rng/rng.js';
import { clamp, computeOdds } from '../odds/odds.js';
import { TUNING } from '../../content/tuning.js';

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').GameResult} GameResult */

/**
 * 賽後處理：疲勞、傷病、手感。
 * @param {CareerState} st
 * @param {GameResult} result
 * @param {number} gameIndex
 * @param {ReadonlySet<string>} played 這場實際有上場的球員 id
 * @returns {{state: CareerState, newInjuries: string[]}}
 */
export function applyPostGame(st, result, gameIndex, played) {
  /** @type {string[]} */
  const newInjuries = [];
  const rng = makeRng(st.seed, `career/${st.year}/postgame/${gameIndex}`);
  /** @type {Record<PlayerId, Player>} */
  const players = { ...st.players };
  const inj = TUNING.injury;
  const conditioning = st.coach.attrs.conditioning;

  for (const id of st.poolOrder) {
    const p = players[id];
    if (!p) continue;
    if (!(st.roster?.members.includes(id) ?? false)) continue;

    const threw = result.pitchCounts[id] ?? 0;
    const appeared = played.has(id);
    let condition = { ...p.condition };

    // ── 投球負荷：有投就累積、沒投就休息 ──────────────────
    // 這一段是「牛棚保留戰力」這句話能不能算數的地方。
    // 沒有它，不用牛棚就沒有任何好處，那個選項說明就是謊話。
    condition.workload = threw > 0
      ? {
          pitchesThisGame: threw,
          pitchesInEvent: condition.workload.pitchesInEvent + threw,
          daysRest: 0,
        }
      : {
          pitchesThisGame: 0,
          // 休息是「消化掉累積球數」，不是拿天數去抵扣。
          // 用天數抵扣的話 pitchesInEvent 只會累加不會減少，
          // 而 daysRest 每次登板就歸零，累積量會無上限成長把投手拖垮（實測到 445 球）。
          pitchesInEvent: Math.max(0, condition.workload.pitchesInEvent - TUNING.fatigue.restRecoveryPitches),
          daysRest: condition.workload.daysRest + 1,
        };

    // ── 傷病 ────────────────────────────────────────────────
    if (condition.injury) {
      const gamesOut = condition.injury.gamesOut - 1;
      condition.injury = gamesOut <= 0 ? null : { ...condition.injury, gamesOut };
    } else if (appeared) {
      // 基礎機率 → 耐用度修正 → 體能管理修正 → 用量超載修正。
      // 最後一項讓「續投王牌會提高傷病風險」從面板上的一句話變成真的。
      let pct = inj.perGameBase * 100
        * (1 - ((p.growth.durability - 50) / 25) * (inj.durability / -100))
        * (1 - ((conditioning - 50) / 25) * 0.2);
      if (threw > inj.overworkThreshold) {
        pct += ((threw - inj.overworkThreshold) / 10) * inj.overworkPerTenPitches;
      }
      const odds = computeOdds(clamp(pct / 100, 0.004, 0.6), []);
      if (rng.bool(odds.final)) {
        const severity = threw > 105 ? 2 : 1;
        condition.injury = {
          code: threw > 0 ? 'ARM' : 'STRAIN',
          gamesOut: rng.int(1, 3 + severity),
          severity: /** @type {1|2|3} */ (severity),
        };
        newInjuries.push(`${p.name}（休 ${condition.injury.gamesOut} 場）`);
      }
    }

    condition.form = clamp(condition.form + rng.int(-2, 3) + (result.win ? 1 : -1), -10, 10);
    players[id] = { ...p, condition };
  }

  // 決策帶來的士氣變化。之前「士氣上升」這個 preview 完全沒有對應的實作。
  const morale = Math.round(clamp(
    st.coach.meters.playerMorale + (result.moraleDelta ?? 0) + (result.win ? 1 : -1),
    0, 100,
  ));

  return {
    state: {
      ...st,
      players,
      coach: { ...st.coach, meters: { ...st.coach.meters, playerMorale: morale } },
    },
    newInjuries,
  };
}

/**
 * @param {number} rankNum
 * @param {boolean} gotBerth
 * @param {readonly GameResult[]} results
 * @returns {{publicApproval:number, assocTrust:number, playerMorale:number}}
 */
export function computeMeterDelta(rankNum, gotBerth, results) {
  const wins = results.filter((r) => r.win).length;
  const base = rankNum === 1 ? 34 : rankNum === 2 ? 22 : rankNum === 4 ? 10 : rankNum === 8 ? -6 : -22;
  const berthBonus = gotBerth ? 18 : -14;
  const beatBig = results.some((r) => r.win && (r.opponent === 'JPN' || r.opponent === 'KOR')) ? 8 : 0;
  // 主場開幕循環賽就打不出兩勝是災難級的失敗，代價必須大到足以讓人下台。
  // 沒有這一項的話「被揃下台」這個結局在數學上根本碰不到（民調最低只會掉到 2）。
  const disaster = rankNum >= 13 && wins <= 1 ? -14 - (1 - wins) * 10 : 0;
  return {
    publicApproval: base + berthBonus + beatBig + disaster,
    assocTrust: Math.round(base * 0.7) + (gotBerth ? 14 : -10) + Math.round(disaster * 0.8),
    playerMorale: Math.round(wins * 2.2) + (rankNum <= 4 ? 8 : -4),
  };
}
