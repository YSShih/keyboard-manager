// @ts-check
import { makeRng } from '../rng/rng.js';
import { computeOdds, mod, ratingMod } from '../odds/odds.js';
import { interpolate } from '../content/template.js';
import { resolvePlateAppearance, OUTCOME_LABEL, carryOverPitches, pullLimit } from './atBat.js';
import { advanceRunners, applyBunt, applySteal } from './advance.js';
import { shouldPause } from './leverage.js';
import { TUNING } from '../../content/tuning.js';
import { makeOpponentSquad } from './opponent.js';

/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').CoachAttr} CoachAttr */
/** @typedef {import('../domain/types.js').NationDef} NationDef */
/** @typedef {import('../domain/types.js').GameSnapshot} GameSnapshot */
/** @typedef {import('../domain/types.js').GameResult} GameResult */
/** @typedef {import('../domain/types.js').SimEvent} SimEvent */
/** @typedef {import('../domain/types.js').DecisionPrompt} DecisionPrompt */
/** @typedef {import('../domain/types.js').DecisionResponse} DecisionResponse */
/** @typedef {import('../../content/v1/decisions.js').Tmpl} Tmpl */

/**
 * @typedef {object} GameContext
 * @property {number} seed
 * @property {string} key       這場比賽的 RNG 路徑前綴
 * @property {number} index     賽程中的第幾場
 * @property {string} stageId
 * @property {Player[]} lineup  我方打序 9 人
 * @property {Player[]} bench   板凳（代打用）
 * @property {Player[]} pitchers 我方可用投手，[0] 為先發
 * @property {CoachAttr} coach
 * @property {NationDef} nation 對手
 * @property {boolean} weAreHome
 * @property {readonly Tmpl[]} templates
 * @property {'aggressive'|'balanced'|'conservative'} [stance] 賽前設定的戰術傾向
 */

const MAX_INNINGS = 15;
/**
 * 突破僵局制：從這一局開始，每個半局都從「一二壘有人」開打。
 * 沒有這個規則的話，延長賽會拖到上限然後以平手收場 ——
 * 而平手在目前的賽制裡會被算成敗，等於用一個永遠倒向玩家的規則決定 2% 的比賽。
 */
const TIEBREAK_FROM = 10;

/** 戰術傾向對跑壘的影響。只作用在我方進攻，對手一律用平衡。 */
const STANCE = TUNING.stance;
/** 決策效果的基準幅度。實際幅度 = SWING_BASE × (1 − 成功率)。 */
const SWING_BASE = 42;

/**
 * 判斷局面是否符合模板的觸發條件。
 * @param {Tmpl} t
 * @param {GameSnapshot} s
 * @param {'PITCHING'|'BATTING'} side
 * @returns {boolean}
 */
function triggerMatches(t, s, side) {
  const g = t.trigger;
  if (g.side !== side) return false;
  if (g.minInning !== undefined && s.inning < g.minInning) return false;
  if (g.minPitchCount !== undefined && s.pitchCount < g.minPitchCount) return false;
  if (g.maxScoreDiff !== undefined && Math.abs(s.runsUs - s.runsThem) > g.maxScoreDiff) return false;
  if (g.maxOuts !== undefined && s.outs > g.maxOuts) return false;
  if (g.trailingOrTied && s.runsUs > s.runsThem) return false;
  if (g.runners === 'ANY' && !s.bases.some(Boolean)) return false;
  if (g.runners === 'FIRST' && !s.bases[0]) return false;
  if (g.runners === 'SCORING' && !(s.bases[1] || s.bases[2])) return false;
  return true;
}

/**
 * 把模板的 rateMods 換算成實際的 Odds modifier。
 * @param {Tmpl['options'][number]} opt
 * @param {CoachAttr} coach
 * @returns {import('../odds/odds.js').Odds}
 */
function optionOdds(opt, coach) {
  const mods = (opt.rateMods ?? []).map((r) => {
    if (r.from === 'coachAttr' && r.attr) {
      const v = coach[r.attr];
      return ratingMod(r.source, interpolate(r.label, { [r.attr]: v }), v, r.points);
    }
    return mod(r.source, r.label, r.points);
  });
  return computeOdds(opt.baseRate, mods);
}

