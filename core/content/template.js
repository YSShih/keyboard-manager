// @ts-check
/**
 * 內容模板的變數展開。
 *
 * 內容檔裡寫 '{{pitcher}} 已經投了 {{pitchCount}} 球'，引擎在展示前把變數換掉。
 * 找不到的變數保留原樣而不是變成 undefined —— 這樣 contentLint 掃得出來，
 * 玩家也不會看到 'undefined 已經投了 92 球'。
 *
 * @param {string} text
 * @param {Record<string, string|number>} vars
 * @returns {string}
 */
export function interpolate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name) => {
    const v = vars[name];
    return v === undefined ? whole : String(v);
  });
}

/**
 * 找出文字裡用到的所有變數名（給 contentLint 用）。
 * @param {string} text
 * @returns {string[]}
 */
export function templateVars(text) {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? '');
}
