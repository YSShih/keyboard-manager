// @ts-check
/**
 * 生涯狀態機：2025 → 2028，六個賽事。
 *
 * 做成單一 generator 的理由：所有玩家決策都從同一條路徑經過，
 * 存檔就只需要記「第 n 個決策選了什麼」，載入時從種子重跑即可還原。
 *
 * 節奏是混合式的：多數比賽用 runGameHeadless 自動結算成一行比數，
 * 只有「重點戰」進入逐球模式讓玩家做關鍵決策。兩者跑的是同一支 simulateGame，
 * 所以自動結算的世界跟手動打的世界數值一致。
 */
import { makeRng } from '../rng/rng.js';
import { clamp } from '../odds/odds.js';
import { encodeSeed, SEED_CODE_VERSION } from '../rng/seedCode.js';
import { generatePool, overall } from './generate.js';
import { suggestRoster, gameSquad } from './roster.js';
import { simulateGame } from '../sim/game.js';
import { runGameHeadless, makeCoachPolicy } from '../sim/driver.js';
import { applyEffects, evalPredicate, selectCast } from '../effects/apply.js';
import { TUNING } from '../../content/tuning.js';
import { nation } from '../../content/data/nations.js';
import { DECISION_TEMPLATES } from '../../content/data/decisions.js';
import { EVENT_CARDS } from '../../content/data/events.js';
import {
  CALENDAR, OLYMPIC_BERTH_RULE, checkOlympicBerth, selectKeyGames, FLAG_OLYMPIC_BERTH,
} from '../../content/data/calendar.js';
import { COACH_ATTRS, COACH_ATTR_LABEL } from './coach.js';
import { encodeRosterChoice, decodeRosterChoice, decodeStance } from './choices.js';
import { applyAllocation } from './allocation.js';
import { applyPostGame } from './postgame.js';
import { pickEnding } from './endings.js';

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').CareerEvent} CareerEvent */
/** @typedef {import('../domain/types.js').DecisionResponse} DecisionResponse */
/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').GameResult} GameResult */
/** @typedef {import('../domain/types.js').TournamentDef} TournamentDef */
/** @typedef {import('../domain/types.js').Roster} Roster */

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
    packVersion: 'data',
    year: CALENDAR[0]?.year ?? 2025,
    phase: 'INIT',
    coach: {
      name: coachName,
      attrs,
      caps,
      unspentPoints: 0,
      prestige: c.startPrestige,
      role: 'NT_MANAGER',
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
    history: [],
    ending: null,
  };
}

/**
 * 玩家自訂名單後，重新推導打序／輪值／牛棚。
 * @param {CareerState} st
 * @param {readonly PlayerId[]} ids
 * @param {Roster} fallback
 * @returns {Roster}
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
 * 這一屆要不要打。
 * @param {TournamentDef} def
 * @param {CareerState} st
 * @returns {boolean}
 */
function shouldPlay(def, st) {
  if (def.skipsIfFlag && st.coach.flags.includes(def.skipsIfFlag)) return false;
  if (def.requiresFlag && !st.coach.flags.includes(def.requiresFlag)) return false;
  return true;
}

/**
 * 賽程表的文字版，開場時就讓玩家看到哪幾場是重點戰。
 * @param {TournamentDef} def
 * @returns {string}
 */
function scheduleText(def) {
  const key = selectKeyGames(def);
  /** @type {string[]} */
  const out = [];
  let i = 0;
  for (const stage of def.stages) {
    const games = stage.opponents.map((code) => {
      const star = key.has(i) ? '★ ' : '　 ';
      i++;
      return `${star}${nation(code).name}`;
    });
    out.push(`${stage.name}（${stage.venue}）　需 ${stage.minWins} 勝\n    ${games.join('　')}`);
  }
  return out.join('\n') + '\n\n★ 為重點戰，你會親自在場邊做決定；其餘由教練團執行。';
}

/**
 * 整段生涯。
 * @param {CareerState} initial
 * @returns {Generator<CareerEvent, CareerState, DecisionResponse|undefined>}
 */
