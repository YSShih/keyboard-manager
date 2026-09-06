// @ts-check
/**
 * 能力點的成長規則與分配。
 */
import { COACH_ATTRS } from './coach.js';
import { TUNING } from '../../content/tuning.js';
import { DECISION_TEMPLATES } from '../../content/data/decisions.js';

/** @typedef {import('../domain/types.js').CareerState} CareerState */
/** @typedef {import('../domain/types.js').CoachAttrKey} CoachAttrKey */
/** @typedef {import('../domain/types.js').Coach} Coach */

/**
 * 成長遞減：越接近上限，每一點越難加。
 * @param {number} current
 * @param {number} cap
 * @param {number} points
 * @returns {number}
 */
export function applyGrowth(current, cap, points) {
  let v = current;
  for (let i = 0; i < points; i++) {
    if (v >= cap) break;
    const ratio = v / cap;
    v += ratio >= TUNING.coach.softCapRatio ? TUNING.coach.softCapPenalty : 1;
  }
  return Math.min(cap, Math.round(v * 10) / 10);
}

/**
 * @param {CareerState} st
 * @param {string} optionId
 * @param {number} available
 * @returns {CareerState}
 */
export function applyAllocation(st, optionId, available) {
  /** @type {any} */
  const attrs = { ...st.coach.attrs };
  let spent = 0;
  for (const part of optionId.split(',').filter(Boolean)) {
    const [k, nRaw] = part.split(':');
    const key = /** @type {CoachAttrKey} */ (k);
    const n = Number(nRaw);
    if (!COACH_ATTRS.includes(key) || !Number.isFinite(n) || n <= 0) continue;
    const use = Math.min(n, available - spent);
    if (use <= 0) continue;
    attrs[key] = applyGrowth(attrs[key], st.coach.caps[key], use);
    spent += use;
  }
  return {
    ...st,
    coach: { ...st.coach, attrs, unspentPoints: st.coach.unspentPoints - spent },
  };
}

/**
 * 自動配置能力點。
 *
 * 策略是「衝最有效益的」：每一點都挑
 *   （這一點實際能加多少）×（這項能力在決策模板裡被用到的權重）
 * 最高的項目。前者自動避開接近上限、加下去會遞減的能力；
 * 後者讓分配跟著實際內容走 —— 之後新增模板時，這個權重會自己更新，
 * 不需要回來改一張寫死的優先順序表。
 *
 * @param {Coach} coach
 * @param {number} points
 * @param {readonly import('../../content/data/decisions.js').Tmpl[]} templates
 * @returns {Partial<Record<CoachAttrKey, number>>}
 */
export function autoAllocate(coach, points, templates = DECISION_TEMPLATES) {
  /** @type {Record<string, number>} */
  const weight = {};
  // 基準權重：體能管理（疲勞、傷病）與識人（潛力揭露）的作用不透過決策模板發生，
  // 純看模板引用次數會嚴重低估它們。這個底數代表那些「場外」價值。
  for (const k of COACH_ATTRS) weight[k] = TUNING.coach.autoAllocateBase[k];
  for (const t of templates) {
    for (const o of t.options) {
      for (const m of o.rateMods ?? []) {
        if (m.from === 'coachAttr' && m.attr) {
          weight[m.attr] = (weight[m.attr] ?? 0) + Math.abs(m.points);
        }
      }
    }
  }
  const weightTotal = COACH_ATTRS.reduce((sum, k) => sum + (weight[k] ?? 0), 0) || 1;

  /** @type {Record<string, number>} */
  const attrs = {};
  for (const k of COACH_ATTRS) attrs[k] = coach.attrs[k];
  /** @type {Partial<Record<CoachAttrKey, number>>} */
  const alloc = {};

  for (let i = 0; i < points; i++) {
    const attrTotal = COACH_ATTRS.reduce((sum, k) => sum + (attrs[k] ?? 0), 0) || 1;
    /** @type {?CoachAttrKey} */
    let best = null;
    let bestGap = -Infinity;

    for (const k of COACH_ATTRS) {
      const cur = attrs[k] ?? 0;
      // 已達上限，加下去是浪費
      if (applyGrowth(cur, coach.caps[k], 1) - cur <= 0) continue;
      // 目前佔比距離「應有佔比」還差多少。差最多的先補。
      // 用比例而不是純權重排序，是因為純權重會讓最高權重的能力把所有點數吃光 ——
      // 但一維教頭實際上更弱：情蒐掛零就代表佈陣選項永遠很爛。
      const gap = (weight[k] ?? 0) / weightTotal - cur / attrTotal;
      // 同分時取 COACH_ATTRS 的固定順序，確保自動配置是決定性的
      if (gap > bestGap + 1e-9) { bestGap = gap; best = k; }
    }
    if (!best) break;
    attrs[best] = applyGrowth(attrs[best] ?? 0, coach.caps[best], 1);
    alloc[best] = (alloc[best] ?? 0) + 1;
  }
  return alloc;
}
