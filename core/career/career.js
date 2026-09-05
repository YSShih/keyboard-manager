// @ts-check
import { makeRng } from '../rng/rng.js';
import { clamp } from '../odds/odds.js';
import { encodeSeed, SEED_CODE_VERSION } from '../rng/seedCode.js';
import { generatePool, overall } from './generate.js';
import { suggestRoster, gameSquad } from './roster.js';
import { simulateGame } from '../sim/game.js';
import { TUNING } from '../../content/tuning.js';
import { nation } from '../../content/v1/nations.js';
import { DECISION_TEMPLATES } from '../../content/v1/decisions.js';
import { PREMIER12_2027, OLYMPIC_BERTH_RULE, checkOlympicBerth } from '../../content/v1/tournaments.js';

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').CareerEvent} CareerEvent */
/** @typedef {import('../domain/types.js').DecisionResponse} DecisionResponse */
/** @typedef {import('../domain/types.js').DecisionPrompt} DecisionPrompt */
/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').CoachAttrKey} CoachAttrKey */
/** @typedef {import('../domain/types.js').GameResult} GameResult */

/** @type {readonly CoachAttrKey[]} */
export const COACH_ATTRS = ['bullpen', 'scouting', 'communication', 'conditioning', 'intel'];

/** @type {Record<CoachAttrKey, string>} */
export const COACH_ATTR_LABEL = {
  bullpen: '用兵', scouting: '識人', communication: '溝通',
  conditioning: '體能管理', intel: '情蒐',
};

/** @type {Record<CoachAttrKey, string>} */
export const COACH_ATTR_DESC = {
  bullpen: '換投決策的成功率，以及接手投手的狀況',
  scouting: '名單建議品質，以及球員潛力看得多準',
  communication: '球員士氣，以及戰術暗號的執行度',
  conditioning: '投手疲勞累積速度與傷病風險',
  intel: '解鎖帶情報的決策選項，並提高佈陣成功率',
};

/**
 * 建立一段全新生涯。
 * @param {number} seed
 * @param {string} coachName
 * @returns {CareerState}
 */
export function newCareer(seed, coachName) {
  const { players, poolOrder } = generatePool(seed);
  const rng = makeRng(seed, 'career/init/coach');
  const c = TUNING.coach;

  /** @type {any} */
  const attrs = {};
  /** @type {any} */
  const caps = {};
  for (const k of COACH_ATTRS) {
    attrs[k] = c.startAttr;
    caps[k] = rng.int(c.capMin, c.capMax + 1);
  }

  return {
    schema: 1,
    seed,
    seedCode: encodeSeed({ version: SEED_CODE_VERSION, seed }),
    packVersion: 'v1',
    year: PREMIER12_2027.year,
    phase: 'INIT',
    coach: {
      name: coachName,
      attrs,
      caps,
      unspentPoints: 0,
      meters: { ...c.startMeters },
      flags: [],
    },
    players,
    poolOrder,
    roster: null,
    tournament: null,
    seq: 0,
    pending: null,
    log: [],
    ending: null,
  };
}

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
 * 成長遞減：越接近上限，每一點越難加。
 * @param {number} current
 * @param {number} cap
 * @param {number} points
 * @returns {number}
 */
export function applyGrowth(current, cap, points) {
  let v = current;
  for (let i = 0; i < points; i++) {
    if (v >= cap) break;
    const ratio = v / cap;
    v += ratio >= TUNING.coach.softCapRatio ? TUNING.coach.softCapPenalty : 1;
  }
  return Math.min(cap, Math.round(v * 10) / 10);
}

/**
 * 整段生涯。
 *
 * 做成單一 generator 的理由：所有玩家決策都從同一條路徑經過，
 * 存檔就只需要記「第 n 個決策選了什麼」，載入時從種子重跑即可還原。
 * 這也讓 headless 批次測試跟真人遊玩跑的是完全同一份程式碼。
 *
 * @param {CareerState} initial
 * @returns {Generator<CareerEvent, CareerState, DecisionResponse|undefined>}
 */