export function* runCareer(initial) {
  /** @type {CareerState} */
  let st = { ...initial };

  yield {
    t: 'PHASE', phase: 'INIT',
    title: '2024 年 11 月 24 日・東京巨蛋',
    body: '中華隊 4：0 完封日本，終結對手 27 連勝，拿下隊史第一座國際一級賽事冠軍。\n'
      + '總教練在慶功宴上宣布引退。他說：「該換人了。」\n\n'
      + `一個月後，協會找上${st.coach.name}。\n`
      + '合約攤在桌上，旁邊是一份 2028 洛杉磯奧運的評估報告。\n\n'
      + '所有人都在鍵盤上說得頭頭是道。現在換你坐上去。',
  };

  /** @type {?{id:string, title:string, text:string}} */
  let forcedEnding = null;

  for (const def of CALENDAR) {
    if (!shouldPlay(def, st)) {
      if (def.skipsIfFlag && st.coach.flags.includes(def.skipsIfFlag)) {
        yield {
          t: 'NARRATIVE',
          entry: {
            kind: 'result', tone: 'good', title: `${def.year} 年 ${def.month}・${def.name}`,
            text: '你不用打資格賽了。三月你在台北看別人搶那張門票，'
              + '然後回去繼續備戰七月。', deltas: [],
          },
        };
      }
      continue;
    }
    // requiresFlag 沒過＝進不了奧運，生涯到此為止
    if (def.requiresFlag && !st.coach.flags.includes(def.requiresFlag)) continue;

    st = { ...st, year: def.year, phase: 'ROSTER' };
    const tKey = `career/${def.id}`;

    yield {
      t: 'PHASE', phase: 'TOURNAMENT',
      title: `${def.year} 年 ${def.month}　${def.name}`,
      body: `${def.intro}\n\n${scheduleText(def)}`,
    };

    // ── 徵召名單 ＋ 全隊方針 ──────────────────────────────
    const suggested = suggestRoster(st.players, st.poolOrder);
    const rosterResp = yield {
      t: 'DECISION',
      prompt: {
        rngKey: `${tKey}/roster`,
        kind: 'ROSTER',
        templateId: 'roster',
        title: '徵召名單與全隊方針',
        body: `從 ${st.poolOrder.length} 人的球員池裡挑出 ${TUNING.pool.rosterSize} 人，`
          + '並決定這一屆的跑壘方針。先發投手由教練團依疲勞安排，你不用每場煩。',
        context: null,
        extra: { opponent: def.name, venue: def.stages[0]?.venue ?? '' },
        options: [{
          id: encodeRosterChoice(suggested.members, 'balanced'),
          label: '採用建議名單', odds: null, preview: [], lockedReason: null,
        }],
      },
    };
    const chosenIds = decodeRosterChoice(rosterResp?.optionId, suggested.members, st);
    const stance = decodeStance(rosterResp?.optionId);
    const roster = chosenIds === suggested.members ? suggested : rebuildRoster(st, chosenIds, suggested);
    st = { ...st, roster };

    // ── 賽前事件卡 ×2 ─────────────────────────────────────
    st = yield* playEventCards(st, `${tKey}/events`, 2);

    // ── 比賽 ──────────────────────────────────────────────
    st = { ...st, phase: 'TOURNAMENT' };
    const keyGames = selectKeyGames(def);
    /** @type {GameResult[]} */
    const results = [];
    let gameIndex = 0;
    let finalRankNum = def.stages[0]?.eliminatedRankNum ?? 99;
    let finalRankLabel = def.stages[0]?.eliminatedRank ?? '';
    let championed = false;

    stages:
    for (let si = 0; si < def.stages.length; si++) {
      const stage = def.stages[si];
      if (!stage) break;
      let stageWins = 0;

      for (const code of stage.opponents) {
        const opp = nation(code);
        const isKey = keyGames.has(gameIndex);
        const gameKey = `${tKey}/game/${String(gameIndex).padStart(2, '0')}`;
        const squad = gameSquad(st.players, roster, gameIndex);
        const ctx = {
          seed: st.seed, key: gameKey, index: gameIndex, stageId: stage.id,
          lineup: squad.lineup, bench: squad.bench, pitchers: squad.pitchers,
          coach: st.coach.attrs, nation: opp,
          weAreHome: stage.venue.includes('臺北') || stage.venue.includes('台北'),
          templates: DECISION_TEMPLATES, stance,
        };

        yield {
          t: 'GAME_START', index: gameIndex, stageId: stage.id,
          stageName: stage.name, venue: stage.venue,
          opponent: code, opponentName: opp.name,
        };

        /** @type {GameResult} */
        let result;
        if (isKey) {
          // 重點戰：逐球，玩家親自決策
          result = yield* simulateGame(ctx);
        } else {
          // 其餘：同一支引擎自動結算，由教頭代打決策
          const run = runGameHeadless(ctx, makeCoachPolicy(st.coach.attrs));
          result = run.result;
          yield { t: 'GAME_END', result };
        }

        results.push(result);
        if (result.win) stageWins++;
        const played = new Set([
          ...squad.lineup.map((p) => p.id),
          ...Object.keys(result.pitchCounts),
        ]);
        const post = applyPostGame(st, result, gameIndex, played);
        st = post.state;
        if (post.newInjuries.length > 0) {
          yield {
            t: 'NARRATIVE',
            entry: { kind: 'injury', tone: 'bad', title: '傷兵', text: post.newInjuries.join('、'), deltas: [] },
          };
        }
        gameIndex++;
      }

      if (stageWins < stage.minWins) {
        finalRankNum = stage.eliminatedRankNum;
        finalRankLabel = stage.eliminatedRank;
        yield {
          t: 'NARRATIVE',
          entry: {
            kind: 'result', tone: 'bad', title: `${stage.name}止步`,
            text: `${stage.opponents.length} 場拿下 ${stageWins} 勝，未達 ${stage.minWins} 勝門檻。`,
            deltas: [],
          },
        };

        // 敗部戰（例如奧運銅牌戰）。獎牌要打贏才有，不是輸掉四強就白拿。
        const con = stage.consolation;
        if (con) {
          const opp = nation(con.opponent);
          const squad = gameSquad(st.players, roster, gameIndex);
          const ctx = {
            seed: st.seed, key: `${tKey}/game/${String(gameIndex).padStart(2, '0')}`,
            index: gameIndex, stageId: `${stage.id}_consolation`,
            lineup: squad.lineup, bench: squad.bench, pitchers: squad.pitchers,
            coach: st.coach.attrs, nation: opp, weAreHome: false,
            templates: DECISION_TEMPLATES, stance,
          };
          yield {
            t: 'GAME_START', index: gameIndex, stageId: ctx.stageId,
            stageName: con.name, venue: stage.venue,
            opponent: con.opponent, opponentName: opp.name,
          };
          // 敗部戰一律是重點戰 —— 一面獎牌就在這一場，不該用自動結算帶過
          const cr = yield* simulateGame(ctx);
          results.push(cr);
          const played = new Set([
            ...squad.lineup.map((p) => p.id), ...Object.keys(cr.pitchCounts),
          ]);
          st = applyPostGame(st, cr, gameIndex, played).state;
          gameIndex++;
          finalRankNum = cr.win ? con.winRank : con.loseRank;
          finalRankLabel = cr.win ? con.winLabel : con.loseLabel;
        }
        break stages;
      }

      if (si === def.stages.length - 1) {
        championed = true;
        finalRankNum = 1;
        finalRankLabel = def.rankRewards[0]?.label ?? '冠軍';
        // 記下每一座冠軍。結局要認得「經典賽冠軍」這條勝利條件，
        // 而不是只看奧運 —— 使用者要的是「奧運金牌或經典賽冠軍」。
        const flag = `champion:${def.id}`;
        if (!st.coach.flags.includes(flag)) {
          st = { ...st, coach: { ...st.coach, flags: [...st.coach.flags, flag] } };
        }
      } else {
        yield {
          t: 'NARRATIVE',
          entry: {
            kind: 'result', tone: 'good', title: `${stage.name}晉級`,
            text: `${stageWins} 勝過關。下一站：${def.stages[si + 1]?.name ?? ''}。`, deltas: [],
          },
        };
      }
    }

    // ── 結算 ──────────────────────────────────────────────
    st = { ...st, phase: 'REVIEW' };
    const reward = def.rankRewards.find((r) => r.rank === finalRankNum)
      ?? def.rankRewards[def.rankRewards.length - 1];
    const winPoints = results.filter((r) => r.win).length * def.pointsPerWin;
    const avgAttr = COACH_ATTRS.reduce((s, k) => s + st.coach.attrs[k], 0) / COACH_ATTRS.length;
    const abilityBonus = Math.max(0, Math.round(
      (reward?.points ?? 0) * ((avgAttr - 50) / 25) * TUNING.reward.abilityBonusRatio,
    ));
    const totalPoints = Math.max(1, (reward?.points ?? 0) + winPoints + abilityBonus);

    // 奧運門票
    /** @type {string[]} */
    const notes = [];
    if (def.stake === 'ticket') {
      const got = def.id === 'premier12_2027'
        ? checkOlympicBerth(finalRankNum, results)
        : { got: championed, reason: championed ? '在主場拿下最後一個名額。' : '沒有拿到那個名額。' };
      if (got.got && !st.coach.flags.includes(FLAG_OLYMPIC_BERTH)) {
        st = { ...st, coach: { ...st.coach, flags: [...st.coach.flags, FLAG_OLYMPIC_BERTH] } };
      }
      notes.push(got.got ? `🎟️ 取得 2028 洛杉磯奧運門票 — ${got.reason}` : `❌ 未取得奧運門票 — ${got.reason}`);
    }

    const prestigeDelta = def.prestige[finalRankNum] ?? 0;
    const meterDelta = tournamentMeterDelta(def, finalRankNum, results);
    st = {
      ...st,
      coach: {
        ...st.coach,
        unspentPoints: st.coach.unspentPoints + totalPoints,
        prestige: clamp(st.coach.prestige + prestigeDelta, 0, 100),
        meters: {
          publicApproval: clamp(st.coach.meters.publicApproval + meterDelta.publicApproval, 0, 100),
          assocTrust: clamp(st.coach.meters.assocTrust + meterDelta.assocTrust, 0, 100),
          playerMorale: clamp(st.coach.meters.playerMorale + meterDelta.playerMorale, 0, 100),
        },
      },
      tournament: {
        defId: def.id, schedule: [], gameIndex, results, stageIndex: 0, eliminated: !championed,
      },
      // 累積整段生涯的成績，結局畫面才給得出四年回顧 ——
      // 只看 tournament.results 的話拿到的是最後一屆，會顯示成「戰績 0–2」。
      history: [...st.history, {
        defId: def.id,
        year: def.year,
        name: def.name,
        rankLabel: finalRankLabel,
        rankNum: finalRankNum,
        wins: results.filter((r) => r.win).length,
        losses: results.filter((r) => !r.win).length,
        beatJpnOrKor: results.some((r) => r.win && (r.opponent === 'JPN' || r.opponent === 'KOR')),
      }],
    };

    yield {
      t: 'PHASE', phase: 'REVIEW',
      title: `${def.name}　最終${finalRankLabel}`,
      body: [
        `${results.filter((r) => r.win).length} 勝 ${results.filter((r) => !r.win).length} 敗`,
        ...notes,
        `聲望 ${prestigeDelta >= 0 ? '+' : ''}${prestigeDelta}　→　${st.coach.prestige}`,
        `獲得能力點 ${totalPoints} 點`,
      ].join('\n'),
    };

    st = { ...st, phase: 'ALLOCATE' };
    const allocResp = yield {
      t: 'DECISION',
      prompt: {
        rngKey: `${tKey}/allocate`,
        kind: 'ALLOCATE',
        templateId: 'allocate',
        title: `分配 ${totalPoints} 點能力`,
        body: '能力越接近上限，每一點的效果越差。上限是隱藏的。',
        context: null,
        extra: { points: totalPoints },
        options: [{ id: '', label: '分配', odds: null, preview: [], lockedReason: null }],
      },
    };
    st = applyAllocation(st, allocResp?.optionId ?? '', totalPoints);

    // ── 生涯是否在此中斷 ──────────────────────────────────
    if (st.coach.meters.publicApproval <= 0 || st.coach.meters.assocTrust <= 0) {
      forcedEnding = pickEnding({ firedNow: true, st, def, rankNum: finalRankNum });
      break;
    }
    if (def.stake === 'ticket' && !st.coach.flags.includes(FLAG_OLYMPIC_BERTH)
        && def.id === 'olympic_qualifier_2028') {
      forcedEnding = pickEnding({ noOlympics: true, st, def, rankNum: finalRankNum });
      break;
    }
    if (def.id === 'olympics_2028') {
      forcedEnding = pickEnding({ olympicRank: finalRankNum, st, def, rankNum: finalRankNum });
      break;
    }
  }

  const ending = forcedEnding ?? pickEnding({ st, def: null, rankNum: 99 });
  st = { ...st, phase: 'ENDED', ending };
  yield { t: 'ENDING', ending };
  yield { t: 'STATE', state: st };
  return st;
}

