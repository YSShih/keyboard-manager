// @ts-check
/**
 * 對手國家。
 *
 * strength 是刻意粗糙的單一數值：這個遊戲模擬的是「你的決策」，不是各國的建隊，
 * 對手用一個實力值 + 名稱就夠了。數值是為了遊戲平衡而定，不代表任何真實排名。
 */

/** @type {readonly import('../../core/domain/types.js').NationDef[]} */
export const NATIONS = [
  { code: 'TPE', name: '中華隊',     strength: 58, region: 'ASIA' },
  { code: 'JPN', name: '日本',       strength: 82, region: 'ASIA' },
  { code: 'KOR', name: '韓國',       strength: 68, region: 'ASIA' },
  { code: 'USA', name: '美國',       strength: 76, region: 'AMERICAS' },
  { code: 'VEN', name: '委內瑞拉',   strength: 74, region: 'AMERICAS' },
  { code: 'DOM', name: '多明尼加',   strength: 73, region: 'AMERICAS' },
  { code: 'PUR', name: '波多黎各',   strength: 66, region: 'AMERICAS' },
  { code: 'MEX', name: '墨西哥',     strength: 64, region: 'AMERICAS' },
  { code: 'PAN', name: '巴拿馬',     strength: 55, region: 'AMERICAS' },
  { code: 'AUS', name: '澳洲',       strength: 52, region: 'EURO_OCE' },
  { code: 'NED', name: '荷蘭',       strength: 60, region: 'EURO_OCE' },
  { code: 'ITA', name: '義大利',     strength: 54, region: 'EURO_OCE' },
  { code: 'CZE', name: '捷克',       strength: 44, region: 'EURO_OCE' },
  { code: 'GBR', name: '英國',       strength: 46, region: 'EURO_OCE' },
  { code: 'CHN', name: '中國',       strength: 42, region: 'ASIA' },
  { code: 'NCA', name: '尼加拉瓜',   strength: 48, region: 'AMERICAS' },
];

/** @type {Map<string, import('../../core/domain/types.js').NationDef>} */
export const NATION_BY_CODE = new Map(NATIONS.map((n) => [n.code, n]));

/**
 * @param {string} code
 * @returns {import('../../core/domain/types.js').NationDef}
 */
export function nation(code) {
  const n = NATION_BY_CODE.get(code);
  if (!n) throw new Error(`未知的國家代號：${code}`);
  return n;
}