export function* runCareer(initial) {
  /** @type {CareerState} */
  let st = { ...initial };
  const def = PREMIER12_2027;

  // ── 開場 ────────────────────────────────────────────────
  st = { ...st, phase: 'ROSTER' };
  yield {
    t: 'PHASE', phase: 'ROSTER',
    title: `${st.year} 年冬天・你接下了中華隊`,
    body: `2026 年經典賽，中華隊預賽 2 勝 2 敗、小組未晉級，最終第 13 名。總教練下台。\n`
      + `協會找上你的時候，說的是「先撐過這一屆」。\n\n`
      + `${def.name}：${def.subtitle}\n`
      + `奧運門票規則 — ${OLYMPIC_BERTH_RULE.label}。${OLYMPIC_BERTH_RULE.explain}`,
  };

  // ── 名單 ────────────────────────────────────────────────
  const suggested = suggestRoster(st.players, st.poolOrder);
  const rosterKey = `career/${st.year}/roster`;
  /** @type {DecisionPrompt} */
  const rosterPrompt = {
    rngKey: rosterKey,
    kind: 'ROSTER',
    templateId: 'roster',
    title: '徵召名單',
    body: `從 ${st.poolOrder.length} 人的球員池裡挑出 ${TUNING.pool.rosterSize} 人。系統已經幫你排好一份，你可以直接開打，也可以自己調。`,
    context: null,
    options: [{ id: encodeRosterChoice(suggested.members), label: '採用建議名單', odds: null, preview: [], lockedReason: null }],
  };
  const rosterResp = yield { t: 'DECISION', prompt: rosterPrompt };
  const chosenIds = decodeRosterChoice(rosterResp?.optionId, suggested.members, st);
  const roster = chosenIds === suggested.members
    ? suggested
    : rebuildRoster(st, chosenIds, suggested);
  st = { ...st, roster, phase: 'TOURNAMENT' };

  // ── 賽事 ────────────────────────────────────────────────
  /** @type {GameResult[]} */
  const results = [];
  let gameIndex = 0;
  let finalRankNum = def.stages[0]?.eliminatedRankNum ?? 13;
  let finalRankLabel = def.stages[0]?.eliminatedRank ?? '第 13 名';
  let championed = false;

  stages:
  for (let si = 0; si < def.stages.length; si++) {
    const stage = def.stages[si];
    if (!stage) break;
    let stageWins = 0;

    yield {
      t: 'PHASE', phase: 'TOURNAMENT',
      title: `${stage.name}・${stage.venue}`,
      body: `${stage.opponents.length} 場比賽，至少 ${stage.minWins} 勝才能晉級。未晉級即為${stage.eliminatedRank}。`,
    };

    for (const code of stage.opponents) {
      const opp = nation(code);
      yield {
        t: 'GAME_START', index: gameIndex, stageId: stage.id,
        stageName: stage.name, venue: stage.venue,
        opponent: code, opponentName: opp.name,
      };

      const squad = gameSquad(st.players, roster, gameIndex);
      const result = yield* simulateGame({
        seed: st.seed,
        key: `career/${st.year}/game/${String(gameIndex).padStart(2, '0')}`,
        index: gameIndex,
        stageId: stage.id,
        lineup: squad.lineup,
        bench: squad.bench,
        pitchers: squad.pitchers,
        coach: st.coach.attrs,
        nation: opp,
        weAreHome: stage.venue === '臺北大巨蛋',
        templates: DECISION_TEMPLATES,
      });

      results.push(result);
      if (result.win) stageWins++;
      st = applyPostGame(st, result, gameIndex);
      gameIndex++;
    }

    if (stageWins < stage.minWins) {
      finalRankNum = stage.eliminatedRankNum;
      finalRankLabel = stage.eliminatedRank;
      yield {
        t: 'NARRATIVE',
        entry: {
          kind: 'result', tone: 'bad',
          title: `${stage.name}止步`,
          text: `${stage.opponents.length} 場拿下 ${stageWins} 勝，未達 ${stage.minWins} 勝門檻。中華隊的 ${st.year} 年止於${stage.eliminatedRank}。`,
          deltas: [],
        },
      };
      break stages;
    }

    if (si === def.stages.length - 1) {
      championed = true;
      finalRankNum = 1;
      finalRankLabel = '冠軍';
    } else {
      yield {
        t: 'NARRATIVE',
        entry: {
          kind: 'result', tone: 'good',
          title: `${stage.name}晉級`,
          text: `${stageWins} 勝過關。下一站：${def.stages[si + 1]?.name ?? ''}。`,
          deltas: [],
        },
      };
    }
  }

  // ── 結算 ────────────────────────────────────────────────
  st = { ...st, phase: 'REVIEW' };
  const berth = checkOlympicBerth(finalRankNum, results);
  const reward = def.rankRewards.find((r) => r.rank === finalRankNum)
    ?? def.rankRewards[def.rankRewards.length - 1];
  const winPoints = results.filter((r) => r.win).length * def.pointsPerWin;
  const avgAttr = COACH_ATTRS.reduce((s, k) => s + st.coach.attrs[k], 0) / COACH_ATTRS.length;
  // 「能力越高，大賽收穫越多」——抄 yakyolife 的正回饋。
  // 下限為 0：新手教頭本來就低於 50，不該因為「還沒開始成長」而被倒扣，
  // 那會讓第一輪的失敗被懲罰兩次。
  const abilityBonus = Math.max(0, Math.round((reward?.points ?? 0) * ((avgAttr - 50) / 25) * TUNING.reward.abilityBonusRatio));
  const totalPoints = Math.max(1, (reward?.points ?? 0) + winPoints + abilityBonus);

  const meterDelta = computeMeterDelta(finalRankNum, berth.got, results);
  st = {
    ...st,
    coach: {
      ...st.coach,
      unspentPoints: st.coach.unspentPoints + totalPoints,
      meters: {
        publicApproval: clamp(st.coach.meters.publicApproval + meterDelta.publicApproval, 0, 100),
        assocTrust: clamp(st.coach.meters.assocTrust + meterDelta.assocTrust, 0, 100),
        playerMorale: clamp(st.coach.meters.playerMorale + meterDelta.playerMorale, 0, 100),
      },
    },
    tournament: {
      defId: def.id, schedule: [], gameIndex, results, stageIndex: 0,
      eliminated: !championed,
    },
  };

  yield {
    t: 'PHASE', phase: 'REVIEW',
    title: `${def.name}　最終${finalRankLabel}`,
    body: [
      `${results.filter((r) => r.win).length} 勝 ${results.filter((r) => !r.win).length} 敗`,
      berth.got ? `🎟️ 取得 2028 洛杉磯奧運門票 — ${berth.reason}` : `❌ 未取得奧運門票 — ${berth.reason}`,
      `獲得能力點 ${totalPoints} 點（名次 ${reward?.points ?? 0}＋勝場 ${winPoints}＋能力加成 ${abilityBonus}）`,
    ].join('\n'),
  };

  // ── 分配 ────────────────────────────────────────────────
  st = { ...st, phase: 'ALLOCATE' };
  const allocKey = `career/${st.year}/allocate`;
  const allocResp = yield {
    t: 'DECISION',
    prompt: {
      rngKey: allocKey,
      kind: 'ALLOCATE',
      templateId: 'allocate',
      title: `分配 ${totalPoints} 點能力`,
      body: '能力越接近上限，每一點的效果越差。上限是隱藏的，你只看得到目前的進度條。',
      context: null,
      options: [{ id: '', label: '分配', odds: null, preview: [], lockedReason: null }],
    },
  };
  st = applyAllocation(st, allocResp?.optionId ?? '', totalPoints);

  // ── 結局 ────────────────────────────────────────────────
  const ending = pickEnding(finalRankNum, berth.got, st.coach.meters);
  st = { ...st, phase: 'ENDED', ending };
  yield { t: 'ENDING', ending };
  yield { t: 'STATE', state: st };
  return st;
}