/**
 * 抽並解決 n 張賽前事件卡。
 * @param {CareerState} st
 * @param {string} keyPrefix
 * @param {number} n
 * @returns {Generator<CareerEvent, CareerState, DecisionResponse|undefined>}
 */
function* playEventCards(st, keyPrefix, n) {
  /** @type {string[]} */
  const used = [];
  for (let i = 0; i < n; i++) {
    const drawKey = `${keyPrefix}/slot/${i}`;
    const pool = EVENT_CARDS.filter(
      (c) => !used.includes(c.id) && (!c.requires || evalPredicate(c.requires, st)),
    );
    if (pool.length === 0) break;
    const card = makeRng(st.seed, `${drawKey}/draw`)
      .weighted(pool.map((c) => ({ item: c, w: c.weight })));
    used.push(card.id);

    const cast = selectCast(card.cast, st, makeRng(st.seed, `${drawKey}/cast`));
    /** @param {string} text */
    const fill = (text) => text.replace(/\{\{cast(\d)\}\}/g, (_, d) => cast[Number(d)]?.name ?? '某位球員');

    const resp = yield {
      t: 'DECISION',
      prompt: {
        rngKey: `${drawKey}/choice`,
        kind: 'EVENT_CARD',
        templateId: card.id,
        title: card.title,
        body: fill(card.body),
        context: null,
        extra: null,
        options: card.options.map((o) => ({
          id: o.id,
          label: o.label,
          odds: { base: o.baseRate, modifiers: [], final: o.baseRate },
          preview: o.preview,
          lockedReason: null,
        })),
      },
    };
    const chosen = card.options.find((o) => o.id === resp?.optionId) ?? card.options[0];
    if (!chosen) continue;

    const success = makeRng(st.seed, `${drawKey}/roll`).bool(chosen.baseRate);
    const applied = applyEffects(st, success ? chosen.onSuccess : chosen.onFail, {
      cast, rng: makeRng(st.seed, `${drawKey}/fx`), attrLabel: COACH_ATTR_LABEL,
    });
    st = applied.state;

    yield {
      t: 'NARRATIVE',
      entry: {
        kind: 'event', tone: success ? 'good' : 'bad',
        title: `事件卡｜${card.title}`,
        text: fill(success ? chosen.successText : chosen.failText),
        deltas: applied.deltas,
      },
    };
  }
  return st;
}

/**
 * 一屆賽事結束後的三條 meter 變化。
 * @param {TournamentDef} def
 * @param {number} rankNum
 * @param {readonly GameResult[]} results
 */
function tournamentMeterDelta(def, rankNum, results) {
  const wins = results.filter((r) => r.win).length;
  const prestige = def.prestige[rankNum] ?? 0;
  const beatBig = results.some((r) => r.win && (r.opponent === 'JPN' || r.opponent === 'KOR')) ? 8 : 0;
  // 一級賽事的成績對民調的影響是二級的兩倍
  const weight = def.tier === 1 ? 1 : 0.5;
  return {
    publicApproval: Math.round(prestige * weight) + beatBig,
    assocTrust: Math.round(prestige * 0.6 * weight),
    playerMorale: Math.round(wins * 1.5) + (rankNum <= 2 ? 8 : rankNum >= 8 ? -6 : 0),
  };
}

export { OLYMPIC_BERTH_RULE };
