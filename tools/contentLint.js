// @ts-check
/**
 * 內容靜態檢查。
 *
 *   node tools/contentLint.js
 *
 * 這裡擋的都是「不會讓程式壞掉，但會讓遊戲變爛」的問題：
 * 模板變數打錯字（玩家看到 {{pitcher}} 四個字）、機率設成 0%（選項永遠失敗）、
 * 真實球員姓名混進資料（法務與品味底線）。
 * 這種東西靠人記是記不住的，要靠工具擋。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DECISION_TEMPLATES } from '../content/data/decisions.js';
import { ARCHETYPES } from '../content/data/archetypes.js';
import { NATIONS, NATION_BY_CODE } from '../content/data/nations.js';
import { CALENDAR, selectKeyGames } from '../content/data/calendar.js';
import { EVENT_CARDS } from '../content/data/events.js';
import { STATE_PATHS } from '../core/effects/apply.js';
import { ENDING_IDS } from '../core/career/endings.js';
import { BLOCKED_NAMES, NAMES } from '../content/data/names.js';
import { templateVars } from '../core/content/template.js';
import { TUNING } from '../content/tuning.js';

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

/** @param {boolean} ok @param {string} msg */
const check = (ok, msg) => { if (!ok) errors.push(msg); };
/** @param {boolean} ok @param {string} msg */
const warn = (ok, msg) => { if (!ok) warnings.push(msg); };

// ── 決策模板 ────────────────────────────────────────────────
const KNOWN_VARS = new Set([
  'pitcher', 'batter', 'inning', 'half', 'outs', 'pitchCount',
  'bullpen', 'scouting', 'communication', 'conditioning', 'intel',
]);

const seenIds = new Set();
for (const t of DECISION_TEMPLATES) {
  check(!seenIds.has(t.id), `決策模板 id 重複：${t.id}`);
  seenIds.add(t.id);
  check(t.options.length >= 2, `${t.id}：至少要有 2 個選項，否則不是決策`);

  for (const v of [...templateVars(t.title), ...templateVars(t.body)]) {
    check(KNOWN_VARS.has(v), `${t.id}：模板變數 {{${v}}} 沒有對應的資料，玩家會看到原始字串`);
  }

  const optIds = new Set();
  for (const o of t.options) {
    check(!optIds.has(o.id), `${t.id}：選項 id 重複 ${o.id}`);
    optIds.add(o.id);
    check(o.baseRate >= 0.05 && o.baseRate <= 0.95,
      `${t.id}/${o.id}：baseRate ${o.baseRate} 超出 [0.05, 0.95]`);
    check(o.successText.length > 0 && o.failText.length > 0,
      `${t.id}/${o.id}：成功／失敗都必須有敘事，數字沒有敘事是沒有記憶點的`);
    warn(o.preview.length > 0, `${t.id}/${o.id}：沒有 preview，玩家不知道賭的是什麼`);

    for (const text of [o.successText, o.failText, o.label]) {
      for (const v of templateVars(text)) {
        check(KNOWN_VARS.has(v), `${t.id}/${o.id}：模板變數 {{${v}}} 無對應資料`);
      }
    }
    for (const r of o.rateMods ?? []) {
      check(r.from !== 'coachAttr' || !!r.attr, `${t.id}/${o.id}：coachAttr 修正缺少 attr`);
      check(Math.abs(r.points) <= 40, `${t.id}/${o.id}：單一修正 ${r.points} 點過大，會蓋掉基準機率`);
    }
  }

  // yakyolife 的核心規則：機率越低，幅度越大。引擎用 (1 − baseRate) 自動換算幅度，
  // 所以這裡只要確認選項之間的機率真的有拉開，決策才有取捨。
  const rates = t.options.map((o) => o.baseRate).slice().sort((a, b) => a - b);
  const spread = (rates[rates.length - 1] ?? 0) - (rates[0] ?? 0);
  warn(spread >= 0.08, `${t.id}：選項成功率只差 ${(spread * 100).toFixed(0)} 個百分點，選哪個都差不多`);
}

// ── 賽事日曆 ─────────────────────────────────────────────────
const seenTournaments = new Set();
for (const def of CALENDAR) {
  check(!seenTournaments.has(def.id), `賽事 id 重複：${def.id}`);
  seenTournaments.add(def.id);

  let games = 0;
  for (const st of def.stages) {
    games += st.opponents.length;
    for (const code of st.opponents) {
      check(NATION_BY_CODE.has(code), `${def.id}/${st.id} 引用了不存在的國家代號 ${code}`);
    }
    check(st.minWins >= 1 && st.minWins <= st.opponents.length,
      `${def.id}/${st.id}：晉級門檻 ${st.minWins} 勝但只有 ${st.opponents.length} 場`);
  }
  check(games >= 3, `${def.id} 只有 ${games} 場，太短`);
  warn(games <= 10, `${def.id} 有 ${games} 場，可能太長`);

  // 每個淘汰名次都要有對應的獎勵，否則結算時會抓不到
  const rankNums = new Set(def.rankRewards.map((r) => r.rank));
  rankNums.add(1);
  for (const st of def.stages) {
    check(rankNums.has(st.eliminatedRankNum),
      `${def.id}/${st.id}：淘汰名次 ${st.eliminatedRankNum} 在 rankRewards 裡沒有對應獎勵`);
  }
  // 每個名次都要有聲望變化，否則會靜默當成 0
  for (const r of def.rankRewards) {
    check(def.prestige[r.rank] !== undefined,
      `${def.id}：名次 ${r.rank}（${r.label}）沒有定義聲望變化`);
  }
  // 重點戰數量要符合等級
  const want = def.tier === 1 ? 2 : 1;
  check(selectKeyGames(def).size === want,
    `${def.id}：等級 ${def.tier} 應有 ${want} 場重點戰，實得 ${selectKeyGames(def).size}`);
  check(def.intro.length > 20, `${def.id}：intro 太短，開場沒有敘事`);
}

