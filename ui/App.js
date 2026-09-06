// @ts-check
import { defineComponent, computed } from 'vue';
import { store, setSpeed, SPEEDS } from '../app/store.js';
import { Scorebar } from './Scorebar.js';
import { Feed } from './Feed.js';
import { DecisionPanel, RosterPanel, AllocatePanel } from './Panels.js';
import { TitleScreen, EndingScreen } from './Screens.js';

export const App = defineComponent({
  name: 'App',
  components: { Scorebar, Feed, DecisionPanel, RosterPanel, AllocatePanel, TitleScreen, EndingScreen },
  setup() {
    const panel = computed(() => {
      const k = store.prompt?.kind;
      if (k === 'ROSTER') return 'RosterPanel';
      if (k === 'ALLOCATE') return 'AllocatePanel';
      if (store.prompt) return 'DecisionPanel';
      return null;
    });
    return { store, panel, setSpeed, SPEEDS };
  },
  template: /* html */ `
  <TitleScreen v-if="store.screen === 'title'" />
  <EndingScreen v-else-if="store.screen === 'ended'" />

  <div v-else class="game-shell">
    <div class="feed-wrap">
      <Scorebar />
      <Feed />
    </div>

    <aside class="panel">
      <component v-if="panel" :is="panel" />
      <div v-else class="panel-head">
        <span class="eyebrow">進行中</span>
        <h2>{{ store.stageName || '比賽進行中' }}</h2>
        <p>{{ store.venue }}　{{ store.opponentName ? '對手：' + store.opponentName : '' }}</p>
        <p style="margin-top:14px;color:var(--paper-mute);font-size:13px">
          比賽會自動推進，只在關鍵局面停下來問你。
        </p>
      </div>
    </aside>

    <nav class="transport" v-if="store.screen === 'playing'">
      <button v-for="s in SPEEDS" :key="s.id"
              :class="{on: store.speedId === s.id}" @click="setSpeed(s.id)">{{ s.label }}</button>
    </nav>
  </div>`,
});
