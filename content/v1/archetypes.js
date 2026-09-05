// @ts-check
/**
 * 球員原型。
 *
 * 原型只描述「類型」（旅美左投、中職重砲），不指涉任何特定真人。
 * 這是刻意的設計：玩家看到「旅美左投・大聯盟40人名單」會自己腦補出情感連結，
 * 但遊戲不需要、也不應該去碰真實球員的姓名與數據。
 *
 * batMean / pitMean 的值是 [平均, 標準差]，套在 0..99 的能力尺度上。
 * callupDifficulty 是徵召難度（0..100），P3 的旅外徵召談判會用到；P1 只用來標示風險。
 */

/** @type {readonly import('../../core/domain/types.js').Archetype[]} */
export const ARCHETYPES = [
  {
    id: 'MLB_LHP',
    label: '旅美左投',
    league: 'MLB',
    positions: ['SP'],
    ageRange: [22, 29],
    batMean: {},
    pitMean: { velo: [72, 7], control: [60, 8], stuff: [70, 7], stamina: [64, 8] },
    callupDifficulty: 82,
    clubs: ['大聯盟40人名單', '3A 隊', '大聯盟先發輪值'],
    weight: 4,
  },
  {
    id: 'NPB_STARTER',
    label: '旅日先發',
    league: 'NPB',
    positions: ['SP'],
    ageRange: [24, 32],
    batMean: {},
    pitMean: { velo: [63, 6], control: [70, 7], stuff: [64, 7], stamina: [72, 7] },
    callupDifficulty: 64,
    clubs: ['日職一軍', '日職先發輪值'],
    weight: 5,
  },
  {
    id: 'CPBL_STARTER',
    label: '中職先發',
    league: 'CPBL',
    positions: ['SP'],
    ageRange: [23, 33],
    batMean: {},
    pitMean: { velo: [58, 7], control: [62, 8], stuff: [57, 8], stamina: [66, 8] },
    callupDifficulty: 24,
    clubs: ['中職本土先發', '中職輪值主力'],
    weight: 9,
  },
  {
    id: 'CPBL_RELIEVER',
    label: '中職後援',
    league: 'CPBL',
    positions: ['RP', 'CP'],
    ageRange: [22, 34],
    batMean: {},
    pitMean: { velo: [64, 8], control: [56, 9], stuff: [63, 8], stamina: [38, 8] },
    callupDifficulty: 22,
    clubs: ['中職牛棚', '中職後援主力', '中職終結者'],
    weight: 14,
  },
  {
    id: 'CPBL_SLUGGER',
    label: '中職重砲',
    league: 'CPBL',
    positions: ['1B', 'DH', 'LF', 'RF'],
    ageRange: [24, 34],
    batMean: {
      contact: [58, 8], power: [72, 8], eye: [58, 9],
      speed: [42, 8], field: [46, 9], arm: [55, 9],
    },
    pitMean: {},
    callupDifficulty: 26,
    clubs: ['中職中心打線', '中職全壘打常客'],
    weight: 10,
  },
  {
    id: 'CPBL_CONTACT',
    label: '中職安打製造機',
    league: 'CPBL',
    positions: ['2B', 'CF', 'LF', 'RF'],
    ageRange: [22, 32],
    batMean: {
      contact: [72, 7], power: [46, 8], eye: [64, 8],
      speed: [66, 9], field: [60, 8], arm: [54, 9],
    },
    pitMean: {},
    callupDifficulty: 24,
    clubs: ['中職開路先鋒', '中職打擊率常勝軍'],
    weight: 12,
  },
  {
    id: 'CPBL_GLOVE',
    label: '守備型內野',
    league: 'CPBL',
    positions: ['SS', '2B', '3B'],
    ageRange: [22, 33],
    batMean: {
      contact: [56, 8], power: [44, 8], eye: [52, 8],
      speed: [60, 8], field: [74, 7], arm: [70, 8],
    },
    pitMean: {},
    callupDifficulty: 22,
    clubs: ['中職金手套候選', '中職內野防線'],
    weight: 10,
  },
  {
    id: 'CPBL_CATCHER',
    label: '中職捕手',
    league: 'CPBL',
    positions: ['C'],
    ageRange: [23, 34],
    batMean: {
      contact: [54, 8], power: [52, 9], eye: [56, 8],
      speed: [34, 7], field: [66, 8], arm: [70, 8],
    },
    pitMean: {},
    callupDifficulty: 20,
    clubs: ['中職正捕手', '中職捕手輪替'],
    weight: 7,
  },
  {
    id: 'MLB_BAT',
    label: '旅美野手',
    league: 'MiLB',
    positions: ['CF', 'SS', '3B', 'RF'],
    ageRange: [21, 27],
    batMean: {
      contact: [64, 9], power: [64, 9], eye: [62, 9],
      speed: [66, 9], field: [64, 9], arm: [64, 9],
    },
    pitMean: {},
    callupDifficulty: 74,
    clubs: ['小聯盟2A', '小聯盟3A', '大聯盟40人名單'],
    weight: 5,
  },
  {
    id: 'AMATEUR_PROSPECT',
    label: '業餘新秀',
    league: 'AMATEUR',
    positions: ['SP', 'RP', 'CF', 'SS', 'C', '1B'],
    ageRange: [19, 23],
    batMean: {
      contact: [48, 10], power: [48, 10], eye: [44, 9],
      speed: [58, 10], field: [52, 10], arm: [56, 10],
    },
    pitMean: { velo: [58, 9], control: [48, 9], stuff: [52, 9], stamina: [54, 10] },
    callupDifficulty: 12,
    clubs: ['大學隊主力', '業餘成棒'],
    weight: 6,
  },
];

/** 特質。P1 只有少數會實際影響模擬，其餘是敘事調味。 */
export const TRAITS = [
  'CLUTCH',      // 大心臟
  'GLASS',       // 玻璃體質
  'WORKHORSE',   // 鐵人
  'MEDIA_DARLING', // 媒體寵兒
  'HOT_HEAD',    // 情緒化
  'VETERAN',     // 老將領袖
];

/** @type {Record<string, string>} */
export const TRAIT_LABEL = {
  CLUTCH: '大心臟',
  GLASS: '玻璃體質',
  WORKHORSE: '鐵人',
  MEDIA_DARLING: '媒體寵兒',
  HOT_HEAD: '情緒化',
  VETERAN: '老將領袖',
};
