// @ts-check
/**
 * 結局判定。
 *
 * 每一個寫得出來的結局都必須真的有人碰得到 —— tools/balance.js 的生涯護欄
 * 會逐一列舉檢查。曾經有一個結局在數學上永遠達不到，是白寫的內容。
 */

/** @typedef {import('../domain/types.js').Meters} Meters */

/**
 * @param {number} rankNum
 * @param {boolean} gotBerth
 * @param {import('../domain/types.js').Meters} meters
 * @returns {{id:string, title:string, text:string}}
 */
export function pickEnding(rankNum, gotBerth, meters) {
  if (meters.publicApproval <= 0 || meters.assocTrust <= 0) {
    return {
      id: 'fired',
      title: '被揃下台',
      text: '記者會結束後，協會沒有再約下一次。你在新聞跑馬燈上看到接任人選的名字，那個人現在正在鍵盤上罵你的位置。',
    };
  }
  if (rankNum === 1 && gotBerth) {
    return {
      id: 'champion',
      title: '東京巨蛋的冠軍',
      text: '你在客場的土地上舉起了冠軍。奧運門票只是附帶的——那些說「你行你上」的人，現在正在轉發你的照片。',
    };
  }
  if (gotBerth) {
    return {
      id: 'ticket',
      title: '拿到門票的人',
      text: `最終${rankNum} 名，但亞洲區最高名次是你的。2028 年洛杉磯，中華隊有位子。續約合約放在桌上，你還沒簽。`,
    };
  }
  if (rankNum <= 4) {
    return {
      id: 'so_close',
      title: '差一場',
      text: '前四強，但門票給了別人。網路上開始流傳你在第七局沒有換投的截圖。你自己也重看了那一局，很多次。',
    };
  }
  return {
    id: 'early_out',
    title: '點到為止',
    text: '你走過的路跟前任一模一樣。留言區的第一則是：「換誰來都一樣。」下面有兩千個讚。',
  };
}
