// @ts-check
import { defineComponent, computed, ref } from 'vue';
import { store, start, reset, randomSeedCode, currentSeedCode, decisionCount } from '../app/store.js';
import { PREMIER12_2027, OLYMPIC_BERTH_RULE } from '../content/v1/tournaments.js';

export const TitleScreen = defineComponent({
  name: 'TitleScreen',
  setup() {
    const roll = () => { store.seedInput = randomSeedCode(); };
    return { store, start, roll, def: PREMIER12_2027, rule: OLYMPIC_BERTH_RULE };
  },
  template: /* html */ `
  <div class="title-screen">
    <div class="title-card">
      <div class="title-mark">2027 · WBSC PREMIER12 · TAIPEI → TOKYO</div>

      <h1 class="game-title">霜民<span class="frost">鍵盤</span>總教練</h1>
      <p class="slogan">你行你上</p>

      <div class="premise">
        2026 年經典賽，中華隊預賽 2 勝 2 敗，小組未晉級，<strong>最終第 13 名</strong>。總教練下台。<br>
        現在協會找上你。第一關是 <strong>2027 年台北的世界 12 強</strong>——
        {{ rule.explain }}
      </div>

      <div class="field">
        <label for="coach">你的名字</label>
        <input id="coach" type="text" v-model="store.coachName" placeholder="總教練" maxlength="12"
               @keyup.enter="start()">
      </div>

      <div class="field">
        <label for="seed">世界種子</label>
        <div class="field-row">
          <input id="seed" type="text" v-model="store.seedInput"
                 placeholder="留空隨機　或貼上朋友的種子碼" @keyup.enter="start()">
          <button class="btn-ghost" @click="roll">換一個</button>
        </div>
      </div>

      <p class="hint">相同種子＋相同選擇＝完全相同的一段人生。也可以直接打一句話當種子。</p>
      <p class="err" v-if="store.error">{{ store.error }}</p>

      <button class="btn-primary" @click="start()">接下中華隊　▸</button>
    </div>
  </div>`,
});

export const EndingScreen = defineComponent({
  name: 'EndingScreen',
  setup() {
    const copied = ref('');
    const results = computed(() => store.state?.tournament?.results ?? []);
    const wins = computed(() => results.value.filter((r) => r.win).length);
    const losses = computed(() => results.value.length - wins.value);
    const coach = computed(() => store.state?.coach);

    /** @param {string} text @param {string} what */
    const copy = async (text, what) => {
      try { await navigator.clipboard.writeText(text); copied.value = what; setTimeout(() => (copied.value = ''), 1800); }
      catch { copied.value = 'fail'; }
    };
    return { store, reset, results, wins, losses, coach, copy, copied, currentSeedCode, decisionCount };
  },
  template: /* html */ `
  <div class="ending-screen">
    <div class="ending-card">
      <div class="title-mark">生涯結束 · {{ store.state?.year }}</div>
      <h1>{{ store.ending?.title }}</h1>
      <p class="body">{{ store.ending?.text }}</p>

      <div class="ending-stats">
        <div><div class="k">戰績</div><div class="v">{{ wins }}–{{ losses }}</div></div>
        <div><div class="k">民調</div><div class="v">{{ coach?.meters.publicApproval }}</div></div>
        <div><div class="k">協會信任</div><div class="v">{{ coach?.meters.assocTrust }}</div></div>
        <div><div class="k">決策次數</div><div class="v">{{ decisionCount() }}</div></div>
      </div>

      <div class="share-box">
        <span class="eyebrow">你的世界種子</span>
        <div class="share-code">{{ currentSeedCode() }}</div>
        <p class="hint" style="margin:0 0 12px">
          把這串貼給朋友，他會拿到一模一樣的球員池與賽程。同樣的牌，看他打不打得比你好。
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-ghost" @click="copy(currentSeedCode(), 'seed')">
            {{ copied === 'seed' ? '已複製 ✓' : '複製種子碼' }}
          </button>
          <button class="btn-ghost" v-if="store.shareString" @click="copy(store.shareString, 'save')">
            {{ copied === 'save' ? '已複製 ✓' : '複製完整存檔（含每一個決策）' }}
          </button>
          <span class="err" v-else-if="store.error" style="margin:0">{{ store.error }}</span>
        </div>
      </div>

      <button class="btn-primary" @click="reset()">再來一次</button>
    </div>
  </div>`,
});
