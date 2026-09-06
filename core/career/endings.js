// @ts-check
/**
 * 結局判定。
 *
 * 每一個寫得出來的結局都必須真的有人碰得到 —— tools/balance.js 的生涯護欄
 * 會逐一列舉檢查。曾經有一個結局在數學上永遠達不到，是白寫的內容。
 */

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').TournamentDef} TournamentDef */

/** 階段一的完整結局清單。護欄會確認每一個都達得到。 */
export const ENDING_IDS = [
  'double_crown', 'olympic_gold', 'wbc_champion',
  'olympic_medal', 'olympic_empty', 'no_olympics', 'fired',
];

/** 這段生涯有沒有拿下經典賽冠軍。 */
const wonWbc = (/** @type {CareerState} */ st) => st.coach.flags.includes('champion:wbc_2026');

/**
 * 經典賽冠軍的結局。依後來奧運走到哪裡調整最後一段。
 * @param {number|undefined} olympicRank
 * @returns {{id:string, title:string, text:string}}
 */
function wbcEnding(olympicRank) {
  const tail = olympicRank === undefined
    ? '奧運沒去成。有人說那是遺憾，\n但那年三月的照片還掛在協會的牆上，而且會一直掛在那裡。'
    : olympicRank <= 3
      ? `洛杉磯又帶回一面獎牌。\n兩年之內兩座頒獎台，這個國家的棒球從來沒有這樣過。`
      : '洛杉磯沒能再進一步。但那年三月的照片還掛在協會的牆上，\n而且會一直掛在那裡。';
  return {
    id: 'wbc_champion',
    title: '經典賽冠軍',
    text: '2026 年的邁阿密，中華隊舉起了世界棒球經典賽的冠軍。\n'
      + '那是這個國家在這項賽事的第一次。\n\n' + tail,
  };
}

/**
 * @param {object} o
 * @param {CareerState} o.st
 * @param {?TournamentDef} o.def 觸發結局的那屆賽事
 * @param {number} o.rankNum
 * @param {boolean} [o.firedNow]
 * @param {boolean} [o.noOlympics]
 * @param {number} [o.olympicRank]
 * @returns {{id:string, title:string, text:string}}
 */
export function pickEnding({ st, def, rankNum, firedNow, noOlympics, olympicRank }) {
  const name = st.coach.name;

  if (firedNow) {
    return {
      id: 'fired',
      title: '被揃下台',
      text: `${def ? `${def.name}結束後的第三天，` : ''}協會沒有再約下一次會。\n`
        + '你在新聞跑馬燈上看到接任人選的名字。那個人現在正在鍵盤上罵你的位置。\n\n'
        + '2024 年那座冠軍還在協會的玻璃櫃裡，擦得很亮。',
    };
  }

  if (noOlympics) {
    return {
      id: 'no_olympics',
      title: '沒能帶隊上奧運',
      text: '三月的台北大巨蛋，最後一個名額從你手上溜掉。\n'
        + '七月，道奇球場的燈亮起來的時候，你在客廳看轉播。\n\n'
        + '棒球睽違二十年重回奧運，而中華隊不在裡面。\n'
        + '這件事會跟著你很久。',
    };
  }

  if (olympicRank !== undefined) {
    if (olympicRank === 1 && wonWbc(st)) {
      return {
        id: 'double_crown',
        title: '經典賽與奧運，都拿了',
        text: '2026 年的邁阿密，2028 年的洛杉磯。\n'
          + `${name}把兩座這個國家從來沒有過的冠軍，在四年之內都拿了回來。\n\n`
          + '前任總教練在 2024 年說「該換人了」。\n'
          + '現在所有人都知道，他換對了人。',
      };
    }
    if (olympicRank === 1) {
      return {
        id: 'olympic_gold',
        title: '洛杉磯的金牌',
        text: '道奇球場的計分板停在最後一個出局數。\n'
          + `${name}被抬起來的時候，看到的是滿場揮舞的旗子。\n\n`
          + '1992 年那面銀牌掛了三十六年。今天終於有東西可以放在它旁邊——\n'
          + '而且是更亮的那一面。\n\n'
          + '那些說「你行你上」的人，現在正在轉發你的照片。',
      };
    }
    // 經典賽冠軍勝過奧運銀銅 —— 那是這個國家在該賽事的第一次。
    // 放在這裡而不是最後，否則只有「沒進奧運」的人才碰得到，實測是 0%。
    if (wonWbc(st)) return wbcEnding(olympicRank);
    if (olympicRank === 2 || olympicRank === 3) {
      return {
        id: 'olympic_medal',
        title: olympicRank === 2 ? '差一場的銀牌' : '銅牌，但站上了頒獎台',
        text: olympicRank === 2
          ? '金牌戰輸了。你在頒獎台上看著對面掛上金牌，手裡的銀牌很重。\n\n'
            + '1992 年那面銀牌旁邊，現在多了一面。有人說這樣也很好。\n'
            + '你笑了笑，沒有回答。'
          : '銅牌戰贏了。這是棒球重回奧運後，中華隊的第一面獎牌。\n\n'
            + '不是你想要的顏色，但站上頒獎台的那一刻，\n'
            + '你想起 2024 年那個晚上——原來有些事真的做得到。',
      };
    }
    return {
      id: 'olympic_empty',
      title: '到過奧運',
      text: '六支球隊，你們是其中一支。這句話本身就不容易。\n\n'
        + '但道奇球場的獎牌不是發給「不容易」的。\n'
        + '回程的飛機上沒有人說話，你把每一場的紀錄又看了一遍。',
    };
  }

  if (wonWbc(st)) return wbcEnding(undefined);

  // 兜底：理論上每條路徑都會在上面被攔下來。真的走到這裡代表日曆或分支有漏。
  return {
    id: 'no_olympics',
    title: '任期結束',
    text: `${st.year} 年，${name}的任期結束了。\n最終聲望 ${st.coach.prestige}。`,
  };
}
