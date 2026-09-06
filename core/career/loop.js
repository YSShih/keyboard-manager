// @ts-check
/**
 * 生涯狀態機。
 *
 * 做成單一 generator 的理由：所有玩家決策都從同一條路徑經過，
 * 存檔就只需要記「第 n 個決策選了什麼」，載入時從種子重跑即可還原。
 * 這也讓 headless 批次測試跟真人遊玩跑的是完全同一份程式碼。
 */
import { makeRng } from '../rng/rng.js';
import { clamp } from '../odds/odds.js';
import { encodeSeed, SEED_CODE_VERSION } from '../rng/seedCode.js';
import { generatePool, overall } from './generate.js';
import { suggestRoster, gameSquad } from './roster.js';
import { simulateGame } from '../sim/game.js';
import { TUNING } from '../../content/tuning.js';
import { nation } from '../../content/data/nations.js';
import { DECISION_TEMPLATES } from '../../content/data/decisions.js';
import { PREMIER12_2027, OLYMPIC_BERTH_RULE, checkOlympicBerth } from '../../content/data/tournaments.js';
import { COACH_ATTRS } from './coach.js';
import { encodeRosterChoice, decodeRosterChoice, encodePregameChoice, decodePregameChoice } from './choices.js';
import { applyGrowth, applyAllocation } from './allocation.js';
import { applyPostGame, computeMeterDelta } from './postgame.js';
import { pickEnding } from './endings.js';

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').CareerEvent} CareerEvent */
/** @typedef {import('../domain/types.js').DecisionResponse} DecisionResponse */
/** @typedef {import('../domain/types.js').DecisionPrompt} DecisionPrompt */
/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').CoachAttrKey} CoachAttrKey */
/** @typedef {import('../domain/types.js').Coach} Coach */
/** @typedef {import('../domain/types.js').GameResult} GameResult */

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
    extra: null,
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
      const gameKey = `career/${st.year}/game/${String(gameIndex).padStart(2, '0')}`;

      // ── 賽前調度 ────────────────────────────────────────
      const preview = gameSquad(st.players, roster, gameIndex);
      const pregameResp = yield {
        t: 'DECISION',
        prompt: {
          rngKey: `${gameKey}/pregame`,
          kind: 'PREGAME',
          templateId: 'pregame',
          title: `第 ${gameIndex + 1} 戰　vs ${opp.name}`,
          body: `${stage.name}・${stage.venue}\n先發投手與跑壘方針由你決定。`,
          context: null,
          extra: {
            opponent: opp.name,
            venue: stage.venue,
            starters: preview.rotationOptions.map((p) => ({
              id: p.id,
              name: p.name,
              load: Math.round(p.condition.workload.pitchesInEvent),
              overall: overall(p),
            })),
          },
          options: [{
            id: encodePregameChoice(preview.pitchers[0]?.id ?? null, 'balanced'),
            label: '照建議出戰', odds: null, preview: [], lockedReason: null,
          }],
        },
      };
      const plan = decodePregameChoice(pregameResp?.optionId);

      yield {
        t: 'GAME_START', index: gameIndex, stageId: stage.id,
        stageName: stage.name, venue: stage.venue,
        opponent: code, opponentName: opp.name,
      };

      const squad = gameSquad(st.players, roster, gameIndex, plan.starterId);
      const result = yield* simulateGame({
        seed: st.seed,
        key: gameKey,
        index: gameIndex,
        stageId: stage.id,
        lineup: squad.lineup,
        bench: squad.bench,
        pitchers: squad.pitchers,
        coach: st.coach.attrs,
        nation: opp,
        weAreHome: stage.venue === '臺北大巨蛋',
        templates: DECISION_TEMPLATES,
        stance: plan.stance,
      });

      results.push(result);
      if (result.win) stageWins++;
      const played = new Set([
        ...squad.lineup.map((p) => p.id),
        ...Object.keys(result.pitchCounts),
      ]);
      const post = applyPostGame(st, result, gameIndex, played);
      st = post.state;

      // ── 賽後結果 ────────────────────────────────────────
      const gamePoints = result.win
        ? TUNING.reward.pointsPerWinGame
        : TUNING.reward.pointsPerLossGame;
      st = {
        ...st,
        coach: { ...st.coach, unspentPoints: st.coach.unspentPoints + gamePoints },
      };

      const mvpName = result.mvp ? st.players[result.mvp]?.name : null;
      yield {
        t: 'PHASE', phase: 'REVIEW',
        title: `${result.win ? '勝' : '敗'}　${result.runsFor} : ${result.runsAgainst}　vs ${opp.name}`,
        body: [
          `${stage.name}・${stage.venue}　第 ${gameIndex + 1} 戰`,
          mvpName ? `本場最佳：${mvpName}` : null,
          result.highlights.length ? result.highlights[0] : null,
          post.newInjuries.length ? `⚠️ 傷兵：${post.newInjuries.join('、')}` : null,
          `獲得能力點 ${gamePoints} 點`,
        ].filter(Boolean).join('\n'),
      };

      // ── 賽後分配 ────────────────────────────────────────
      const gAlloc = yield {
        t: 'DECISION',
        prompt: {
          rngKey: `${gameKey}/allocate`,
          kind: 'ALLOCATE',
          templateId: 'allocate_game',
          title: `分配 ${gamePoints} 點能力`,
          body: '能力越接近上限，每一點的效果越差。上限是隱藏的。',
          context: null,
          extra: { points: gamePoints },
          options: [{ id: '', label: '分配', odds: null, preview: [], lockedReason: null }],
        },
      };
      st = applyAllocation(st, gAlloc?.optionId ?? '', gamePoints);

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
  // 勝場點數已經在每場賽後給過了，這裡只算名次獎勵與能力加成，避免重複計算。
  const winPoints = 0;
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
      `名次獎勵 ${totalPoints} 點（名次 ${reward?.points ?? 0}＋能力加成 ${abilityBonus}）`,
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
      body: '賽事結束的名次獎勵。能力越接近上限，每一點的效果越差。',
      context: null,
      extra: { points: totalPoints },
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
