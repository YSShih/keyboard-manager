// @ts-check
import { defineComponent, computed, ref, onMounted } from 'vue';
import { store, start, reset, randomSeedCode, currentSeedCode, decisionCount } from '../app/store.js';
import { CALENDAR } from '../content/data/calendar.js';

export const TitleScreen = defineComponent({
  name: 'TitleScreen',
  setup() {
    const roll = () => { store.seedInput = randomSeedCode(); };
    // 預設就顯示一組種子碼，而不是留白。
    // 空白輸入框只會讓人以為那是選填欄位，種子碼是這個遊戲的社群機制核心，
    // 應該一開始就看得到、複製得走。
    onMounted(() => { if (!store.seedInput.trim()) roll(); });
    return { store, start, roll, calendar: CALENDAR };
  },
  template: /* html */ `
  <div class="title-screen">
    <div class="title-card">
      <div class="title-mark">2024 → 2028 · TAIPEI · TOKYO · LOS ANGELES</div>

      <h1 class="game-title">霜民<span class="frost">鍵盤</span>總教練</h1>
      <p class="slogan">你行你上</p>

      <div class="premise">
        2024 年 11 月，中華隊 <strong>4：0 完封日本</strong>，終結對手 27 連勝，
        拿下隊史第一座國際一級賽事冠軍。總教練在慶功宴上宣布引退。<br><br>
        一個月後，協會找上你。桌上除了合約，還有一份
        <strong>2028 洛杉磯奧運</strong>的評估報告。
      </div>

      <div class="premise" style="border-left-color:var(--amber);margin-top:-14px">
        <span class="eyebrow" style="display:block;margin-bottom:6px">四年，六場硬仗</span>
        <span v-for="(t, i) in calendar" :key="t.id" style="display:block;font-size:13.5px">
          {{ t.year }}　{{ t.name }}<span v-if="t.stake === 'ticket'" style="color:var(--amber)">　·　奧運門票</span><span v-if="t.stake === 'gold'" style="color:var(--frost)">　·　金牌</span>
        </span>
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
                 placeholder="貼上朋友的種子碼" @keyup.enter="start()">
          <button class="btn-ghost" @click="roll">換一個</button>
        </div>
      </div>

      <p class="hint">相同種子＋相同選擇＝完全相同的一段人生。可以貼朋友的種子碼，也可以直接打一句話當種子。</p>
      <p class="err" v-if="store.error">{{ store.error }}</p>

      <button class="btn-primary" @click="start()">接下中華隊　▸</button>
    </div>
  </div>`,
});

export const EndingScreen = defineComponent({
  name: 'EndingScreen',
  setup() {
    const copied = ref('');
    const history = computed(() => store.state?.history ?? []);
    const wins = computed(() => history.value.reduce((s, h) => s + h.wins, 0));
    const losses = computed(() => history.value.reduce((s, h) => s + h.losses, 0));
    const coach = computed(() => store.state?.coach);

    /** @param {string} text @param {string} what */
    const copy = async (text, what) => {
      try { await navigator.clipboard.writeText(text); copied.value = what; setTimeout(() => (copied.value = ''), 1800); }
      catch { copied.value = 'fail'; }
    };
    return { store, reset, history, wins, losses, coach, copy, copied, currentSeedCode, decisionCount };
  },
  template: /* html */ `
  <div class="ending-screen">
    <div class="ending-card">
      <div class="title-mark">生涯結束 · {{ store.state?.year }}</div>
      <h1>{{ store.ending?.title }}</h1>
      <p class="body">{{ store.ending?.text }}</p>

      <div class="section-label">四年回顧</div>
      <div class="career-table">
        <div v-for="h in history" :key="h.defId" class="career-row"
             :class="{ crown: h.rankNum === 1 }">
          <span class="yr num">{{ h.year }}</span>
          <span class="nm">{{ h.name }}</span>
          <span class="rk">{{ h.rankLabel }}</span>
          <span class="wl num">{{ h.wins }}–{{ h.losses }}</span>
        </div>
      </div>

      <div class="ending-stats">
        <div><div class="k">總戰績</div><div class="v">{{ wins }}–{{ losses }}</div></div>
        <div><div class="k">聲望</div><div class="v">{{ coach?.prestige }}</div></div>
        <div><div class="k">民調</div><div class="v">{{ coach?.meters.publicApproval }}</div></div>
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