/**
 * @param {GameContext} ctx
 * @returns {Generator<SimEvent, GameResult, DecisionResponse|undefined>}
 */
export function* simulateGame(ctx) {
  const opp = makeOpponentSquad(ctx.seed, ctx.key, ctx.nation);
  const stance = STANCE[ctx.stance ?? 'balanced'] ?? STANCE.balanced;

  // 我方
  const lineup = ctx.lineup.slice();
  const bench = ctx.bench.slice();
  const myPitchers = ctx.pitchers.slice();
  const closer = myPitchers[myPitchers.length - 1] ?? null;
  let myPitcher = myPitchers[0] ?? null;
  /** @type {Set<string>} */
  const usedPitchers = new Set(myPitcher ? [myPitcher.id] : []);
  let myPitchCount = 0;

  // 對方
  let oppPitcherIdx = 0;
  let oppPitchCount = 0;

  let myBatIdx = 0;
  let oppBatIdx = 0;
  let runsUs = 0;
  let runsThem = 0;
  let pauses = 0;
  let walkOff = false;
  let moraleDelta = 0;
  /** @type {Record<string, number>} */
  const myPitchCounts = {};
  /** @type {Record<string, number>} */
  const templateUses = {};
  /** @type {string[]} */
  const highlights = [];
  /** @type {Record<string, number>} */
  const contribution = {};

  /**
   * 挑下一個上來的投手。
   *
   * 原本這裡是 myPitcherIdx++，每場從 0 開始，所以第二任投手永遠是牛棚的第一個人 ——
   * 一整屆賽事下來只有那一個後援在投，其他人一球都沒投，牛棚深度形同不存在。
   * 現在改成挑「最新鮮的」（賽會內累積球數最少），並把終結者留到第 8 局以後。
   *
   * @param {number} inning
   * @returns {Player|null}
   */
  const pickReliever = (inning) => {
    const avail = myPitchers.filter((p) => !usedPitchers.has(p.id));
    if (avail.length === 0) return null;
    const pool = inning >= 8 || !closer
      ? avail
      : (avail.filter((p) => p.id !== closer.id).length > 0
          ? avail.filter((p) => p.id !== closer.id)
          : avail);
    return pool.slice().sort((a, b) => {
      const d = carryOverPitches(a.condition.workload) - carryOverPitches(b.condition.workload);
      return d !== 0 ? d : (a.id < b.id ? -1 : 1);
    })[0] ?? null;
  };

  /**
   * 這一分是不是再見分。
   * 只有在九局下（含延長）、且打擊的一方是主隊、且主隊因此超前時才成立。
   * @param {number} inning @param {'top'|'bot'} half @param {boolean} weBat
   * @returns {boolean}
   */
  const isWalkOff = (inning, half, weBat) => {
    if (half !== 'bot' || inning < 9) return false;
    return weBat ? runsUs > runsThem : runsThem > runsUs;
  };

  /** @param {Player[]} arr @param {number} i */
  const at = (arr, i) => {
    const p = arr[i % arr.length];
    if (!p) throw new Error(`陣容取值越界 @ ${ctx.key}`);
    return p;
  };

  /**
   * 打一個半局。
   * @param {boolean} weBat
   * @param {number} inning
   * @param {number} remainingAtBats
   * @returns {Generator<SimEvent, void, DecisionResponse|undefined>}
   */
  function* halfInning(weBat, inning, remainingAtBats) {
    let outs = 0;
    /** @type {[boolean, boolean, boolean]} */
    let bases = inning >= TIEBREAK_FROM ? [true, true, false] : [false, false, false];
    const half = /** @type {'top'|'bot'} */ (ctx.weAreHome === weBat ? 'bot' : 'top');
    let ab = 0;

    while (outs < 3) {
      const pitcher = weBat ? at(opp.pitchers, oppPitcherIdx) : (myPitcher ?? at(myPitchers, 0));
      const batter = weBat ? at(lineup, myBatIdx) : at(opp.lineup, oppBatIdx);
      const pitchCount = weBat ? oppPitchCount : myPitchCount;

      /** @type {GameSnapshot} */
      const snap = {
        inning, half, outs, bases: [bases[0], bases[1], bases[2]],
        runsUs, runsThem, pitcher: pitcher.id, batter: batter.id, pitchCount,
      };

      const abKey = `${ctx.key}/inn/${String(inning).padStart(2, '0')}/${half}/ab/${String(ab).padStart(2, '0')}`;

      // ── 決策點 ──────────────────────────────────────────
      /** @type {null | {action:string, success:boolean, text:string, swing:number}} */
      let applied = null;
      const side = weBat ? 'BATTING' : 'PITCHING';
      if (shouldPause(snap, pauses, remainingAtBats - ab)) {
        const candidates = ctx.templates
          .filter((t) => triggerMatches(t, snap, side) && (templateUses[t.id] ?? 0) < 2)
          .slice()
          .sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : 1));
        const tmpl = candidates[0];
        if (tmpl) {
          pauses++;
          templateUses[tmpl.id] = (templateUses[tmpl.id] ?? 0) + 1;
          const vars = {
            pitcher: pitcher.name, batter: batter.name, inning,
            half: half === 'top' ? '上' : '下', outs, pitchCount,
            bullpen: ctx.coach.bullpen, scouting: ctx.coach.scouting,
            communication: ctx.coach.communication, intel: ctx.coach.intel,
            conditioning: ctx.coach.conditioning,
          };
          const options = tmpl.options.map((o) => ({
            id: o.id,
            label: o.label,
            odds: optionOdds(o, ctx.coach),
            preview: o.preview,
            lockedReason: o.action === 'PINCH_HIT' && bench.length === 0 ? '板凳沒有人了' : null,
          }));
          /** @type {DecisionPrompt} */
          const prompt = {
            rngKey: `${abKey}/decision`,
            kind: tmpl.kind,
            templateId: tmpl.id,
            title: interpolate(tmpl.title, vars),
            body: interpolate(tmpl.body, vars),
            context: snap,
            extra: null,
            options,
          };
          const resp = yield { t: 'DECISION', prompt };
          const chosenId = resp?.optionId ?? options[0]?.id ?? '';
          const chosen = tmpl.options.find((o) => o.id === chosenId) ?? tmpl.options[0];
          if (chosen) {
            const odds = optionOdds(chosen, ctx.coach);
            const success = makeRng(ctx.seed, `${abKey}/decision/roll`).bool(odds.final);
            applied = {
              action: chosen.action,
              success,
              text: interpolate(success ? chosen.successText : chosen.failText, vars),
              // 低機率＝大幅度。這是抄 yakyolife 的核心規則，也是讓「明碼成功率」
              // 真的有意義的關鍵：如果高機率選項同時給大加成，玩家永遠只要選最安全的，
              // 決策就不存在了。
              swing: SWING_BASE * (1 - chosen.baseRate),
            };
          }
        }
      }

      // ── 決策的直接後果 ──────────────────────────────────
      if (applied) {
        yield { t: 'SUBSTITUTION', narrative: applied.text };
        // 決策成敗會影響球員士氣。幅度跟該選項的成功率反向掛鉤，
        // 跟場中效果用同一套規則：賭得越大，士氣的擺盪也越大。
        moraleDelta += (applied.success ? 1 : -1) * (applied.swing / 30);

        if (applied.action === 'PULL_PITCHER' && !weBat) {
          const np = pickReliever(inning);
          if (np) {
            myPitcher = np;
            usedPitchers.add(np.id);
            myPitchCount = 0;
            yield { t: 'SUBSTITUTION', narrative: `投手換上 ${np.name}。` };
          }
        }
        if (applied.action === 'PINCH_HIT' && weBat && bench.length > 0) {
          const ph = bench.shift();
          if (ph) {
            lineup[myBatIdx % lineup.length] = ph;
            yield { t: 'SUBSTITUTION', narrative: `代打 ${ph.name} 上場。` };
          }
        }
        if (applied.action === 'IBB' && !weBat) {
          const r = advanceRunners(bases, 'BB', outs, 50, makeRng(ctx.seed, `${abKey}/ibb`));
          bases = r.bases; runsThem += r.runs;
          if (r.runs > 0 && isWalkOff(inning, half, weBat)) walkOff = true;
          myPitchCount += 4;
          oppBatIdx++;
          ab++;
          yield { t: 'PLAY', narrative: `故意四壞，${batter.name} 上一壘。`, snapshot: { ...snap, bases }, outcome: 'BB', runs: r.runs };
          if (walkOff) break;
          continue;
        }
        if (applied.action === 'STEAL' && weBat) {
          const before = bases[2];
          const r = applySteal(bases, applied.success);
          bases = r.bases;
          outs += r.outsAdded;
          // 盜本壘成功會得分
          const stoleHome = before && applied.success && !r.bases[2] && r.outsAdded === 0;
          const gained = stoleHome ? 1 : 0;
          runsUs += gained;
          if (gained > 0 && isWalkOff(inning, half, weBat)) walkOff = true;
          yield {
            t: 'PLAY',
            narrative: `${applied.text}（${r.note}）`,
            snapshot: { ...snap, bases, outs, runsUs },
            outcome: 'OUT_G',
            runs: gained,
          };
          if (outs >= 3 || walkOff) break;
          // 盜壘不消耗打席，同一名打者繼續打
          continue;
        }
        if (applied.action === 'BUNT' && weBat) {
          const r = applyBunt(bases, applied.success);
          bases = r.bases; runsUs += r.runs; outs += r.outsAdded;
          if (r.runs > 0 && isWalkOff(inning, half, weBat)) walkOff = true;
          oppPitchCount += 2;
          myBatIdx++;
          ab++;
          yield { t: 'PLAY', narrative: applied.text, snapshot: { ...snap, bases, outs }, outcome: 'OUT_G', runs: r.runs };
          if (outs >= 3 || walkOff) break;
          continue;
        }
      }

      // ── 打席解算 ────────────────────────────────────────
      const defenseField = weBat
        ? ctx.nation.strength
        : lineup.reduce((s, p) => s + p.ratings.bat.field, 0) / lineup.length;

      // 決策成功／失敗轉成這個打席的手感修正，幅度由該選項的成功率反向決定
      const sw = applied ? applied.swing : 0;
      const decisionForm = applied
        ? (applied.success ? (weBat ? sw : -sw) : (weBat ? -sw : sw))
        : 0;
      const shiftBonus = applied && applied.action === 'SHIFT'
        ? (applied.success ? -sw : sw) : 0;

      const batterAdj = decisionForm === 0 && shiftBonus === 0
        ? batter
        : { ...batter, condition: { ...batter.condition, form: batter.condition.form + decisionForm + shiftBonus } };

      const pa = resolvePlateAppearance({
        batter: batterAdj,
        pitcher,
        defenseField,
        opponentStrength: ctx.nation.strength,
        coach: ctx.coach,
        weAreBatting: weBat,
        pitchCount,
      }, makeRng(ctx.seed, abKey));

      const pitches = 3 + (pa.outcome === 'K' ? 2 : 0) + (pa.outcome === 'BB' ? 3 : 0)
        + makeRng(ctx.seed, `${abKey}/pitches`).int(0, 4);
      if (weBat) {
        oppPitchCount += pitches;
      } else {
        myPitchCount += pitches;
        myPitchCounts[pitcher.id] = (myPitchCounts[pitcher.id] ?? 0) + pitches;
      }

      const runnerSpeed = weBat
        ? lineup.reduce((s, p) => s + p.ratings.bat.speed, 0) / lineup.length
        : ctx.nation.strength;
      const adv = advanceRunners(
        bases, pa.outcome, outs, runnerSpeed, makeRng(ctx.seed, `${abKey}/adv`),
        weBat ? stance : STANCE.balanced,
      );
      bases = adv.bases;
      outs += adv.outsAdded;
      if (weBat) runsUs += adv.runs; else runsThem += adv.runs;
      if (adv.runs > 0 && isWalkOff(inning, half, weBat)) walkOff = true;

      if (weBat && adv.runs > 0) contribution[batter.id] = (contribution[batter.id] ?? 0) + adv.runs;
      if (weBat && ['1B', '2B', '3B', 'HR'].includes(pa.outcome)) {
        contribution[batter.id] = (contribution[batter.id] ?? 0) + 1;
      }

      const label = OUTCOME_LABEL[pa.outcome];
      const narrative = adv.note
        ? `${batter.name} ${adv.note}！`
        : `${batter.name} ${label}${adv.runs > 0 ? `，回來 ${adv.runs} 分` : ''}。`;

      if (weBat && (pa.outcome === 'HR' || adv.runs >= 2)) {
        highlights.push(`${inning} 局${half === 'top' ? '上' : '下'}　${narrative}`);
      }

      yield {
        t: 'PLAY',
        narrative,
        snapshot: { ...snap, bases, outs, runsUs, runsThem },
        outcome: pa.outcome,
        runs: adv.runs,
      };

      if (weBat) myBatIdx++; else oppBatIdx++;
      ab++;
      // 再見分：主隊在九局下（含延長）超前的瞬間比賽就結束，不再打完這個半局。
      if (walkOff) {
        yield { t: 'SUBSTITUTION', narrative: '再見分！比賽在這裡結束。' };
        break;
      }

      // 我方投手爆量自動換投（沒問玩家，因為這已經不是決策而是常識）
      if (!weBat && myPitcher && myPitchCount >= pullLimit(myPitcher)) {
        const np = pickReliever(inning);
        if (np) {
          myPitcher = np;
          usedPitchers.add(np.id);
          myPitchCount = 0;
          yield { t: 'SUBSTITUTION', narrative: `${np.name} 接替登板。` };
        }
      }
      // 對手也依同一套角色門檻換投，否則對方的後援會被留到破百球。
      const oppCurrent = at(opp.pitchers, oppPitcherIdx);
      if (weBat && oppPitchCount >= pullLimit(oppCurrent) && oppPitcherIdx < opp.pitchers.length - 1) {
        oppPitcherIdx++;
        oppPitchCount = 0;
      }
      if (ab > 24) break; // 安全閥：單一半局不可能無限延長
    }

    yield {
      t: 'HALF_END',
      snapshot: { inning, half, outs, bases: [false, false, false], runsUs, runsThem, pitcher: null, batter: null, pitchCount: 0 },
    };
  }

  // ── 主迴圈 ────────────────────────────────────────────────
  let inning = 1;
  for (; inning <= MAX_INNINGS; inning++) {
    const remaining = Math.max(6, (9 - inning + 1) * 7);

    // 客隊先攻
    yield* halfInning(!ctx.weAreHome, inning, remaining);
    // 提前結束：主隊在 9 局後領先，客隊打完就結束（主隊不必再進攻）
    if (inning >= 9 && ((ctx.weAreHome && runsUs > runsThem) || (!ctx.weAreHome && runsThem > runsUs))) break;

    yield* halfInning(ctx.weAreHome, inning, remaining);
    if (walkOff) break;

    // 提前勝利（10 分差、7 局後）
    if (inning >= 7 && Math.abs(runsUs - runsThem) >= 10) break;
    if (inning >= 9 && runsUs !== runsThem) break;
  }

  const win = runsUs > runsThem;
  /** @type {?PlayerId} */
  let mvp = null;
  let best = 0;
  for (const id of Object.keys(contribution).sort()) {
    const v = contribution[id] ?? 0;
    if (v > best) { best = v; mvp = /** @type {PlayerId} */ (id); }
  }

  /** @type {GameResult} */
  const result = {
    index: ctx.index,
    stageId: ctx.stageId,
    opponent: ctx.nation.code,
    runsFor: runsUs,
    runsAgainst: runsThem,
    win,
    highlights: highlights.slice(0, 4),
    mvp,
    // 帶出去給賽後處理用：傷病風險要跟球數掛鉤，跨場次疲勞也要靠它累積。
    // 沒有這些，「續投王牌會提高傷病風險」「士氣上升」就只是面板上的空話。
    pitchCounts: myPitchCounts,
    moraleDelta: Math.round(moraleDelta * 10) / 10,
  };
  yield { t: 'GAME_END', result };
  return result;
}
