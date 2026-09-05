// @ts-check
import { reactive } from 'vue';
import { decodeSeed, encodeSeed, seedFromPhrase, looksLikeSeedCode, SEED_CODE_VERSION } from '../core/rng/seedCode.js';
import { newCareer, runCareer } from '../core/career/career.js';
import { makeSave, exportSaveString } from '../core/save/save.js';

/** @typedef {import('../core/domain/types.js').CareerEvent} CareerEvent */
/** @typedef {import('../core/domain/types.js').CareerState} CareerState */
/** @typedef {import('../core/domain/types.js').DecisionPrompt} DecisionPrompt */
/** @typedef {import('../core/domain/types.js').GameSnapshot} GameSnapshot */

/** 播報速度（毫秒／則）。 */
export const SPEEDS = /** @type {const} */ ([
  { id: 'slow',   label: '慢',  ms: 620 },
  { id: 'normal', label: '正常', ms: 260 },
  { id: 'fast',   label: '快',  ms: 70 },
  { id: 'skip',   label: '跳過', ms: 0 },
]);

/**
 * @typedef {object} FeedItem
 * @property {number} id
 * @property {CareerEvent} event
 */

export const store = reactive({
  /** @type {'title'|'playing'|'ended'} */
  screen: 'title',
  coachName: '',
  seedInput: '',
  error: '',

  /** @type {CareerState|null} */
  state: null,
  /** @type {FeedItem[]} */
  feed: [],
  /** @type {DecisionPrompt|null} */
  prompt: null,
  /** @type {GameSnapshot|null} */
  snapshot: null,

  // 當前比賽的抬頭
  opponentName: '',
  stageName: '',
  venue: '',
  runsUs: 0,
  runsThem: 0,

  speedId: /** @type {string} */ ('normal'),
  draining: false,
  shareString: '',
  /** @type {{id:string,title:string,text:string}|null} */
  ending: null,
});

// ── 內部狀態（刻意不放進 reactive：generator 不該被 Vue 代理） ──
/** @type {ReturnType<typeof runCareer>|null} */
let iter = null;
/** @type {CareerEvent[]} */
let buffer = [];
/** @type {DecisionPrompt|null} */
let heldPrompt = null;
/** @type {{seq:number, anchor:string, choiceId:string}[]} */
let decisions = [];
let feedId = 0;
let timer = /** @type {any} */ (null);
let seedCode = '';

/** @returns {number} */
function speedMs() {
  return SPEEDS.find((s) => s.id === store.speedId)?.ms ?? 260;
}

/**
 * 產生一個隨機種子。這是遊戲裡唯一容許非決定性的地方，
 * 而且刻意放在 core 外面 —— core 永遠只消費「被給定的」種子。
 * @returns {string}
 */
export function randomSeedCode() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const seed = ((buf[0] ?? 0) * 256 + ((buf[1] ?? 0) & 0xff)) % 2 ** 40;
  return encodeSeed({ version: SEED_CODE_VERSION, seed });
}

/**
 * 把使用者輸入解讀成種子。輸入看起來像種子碼就照解，否則當成自訂片語。
 * @param {string} raw
 * @returns {{seed:number, code:string}}
 */
export function resolveSeed(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    const code = randomSeedCode();
    return { seed: decodeSeed(code).seed, code };
  }
  if (looksLikeSeedCode(trimmed)) {
    const { seed } = decodeSeed(trimmed);
    return { seed, code: encodeSeed({ version: SEED_CODE_VERSION, seed }) };
  }
  const info = seedFromPhrase(trimmed);
  return { seed: info.seed, code: encodeSeed(info) };
}

/** 開始一段新生涯。 */
export function start() {
  store.error = '';
  let resolved;
  try {
    resolved = resolveSeed(store.seedInput);
  } catch (e) {
    store.error = e instanceof Error ? e.message : String(e);
    return;
  }
  seedCode = resolved.code;
  const name = store.coachName.trim() || '無名教頭';

  const initial = newCareer(resolved.seed, name);
  iter = runCareer(initial);
  buffer = [];
  heldPrompt = null;
  decisions = [];
  feedId = 0;
  store.state = initial;
  store.feed = [];
  store.prompt = null;
  store.snapshot = null;
  store.ending = null;
  store.shareString = '';
  store.runsUs = 0;
  store.runsThem = 0;
  store.screen = 'playing';

  pump(undefined);
  drain();
}

