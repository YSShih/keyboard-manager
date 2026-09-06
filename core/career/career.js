// @ts-check
/**
 * 生涯模組的對外入口。
 *
 * 這個檔案只做 re-export。實作拆在同目錄的各個檔案裡：
 *   loop.js        狀態機（newCareer / runCareer）
 *   coach.js       能力與傾向常數
 *   choices.js     決策 optionId 編解碼
 *   allocation.js  能力點成長與分配
 *   postgame.js    賽後處理
 *   endings.js     結局判定
 *   roster.js      名單
 *   generate.js    球員生成
 *
 * 保留這個入口是為了讓既有的 import（UI、存檔、測試、工具）不用全部改寫。
 */
export { newCareer, runCareer } from './loop.js';
export { COACH_ATTRS, COACH_ATTR_LABEL, COACH_ATTR_DESC, STANCE_LABEL } from './coach.js';
export {
  encodeRosterChoice, encodeAllocChoice, encodePregameChoice,
  decodeRosterChoice, decodePregameChoice,
} from './choices.js';
export { applyGrowth, applyAllocation, autoAllocate } from './allocation.js';
export { applyPostGame, computeMeterDelta } from './postgame.js';
export { pickEnding } from './endings.js';
