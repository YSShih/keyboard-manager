// @ts-check
import { decodeSeed } from '../rng/seedCode.js';
import { newCareer, runCareer } from '../career/career.js';

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').CareerEvent} CareerEvent */

/** 引擎版本。改動會影響既有種子重播結果時才 +1。 */
export const ENGINE_VERSION = '0.1.0';
export const SAVE_FORMAT_VERSION = 1;

/**
 * @typedef {object} DecisionRecord
 * @property {number} seq
 * @property {string} anchor  該決策點的 RNG key，重播時的完整性錨點
 * @property {string} choiceId
 */

/**
 * @typedef {object} SaveFile
 * @property {number} formatVersion
 * @property {string} seedCode
 * @property {string} coachName
 * @property {string} engineVersion
 * @property {{id:string, version:string}} contentPack
 * @property {DecisionRecord[]} decisions
 * @property {string} checksum
 */

/**
 * 存檔＝種子＋有序決策紀錄，不存狀態快照。
 *
 * 為什麼：狀態樹又大又會隨版本改結構，而且沒辦法序列化 generator。
 * 決定論成立的前提下，「種子 + 你按過的每一個按鈕」就足以完整重建整段人生，
 * 而且順便得到賽後重播的能力。無渲染重跑一整段生涯是毫秒級。
 *
 * @param {object} o
 * @param {string} o.seedCode
 * @param {string} o.coachName
 * @param {DecisionRecord[]} o.decisions
 * @returns {SaveFile}
 */
export function makeSave({ seedCode, coachName, decisions }) {
  /** @type {Omit<SaveFile, 'checksum'>} */
  const body = {
    formatVersion: SAVE_FORMAT_VERSION,
    seedCode,
    coachName,
    engineVersion: ENGINE_VERSION,
    contentPack: { id: 'bbm-content', version: 'v1' },
    decisions,
  };
  return { ...body, checksum: checksum(canonical(body)) };
}

/**
 * 穩定序列化（key 排序），確保 checksum 不會因為屬性順序而改變。
 * @param {unknown} v
 * @returns {string}
 */
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const obj = /** @type {Record<string, unknown>} */ (v);
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

/**
 * @param {string} s
 * @returns {string}
 */
function checksum(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/**
 * @param {SaveFile} save
 * @returns {boolean}
 */
export function verifySave(save) {
  const { checksum: given, ...body } = save;
  return checksum(canonical(body)) === given;
}

/**
 * 重播一份存檔。
 *
 * 每一步都比對 prompt.rngKey 是否等於當初記下的 anchor。不符就明確報錯，
 * **不要**默默用錯的答案繼續跑出一段假的人生——那比直接說「存檔不相容」糟糕得多。
 *
 * @param {SaveFile} save
 * @returns {{state: CareerState, events: CareerEvent[], truncated: boolean}}
 */
export function replaySave(save) {
  if (!verifySave(save)) throw new Error('存檔校驗失敗：內容可能被修改過。');
  if (save.formatVersion !== SAVE_FORMAT_VERSION) {
    throw new Error(`存檔格式版本 ${save.formatVersion} 與目前引擎（${SAVE_FORMAT_VERSION}）不相容。`);
  }
  const { seed } = decodeSeed(save.seedCode);
  const it = runCareer(newCareer(seed, save.coachName));
  /** @type {CareerEvent[]} */
  const events = [];
  /** @type {import('../domain/types.js').DecisionResponse|undefined} */
  let input = undefined;
  let i = 0;

  for (let guard = 0; guard < 200000; guard++) {
    const step = it.next(input);
    input = undefined;
    if (step.done) return { state: step.value, events, truncated: false };
    events.push(step.value);
    if (step.value.t === 'DECISION') {
      const rec = save.decisions[i];
      if (!rec) return { state: /** @type {any} */ (null), events, truncated: true };
      if (rec.anchor !== step.value.prompt.rngKey) {
        throw new Error(
          `存檔與目前版本不相容：第 ${i} 個決策的位置對不上。\n`
          + `　存檔記錄：${rec.anchor}\n　目前引擎：${step.value.prompt.rngKey}`,
        );
      }
      input = { promptKey: rec.anchor, optionId: rec.choiceId };
      i++;
    }
  }
  throw new Error('重播未在步數上限內結束');
}

/** @param {Uint8Array<ArrayBufferLike>} buf @returns {string} */
function toBase64Url(buf) {
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} s @returns {Uint8Array<ArrayBuffer>} */
function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * 匯出成可以直接貼進聊天室的字串。
 *
 * 首字元標示編碼方式：'G' = gzip、'R' = 未壓縮。
 * 沒有 CompressionStream 的環境（舊瀏覽器）會走 'R'，字串大約長三倍但仍然可用。
 * 之前這裡是 try/catch 吞掉錯誤然後回傳空字串 —— 結果是分享按鈕靜默消失，
 * 玩家不知道發生什麼事，我也永遠不會收到回報。寧可給一條長一點的字串。
 *
 * @param {SaveFile} save
 * @returns {Promise<string>}
 */
export async function exportSaveString(save) {
  const bytes = new TextEncoder().encode(JSON.stringify(save));
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    void writer.write(bytes);
    void writer.close();
    return `G${toBase64Url(new Uint8Array(await new Response(cs.readable).arrayBuffer()))}`;
  }
  return `R${toBase64Url(bytes)}`;
}

/**
 * @param {string} s
 * @returns {Promise<SaveFile>}
 */
export async function importSaveString(s) {
  const kind = s[0];
  const body = s.slice(1);
  if (kind === 'R') return JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  if (kind !== 'G') throw new Error('存檔字串格式無法辨識，可能是複製時掉了字元。');
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('這個瀏覽器不支援 gzip 解壓，無法讀取壓縮過的存檔。');
  }
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  void writer.write(fromBase64Url(body));
  void writer.close();
  return JSON.parse(await new Response(ds.readable).text());
}
