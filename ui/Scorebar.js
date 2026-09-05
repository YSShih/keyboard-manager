// @ts-check
import { defineComponent, computed } from 'vue';
import { store } from '../app/store.js';

/**
 * 頂部記分板。壘包鑽石是這個介面的記憶點 —— 純 SVG，沒有圖片資產。
 */
export const Scorebar = defineComponent({
  name: 'Scorebar',
  setup() {
    const snap = computed(() => store.snapshot);
    const bases = computed(() => store.snapshot?.bases ?? [false, false, false]);
    const outs = computed(() => store.snapshot?.outs ?? 0);
    const meters = computed(() => store.state?.coach.meters);
    const inningText = computed(() => {
      const s = store.snapshot;
      if (!s) return '—';
      return `${s.inning} 局${s.half === 'top' ? '上' : '下'}`;
    });
    return { snap, bases, outs, meters, inningText, store };
  },
  template: /* html */ `
  <header class="scorebar">
    <div class="scorebar-inner">
      <div class="sb-cell wide">
        <span class="k">{{ store.stageName || '賽事' }}</span>
        <span class="sb-team">中華隊　<span style="color:var(--frost-dim)">vs</span>　{{ store.opponentName || '—' }}</span>
      </div>

      <div class="sb-cell">
        <span class="k">score</span>
        <span class="score-big">{{ store.runsUs }}<span class="sep">:</span>{{ store.runsThem }}</span>
      </div>

      <div class="sb-cell" :title="'壘包與出局數'">
        <div class="diamond" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <!-- 二壘在上、一壘在右、三壘在左，跟轉播圖一致 -->
            <rect class="base" :class="{on: bases[1]}" x="15" y="3"  width="10" height="10" transform="rotate(45 20 8)"/>
            <rect class="base" :class="{on: bases[0]}" x="27" y="15" width="10" height="10" transform="rotate(45 32 20)"/>
            <rect class="base" :class="{on: bases[2]}" x="3"  y="15" width="10" height="10" transform="rotate(45 8 20)"/>
          </svg>
        </div>
        <div class="outs">
          <i class="out-dot" :class="{on: outs > 0}"></i>
          <i class="out-dot" :class="{on: outs > 1}"></i>
        </div>
      </div>

      <div class="sb-cell">
        <span class="k">inning</span>
        <span class="v">{{ inningText }}</span>
      </div>

      <div class="sb-cell" v-if="meters" title="民調／協會信任／球員士氣">
        <span class="k">民調 / 信任 / 士氣</span>
        <span class="v" style="font-size:13px">
          <span :style="{color: meters.publicApproval < 20 ? 'var(--crimson)' : 'inherit'}">{{ meters.publicApproval }}</span>
          <span style="color:var(--rule)"> / </span>{{ meters.assocTrust }}<span style="color:var(--rule)"> / </span>{{ meters.playerMorale }}
        </span>
      </div>
    </div>
  </header>`,
});
