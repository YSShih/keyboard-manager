// @ts-check
import { defineComponent, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { store } from '../app/store.js';

/** 單一事件的呈現。 */
const FeedEntry = defineComponent({
  name: 'FeedEntry',
  props: { ev: { type: Object, required: true } },
  setup(props) {
    const e = computed(() => /** @type {any} */ (props.ev));
    const inn = computed(() => {
      const s = e.value.snapshot;
      return s ? `${s.inning}${s.half === 'top' ? '上' : '下'}` : '';
    });
    return { e, inn };
  },
  template: /* html */ `
  <div v-if="e.t === 'PHASE'" class="phase-card">
    <h2>{{ e.title }}</h2>
    <p>{{ e.body }}</p>
  </div>

  <div v-else-if="e.t === 'GAME_START'" class="game-head">
    <span class="vs">中華隊　vs　{{ e.opponentName }}</span>
    <span class="meta">{{ e.stageName }}　{{ e.venue }}</span>
  </div>

  <div v-else-if="e.t === 'PLAY'" class="play" :class="{scored: e.runs > 0}">
    <span class="inn">{{ inn }}</span>
    <span class="txt">{{ e.narrative }}</span>
  </div>

  <div v-else-if="e.t === 'SUBSTITUTION'" class="play sub">
    <span class="inn">▸</span>
    <span class="txt">{{ e.narrative }}</span>
  </div>

  <div v-else-if="e.t === 'HALF_END'" class="play half-end">
    <span class="inn"></span>
    <span>{{ e.snapshot.inning }} 局{{ e.snapshot.half === 'top' ? '上' : '下' }}結束　{{ e.snapshot.runsUs }} : {{ e.snapshot.runsThem }}</span>
  </div>

  <div v-else-if="e.t === 'GAME_END'" class="result-line">
    <span class="badge" :class="e.result.win ? 'win' : 'loss'">{{ e.result.win ? '勝' : '敗' }}</span>
    <span class="sc">{{ e.result.runsFor }} : {{ e.result.runsAgainst }}</span>
    <span class="hl" v-if="e.result.highlights.length">{{ e.result.highlights[0] }}</span>
  </div>

  <div v-else-if="e.t === 'NARRATIVE'" class="narrative" :class="e.entry.tone">
    <h3>{{ e.entry.title }}</h3>
    <p>{{ e.entry.text }}</p>
  </div>
  `,
});

export const Feed = defineComponent({
  name: 'Feed',
  components: { FeedEntry },
  setup() {
    // 播報是自動推進的，畫面必須跟著走，否則玩家只會看到一片不動的舊訊息。
    // 但玩家自己往回捲時不要把他拉回來 —— 那比不捲更煩。
    let stick = true;
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stick = gap < 140;
    };
    onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
    onUnmounted(() => window.removeEventListener('scroll', onScroll));

    watch(() => store.feed.length, async () => {
      if (!stick) return;
      await nextTick();
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    });

    return { store };
  },
  template: /* html */ `
  <div class="feed">
    <FeedEntry v-for="item in store.feed" :key="item.id" :ev="item.event" />
  </div>`,
});
