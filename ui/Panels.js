// @ts-check
import { defineComponent, computed, ref } from 'vue';
import { store, choose } from '../app/store.js';
import { explainOdds } from '../core/odds/odds.js';
import { overall } from '../core/career/generate.js';
import { suggestRoster } from '../core/career/roster.js';
import {
  COACH_ATTRS, COACH_ATTR_LABEL, COACH_ATTR_DESC, STANCE_LABEL,
  encodeRosterChoice, encodeAllocChoice, encodePregameChoice, applyGrowth, autoAllocate,
} from '../core/career/career.js';
import { TUNING } from '../content/tuning.js';

/**
 * 機率帳本 —— 「不是黑箱」的證據。
 * 每一條修正都帶著中文說明，玩家點開就看得到 62% 是怎麼算出來的。
 */
const OddsLedger = defineComponent({
  name: 'OddsLedger',
  props: { odds: { type: Object, required: true } },
  setup(props) {
    const open = ref(false);
    const rows = computed(() => explainOdds(/** @type {any} */ (props.odds)));
    return { open, rows };
  },
  template: /* html */ `
  <div v-if="rows.length > 1">
    <button class="ledger-toggle" @click.stop="open = !open">
      {{ open ? '收合' : '這個數字怎麼來的' }}
    </button>
    <div class="ledger" v-if="open">
      <div v-for="(r, i) in rows" :key="i" class="ledger-row" :class="{base: i === 0}">
        <span class="lab">{{ r.label }}</span>
        <span class="val" :class="i === 0 ? '' : (r.value.startsWith('+') ? 'up' : 'down')">{{ r.value }}</span>
      </div>
    </div>
  </div>`,
});

/** 場中決策面板。 */
export const DecisionPanel = defineComponent({
  name: 'DecisionPanel',
  components: { OddsLedger },
  setup() {
    const p = computed(() => store.prompt);
    const ctx = computed(() => store.prompt?.context ?? null);
    const kindLabel = computed(() => ({
      PITCHING_CHANGE: '投手調度', PINCH_HIT: '代打', BUNT: '戰術暗號',
      IBB: '故意四壞', SHIFT: '守備佈陣', EVENT_CARD: '事件',
      ALLOCATE: '能力分配', ROSTER: '徵召名單', STEAL: '跑壘指示', PREGAME: '賽前調度',
    })[store.prompt?.kind ?? 'EVENT_CARD'] ?? '決策');
    return { p, ctx, kindLabel, choose, pct: (/** @type {number} */ v) => Math.round(v * 100) };
  },
  template: /* html */ `
  <div v-if="p">
    <div class="panel-head">
      <span class="eyebrow">決策　·　{{ kindLabel }}</span>
      <h2>{{ p.title }}</h2>
      <p>{{ p.body }}</p>
    </div>

    <div class="situation" v-if="ctx">
      <div class="col"><span class="k">局數</span><span class="v">{{ ctx.inning }}{{ ctx.half === 'top' ? '上' : '下' }}</span></div>
      <div class="col"><span class="k">出局</span><span class="v">{{ ctx.outs }}</span></div>
      <div class="col"><span class="k">比分</span><span class="v">{{ ctx.runsUs }}:{{ ctx.runsThem }}</span></div>
      <div class="col"><span class="k">球數</span><span class="v" :style="{color: ctx.pitchCount >= 95 ? 'var(--crimson)' : 'inherit'}">{{ ctx.pitchCount }}</span></div>
    </div>

    <button v-for="o in p.options" :key="o.id" class="opt"
            :disabled="!!o.lockedReason" @click="choose(o.id)">
      <div class="opt-top">
        <span class="opt-label">{{ o.label }}</span>
        <span class="opt-rate" v-if="o.odds">{{ pct(o.odds.final) }}%</span>
      </div>
      <div class="opt-bar" v-if="o.odds"><i :style="{width: pct(o.odds.final) + '%'}"></i></div>
      <p class="opt-preview" v-for="(pv, i) in o.preview" :key="i">{{ pv }}</p>
      <p class="opt-locked" v-if="o.lockedReason">{{ o.lockedReason }}</p>
      <OddsLedger v-if="o.odds" :odds="o.odds" />
    </button>
  </div>`,
});

