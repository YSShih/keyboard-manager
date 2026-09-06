// @ts-check
/**
 * 生涯賽事日曆：2025 → 2028。
 *
 * 每一格對應一個真實存在的賽事。已查證的部分（賽制、隊數、場地、獎勵路徑）
 * 照實做；官方未公布的分組與對手名單為遊戲化處理，在各賽事的註解裡標明。
 * 來源見 README 與 docs/design/20260906-redesign.md。
 *
 * ⚠️ 2029 亞錦賽與 2030 WBC 刻意不放：前者查不到任何公告，
 * 後者只有「預期三月」的報導、官方未確認、主辦地未定。
 * 把推測當事實寫進遊戲，玩家會以為那是真的賽程。
 */

import { nation } from './nations.js';

/** @typedef {import('../../core/domain/types.js').TournamentDef} TournamentDef */

/** 拿到奧運門票時掛上的旗標。2028 的兩格靠它分流。 */
export const FLAG_OLYMPIC_BERTH = 'olympic_berth';

/** @type {readonly TournamentDef[]} */
export const CALENDAR = [
  // ─────────────────────────────────────────────────────────────
  {
    id: 'asia_championship_2025',
    year: 2025,
    month: '11 月',
    name: '第 31 屆亞洲棒球錦標賽',
    subtitle: '接任後的第一份考卷',
    tier: 2,
    stake: null,
    requiresFlag: null,
    skipsIfFlag: null,
    intro: '你接下的是一支剛拿到世界冠軍的球隊。\n'
      + '所有人都在等著看你能不能守住那個高度——包括那些覺得換誰來都一樣的人。\n\n'
      + '這一屆規格不高，但輸了，質疑聲會從第一天就跟著你。',
    // 官方分組未公布，以下為遊戲化處理
    stages: [
      {
        id: 'group', name: '循環賽', venue: '臺北天母球場',
        opponents: ['PHI', 'CHN', 'KOR'], minWins: 2,
        eliminatedRank: '第 4 名', eliminatedRankNum: 4,
      },
      {
        id: 'final', name: '冠軍戰', venue: '臺北天母球場',
        opponents: ['JPN'], minWins: 1,
        eliminatedRank: '亞軍', eliminatedRankNum: 2,
      },
    ],
    pointsPerWin: 1,
    rankRewards: [
      { rank: 1, label: '冠軍', points: 10 },
      { rank: 2, label: '亞軍', points: 7 },
      { rank: 4, label: '第 4 名', points: 3 },
    ],
    prestige: { 1: 14, 2: 6, 4: -10 },
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: 'wbc_2026',
    year: 2026,
    month: '3 月',
    name: '第六屆世界棒球經典賽',
    subtitle: '一級賽事的第一次',
    tier: 1,
    stake: null,
    requiresFlag: null,
    skipsIfFlag: null,
    intro: '經典賽。跟亞錦賽完全是兩個世界——對手會派出大聯盟的完整陣容。\n\n'
      + '這是你第一次帶隊打一級賽事。協會嘴上說「以賽代訓」，\n'
      + '但你知道他們在算的是 2028。',
    // 中華隊實際的 2026 WBC 同組對手（已查證）
    stages: [
      {
        id: 'pool', name: '預賽 C 組', venue: '東京巨蛋',
        opponents: ['CZE', 'AUS', 'KOR', 'JPN'], minWins: 2,
        eliminatedRank: '第 13 名', eliminatedRankNum: 13,
      },
      {
        id: 'quarter', name: '八強', venue: '邁阿密 loanDepot park',
        opponents: ['MEX'], minWins: 1,
        eliminatedRank: '八強', eliminatedRankNum: 8,
      },
      {
        id: 'semi', name: '四強', venue: '邁阿密 loanDepot park',
        opponents: ['USA'], minWins: 1,
        eliminatedRank: '第 4 名', eliminatedRankNum: 4,
      },
      {
        id: 'final', name: '冠軍戰', venue: '邁阿密 loanDepot park',
        opponents: ['VEN'], minWins: 1,
        eliminatedRank: '亞軍', eliminatedRankNum: 2,
      },
    ],
    pointsPerWin: 1,
    rankRewards: [
      { rank: 1, label: '冠軍', points: 22 },
      { rank: 2, label: '亞軍', points: 16 },
      { rank: 4, label: '第 4 名', points: 11 },
      { rank: 8, label: '八強', points: 7 },
      { rank: 13, label: '第 13 名', points: 3 },
    ],
    prestige: { 1: 30, 2: 20, 4: 12, 8: 2, 13: -18 },
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: 'asian_games_2026',
    year: 2026,
    month: '9 月',
    name: '愛知名古屋亞運',
    subtitle: '終結韓國四連霸',
    tier: 2,
    stake: null,
    requiresFlag: null,
    skipsIfFlag: null,
    intro: '韓國已經連四屆金牌。\n'
      + '這一屆各隊派的都不是最強陣容，但亞運金牌在國內的分量從來不看陣容。\n\n'
      + '協會沒有明說，但你聽得出來：輸給韓國第五次，位子會很難坐。',
    // 中華隊實際分在 B 組（已查證）；同組對手未公布，以下為遊戲化處理
    stages: [
      {
        id: 'group', name: 'B 組預賽', venue: '豐橋市民球場',
        opponents: ['HKG', 'CHN', 'JPN'], minWins: 2,
        eliminatedRank: '第 4 名', eliminatedRankNum: 4,
      },
      {
        id: 'final', name: '金牌戰', venue: '岡崎市民球場',
        opponents: ['KOR'], minWins: 1,
        eliminatedRank: '銀牌', eliminatedRankNum: 2,
      },
    ],
    pointsPerWin: 1,
    rankRewards: [
      { rank: 1, label: '金牌', points: 12 },
      { rank: 2, label: '銀牌', points: 8 },
      { rank: 4, label: '第 4 名', points: 3 },
    ],
    prestige: { 1: 18, 2: 6, 4: -12 },
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: 'premier12_2027',
    year: 2027,
    month: '11 月',
    name: 'WBSC 世界十二強棒球賽',
    subtitle: '台北開幕・東京決戰　—　亞洲唯一一張奧運門票',
    tier: 1,
    stake: 'ticket',
    requiresFlag: null,
    skipsIfFlag: null,
    intro: '三年前，前任總教練就是在東京巨蛋舉起這座冠軍。\n'
      + '現在輪到你，而且前兩輪在台北——主場，滿場，所有人都會來。\n\n'
      + '這一屆發兩張洛杉磯奧運門票，亞洲只有一張。\n'
      + '壓不過日韓，2028 年你就得去打資格賽。',
    // 已查證：16 隊、四階段、台北預賽複賽、東京超級循環與獎牌戰
    stages: [
      {
        id: 'opening', name: '開幕循環賽', venue: '臺北大巨蛋',
        opponents: ['CZE', 'CHN', 'AUS', 'KOR'], minWins: 2,
        eliminatedRank: '第 13 名', eliminatedRankNum: 13,
      },
      {
        id: 'second', name: '複賽', venue: '臺北大巨蛋',
        opponents: ['MEX', 'PUR'], minWins: 1,
        eliminatedRank: '八強', eliminatedRankNum: 8,
      },
      {
        id: 'super', name: '超級循環', venue: '東京巨蛋',
        opponents: ['USA', 'JPN'], minWins: 1,
        eliminatedRank: '第 4 名', eliminatedRankNum: 4,
      },
      {
        id: 'medal', name: '冠軍戰', venue: '東京巨蛋',
        opponents: ['VEN'], minWins: 1,
        eliminatedRank: '亞軍', eliminatedRankNum: 2,
      },
    ],
    pointsPerWin: 1,
    rankRewards: [
      { rank: 1, label: '冠軍', points: 24 },
      { rank: 2, label: '亞軍', points: 18 },
      { rank: 4, label: '第 4 名', points: 12 },
      { rank: 8, label: '八強', points: 7 },
      { rank: 13, label: '第 13 名', points: 3 },
    ],
    prestige: { 1: 28, 2: 18, 4: 10, 8: -4, 13: -22 },
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: 'olympic_qualifier_2028',
    year: 2028,
    month: '3 月',
    name: '奧運最終資格賽',
    subtitle: '主場，最後一次機會',
    tier: 1,
    stake: 'ticket',
    requiresFlag: null,
    skipsIfFlag: FLAG_OLYMPIC_BERTH,   // 已經拿到門票就跳過
    intro: '十二強沒拿到那張門票。\n'
      + '所幸這場資格賽在台灣——協會兩年前就把主辦權搶下來了，\n'
      + '當初被笑是浪費錢，現在成了你唯一的救命繩。\n\n'
      + '一個名額。輸了，2028 年的夏天你只能在電視上看。',
    // 已查證：台灣主辦。分組與對手未公布，以下為遊戲化處理
    stages: [
      {
        id: 'group', name: '循環賽', venue: '臺北大巨蛋',
        opponents: ['ESP', 'PAN', 'NED'], minWins: 2,
        eliminatedRank: '未晉級', eliminatedRankNum: 4,
      },
      {
        id: 'final', name: '門票決勝戰', venue: '臺北大巨蛋',
        opponents: ['KOR'], minWins: 1,
        eliminatedRank: '差一步', eliminatedRankNum: 2,
      },
    ],
    pointsPerWin: 1,
    rankRewards: [
      { rank: 1, label: '取得門票', points: 16 },
      { rank: 2, label: '差一步', points: 6 },
      { rank: 4, label: '未晉級', points: 2 },
    ],
    prestige: { 1: 20, 2: -14, 4: -26 },
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: 'olympics_2028',
    year: 2028,
    month: '7 月',
    name: '洛杉磯奧運棒球',
    subtitle: '道奇球場・六隊・一面金牌',
    tier: 1,
    stake: 'gold',
    requiresFlag: FLAG_OLYMPIC_BERTH,  // 沒門票就進不來
    skipsIfFlag: null,
    intro: '道奇球場。六支球隊。\n'
      + '棒球睽違二十年重回奧運，而中華隊在裡面。\n\n'
      + '1992 年巴塞隆納那面銀牌掛了三十六年。\n'
      + '今年七月，你有機會把它換掉。',
    // 已查證：6 隊、分兩組各 3 隊、7/17 準決賽附加賽、7/18 四強、7/19 金牌戰
    stages: [
      {
        id: 'group', name: '分組賽', venue: '道奇球場',
        opponents: ['USA', 'JPN'], minWins: 1,
        eliminatedRank: '小組出局', eliminatedRankNum: 5,
      },
      {
        id: 'playin', name: '準決賽附加賽', venue: '道奇球場',
        opponents: ['MEX'], minWins: 1,
        eliminatedRank: '第 4 名', eliminatedRankNum: 4,
      },
      {
        id: 'semi', name: '四強', venue: '道奇球場',
        opponents: ['KOR'], minWins: 1,
        // 輸了不是直接拿銅牌，是去打銅牌戰
        eliminatedRank: '第 4 名', eliminatedRankNum: 4,
        consolation: {
          name: '銅牌戰', opponent: 'MEX',
          winRank: 3, winLabel: '銅牌',
          loseRank: 4, loseLabel: '第 4 名',
        },
      },
      {
        id: 'final', name: '金牌戰', venue: '道奇球場',
        opponents: ['VEN'], minWins: 1,
        eliminatedRank: '銀牌', eliminatedRankNum: 2,
      },
    ],
    pointsPerWin: 2,
    rankRewards: [
      { rank: 1, label: '金牌', points: 30 },
      { rank: 2, label: '銀牌', points: 20 },
      { rank: 3, label: '銅牌', points: 14 },
      { rank: 4, label: '第 4 名', points: 9 },
      { rank: 5, label: '小組出局', points: 3 },
    ],
    prestige: { 1: 45, 2: 28, 3: 18, 4: 6, 5: -30 },
  },
];

