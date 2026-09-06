// @ts-check
/**
 * 賽事定義。
 *
 * 已查證的事實（來源見 README）：
 *   - Premier12 2027 擴編為 16 隊，四階段：Opening → Second → Super Round → Medal Round
 *   - 開幕兩輪在台北，超級循環與獎牌戰在東京巨蛋
 *   - 發放兩張 LA28 奧運門票：一張給亞洲最高名次隊，一張給歐洲／大洋洲最高名次隊
 *
 * ⚠️ 未查證、以下為遊戲化處理：
 *   - 各階段的實際分組與對手名單（官方尚未公布）→ 本作自訂
 *   - 晉級改用「最低勝場數」而非完整 16 隊積分模擬。這是刻意的簡化：
 *     玩家需要的是「再輸一場就出局」這種看得懂的壓力，不是一張看不懂的積分表
 *   - 「亞洲最高名次」用一條明講的規則代替全隊模擬，見 OLYMPIC_BERTH_RULE
 */

/** @type {import('../../core/domain/types.js').TournamentDef} */
export const PREMIER12_2027 = {
  id: 'premier12_2027',
  year: 2027,
  name: 'WBSC 世界12強棒球賽 2027',
  subtitle: '台北開幕・東京決戰　—　亞洲唯一一張奧運門票',
  pointsPerWin: 1,
  stages: [
    {
      id: 'opening',
      name: '開幕循環賽',
      venue: '臺北大巨蛋',
      // 真實賽制的開幕兩輪在台北。同組放一支亞洲強權（韓國），
      // 讓玩家有機會在主場就把「擊敗日韓」這個門票條件先存起來。
      opponents: ['CZE', 'CHN', 'AUS', 'NED', 'KOR'],
      minWins: 2,
      eliminatedRank: '第 13 名',
      eliminatedRankNum: 13,
    },
    {
      id: 'second',
      name: '複賽',
      venue: '臺北大巨蛋',
      opponents: ['MEX', 'PUR'],
      minWins: 1,
      eliminatedRank: '八強',
      eliminatedRankNum: 8,
    },
    {
      id: 'super',
      name: '超級循環',
      venue: '東京巨蛋',
      opponents: ['USA', 'JPN'],
      minWins: 1,
      eliminatedRank: '第 4 名',
      eliminatedRankNum: 4,
    },
    {
      id: 'medal',
      name: '冠軍戰',
      venue: '東京巨蛋',
      opponents: ['VEN'],
      minWins: 1,
      eliminatedRank: '亞軍',
      eliminatedRankNum: 2,
    },
  ],
  rankRewards: [
    { rank: 1,  label: '冠軍',     points: 20 },
    { rank: 2,  label: '亞軍',     points: 15 },
    { rank: 4,  label: '第 4 名',  points: 11 },
    { rank: 8,  label: '八強',     points: 7 },
    { rank: 13, label: '第 13 名', points: 4 },
  ],
};

/**
 * 奧運門票規則。
 *
 * 真實規則是「亞洲區最高名次隊獲得一張 LA28 門票」。完整模擬 16 隊積分才能算出
 * 誰是亞洲最高名次，但那對玩家是個黑箱。這裡換成一條玩家從第一秒就看得懂、
 * 而且看得出自己離它有多遠的規則——並且在 UI 上一直顯示。
 */
export const OLYMPIC_BERTH_RULE = {
  maxRank: 4,
  mustBeatAny: ['JPN', 'KOR'],
  label: '最終名次前 4，且至少擊敗日本或韓國一次',
  explain: '亞洲區最高名次隊獲得一張洛杉磯奧運門票。壓不過日韓，就沒有 2028。',
};

/**
 * 判定是否取得奧運門票。
 * @param {number} rankNum 最終名次數字
 * @param {readonly import('../../core/domain/types.js').GameResult[]} results
 * @returns {{got:boolean, reason:string}}
 */
export function checkOlympicBerth(rankNum, results) {
  const beaten = results.filter(
    (r) => r.win && OLYMPIC_BERTH_RULE.mustBeatAny.includes(r.opponent),
  );
  if (rankNum > OLYMPIC_BERTH_RULE.maxRank) {
    return { got: false, reason: `最終名次 ${rankNum} 未達前 4。` };
  }
  if (beaten.length === 0) {
    return { got: false, reason: '整屆沒有擊敗日本或韓國，亞洲最高名次不是你。' };
  }
  const who = beaten.map((r) => (r.opponent === 'JPN' ? '日本' : '韓國'));
  return { got: true, reason: `擊敗${[...new Set(who)].join('與')}，拿下亞洲最高名次。` };
}