/**
 * @param {string|undefined} optionId
 * @param {readonly PlayerId[]} fallback
 * @param {CareerState} st
 * @returns {readonly PlayerId[]}
 */
function decodeRosterChoice(optionId, fallback, st) {
  if (!optionId || !optionId.startsWith('ids:')) return fallback;
  const ids = /** @type {PlayerId[]} */ (optionId.slice(4).split(',').filter(Boolean));
  const valid = ids.filter((id) => st.players[id]);
  if (valid.length !== TUNING.pool.rosterSize) return fallback;
  return valid;
}

/**
 * 玩家自訂名單後，重新推導打序／輪值／牛棚。
 * @param {CareerState} st
 * @param {readonly PlayerId[]} ids
 * @param {import('../domain/types.js').Roster} fallback
 * @returns {import('../domain/types.js').Roster}
 */
function rebuildRoster(st, ids, fallback) {
  /** @type {Record<PlayerId, Player>} */
  const subset = {};
  for (const id of ids) {
    const p = st.players[id];
    if (p) subset[id] = p;
  }
  const sub = suggestRoster(subset, ids);
  return sub.lineup.length >= TUNING.pool.lineupSize ? { ...sub, members: ids } : fallback;
}

/**
 * 賽後處理：疲勞、傷病、手感。
 * @param {CareerState} st
 * @param {GameResult} result
 * @param {number} gameIndex
 * @returns {CareerState}
 */
