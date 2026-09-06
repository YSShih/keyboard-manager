// @ts-check
/**
 * 教頭能力與戰術傾向的常數。純資料、零邏輯，UI 與 core 都能安全 import。
 */

/** @typedef {import('../domain/types.js').CoachAttrKey} CoachAttrKey */

/** @type {readonly CoachAttrKey[]} */
export const COACH_ATTRS = ['bullpen', 'scouting', 'communication', 'conditioning', 'intel'];

/** @type {Record<CoachAttrKey, string>} */
export const COACH_ATTR_LABEL = {
  bullpen: '用兵', scouting: '識人', communication: '溝通',
  conditioning: '體能管理', intel: '情蒐',
};

/** @type {Record<CoachAttrKey, string>} */
export const COACH_ATTR_DESC = {
  bullpen: '換投決策的成功率，以及接手投手的狀況',
  scouting: '名單建議品質，以及球員潛力看得多準',
  communication: '球員士氣，以及戰術暗號的執行度',
  conditioning: '投手疲勞累積速度與傷病風險',
  intel: '解鎖帶情報的決策選項，並提高佈陣成功率',
};

/** @type {Record<string, string>} */
export const STANCE_LABEL = {
  aggressive: '積極',
  balanced: '平衡',
  conservative: '保守',
};
