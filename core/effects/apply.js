// @ts-check
import { clamp } from '../odds/odds.js';
import { overall } from '../career/generate.js';

/**
 * 內容 → 狀態的唯一通道。
 *
 * 事件卡與決策模板不能直接操作 CareerState，只能宣告 `Effect[]`，由這裡執行。
 * 這是「新增 60 張卡不用碰一行引擎程式碼」的前提 ——
 * 一旦有卡片開始直接改 state，內容與引擎就黏死了。
 *
 * 注意：引擎自己的機制（賽後處理、能力點分配、名次結算）當然是直接改 state 的，
 * 這條規則約束的是**內容**，不是引擎。
 */

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').Effect} Effect */
/** @typedef {import('../domain/types.js').Predicate} Predicate */
/** @typedef {import('../domain/types.js').Player} Player */
/** @typedef {import('../domain/types.js').PlayerId} PlayerId */
/** @typedef {import('../domain/types.js').NarrativeEntry} NarrativeEntry */
/** @typedef {import('../rng/rng.js').Rng} Rng */

/**
 * 可以被 Predicate 讀取的路徑。用固定清單而不是任意字串，
 * 這樣打錯字會被 contentLint 抓到，而不是在執行期靜默回傳 undefined。
 * @param {CareerState} st
 * @param {string} path
 * @returns {?number}
 */
export function readPath(st, path) {
  switch (path) {
    case 'coach.meters.publicApproval': return st.coach.meters.publicApproval;
    case 'coach.meters.assocTrust': return st.coach.meters.assocTrust;
    case 'coach.meters.playerMorale': return st.coach.meters.playerMorale;
    case 'coach.prestige': return st.coach.prestige;
    case 'coach.unspentPoints': return st.coach.unspentPoints;
    case 'coach.attrs.bullpen': return st.coach.attrs.bullpen;
    case 'coach.attrs.scouting': return st.coach.attrs.scouting;
    case 'coach.attrs.communication': return st.coach.attrs.communication;
    case 'coach.attrs.conditioning': return st.coach.attrs.conditioning;
    case 'coach.attrs.intel': return st.coach.attrs.intel;
    case 'year': return st.year;
    default: return null;
  }
}

/** 所有合法的 StatePath。contentLint 會用它檢查內容有沒有打錯字。 */
export const STATE_PATHS = [
  'coach.meters.publicApproval', 'coach.meters.assocTrust', 'coach.meters.playerMorale',
  'coach.prestige', 'coach.unspentPoints',
  'coach.attrs.bullpen', 'coach.attrs.scouting', 'coach.attrs.communication',
  'coach.attrs.conditioning', 'coach.attrs.intel',
  'year',
];

/**
 * @param {Predicate} p
 * @param {CareerState} st
 * @returns {boolean}
 */
export function evalPredicate(p, st) {
  switch (p.op) {
    case 'always': return true;
    case 'gte': return (readPath(st, p.path) ?? 0) >= p.value;
    case 'lte': return (readPath(st, p.path) ?? 0) <= p.value;
    case 'hasFlag': return st.coach.flags.includes(p.flag);
    case 'not': return !evalPredicate(p.of, st);
    case 'and': return p.of.every((q) => evalPredicate(q, st));
    case 'or': return p.of.some((q) => evalPredicate(q, st));
    default: return false;
  }
}

/**
 * 依 CastSpec 從球員池挑人。
 *
 * 迭代一律走 poolOrder，不用 Object.keys —— 順序必須是決定性的。
 *
 * @param {readonly import('../domain/types.js').CastSpec[]} specs
 * @param {CareerState} st
 * @param {Rng} rng
 * @returns {Player[]}
 */
export function selectCast(specs, st, rng) {
  const pool = st.poolOrder
    .map((id) => st.players[id])
    .filter(/** @returns {p is Player} */ (p) => !!p);
  const inRoster = st.roster
    ? pool.filter((p) => st.roster?.members.includes(p.id))
    : pool;
  const from = inRoster.length > 0 ? inRoster : pool;

  /** @type {Player[]} */
  const out = [];
  for (const [i, spec] of specs.entries()) {
    const avail = from.filter((p) => !out.includes(p));
    if (avail.length === 0) break;

    // 一律 .slice().sort() 寫在同一行 —— 讓「不會改到來源陣列」在呼叫點就看得出來，
    // 純度掃描也才驗得過。同分時用 id 決勝，確保選角是決定性的。
    /** @type {Player[]} */
    let ranked;
    switch (spec.pick) {
      case 'acePitcher':
        ranked = avail.slice().sort((a, b) => {
          const pa = ['SP', 'RP', 'CP'].includes(a.primary) ? overall(a) : -1;
          const pb = ['SP', 'RP', 'CP'].includes(b.primary) ? overall(b) : -1;
          return pb - pa || (a.id < b.id ? -1 : 1);
        });
        break;
      case 'worstForm':
        ranked = avail.slice().sort(
          (a, b) => a.condition.form - b.condition.form || (a.id < b.id ? -1 : 1),
        );
        break;
      case 'oldestOver':
        ranked = avail.slice().sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1));
        break;
      default:
        // randomPlayer：先穩定排序再抽，確保同一個種子每次抽到同一個人
        ranked = avail.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
        out.push(rng.fork(`cast/${i}`).pick(ranked));
        continue;
    }
    const first = ranked[0];
    if (first) out.push(first);
  }
  return out;
}

