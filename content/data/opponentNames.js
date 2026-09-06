// @ts-check
/**
 * 對手球員的姓名素材。
 *
 * ⚠️ 全部是各語系的常見姓氏，不指涉任何真實球員。
 * 沒有這個表的時候播報會寫成「捷克 CF 飛球出局」，那是 debug 輸出不是轉播。
 * 對手雖然只是背景，但背景不能出戲。
 */

/** @type {Record<string, readonly string[]>} */
const POOLS = {
  JP: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡邊', '山本', '中村', '小林', '加藤',
       '吉田', '松本', '井上', '木村', '清水', '森'],
  KR: ['金', '李', '朴', '崔', '鄭', '姜', '趙', '尹', '張', '林', '韓', '吳', '申', '柳', '洪', '南'],
  CN: ['王', '李', '張', '劉', '陳', '楊', '黃', '趙', '周', '徐', '孫', '馬', '朱', '胡', '郭', '何'],
  LATIN: ['Rodríguez', 'Martínez', 'García', 'López', 'González', 'Pérez',
          'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Díaz', 'Cruz', 'Reyes', 'Morales'],
  ANGLO: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson',
          'Anderson', 'Taylor', 'Moore', 'Clark', 'Hall', 'Young', 'Walker', 'Wright'],
  CZ:   ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák',
         'Němec', 'Pokorný', 'Marek', 'Beneš', 'Fiala', 'Sedláček'],
  NL:   ['van Dijk', 'de Jong', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'de Vries',
         'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker'],
  IT:   ['Rossi', 'Ferrari', 'Russo', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci',
         'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'Costa'],
};

/** 國家代號 → 姓名池。 */
const BY_NATION = /** @type {Record<string, keyof typeof POOLS>} */ ({
  JPN: 'JP', KOR: 'KR', CHN: 'CN',
  USA: 'ANGLO', GBR: 'ANGLO', AUS: 'ANGLO',
  VEN: 'LATIN', DOM: 'LATIN', PUR: 'LATIN', MEX: 'LATIN', PAN: 'LATIN', NCA: 'LATIN',
  CZE: 'CZ', NED: 'NL', ITA: 'IT',
});

/**
 * @param {string} nationCode
 * @returns {readonly string[]}
 */
export function namePool(nationCode) {
  return POOLS[BY_NATION[nationCode] ?? 'ANGLO'] ?? POOLS.ANGLO ?? [];
}