// 條件分支要接得起來：有 requiresFlag 的賽事，一定要有別的賽事會掛上那個 flag
for (const def of CALENDAR) {
  if (!def.requiresFlag) continue;
  const provider = CALENDAR.some((d) => d.stake === 'ticket');
  check(provider, `${def.id} 需要 flag「${def.requiresFlag}」，但沒有任何賽事會掛上它`);
}

// ── 事件卡 ───────────────────────────────────────────────────
const seenCards = new Set();
for (const c of EVENT_CARDS) {
  check(!seenCards.has(c.id), `事件卡 id 重複：${c.id}`);
  seenCards.add(c.id);
  check(c.weight > 0, `${c.id} 權重為 0，永遠不會被抽到`);
  check(c.options.length >= 2, `${c.id}：至少要有 2 個選項`);
  check(c.body.length > 20, `${c.id}：body 太短`);

  const optIds = new Set();
  for (const o of c.options) {
    check(!optIds.has(o.id), `${c.id}：選項 id 重複 ${o.id}`);
    optIds.add(o.id);
    check(o.baseRate >= 0.05 && o.baseRate <= 0.95, `${c.id}/${o.id}：baseRate ${o.baseRate} 超出範圍`);
    check(o.preview.length >= 1, `${c.id}/${o.id}：沒有 preview，玩家不知道賭的是什麼`);
    check(o.successText.length > 0 && o.failText.length > 0, `${c.id}/${o.id}：成功與失敗都要有敘事`);
    check(o.onSuccess.length > 0 || o.onFail.length > 0, `${c.id}/${o.id}：兩邊都沒有效果，選了等於沒選`);

    // cast 引用不可越界，否則 Effect 會靜默失效
    for (const fx of [...o.onSuccess, ...o.onFail]) {
      if ('target' in fx) {
        check(fx.target < c.cast.length,
          `${c.id}/${o.id}：Effect 指向 cast[${fx.target}]，但這張卡只定義了 ${c.cast.length} 個角色`);
      }
    }
  }
  // 模板變數要有對應的 cast
  for (const text of [c.body, ...c.options.flatMap((o) => [o.successText, o.failText])]) {
    for (const m of text.matchAll(/\{\{cast(\d)\}\}/g)) {
      check(Number(m[1]) < c.cast.length,
        `${c.id}：文字引用 {{cast${m[1]}}} 但只定義了 ${c.cast.length} 個角色`);
    }
  }
  // requires 的 path 要合法
  if (c.requires && (c.requires.op === 'gte' || c.requires.op === 'lte')) {
    check(STATE_PATHS.includes(c.requires.path),
      `${c.id}：requires 用了不存在的 path「${c.requires.path}」`);
  }
}
warn(EVENT_CARDS.length >= 8, `事件卡只有 ${EVENT_CARDS.length} 張，一屆抽兩張很快就重複`);

// ── 球員原型：必須湊得出合法名單 ────────────────────────────
const QUOTA_POSITIONS = ['SP', 'RP', 'CP', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
for (const pos of QUOTA_POSITIONS) {
  const eligible = ARCHETYPES.filter((a) => a.positions.includes(/** @type {any} */ (pos)));
  check(eligible.length > 0, `沒有任何原型可以守 ${pos}，球員池會生不出這個位置`);
}
for (const a of ARCHETYPES) {
  check(a.weight > 0, `原型 ${a.id} 權重為 0，永遠不會出現`);
  check(a.ageRange[0] < a.ageRange[1], `原型 ${a.id} 年齡區間不合法`);
  check(a.clubs.length > 0, `原型 ${a.id} 沒有球團名`);
}

// ── 真實球員姓名黑名單（法務與品味底線）────────────────────
/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

for (const f of [...walk('content'), ...walk('core')]) {
  const src = readFileSync(f, 'utf8');
  for (const name of BLOCKED_NAMES) {
    // names.js 本身就是黑名單所在地，跳過。
    if (f.endsWith('names.js')) continue;
    check(!src.includes(name), `${f} 出現了真實球員姓名「${name}」—— 本作所有球員必須是虛構的`);
  }
}

// 姓名產生器的組合空間要夠大，否則同一池裡會一直撞名
const combos = NAMES.surnames.length * NAMES.givenChars.length * NAMES.givenChars.length;
check(combos > TUNING.pool.size * 200,
  `姓名組合只有 ${combos} 種，40 人池容易撞名（建議 > ${TUNING.pool.size * 200}）`);

// ── 輸出 ────────────────────────────────────────────────────
console.log(`檢查 ${CALENDAR.length} 個賽事、${EVENT_CARDS.length} 張事件卡、`
  + `${DECISION_TEMPLATES.length} 個決策模板、${ARCHETYPES.length} 個球員原型、`
  + `${NATIONS.length} 個國家、${BLOCKED_NAMES.length} 筆姓名黑名單、`
  + `${ENDING_IDS.length} 個結局。
`);

for (const w of warnings) console.log(`⚠️  ${w}`);
if (warnings.length) console.log();

if (errors.length === 0) {
  console.log('✅ 內容檢查通過');
} else {
  for (const e of errors) console.log(`❌ ${e}`);
  console.log(`\n${errors.length} 個問題`);
  process.exitCode = 1;
}