/**
 * 套用一組 Effect。回傳新的 state 與給玩家看的變化說明。
 *
 * @param {CareerState} st
 * @param {readonly Effect[]} effects
 * @param {{cast: readonly Player[], rng: Rng, attrLabel: Record<string,string>}} ctx
 * @returns {{state: CareerState, deltas: string[]}}
 */
export function applyEffects(st, effects, ctx) {
  /** @type {string[]} */
  const deltas = [];
  /** @type {any} */
  let attrs = { ...st.coach.attrs };
  let meters = { ...st.coach.meters };
  let prestige = st.coach.prestige;
  let unspentPoints = st.coach.unspentPoints;
  let flags = st.coach.flags.slice();
  /** @type {Record<PlayerId, Player>} */
  const players = { ...st.players };

  /** @param {number} i */
  const target = (i) => ctx.cast[i] ?? null;

  for (const fx of effects) {
    switch (fx.t) {
      case 'coachAttr': {
        attrs[fx.attr] = clamp(attrs[fx.attr] + fx.delta, 1, 99);
        deltas.push(`${ctx.attrLabel[fx.attr] ?? fx.attr} ${fx.delta > 0 ? '+' : ''}${fx.delta}`);
        break;
      }
      case 'meter': {
        const label = { publicApproval: '民調', assocTrust: '協會信任', playerMorale: '士氣' }[fx.meter];
        meters = { ...meters, [fx.meter]: clamp(meters[fx.meter] + fx.delta, 0, 100) };
        deltas.push(`${label} ${fx.delta > 0 ? '+' : ''}${fx.delta}`);
        break;
      }
      case 'prestige': {
        prestige = clamp(prestige + fx.delta, 0, 100);
        deltas.push(`聲望 ${fx.delta > 0 ? '+' : ''}${fx.delta}`);
        break;
      }
      case 'points': {
        unspentPoints = Math.max(0, unspentPoints + fx.delta);
        deltas.push(`能力點 ${fx.delta > 0 ? '+' : ''}${fx.delta}`);
        break;
      }
      case 'playerForm': {
        const p = target(fx.target);
        if (!p) break;
        players[p.id] = {
          ...p,
          condition: { ...p.condition, form: clamp(p.condition.form + fx.delta, -10, 10) },
        };
        deltas.push(`${p.name} 手感 ${fx.delta > 0 ? '+' : ''}${fx.delta}`);
        break;
      }
      case 'playerRating': {
        const p = target(fx.target);
        if (!p) break;
        /** @type {any} */
        const group = { ...p.ratings[fx.group] };
        if (typeof group[fx.key] !== 'number') break;
        group[fx.key] = clamp(group[fx.key] + fx.delta, 1, 99);
        players[p.id] = { ...p, ratings: { ...p.ratings, [fx.group]: group } };
        deltas.push(`${p.name} ${fx.key} ${fx.delta > 0 ? '+' : ''}${fx.delta}`);
        break;
      }
      case 'playerLoyalty': {
        const p = target(fx.target);
        if (!p) break;
        players[p.id] = { ...p, loyalty: clamp(p.loyalty + fx.delta, 0, 100) };
        deltas.push(`${p.name} 應召意願 ${fx.delta > 0 ? '+' : ''}${fx.delta}`);
        break;
      }
      case 'injure': {
        const p = target(fx.target);
        if (!p || p.condition.injury) break;
        const games = ctx.rng.fork(`injure/${p.id}`).int(fx.games[0], fx.games[1] + 1);
        players[p.id] = {
          ...p,
          condition: { ...p.condition, injury: { code: 'EVENT', gamesOut: games, severity: fx.severity } },
        };
        deltas.push(`${p.name} 受傷，休 ${games} 場`);
        break;
      }
      case 'flag': {
        for (const f of fx.add ?? []) if (!flags.includes(f)) flags.push(f);
        for (const f of fx.remove ?? []) flags = flags.filter((x) => x !== f);
        break;
      }
      case 'narrative': {
        deltas.push(fx.text);
        break;
      }
    }
  }

  return {
    state: {
      ...st,
      players,
      coach: { ...st.coach, attrs, meters, prestige, unspentPoints, flags },
    },
    deltas,
  };
}