/**
 * 奧運門票規則（2027 十二強）。
 *
 * 真實規則是「亞洲區最高名次隊獲得一張 LA28 門票」。完整模擬 16 隊積分才能算出
 * 誰是亞洲最高名次，但那對玩家是個黑箱。這裡換成一條玩家從第一秒就看得懂、
 * 而且看得出自己離它有多遠的規則。
 */
export const OLYMPIC_BERTH_RULE = {
  autoRank: 2,
  maxRank: 4,
  mustBeatAny: ['JPN', 'KOR'],
  label: '打進冠亞軍即得；第 3、4 名則須至少擊敗日本或韓國一次',
  explain: '亞洲區最高名次隊獲得一張洛杉磯奧運門票。壓不過日韓，就沒有 2028。',
};

/**
 * @param {number} rankNum
 * @param {readonly import('../../core/domain/types.js').GameResult[]} results
 * @returns {{got:boolean, reason:string}}
 */
export function checkOlympicBerth(rankNum, results) {
  // 打進冠亞軍就一定是亞洲最高名次 —— 決賽對手是美洲隊，
  // 你排在他前後都代表沒有亞洲隊在你之上。
  // 少了這條的話會出現「拿了冠軍卻沒拿到門票」這種荒謬結果
  //（預賽輸給日韓、但一路贏到最後）。
  if (rankNum <= OLYMPIC_BERTH_RULE.autoRank) {
    return { got: true, reason: rankNum === 1 ? '冠軍。沒有人排在你前面。' : '亞軍，亞洲區最高名次。' };
  }
  if (rankNum > OLYMPIC_BERTH_RULE.maxRank) {
    return { got: false, reason: `最終名次 ${rankNum} 未達前 4。` };
  }
  const beaten = results.filter(
    (r) => r.win && OLYMPIC_BERTH_RULE.mustBeatAny.includes(r.opponent),
  );
  if (beaten.length === 0) {
    return { got: false, reason: '整屆沒有擊敗日本或韓國，亞洲最高名次不是你。' };
  }
  const who = [...new Set(beaten.map((r) => (r.opponent === 'JPN' ? '日本' : '韓國')))];
  return { got: true, reason: `擊敗${who.join('與')}，拿下亞洲最高名次。` };
}

