// @ts-check
/**
 * 賽前事件卡。每屆賽事開打前抽兩張。
 *
 * 這是把「中華隊特有的痛點」放進遊戲的地方：旅外徵召、投手用量、
 * 媒體輿論、協會關說。每張卡三個選項，明碼標示成功率，
 * 而且遵守 yakyolife 的核心規則——**機率越低，幅度越大**。
 *
 * 卡片只能宣告 Effect[]，由 core/effects/apply.js 執行。
 * 內容不准直接操作 CareerState，否則加一張卡就要改一次引擎。
 */

/** @typedef {import('../../core/domain/types.js').EventCard} EventCard */

/** @type {readonly EventCard[]} */
export const EVENT_CARDS = [
  {
    id: 'overseas_callup',
    weight: 12,
    cast: [{ pick: 'acePitcher' }],
    title: '旅外球團不放人',
    body: '{{cast0}} 的球團回信了：可以放人，但要限制投球局數，而且不打複賽以後的場次。\n'
      + '經紀人在電話那頭說，這已經是他們能爭取到最好的條件。',
    options: [
      {
        id: 'push', label: '硬徵到底', baseRate: 0.34,
        preview: ['成功：完整戰力歸隊，全隊士氣大振', '失敗：徹底談崩，他這屆不會來，而且記恨'],
        onSuccess: [
          { t: 'meter', meter: 'playerMorale', delta: 10 },
          { t: 'playerLoyalty', target: 0, delta: 12 },
          { t: 'prestige', delta: 5 },
        ],
        onFail: [
          { t: 'playerLoyalty', target: 0, delta: -25 },
          { t: 'meter', meter: 'playerMorale', delta: -8 },
          { t: 'meter', meter: 'assocTrust', delta: -6 },
        ],
        successText: '你親自飛了一趟。三天後球團鬆口，{{cast0}} 全程參賽。',
        failText: '談判在第二通電話就破局。{{cast0}} 這屆不會出現，而且他知道是誰把事情搞砸的。',
      },
      {
        id: 'accept', label: '接受條件', baseRate: 0.62,
        preview: ['成功：人來了，但用量受限', '失敗：條件談定後對方又加碼要求'],
        onSuccess: [{ t: 'narrative', text: '{{cast0}} 歸隊，但只能投到複賽。' }, { t: 'meter', meter: 'assocTrust', delta: 4 }],
        onFail: [{ t: 'playerRating', target: 0, group: 'pit', key: 'stamina', delta: -8 }],
        successText: '{{cast0}} 準時報到。你在名單上把他的名字後面標了一個小小的星號。',
        failText: '簽完之後球團又追加了一條「每場不得超過 60 球」。你只能吞下去。',
      },
      {
        id: 'giveup', label: '放棄徵召，用本土', baseRate: 0.7,
        preview: ['成功：本土投手抓住機會，意外之喜', '失敗：戰力缺口補不起來'],
        onSuccess: [
          { t: 'coachAttr', attr: 'scouting', delta: 2 },
          { t: 'meter', meter: 'playerMorale', delta: 5 },
        ],
        onFail: [{ t: 'meter', meter: 'publicApproval', delta: -8 }],
        successText: '你把機會給了本土的年輕投手。牛棚練出來了，這比一個人更值錢。',
        failText: '沒有 {{cast0}} 的輪值明顯薄了一層，媒體隔天就開始算帳。',
      },
    ],
  },

  {
    id: 'workload_debate',
    weight: 10,
    cast: [{ pick: 'acePitcher' }],
    title: '賽前的用量爭議',
    body: '記者在賽前記者會上直接問：「{{cast0}} 這屆準備投幾局？」\n'
      + '去年有人被操到進手術室，這個問題現在很敏感。',
    options: [
      {
        id: 'promise_limit', label: '公開承諾嚴格限制用量', baseRate: 0.68,
        preview: ['成功：輿論買單，球員信任你', '失敗：被解讀成怕輸，賽前氣氛下滑'],
        onSuccess: [
          { t: 'meter', meter: 'publicApproval', delta: 8 },
          { t: 'coachAttr', attr: 'conditioning', delta: 2 },
        ],
        onFail: [{ t: 'meter', meter: 'publicApproval', delta: -5 }],
        successText: '你說「贏球不必用一個人的手臂換」。這句話上了隔天的頭版。',
        failText: '「還沒打就在想怎麼保護？」評論區不太買單。',
      },
      {
        id: 'deflect', label: '打太極，不承諾任何事', baseRate: 0.55,
        preview: ['成功：保留調度彈性', '失敗：被寫成迴避問題'],
        onSuccess: [{ t: 'coachAttr', attr: 'communication', delta: 1 }],
        onFail: [{ t: 'meter', meter: 'publicApproval', delta: -6 }, { t: 'meter', meter: 'assocTrust', delta: -3 }],
        successText: '「看狀況。」你講了五分鐘，什麼都沒說，記者也問不出東西。',
        failText: '標題下的是「總教練避答用量問題」。你連解釋的機會都沒有。',
      },
      {
        id: 'all_in', label: '直說：關鍵場次我會用到底', baseRate: 0.3,
        preview: ['成功：球員被激起來，全隊上下一條心', '失敗：輿論炎上，協會也不高興'],
        onSuccess: [
          { t: 'meter', meter: 'playerMorale', delta: 14 },
          { t: 'prestige', delta: 6 },
        ],
        onFail: [
          { t: 'meter', meter: 'publicApproval', delta: -14 },
          { t: 'meter', meter: 'assocTrust', delta: -10 },
        ],
        successText: '「該用的時候我會用。輸了算我的。」休息室裡沒有人有意見。',
        failText: '這句話被剪成三秒的短影音，配上去年那張手術照。',
      },
    ],
  },

  {
    id: 'association_pick',
    weight: 9,
    cast: [{ pick: 'oldestOver', age: 30 }],
    title: '協會高層的電話',
    body: '「有一位資深球員，很希望這次能入選。」\n'
      + '對方沒有直接說名字，但你知道他在講 {{cast0}}。\n'
      + '你也知道，那個名額本來要給誰。',
    options: [
      {
        id: 'accept', label: '照辦', baseRate: 0.72,
        preview: ['成功：換到協會的資源與信任', '失敗：休息室知道這件事了'],
        onSuccess: [{ t: 'meter', meter: 'assocTrust', delta: 12 }, { t: 'points', delta: 2 }],
        onFail: [{ t: 'meter', meter: 'playerMorale', delta: -12 }, { t: 'meter', meter: 'assocTrust', delta: 6 }],
        successText: '名單公布，沒有人多問。協會那邊的門從此好敲一點。',
        failText: '名單公布當天，被擠下去的那個人在社群發了一句「我盡力了」。',
      },
      {
        id: 'refuse', label: '拒絕，名單我自己決定', baseRate: 0.45,
        preview: ['成功：球員看見你護著他們，士氣大漲', '失敗：協會信任重挫，後面每件事都會卡'],
        onSuccess: [
          { t: 'meter', meter: 'playerMorale', delta: 16 },
          { t: 'prestige', delta: 8 },
          { t: 'meter', meter: 'assocTrust', delta: -6 },
        ],
        onFail: [
          { t: 'meter', meter: 'assocTrust', delta: -20 },
          { t: 'meter', meter: 'publicApproval', delta: -4 },
        ],
        successText: '「名單是我的責任。」電話那頭沉默了三秒，然後說「我知道了」。',
        failText: '從那天起，你要的東西都要多等兩個禮拜。',
      },
      {
        id: 'compromise', label: '折衷：讓他進名單但不排先發', baseRate: 0.58,
        preview: ['成功：兩邊都過得去', '失敗：兩邊都不滿意'],
        onSuccess: [{ t: 'meter', meter: 'assocTrust', delta: 6 }, { t: 'coachAttr', attr: 'communication', delta: 2 }],
        onFail: [{ t: 'meter', meter: 'assocTrust', delta: -8 }, { t: 'meter', meter: 'playerMorale', delta: -6 }],
        successText: '{{cast0}} 進了名單，坐在板凳上。雙方都當作沒事發生。',
        failText: '協會覺得你敷衍，球員覺得你妥協。這種折衷最糟。',
      },
    ],
  },

  {
    id: 'slump_veteran',
    weight: 10,
    cast: [{ pick: 'worstForm' }],
    title: '有人狀況掉得很明顯',
    body: '{{cast0}} 最近的打擊練習看起來完全不對。\n'
      + '他自己說沒事，但打擊教練私下跟你說了三次。',
    options: [
      {
        id: 'bench', label: '直接告訴他這屆不排先發', baseRate: 0.5,
        preview: ['成功：他接受並調整，後段回來了', '失敗：他當場翻臉，休息室氣氛炸裂'],
        onSuccess: [{ t: 'playerForm', target: 0, delta: 6 }, { t: 'coachAttr', attr: 'scouting', delta: 2 }],
        onFail: [{ t: 'meter', meter: 'playerMorale', delta: -14 }, { t: 'playerLoyalty', target: 0, delta: -15 }],
        successText: '「我知道。」他只說了這兩個字，然後多留了兩小時打擊。',
        failText: '他把球棒摔在置物櫃上。這件事當天晚上就傳出去了。',
      },
      {
        id: 'talk', label: '找他單獨談', baseRate: 0.64,
        preview: ['成功：問題被講開，狀況回穩', '失敗：談了等於沒談'],
        onSuccess: [
          { t: 'playerForm', target: 0, delta: 4 },
          { t: 'meter', meter: 'playerMorale', delta: 6 },
          { t: 'coachAttr', attr: 'communication', delta: 2 },
        ],
        onFail: [{ t: 'playerForm', target: 0, delta: -3 }],
        successText: '談到一半他才說出家裡的事。有些低潮跟揮棒無關。',
        failText: '他一直說「我沒事」。你也只能說好。',
      },
      {
        id: 'ignore', label: '不動他，相信老將自己會調整', baseRate: 0.4,
        preview: ['成功：他用一支關鍵安打回答所有質疑', '失敗：狀況持續下滑，還拖累打線'],
        onSuccess: [{ t: 'playerForm', target: 0, delta: 8 }, { t: 'prestige', delta: 4 }],
        onFail: [{ t: 'playerForm', target: 0, delta: -8 }, { t: 'meter', meter: 'publicApproval', delta: -6 }],
        successText: '老將就是老將。你什麼都沒做，是對的。',
        failText: '他的狀況一路掉到賽事開打。你事後想，那三次提醒你都聽見了。',
      },
    ],
  },

  {
    id: 'young_gun',
    weight: 11,
    cast: [{ pick: 'randomPlayer' }],
    title: '該不該把新人拔上來',
    body: '{{cast0}} 在熱身賽打出了所有人都沒預料到的內容。\n'
      + '把他放進名單，就得擠掉一個有經驗的。',
    options: [
      {
        id: 'promote', label: '拔上來，給他先發', baseRate: 0.42,
        preview: ['成功：一顆新星就此誕生', '失敗：大場面壓垮他，也壓垮打線'],
        onSuccess: [
          { t: 'playerRating', target: 0, group: 'bat', key: 'contact', delta: 4 },
          { t: 'playerForm', target: 0, delta: 6 },
          { t: 'prestige', delta: 7 },
          { t: 'coachAttr', attr: 'scouting', delta: 2 },
        ],
        onFail: [
          { t: 'playerForm', target: 0, delta: -8 },
          { t: 'meter', meter: 'publicApproval', delta: -7 },
        ],
        successText: '你賭對了。三年後所有人都會說當初是誰先看出來的。',
        failText: '國際賽的燈光跟熱身賽不一樣。他站在打擊區裡看起來很小。',
      },
      {
        id: 'bench_role', label: '帶他去，但先當板凳', baseRate: 0.66,
        preview: ['成功：他學到東西，下一屆就是主力', '失敗：從頭坐到尾，什麼也沒學到'],
        onSuccess: [{ t: 'playerForm', target: 0, delta: 3 }, { t: 'coachAttr', attr: 'scouting', delta: 1 }],
        onFail: [{ t: 'playerLoyalty', target: 0, delta: -8 }],
        successText: '他整屆只上場三次，但每一場都坐在最靠近你的位置。',
        failText: '整屆沒上場。回程飛機上他一句話都沒說。',
      },
      {
        id: 'leave', label: '不帶，讓他再磨一年', baseRate: 0.6,
        preview: ['成功：穩健的選擇，資深球員也安心', '失敗：他在國內打爆，你被問為什麼不帶'],
        onSuccess: [{ t: 'meter', meter: 'playerMorale', delta: 4 }],
        onFail: [{ t: 'meter', meter: 'publicApproval', delta: -9 }, { t: 'playerLoyalty', target: 0, delta: -10 }],
        successText: '名單維持原樣。老將們知道你不會為了一場熱身賽動搖。',
        failText: '你沒帶的那個人，在國內聯賽單月打了九支全壘打。',
      },
    ],
  },

  {
    id: 'media_pressure',
    weight: 9,
    requires: { op: 'lte', path: 'coach.meters.publicApproval', value: 45 },
    cast: [],
    title: '民調數字被做成新聞了',
    body: '某家媒體做了「你支持現任總教練嗎」的網路投票，結果放在首頁。\n'
      + '公關問你要不要回應。',
    options: [
      {
        id: 'fight', label: '公開反擊', baseRate: 0.32,
        preview: ['成功：硬起來反而圈粉，聲量翻轉', '失敗：越描越黑，全網炎上'],
        onSuccess: [{ t: 'meter', meter: 'publicApproval', delta: 18 }, { t: 'prestige', delta: 6 }],
        onFail: [{ t: 'meter', meter: 'publicApproval', delta: -12 }, { t: 'meter', meter: 'assocTrust', delta: -8 }],
        successText: '「網路投票決定不了先發名單。」這句話被做成梗圖，然後變成應援標語。',
        failText: '你的回應被逐句拆解。隔天的投票數字更難看。',
      },
      {
        id: 'ignore', label: '不回應，專心備戰', baseRate: 0.6,
        preview: ['成功：新聞熱度自己過去', '失敗：沉默被當成默認'],
        onSuccess: [{ t: 'meter', meter: 'playerMorale', delta: 5 }],
        onFail: [{ t: 'meter', meter: 'publicApproval', delta: -6 }],
        successText: '你什麼都沒說。一週後沒有人記得那個投票。',
        failText: '「總教練不回應」本身變成了下一則新聞。',
      },
      {
        id: 'players_first', label: '把焦點轉到球員身上', baseRate: 0.7,
        preview: ['成功：球員感受到你在擋子彈', '失敗：被說是拿球員當擋箭牌'],
        onSuccess: [{ t: 'meter', meter: 'playerMorale', delta: 10 }, { t: 'coachAttr', attr: 'communication', delta: 2 }],
        onFail: [{ t: 'meter', meter: 'publicApproval', delta: -4 }],
        successText: '你整場記者會只講球員的準備。休息室的人都看到了。',
        failText: '「別問我，去看他們練得多辛苦」——這句被寫成迴避。',
      },
    ],
  },

  {
    id: 'scouting_report',
    weight: 10,
    cast: [],
    title: '一份來路不明的情蒐報告',
    body: '有人把對手投手群的配球傾向整理成一份 40 頁的報告，匿名寄到協會。\n'
      + '內容看起來很專業，但你不知道它從哪來。',
    options: [
      {
        id: 'use', label: '照單全收，全隊研讀', baseRate: 0.48,
        preview: ['成功：情蒐大幅領先，整屆受用', '失敗：資料是錯的，球員被帶偏'],
        onSuccess: [{ t: 'coachAttr', attr: 'intel', delta: 5 }, { t: 'meter', meter: 'playerMorale', delta: 4 }],
        onFail: [{ t: 'coachAttr', attr: 'intel', delta: -2 }, { t: 'meter', meter: 'playerMorale', delta: -8 }],
        successText: '那份報告準得可怕。前三場的配球幾乎完全命中。',
        failText: '第二場就發現對不上。有人拿舊資料唬你，而你全隊都讀了。',
      },
      {
        id: 'verify', label: '先讓情蒐組交叉驗證', baseRate: 0.68,
        preview: ['成功：篩出可用的部分', '失敗：驗證花掉太多時間'],
        onSuccess: [{ t: 'coachAttr', attr: 'intel', delta: 3 }],
        onFail: [{ t: 'coachAttr', attr: 'conditioning', delta: -1 }, { t: 'narrative', text: '備戰時間被壓縮了。' }],
        successText: '驗過之後留下十二頁。十二頁真的東西比四十頁猜測有用。',
        failText: '驗到開賽前一天才驗完，結論是「大致沒錯」。這句話沒有任何幫助。',
      },
      {
        id: 'discard', label: '丟掉，用自己的資料', baseRate: 0.62,
        preview: ['成功：不受干擾，按自己的節奏', '失敗：對手的變化你完全沒準備'],
        onSuccess: [{ t: 'coachAttr', attr: 'scouting', delta: 2 }, { t: 'prestige', delta: 3 }],
        onFail: [{ t: 'coachAttr', attr: 'intel', delta: -3 }],
        successText: '你相信自己的團隊。那份報告在碎紙機裡。',
        failText: '對手換了配球邏輯，而你手上唯一提到這件事的資料被你丟了。',
      },
    ],
  },

  {
    id: 'camp_intensity',
    weight: 11,
    cast: [{ pick: 'oldestOver', age: 30 }],
    title: '賽前集訓的強度',
    body: '體能教練問你這次集訓要怎麼安排。\n'
      + '練得重，狀態上得快但有風險 —— 尤其 {{cast0}} 這種年紀的；\n'
      + '練得輕，開賽時可能還沒進入狀況。',
    options: [
      {
        id: 'hard', label: '高強度，一週練滿', baseRate: 0.38,
        preview: ['成功：全隊狀態拉到最高點', '失敗：有人在集訓就掛了'],
        onSuccess: [{ t: 'meter', meter: 'playerMorale', delta: 8 }, { t: 'coachAttr', attr: 'conditioning', delta: 3 }],
        onFail: [{ t: 'injure', target: 0, games: [1, 3], severity: 1 }, { t: 'meter', meter: 'playerMorale', delta: -6 }],
        successText: '第一場開打時，全隊看起來像已經打了半個球季。',
        failText: '集訓第四天 {{cast0}} 就拉傷了。你在名單上劃掉一個名字。',
      },
      {
        id: 'balanced', label: '照標準課表', baseRate: 0.66,
        preview: ['成功：穩定進入狀況', '失敗：不上不下'],
        onSuccess: [{ t: 'coachAttr', attr: 'conditioning', delta: 2 }],
        onFail: [{ t: 'narrative', text: '集訓平淡地結束了，沒有人變好也沒有人變差。' }],
        successText: '沒有意外，這本身就是好消息。',
        failText: '練完了，但你說不出全隊有什麼不一樣。',
      },
      {
        id: 'light', label: '減量，保留體力', baseRate: 0.6,
        preview: ['成功：零傷兵進入賽事', '失敗：開賽手感冰冷'],
        onSuccess: [{ t: 'coachAttr', attr: 'conditioning', delta: 2 }, { t: 'meter', meter: 'playerMorale', delta: 4 }],
        onFail: [{ t: 'meter', meter: 'playerMorale', delta: -5 }],
        successText: '全員健康站上開幕戰。這種事不會上新聞，但你知道有多難。',
        failText: '前兩場打線像還沒睡醒。',
      },
    ],
  },
];
