// @ts-check
/**
 * 關鍵局面的決策點模板。
 *
 * trigger 是「資料」而不是函式：一組結構化的局面條件。這讓新增決策點不需要改引擎，
 * 也讓 tools/contentLint.js 能靜態檢查每個模板。
 *
 * 每個選項都必須標示明碼 baseRate，並用 rateMods 說明教頭能力如何影響它——
 * 那些 label 會原封不動出現在玩家的 tooltip 裡。
 */

/**
 * @typedef {object} DecisionTrigger
 * @property {'PITCHING'|'BATTING'} side 我方正在投球還是打擊
 * @property {number} [minInning]
 * @property {number} [minPitchCount]
 * @property {number} [maxScoreDiff]  分差絕對值上限
 * @property {'ANY'|'FIRST'|'SCORING'} [runners]
 * @property {number} [maxOuts]
 * @property {boolean} [trailingOrTied]
 */

/**
 * @typedef {import('../../core/domain/types.js').DecisionTemplate & {trigger: DecisionTrigger}} Tmpl
 */

/** @type {readonly Tmpl[]} */
export const DECISION_TEMPLATES = [
  /*
   * 覆蓋率用的兩張。
   *
   * 原本四張模板全都要求分差 ≤ 2 或 ≤ 3，所以比數一拉開就沒有任何一張對得上 ——
   * 實測 11.6% 的比賽玩家整場零決策，只能看。這兩張刻意不設分差條件，
   * 讓「大比分領先時要不要保留戰力」「垃圾時間要不要練兵」也是需要判斷的局面。
   */
  {
    id: 'bullpen_management',
    kind: 'PITCHING_CHANGE',
    priority: 40,
    trigger: { side: 'PITCHING', minInning: 4, minPitchCount: 45 },
    title: '牛棚有人在熱身',
    body: '{{inning}} 局{{half}}，{{pitcher}} 已經投了 {{pitchCount}} 球。後面還有比賽要打，牛棚也不是無限的。',
    options: [
      {
        id: 'stay',
        label: '讓他再撐一局',
        baseRate: 0.5,
        rateMods: [{ source: 'conditioning', label: '你的「體能管理」{{conditioning}}', from: 'coachAttr', attr: 'conditioning', points: 12 }],
        preview: ['成功：省下牛棚，後面的比賽有人可用', '失敗：這一局被打穿，而且他的手臂也累了'],
        action: 'STAY',
        successText: '{{pitcher}} 又解決一局。他下場時朝休息區點了個頭。',
        failText: '{{pitcher}} 的球已經沒有進壘點了，這一局被連續掃出安打。',
      },
      {
        id: 'fresh',
        label: '換上生力軍',
        baseRate: 0.58,
        rateMods: [{ source: 'bullpen', label: '你的「用兵」{{bullpen}}', from: 'coachAttr', attr: 'bullpen', points: 14 }],
        preview: ['成功：新投手直接壓制', '失敗：牛棚提前消耗，接下來幾場少一個人'],
        action: 'PULL_PITCHER',
        successText: '生力軍上來就是三上三下。這球換得漂亮。',
        failText: '接手的投手抓不到好球帶，馬上讓壘上有人。',
      },
      {
        id: 'match',
        label: '找對位的投手上來對決',
        baseRate: 0.42,
        rateMods: [{ source: 'scouting', label: '你的「識人」{{scouting}}', from: 'coachAttr', attr: 'scouting', points: 20 }],
        preview: ['成功：對位吃死這一棒，士氣大振', '失敗：對位判斷錯誤，被打爆'],
        action: 'PULL_PITCHER',
        successText: '這個對位完全吃死對方的打者。轉播單位重播了三次你在休息區的表情。',
        failText: '對位完全看錯。那顆球被打得又高又遠。',
      },
    ],
  },
  {
    id: 'offense_tempo',
    kind: 'STEAL',
    priority: 35,
    trigger: { side: 'BATTING', minInning: 3, runners: 'ANY' },
    title: '要不要動跑者',
    body: '{{inning}} 局{{half}}，{{outs}} 人出局，壘上有人。對方投手的牽制動作有點慢。',
    options: [
      {
        id: 'steal',
        label: '啟動跑者',
        baseRate: 0.44,
        rateMods: [{ source: 'communication', label: '你的「溝通」{{communication}}', from: 'coachAttr', attr: 'communication', points: 16 }],
        preview: ['成功：跑者推進到得點圈', '失敗：跑者被觸殺，攻勢中斷'],
        action: 'STEAL',
        successText: '跑者起步的時機抓得剛好，一個滑壘搶進二壘。',
        failText: '捕手的傳球又快又準，跑者在二壘前被觸殺。',
      },
      {
        id: 'hold',
        label: '不動，讓打者處理',
        baseRate: 0.55,
        preview: ['成功：打者自己解決，跑者也還在', '失敗：打成雙殺，什麼都沒了'],
        action: 'STAY',
        successText: '{{batter}} 把球送進外野，跑者一路奔回三壘。',
        failText: '{{batter}} 打成軟弱的滾地球，二壘、一壘，雙殺。',
      },
      {
        id: 'patient',
        label: '要打者纏鬥，先消耗對方球數',
        baseRate: 0.66,
        rateMods: [{ source: 'intel', label: '你的「情蒐」{{intel}}', from: 'coachAttr', attr: 'intel', points: 14 }],
        preview: ['成功：磨掉對方投手的球數', '失敗：陷入不利球數，被三振'],
        action: 'STAY',
        successText: '{{batter}} 一連看掉六球，對方投手的球數又多了一截。',
        failText: '{{batter}} 等球等到兩好球，最後被一顆邊邊角角的變化球三振。',
      },
    ],
  },
  {
    id: 'pull_ace_high_pitch',
    kind: 'PITCHING_CHANGE',
    priority: 100,
    trigger: { side: 'PITCHING', minPitchCount: 95 },
    title: '王牌的球數已經過線',
    body: '{{pitcher}} 已經投了 {{pitchCount}} 球。牛棚有人站起來了，看台上開始有人喊換投，也有人喊讓他投完。',
    options: [
      {
        id: 'stay',
        label: '續投王牌',
        baseRate: 0.4,
        rateMods: [{ source: 'bullpen', label: '你的「用兵」{{bullpen}}', from: 'coachAttr', attr: 'bullpen', points: 10 }],
        preview: ['成功：士氣上升，牛棚保留戰力', '失敗：續投失分，且傷病風險大幅上升'],
        action: 'STAY',
        successText: '{{pitcher}} 咬牙撐住，用一顆偏低的變化球結束這個打席。休息區站起來鼓掌。',
        failText: '{{pitcher}} 的球明顯沒有進壘點了，這一球被扎實地掃出去。',
      },
      {
        id: 'pull',
        label: '換右投對決',
        baseRate: 0.55,
        rateMods: [{ source: 'bullpen', label: '你的「用兵」{{bullpen}}', from: 'coachAttr', attr: 'bullpen', points: 16 }],
        preview: ['成功：接手投手壓制這個打席', '失敗：牛棚沒接住，且王牌被提早換下'],
        action: 'PULL_PITCHER',
        successText: '牛棚的球一進來就完全不一樣，三球解決。你的換投時機被轉播單位在重播裡標了紅圈。',
        failText: '接手的投手第一球就塞不進好球帶。換投換出更大的麻煩。',
      },
      {
        id: 'ibb_then_decide',
        label: '先保送這棒再說',
        // 定價偏低是刻意的：敬遠除了擲骰之外還白送一個跑者，
        // 那個結構性代價不會出現在成功率裡，所以成功率本身必須壓低來反映它。
        baseRate: 0.46,
        preview: ['成功：避開對方強棒，但壘上更擠', '失敗：自亂陣腳，滿壘壓力給到自己'],
        action: 'IBB',
        successText: '四顆壞球送上一壘。下一棒打成雙殺，你賭對了。',
        failText: '四顆壞球送上一壘，然後下一棒把球扛到牆邊。看台一片噓聲。',
      },
    ],
  },
  {
    id: 'late_close_pitching',
    kind: 'PITCHING_CHANGE',
    priority: 80,
    trigger: { side: 'PITCHING', minInning: 7, maxScoreDiff: 2, runners: 'SCORING' },
    title: '得點圈有人，一分都不能掉',
    body: '{{inning}} 局{{half}}，{{outs}} 人出局，得點圈有人。{{pitcher}} 目前 {{pitchCount}} 球。',
    options: [
      {
        id: 'stay',
        label: '相信他能解決',
        baseRate: 0.48,
        rateMods: [{ source: 'bullpen', label: '你的「用兵」{{bullpen}}', from: 'coachAttr', attr: 'bullpen', points: 12 }],
        preview: ['成功：化解危機，牛棚完全保留', '失敗：失分，且事後一定被檢討'],
        action: 'STAY',
        successText: '{{pitcher}} 用一顆內角速球讓打者揮空。他對著休息區比了一個拳頭。',
        failText: '一支穿越內野的滾地安打，跑者輕鬆回來得分。',
      },
      {
        id: 'pull',
        label: '換上終結者提前登板',
        baseRate: 0.58,
        rateMods: [{ source: 'bullpen', label: '你的「用兵」{{bullpen}}', from: 'coachAttr', attr: 'bullpen', points: 18 }],
        preview: ['成功：直接關門', '失敗：終結者提前消耗，後面沒人可用'],
        action: 'PULL_PITCHER',
        successText: '終結者提前一局登板，兩球解決戰鬥。轉播說這是今天最好的一次調度。',
        failText: '終結者今天的球質不對，被打出一支追平安打。',
      },
      {
        id: 'shift',
        label: '守備往拉打方向大幅移防',
        baseRate: 0.62,
        rateMods: [{ source: 'intel', label: '你的「情蒐」{{intel}}', from: 'coachAttr', attr: 'intel', points: 20 }],
        preview: ['成功：正中佈陣，接殺出局', '失敗：對手往反方向推打，形同送分'],
        action: 'SHIFT',
        successText: '球正好滾到移防後的二游之間，守備員原地接殺。情蒐報告沒有白讀。',
        failText: '對方反方向輕推，球滾過空無一人的三壘線。你的佈陣被打臉。',
      },
    ],
  },
  {
    id: 'bunt_or_swing',
    kind: 'BUNT',
    priority: 70,
    trigger: { side: 'BATTING', minInning: 6, maxScoreDiff: 2, runners: 'FIRST', maxOuts: 1, trailingOrTied: true },
    title: '推進，還是強攻？',
    body: '{{inning}} 局{{half}}，{{outs}} 人出局，一壘有人。{{batter}} 站上打擊區。三壘指導區在等你的暗號。',
    options: [
      {
        id: 'swing',
        label: '強攻',
        baseRate: 0.42,
        preview: ['成功：一棒清空壘包', '失敗：雙殺打，攻勢當場結束'],
        action: 'STAY',
        successText: '{{batter}} 抓到一顆失投的變化球，扎實地送到外野。',
        failText: '{{batter}} 打成軟弱的滾地球，二壘、一壘，雙殺。',
      },
      {
        id: 'bunt',
        label: '觸擊推進',
        // 同理：觸擊成功也要送掉一個出局數，那是成功率沒有表達的成本。
        baseRate: 0.58,
        rateMods: [{ source: 'communication', label: '你的「溝通」{{communication}}', from: 'coachAttr', attr: 'communication', points: 12 }],
        preview: ['成功：跑者上二壘，得點圈有人', '失敗：觸擊失敗，跑者被封殺在二壘'],
        action: 'BUNT',
        successText: '{{batter}} 把球輕輕推向三壘方向，犧牲自己換來得點圈的跑者。',
        failText: '觸擊的角度太正，投手接到後從容傳向二壘，前面的跑者被封殺。',
      },
      {
        id: 'hitrun',
        label: '打帶跑',
        baseRate: 0.5,
        rateMods: [{ source: 'communication', label: '你的「溝通」{{communication}}', from: 'coachAttr', attr: 'communication', points: 16 }],
        preview: ['成功：跑者一口氣上三壘，打者也安全', '失敗：打者揮空，跑者在二壘被觸殺'],
        action: 'STAY',
        successText: '跑者起跑，{{batter}} 把球推進右外野的空檔，一口氣攻佔一三壘。',
        failText: '{{batter}} 揮棒落空，跑者在二壘前被捕手的傳球逮個正著。',
      },
    ],
  },
  {
    id: 'pinch_hit_late',
    kind: 'PINCH_HIT',
    priority: 60,
    trigger: { side: 'BATTING', minInning: 7, maxScoreDiff: 6, trailingOrTied: true },
    title: '要不要動代打',
    body: '{{inning}} 局{{half}}，{{outs}} 人出局。輪到 {{batter}}，板凳上還有沒用過的牌。',
    options: [
      {
        id: 'stay',
        label: '相信原打者',
        baseRate: 0.45,
        preview: ['成功：他自己解決，代打留著應付後面的局面', '失敗：打不出來，事後被問為什麼不換'],
        action: 'STAY',
        successText: '{{batter}} 沒有辜負你，一支扎實的安打。',
        failText: '{{batter}} 三球出局，你在休息區看著板凳上那個沒被叫上場的人。',
      },
      {
        id: 'pinch',
        label: '換上代打',
        baseRate: 0.55,
        rateMods: [{ source: 'scouting', label: '你的「識人」{{scouting}}', from: 'coachAttr', attr: 'scouting', points: 20 }],
        preview: ['成功：代打建功', '失敗：代打沒打出來，守備還變弱了'],
        action: 'PINCH_HIT',
        successText: '代打一上場就抓到第一球，球飛過內野。看台整個站起來。',
        failText: '代打完全沒跟上球速，三振。而且原來的守備位置現在空了。',
      },
    ],
  },
];