/**
 * 挑出這屆的「重點戰」——會進入逐球模式讓玩家做關鍵決策的比賽。
 *
 * 判準（依序）：決賽／獎牌戰 > 對日本或韓國 > 對手實力 > 賽程越後面越關鍵。
 * 對手實力是必要的決勝條件 —— 沒有它，同分時只比索引，
 * 會選到分組賽第一場對最弱的隊伍當「重點戰」。
 * 一級賽事取 2 場，二級取 1 場。刻意是可預先算出來的，
 * 這樣賽程表上就能標星號，玩家一開始就知道哪幾場要親自上陣。
 *
 * @param {TournamentDef} def
 * @returns {Set<number>} 重點戰在賽程中的索引
 */
export function selectKeyGames(def) {
  /** @type {{index:number, score:number}[]} */
  const scored = [];
  let index = 0;
  for (const [si, stage] of def.stages.entries()) {
    const isLast = si === def.stages.length - 1;
    for (const code of stage.opponents) {
      let score = si * 4;
      if (isLast) score += 100;
      if (code === 'JPN' || code === 'KOR') score += 50;
      score += nation(code).strength / 10;
      scored.push({ index, score });
      index++;
    }
  }
  const want = def.tier === 1 ? 2 : 1;
  return new Set(
    scored.slice().sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, want).map((x) => x.index),
  );
}