/** 徵召名單面板。 */
export const RosterPanel = defineComponent({
  name: 'RosterPanel',
  setup() {
    const suggested = computed(() => {
      const st = store.state;
      if (!st) return [];
      return suggestRoster(st.players, st.poolOrder).members;
    });
    /** @type {import('vue').Ref<string[]|null>} */
    const picked = ref(null);
    const selected = computed(() => picked.value ?? suggested.value.slice());

    const pool = computed(() => {
      const st = store.state;
      if (!st) return [];
      return st.poolOrder.map((id) => st.players[id]).filter(Boolean);
    });

    const size = TUNING.pool.rosterSize;
    const stance = ref(store.lastStance);
    const STANCES = [
      { id: 'aggressive', desc: '跑者積極搶進壘包。多得分，也多被觸殺。' },
      { id: 'balanced', desc: '照一般判斷跑壘。' },
      { id: 'conservative', desc: '跑者只在有把握時推進。少丟出局數，也少拿分。' },
    ];
    const isIn = (/** @type {string} */ id) => selected.value.includes(id);
    const toggle = (/** @type {string} */ id) => {
      const cur = selected.value.slice();
      const i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(id);
      picked.value = cur;
    };
    const useSuggested = () => { picked.value = null; };
    const confirm = () => {
      store.lastStance = stance.value;
      choose(encodeRosterChoice(/** @type {any} */ (selected.value), /** @type {any} */ (stance.value)));
    };

    return { pool, selected, isIn, toggle, useSuggested, confirm, size, overall, store, stance, STANCES, STANCE_LABEL };
  },
  template: /* html */ `
  <div>
    <div class="panel-head">
      <span class="eyebrow">決策　·　徵召名單</span>
      <h2>{{ selected.length }} / {{ size }} 人</h2>
      <p>點球員可以加入或移出。守備位置與打序會依照你選的人重新推導。</p>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn-ghost" @click="useSuggested">回到建議名單</button>
      <button class="btn-primary" style="margin:0;padding:12px" :disabled="selected.length !== size" @click="confirm">
        {{ selected.length === size ? '確定，開打' : (selected.length > size ? '太多 ' + (selected.length - size) + ' 人' : '還差 ' + (size - selected.length) + ' 人') }}
      </button>
    </div>

    <div class="section-label">全隊跑壘方針</div>
    <button v-for="s in STANCES" :key="s.id" class="opt"
            :style="{borderColor: stance === s.id ? 'var(--frost)' : 'var(--rule)'}"
            @click="stance = s.id">
      <div class="opt-top"><span class="opt-label">{{ STANCE_LABEL[s.id] }}</span></div>
      <p class="opt-preview">{{ s.desc }}</p>
    </button>

    <div class="section-label">球員池（{{ selected.length }} / {{ size }}）</div>
    <div v-for="p in pool" :key="p.id" class="pcard"
         :style="{opacity: isIn(p.id) ? 1 : 0.34, cursor:'pointer', marginBottom:'6px',
                  borderColor: isIn(p.id) ? 'var(--frost-dim)' : 'var(--rule)'}"
         @click="toggle(p.id)">
      <div class="pcard-top">
        <span class="pos">{{ p.primary }}</span>
        <span class="nm">{{ p.name }}</span>
        <span class="no">#{{ p.number }}</span>
        <span class="ovr">{{ overall(p) }}</span>
      </div>
      <div class="sub">{{ p.age }} 歲　{{ p.archetypeLabel }}　<span class="club">{{ p.club }}</span></div>
    </div>
  </div>`,
});