/**
 * 推進 generator，直到遇到決策點或結束。事件先進 buffer，由 drain() 逐則放進畫面——
 * 這樣玩家會先看到「發生了什麼」，才被問「你要怎麼辦」。
 * @param {import('../core/domain/types.js').DecisionResponse|undefined} input
 */
function pump(input) {
  if (!iter) return;
  for (let guard = 0; guard < 100000; guard++) {
    const step = iter.next(input);
    input = undefined;
    if (step.done) { store.state = step.value; return; }
    const ev = step.value;
    if (ev.t === 'DECISION') { heldPrompt = ev.prompt; return; }
    buffer.push(ev);
    if (ev.t === 'STATE') store.state = ev.state;
  }
}

/** 把 buffer 依速度逐則搬進畫面。 */
function drain() {
  if (timer) { clearTimeout(timer); timer = null; }
  store.draining = true;

  const step = () => {
    const ms = speedMs();
    // 跳過模式：一次全倒完，不做動畫。
    const batch = ms === 0 ? buffer.length : 1;
    for (let i = 0; i < batch && buffer.length; i++) {
      const ev = buffer.shift();
      if (ev) applyToView(ev);
    }
    if (buffer.length > 0) {
      timer = setTimeout(step, ms || 0);
    } else {
      store.draining = false;
      store.prompt = heldPrompt;
      if (store.state?.ending) {
        store.ending = store.state.ending;
        store.screen = 'ended';
        void buildShare();
      }
    }
  };
  step();
}

/**
 * @param {CareerEvent} ev
 */
function applyToView(ev) {
  switch (ev.t) {
    case 'GAME_START':
      store.opponentName = ev.opponentName;
      store.stageName = ev.stageName;
      store.venue = ev.venue;
      store.runsUs = 0;
      store.runsThem = 0;
      store.snapshot = null;
      break;
    case 'PLAY':
      store.snapshot = ev.snapshot;
      store.runsUs = ev.snapshot.runsUs;
      store.runsThem = ev.snapshot.runsThem;
      break;
    case 'HALF_END':
      store.snapshot = ev.snapshot;
      break;
    case 'GAME_END':
      store.runsUs = ev.result.runsFor;
      store.runsThem = ev.result.runsAgainst;
      store.snapshot = null;
      break;
    default:
      break;
  }
  // HALF_END 太多會把敘事沖掉，只保留有內容的事件。
  if (ev.t !== 'STATE') store.feed.push({ id: feedId++, event: ev });
}

/**
 * 玩家做出選擇。
 * @param {string} optionId
 */
export function choose(optionId) {
  if (!heldPrompt) return;
  decisions.push({ seq: decisions.length, anchor: heldPrompt.rngKey, choiceId: optionId });
  const resp = { promptKey: heldPrompt.rngKey, optionId };
  heldPrompt = null;
  store.prompt = null;
  pump(resp);
  drain();
}

/** @param {string} id */
export function setSpeed(id) {
  store.speedId = id;
  if (store.draining) drain();
}

async function buildShare() {
  const save = makeSave({ seedCode, coachName: store.coachName.trim() || '無名教頭', decisions });
  try {
    store.shareString = await exportSaveString(save);
  } catch (e) {
    // 不要靜默失敗。按鈕消失而沒有說明，玩家不知道發生什麼事，我也收不到回報。
    store.shareString = '';
    store.error = `存檔匯出失敗：${e instanceof Error ? e.message : String(e)}`;
  }
}

export function currentSeedCode() { return seedCode; }
export function decisionCount() { return decisions.length; }

/** 回到標題畫面。 */
export function reset() {
  if (timer) clearTimeout(timer);
  iter = null; buffer = []; heldPrompt = null; decisions = [];
  store.screen = 'title';
  store.feed = [];
  store.prompt = null;
  store.ending = null;
}
