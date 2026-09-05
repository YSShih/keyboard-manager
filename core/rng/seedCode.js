// @ts-check
/**
 * 種子碼編解碼。
 *
 * 這是玩家之間唯一的交換媒介，所以格式要能被手抄、被 LINE 轉貼、被截圖再打回去。
 * 用 Crockford Base32：字母表排除 I / L / O / U，解碼時把 I、L 修正成 1、O 修正成 0，
 * 大小寫不敏感，連字號可有可無。
 *
 * 版面：version(6) + seed(40) + checksum(8) = 54 bits → 11 個字元（55 bits，最高位補 0）
 * 顯示為 XXXX-XXXX-XXX。
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SEED_BITS = 40n;
const SEED_MASK = (1n << SEED_BITS) - 1n;

/** 目前的種子碼版本。改動編碼版面時才 +1。 */
export const SEED_CODE_VERSION = 1;

/**
 * @typedef {object} SeedInfo
 * @property {number} version
 * @property {number} seed 40-bit 主種子
 */

/**
 * FNV-1a 32-bit，取低 8 位當 checksum。
 * @param {bigint} payload
 * @returns {bigint}
 */
function checksum8(payload) {
  let h = 2166136261 >>> 0;
  let v = payload;
  for (let i = 0; i < 8; i++) {
    const byte = Number(v & 0xffn);
    v >>= 8n;
    h = (h ^ byte) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return BigInt(h & 0xff);
}

/**
 * @param {SeedInfo} info
 * @returns {string} 例：'K7QM-3XZ9-VB2'
 */
export function encodeSeed(info) {
  const version = BigInt(info.version) & 0x3fn;
  const seed = BigInt(info.seed) & SEED_MASK;
  const payload = (version << SEED_BITS) | seed;
  const value = (payload << 8n) | checksum8(payload);

  let out = '';
  for (let i = 10; i >= 0; i--) {
    const idx = Number((value >> BigInt(i * 5)) & 0x1fn);
    out += ALPHABET[idx];
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

/**
 * 把使用者輸入正規化成 11 個字元。容錯：小寫、連字號、空白、I/L→1、O→0。
 * @param {string} code
 * @returns {string}
 */
function normalize(code) {
  return code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/**
 * @param {string} code
 * @returns {SeedInfo}
 * @throws {Error} 格式錯誤或 checksum 不符
 */
export function decodeSeed(code) {
  const s = normalize(code);
  if (s.length !== 11) {
    throw new Error(`種子碼長度應為 11 個字元（收到 ${s.length} 個）`);
  }

  let value = 0n;
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`種子碼含有無效字元「${ch}」`);
    value = (value << 5n) | BigInt(idx);
  }

  const payload = value >> 8n;
  const given = value & 0xffn;
  if (given !== checksum8(payload)) {
    throw new Error('種子碼校驗失敗，請確認有沒有抄錯字');
  }

  return {
    version: Number((payload >> SEED_BITS) & 0x3fn),
    seed: Number(payload & SEED_MASK),
  };
}

/**
 * 讓玩家用自訂片語開局（「中華隊加油」）。回顯時 UI 一律顯示正規種子碼。
 * @param {string} phrase
 * @returns {SeedInfo}
 */
export function seedFromPhrase(phrase) {
  let h1 = 0xdeadbeef >>> 0;
  let h2 = 0x41c6ce57 >>> 0;
  for (let i = 0; i < phrase.length; i++) {
    const k = phrase.charCodeAt(i);
    h1 = Math.imul(h1 ^ k, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ k, 1597334677) >>> 0;
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) >>> 0;
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909) >>> 0;
  const seed = Number(((BigInt(h2) << 32n) | BigInt(h1)) & SEED_MASK);
  return { version: SEED_CODE_VERSION, seed };
}

/**
 * 判斷字串看起來像不像種子碼（用來決定要走 decodeSeed 還是 seedFromPhrase）。
 * @param {string} code
 * @returns {boolean}
 */
export function looksLikeSeedCode(code) {
  const s = normalize(code);
  return s.length === 11 && [...s].every((ch) => ALPHABET.includes(ch));
}