/** 能力分配面板。 */
export const AllocatePanel = defineComponent({
  name: 'AllocatePanel',
  setup() {
    const total = computed(() => store.prompt?.extra?.points ?? 0);
    /** @type {import('vue').Ref<Record<string, number>>} */
    const alloc = ref(Object.fromEntries(COACH_ATTRS.map((k) => [k, 0])));
    const spent = computed(() => Object.values(alloc.value).reduce((s, v) => s + v, 0));
    const left = computed(() => total.value - spent.value);

    const attrs = computed(() => {
      const c = store.state?.coach;
      if (!c) return [];
      return COACH_ATTRS.map((k) => {
        const cur = c.attrs[k];
        const cap = c.caps[k];
        const after = applyGrowth(cur, cap, alloc.value[k] ?? 0);
        return {
          key: k, label: COACH_ATTR_LABEL[k], desc: COACH_ATTR_DESC[k],
          cur, cap, after,
          // 上限是隱藏的：進度條用「相對於理論最大值 99」來畫，不洩漏 cap。
          pctNow: Math.min(100, cur / 99 * 100),
          pctAfter: Math.min(100, after / 99 * 100),
          n: alloc.value[k] ?? 0,
          atCap: after >= cap,
        };
      });
    });

    const add = (/** @type {string} */ k) => { if (left.value > 0) alloc.value[k] = (alloc.value[k] ?? 0) + 1; };
    const sub = (/** @type {string} */ k) => { if ((alloc.value[k] ?? 0) > 0) alloc.value[k] = (alloc.value[k] ?? 0) - 1; };
    const reset = () => { for (const k of COACH_ATTRS) alloc.value[k] = 0; };

    /** 一鍵配置：依各能力的實際有用程度分配，並跳過已達上限的項目。 */
    const auto = () => {
      const coach = store.state?.coach;
      if (!coach) return;
      const picked = autoAllocate(coach, total.value);
      for (const k of COACH_ATTRS) alloc.value[k] = picked[k] ?? 0;
    };

    const confirm = () => choose(encodeAllocChoice(/** @type {any} */ (alloc.value)));

    return { total, left, attrs, add, sub, reset, auto, confirm, store };
  },
  template: /* html */ `
  <div>
    <div class="panel-head">
      <span class="eyebrow">決策　·　能力分配</span>
      <h2>{{ store.prompt?.title }}</h2>
      <p>{{ store.prompt?.body }}</p>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span class="points-left" style="margin:0">剩餘 {{ left }} 點</span>
      <button class="btn-ghost" style="margin-left:auto;padding:8px 12px" @click="auto">自動配置</button>
      <button class="btn-ghost" style="padding:8px 12px" @click="reset" :disabled="left === total">清除</button>
    </div>

    <div v-for="a in attrs" :key="a.key" class="alloc-row" style="flex-wrap:wrap">
      <span class="alloc-name">{{ a.label }}</span>
      <div class="alloc-bar">
        <u :style="{width: a.pctAfter + '%'}"></u>
        <i :style="{width: a.pctNow + '%'}"></i>
      </div>
      <span class="alloc-val">
        <b>{{ a.cur }}</b><span v-if="a.after !== a.cur"> → {{ a.after }}</span>
      </span>
      <div class="alloc-btns">
        <button @click="sub(a.key)" :disabled="a.n === 0">−</button>
        <button @click="add(a.key)" :disabled="left === 0 || a.atCap">＋</button>
      </div>
      <div class="alloc-desc" style="flex-basis:100%">
        {{ a.desc }}<span v-if="a.atCap" style="color:var(--amber)">　·　已達上限</span>
      </div>
    </div>

    <button class="btn-primary" @click="confirm">
      {{ left > 0 ? '還有 ' + left + ' 點沒分配，仍要確定' : '確定分配' }}
    </button>
  </div>`,
});
