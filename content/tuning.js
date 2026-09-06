// @ts-check
/**
 * 全部平衡常數的唯一來源。
 *
 * 為什麼集中在這裡：平衡失控時，你需要一個地方可以改；如果數字散落在二十個檔案裡，
 * 調平衡就會變成考古。tools/balance.js 跑批次模擬時也只讀這裡。
 * 規則：core/ 底下不准出現裸露的魔術數字，一律 import 進來。
 */

export const TUNING = {
  /** 球員池 */
  pool: {
    size: 40,
    rosterSize: 28,
    lineupSize: 9,
    rotationSize: 4,
    bullpenSize: 7,
  },

  /** 教頭起始值 */
  coach: {
    startAttr: 22,
    capMin: 45,
    capMax: 85,
    /** 能力達上限的這個比例後，成長開始遞減（抄 yakyolife 的 70/75 手感） */
    softCapRatio: 0.75,
    softCapPenalty: 0.5,
    startMeters: { publicApproval: 38, assocTrust: 55, playerMorale: 50 },
    /**
     * 起始聲望。階段一固定為總教練，聲望只計算與顯示、不觸發升降；
     * 階段二會用它做 中職教練 → 教練團 → 總教練 的升降判定。
     */
    startPrestige: 55,
    prestigeThresholds: { NT_COACH: 45, NT_MANAGER: 75, demote: 25 },
    /**
     * 自動配置時每項能力的「場外」基準權重，會加到決策模板的引用權重上。
     *
     * 為什麼要逐項明列而不是給一個統一底數：模板引用次數只反映檯面上的價值。
     * 體能管理降低全隊投手的疲勞累積與傷病風險、識人決定潛力揭露精度，
     * 這些作用完全不透過決策模板發生。用統一底數的話，體能管理的目標佔比
     * 會低於五項平均，而五項起始值相同，於是它永遠拿不到任何點數。
     */
    autoAllocateBase: {
      bullpen: 10,       // 幾乎全部價值都在決策模板裡，已被計入
      scouting: 25,      // 名單建議品質、潛力顯示精度
      communication: 10, // 同用兵，主要在模板裡
      conditioning: 55,  // 疲勞累積速率 + 傷病機率，全隊投手都受影響
      intel: 20,         // 解鎖帶情報的選項
    },
  },

  /** 打席解算 */
  atBat: {
    /** 各結果的聯盟基準率（總和為 1） */
    base: {
      K: 0.215, BB: 0.085, HBP: 0.011,
      OUT_G: 0.245, OUT_F: 0.245,
      '1B': 0.14, '2B': 0.041, '3B': 0.004, HR: 0.03, ERR: 0.014,
    },
    /**
     * 能力每高於 50 共 25 點，對該結果基準率的「相對百分比」修正。
     * 例：contactToK = -25 代表 contact 75 的打者三振率 × (1 - 0.25) = 0.75 倍。
     * 這些值決定了「強弱差距有多大」，是整個遊戲最敏感的一組數字，
     * 改動後務必跑 tools/balance.js 確認勝率護欄沒破。
     */
    weight: {
      contactToK: -25, stuffToK: 28, veloToK: 10,
      eyeToBB: 30, controlToBB: -32,
      powerToHR: 42, controlToHR: -14,
      contactTo1B: 26, speedTo1B: 10,
      powerTo2B: 20, contactTo2B: 10, speedTo3B: 20,
      fieldToErr: -30,
    },
    /**
     * 對手國家實力對我方正面結果的相對百分比修正。
     *
     * ⚠️ 這個值刻意壓得小。對手球員的能力值本身已經是由 nation.strength 生成的
     * （見 core/sim/opponent.js），所以強度已經計入一次。這裡只代表「球員能力值
     * 以外」的隊伍素質：守備默契、板凳深度、國際賽經驗。
     * 早期版本這裡是 -18，造成強度被重複計算，對日本勝率被壓到 8%。
     */
    nationStrength: -6,

    /**
     * 教頭五項能力的平均值，對我方正面結果的相對百分比修正。
     *
     * 為什麼需要這一項：原本教頭能力只透過決策選項的成功率生效，作用點太少，
     * 22 → 90 對日本勝率只從 25% 升到 30%。結果是整段生涯練上來的能力
     * 幾乎不影響最後能不能拿金牌 —— 養成變成裝飾，而「勵志拿下奧運金牌」
     * 這個前提也就不成立。好教練本來就能讓球隊打出更多東西，
     * 這一項把那件事寫進模型。
     *
     * ⚠️ 基準點是「起始能力」而不是刻度中點 50。
     * 用 50 當基準的話，起始 22 的菜鳥教頭開局就被扣 15%，
     * 整個基礎平衡（對捷克勝率從 66% 掉到 52%）全部要重調。
     * 用起始值當基準，成長就是純粹的上檔 —— 這也比較符合「勵志」的調性：
     * 你感覺得到自己在變強，而不是一開始被懲罰。
     */
    coachQuality: 22,
  },

  /** 投手疲勞 */
  fatigue: {
    /** 球數超過這些門檻後，每球的能力衰減加速 */
    thresholds: [75, 90, 105],
    penaltyPerStep: [0.12, 0.3, 0.55],
    /** 續航能力每高於 50 共 25 點，門檻往後推幾球 */
    staminaShift: 8,
    /** 體能管理每高於 50 共 25 點，疲勞累積速率的乘數修正 */
    conditioningRelief: 0.18,
    /**
     * 跨場次疲勞。沒有這一段的話，先發投手上一場投 110 球，下一場照樣是全新的 ——
     * 而且「牛棚保留戰力」這種選項說明會變成謊話，因為不用牛棚根本沒有任何好處。
     */
    restRecoveryPitches: 32,  // 每休一場能消化掉的累積球數
    carryOverWeight: 0.5,     // 未消化的累積球數，有多少比例算進本場的有效球數

    /**
     * 自動換投門檻，依角色分開。
     *
     * 原本是一個 118 的統一上限，結果後援投手也被留到破百球（真實後援投 15–30 球），
     * 一場只用得到 2 個投手，終結者整屆賽事一球沒投。
     * 實際門檻 = base + ((續航 − 50) / 25) × staminaSwing
     */
    pullLimitStarter: 92,
    pullLimitReliever: 26,
    pullLimitStaminaSwing: 12,
  },

  /**
   * 賽前戰術傾向。
   *
   * 這必須是取捨而不是免費加成：積極提高多推進一個壘包的機率，
   * 但推進失敗時有機率在壘間被觸殺。保守反過來 —— 少拿分，也少送出局數。
   */
  stance: {
    aggressive: { advance: 0.14, thrownOut: 0.3 },
    balanced:   { advance: 0,    thrownOut: 0 },
    conservative: { advance: -0.14, thrownOut: -0.12 },
  },

  /** 決策點 */
  decision: {
    maxPerGame: 5,
    minPerGame: 3,
    /** Leverage Index 超過這個值才考慮暫停 */
    leverageThreshold: 1.4,
    /** 投手球數超過這個值必定觸發換投決策 */
    forcePitchCount: 95,
  },

  /** 賽事獎勵 */
  reward: {
    /**
     * 每場比賽結束當下就給的點數。
     * 把成長感攤到每一場，而不是等整屆打完才一次結算 ——
     * 原本 10 場只在最後給一次，中途完全沒有變強的感覺。
     */
    pointsPerWinGame: 2,
    pointsPerLossGame: 1,
    pointsPerWin: 1,
    /**
     * 名次獎勵的總倍率。
     *
     * 實測發現玩家到 2028 年時，教頭平均能力只從 22 練到 35.6（中位數），
     * 而能力上限平均是 64.8 —— 連一半潛力都沒用到。
     * 這代表「四年養成」在數值上幾乎沒發生，也是奪冠率上不去的真正原因。
     *
     * 拉這個倍率比拉 coachQuality 好：成長會真的被看見（進度條在動），
     * 而不是把每一點的效果放大到讓理論極限變得荒謬
     *（coachQuality 30 時滿能力教頭對日本勝率 90%，那樣後期就沒有張力了）。
     */
    pointsMultiplier: 3.4,
    /** 教頭能力平均值每高於 50 共 25 點，額外加成比例（「能力越高收穫越多」） */
    abilityBonusRatio: 0.35,
  },

  /** 受傷 */
  injury: {
    /**
     * 每場比賽的基礎受傷機率。
     * 只套用在「實際有上場」的球員身上 —— 原本是套用在整份 28 人名單，
     * 連整場坐板凳的人都有 4% 機率受傷，一屆下來傷掉 11 人（40% 的名單）。
     */
    perGameBase: 0.022,
    /** 耐用度每高於 50 共 25 點的百分點修正 */
    durability: -3,
    /** 單場球數超過這個門檻後，每多 10 球增加的傷病百分點 */
    overworkThreshold: 70,
    overworkPerTenPitches: 2.5,
  },
};