function applyPostGame(st, result, gameIndex) {
  const rng = makeRng(st.seed, `career/${st.year}/postgame/${gameIndex}`);
  /** @type {Record<PlayerId, Player>} */
  const players = { ...st.players };
  const inj = TUNING.injury;

  for (const id of st.poolOrder) {
    const p = players[id];
    if (!p) continue;
    const inRoster = st.roster?.members.includes(id) ?? false;
    if (!inRoster) continue;

    let condition = { ...p.condition };
    if (condition.injury) {
      const gamesOut = condition.injury.gamesOut - 1;
      condition.injury = gamesOut <= 0 ? null : { ...condition.injury, gamesOut };
    } else {
      const conditioning = st.coach.attrs.conditioning;
      const p0 = inj.perGameBase
        * (1 + ((p.growth.durability - 50) / 25) * (inj.durability / 100))
        * (1 - ((conditioning - 50) / 25) * 0.2);
      if (rng.bool(Math.max(0.005, p0))) {
        condition.injury = { code: 'STRAIN', gamesOut: rng.int(1, 4), severity: 1 };
      }
    }
    condition.form = clamp(condition.form + rng.int(-2, 3) + (result.win ? 1 : -1), -10, 10);
    players[id] = { ...p, condition };
  }
  return { ...st, players };
}

/**
 * @param {number} rankNum
 * @param {boolean} gotBerth
 * @param {readonly GameResult[]} results
 * @returns {{publicApproval:number, assocTrust:number, playerMorale:number}}
 */
function computeMeterDelta(rankNum, gotBerth, results) {
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

/**
 * @param {CareerState} st
 * @param {string} optionId
 * @param {number} available
 * @returns {CareerState}
 */
export function applyAllocation(st, optionId, available) {
  /** @type {any} */
  const attrs = { ...st.coach.attrs };
  let spent = 0;
  for (const part of optionId.split(',').filter(Boolean)) {
    const [k, nRaw] = part.split(':');
    const key = /** @type {CoachAttrKey} */ (k);
    const n = Number(nRaw);
    if (!COACH_ATTRS.includes(key) || !Number.isFinite(n) || n <= 0) continue;
    const use = Math.min(n, available - spent);
    if (use <= 0) continue;
    attrs[key] = applyGrowth(attrs[key], st.coach.caps[key], use);
    spent += use;
  }
  return {
    ...st,
    coach: { ...st.coach, attrs, unspentPoints: st.coach.unspentPoints - spent },
  };
}

/**
 * @param {number} rankNum
 * @param {boolean} gotBerth
 * @param {import('../domain/types.js').Meters} meters
 * @returns {{id:string, title:string, text:string}}
 */
export function pickEnding(rankNum, gotBerth, meters) {
  if (meters.publicApproval <= 0 || meters.assocTrust <= 0) {
    return {
      id: 'fired',
      title: '被揃下台',
      text: '記者會結束後，協會沒有再約下一次。你在新聞跑馬燈上看到接任人選的名字，那個人現在正在鍵盤上罵你的位置。',
    };
  }
  if (rankNum === 1 && gotBerth) {
    return {
      id: 'champion',
      title: '東京巨蛋的冠軍',
      text: '你在客場的土地上舉起了冠軍。奧運門票只是附帶的——那些說「你行你上」的人，現在正在轉發你的照片。',
    };
  }
  if (gotBerth) {
    return {
      id: 'ticket',
      title: '拿到門票的人',
      text: `最終${rankNum} 名，但亞洲區最高名次是你的。2028 年洛杉磯，中華隊有位子。續約合約放在桌上，你還沒簽。`,
    };
  }
  if (rankNum <= 4) {
    return {
      id: 'so_close',
      title: '差一場',
      text: '前四強，但門票給了別人。網路上開始流傳你在第七局沒有換投的截圖。你自己也重看了那一局，很多次。',
    };
  }
  return {
    id: 'early_out',
    title: '點到為止',
    text: '你走過的路跟前任一模一樣。留言區的第一則是：「換誰來都一樣。」下面有兩千個讚。',
  };
}
