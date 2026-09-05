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
    pointsPerWin: 1,
    /** 教頭能力平均值每高於 50 共 25 點，額外加成比例（「能力越高收穫越多」） */
    abilityBonusRatio: 0.35,
  },

  /** 受傷 */
  injury: {
    /** 每場比賽的基礎受傷機率 */
    perGameBase: 0.04,
    /** 耐用度每高於 50 共 25 點的百分點修正 */
    durability: -3,
    /** 單場球數超過門檻後，每 10 球增加的百分點 */
    overworkPerTenPitches: 2.5,
  },
};
