# 動手改之前

這份文件只寫**違反了不會報錯、但會靜默壞掉**的規則。
一般的風格問題交給 `npm run typecheck`，這裡講的是會毀掉遊戲的東西。

每一條都有對應的自動化檢查（`npm test` / `npm run lint:content`），
但檢查是最後一道防線，不是第一道。

---

## 1. 隨機數必須分流

**規則**

1. 每個隨機來源有自己的命名 key，不共用父流
2. 函式之間傳遞 **key 前綴字串**，不是 `Rng` 實例
3. 對集合做隨機迭代前，一律 `.slice().sort(穩定全序比較器)`
4. 比較機率前量化：`quantizeProb(p)`（`rng.bool()` 已經內建）

**為什麼**

單一 mutable 隨機流是這類遊戲最常見的災難。抽卡順序改一下、或某處多插一次
`rng.next()`，後面所有取值全部位移——**所有既有的種子碼一次失效**。
玩家貼給朋友的種子碼跑出不同人生，而你完全不知道是哪一行造成的。

分流之後，「新增一張事件卡」只影響那張卡自己的 key，比賽的逐球結果一顆都不會變。

```js
// ✅ 傳 key 字串，各自建流
const abKey = `${gameKey}/inn/07/top/ab/02`;
const rng = makeRng(seed, abKey);

// ❌ 傳實例：呼叫端的消耗量會影響被呼叫端
function resolve(rng) { ... }
```

**檢查**：`tests/determinism.test.js` 的「加一張永遠不會觸發的決策模板，不改變任何一顆球的結果」

---

## 2. 機率必須走帳本

任何寫死的 `rng.next() < 0.3` 都不准進 `core/`。必須是：

```js
rng.bool(computeOdds(base, mods).final)
```

**為什麼**

`computeOdds` 會把每一個影響因素連同**玩家看得懂的中文說明**一起留下，
UI 直接攤開給玩家看：

```
基準              40%
你的「用兵」22     −11
```

這是「不是黑箱」從口頭承諾變成架構保證的地方。一旦有人在某處寫死一個機率，
那個數字就永遠不會出現在帳本裡，玩家會覺得遊戲在騙他——而他是對的。

`rng.bool(p)` 用在**玩家不會經歷成結果的**擲骰（例如名字要兩個字還是一個字）是可以的。
判準是：**玩家會不會想問「為什麼」**。會，就走 `computeOdds`。

**檢查**：`tests/purity.test.js` 的「沒有裸露的 rng.next() 拿來跟寫死的機率比大小」

---

## 3. `applyEffects` 是唯一能改 `CareerState` 的地方

`CareerState` 是單一 immutable 樹。內容（事件卡、決策模板）不能直接改狀態，
只能宣告 `Effect[]`，由 `core/effects/` 執行。

**為什麼**：這是「新增 60 張卡不用碰一行引擎程式碼」的前提。
一旦有卡片開始直接操作 state，內容與引擎就黏死了，之後每加一張卡都要改引擎。

---

## 4. `core/` 是純邏輯

零 DOM、零 `Math.random`、零 `Date.now`、不 import `ui/` 或 `app/`。

需要隨機種子時，種子從外面傳進來——`core` 永遠只**消費**被給定的種子，
不自己產生。產生新種子的唯一地方是 `app/store.js` 的 `randomSeedCode()`。

**檢查**：`tests/purity.test.js`（含把 `Math.random` 換成會 throw 的版本跑完整段生涯）

---

## 5. 內容改動會讓既有種子碼失效，這是已接受的取捨

改動 `content/data/` 裡的任何東西 —— 事件卡、決策模板、球員原型、賽事定義 ——
都會讓既有的種子碼跑出不同的人生。**本作不提供跨版本重播。**

之前這裡寫的是「`content/data/` 凍結、新內容進 `v2/`、存檔綁定 pack 版本、
舊種子永遠用舊 pack 重播」。那段是假的：`core/` 直接寫死 import `content/data/`，
`save.js` 寫入的 `contentPack` 欄位沒有任何程式碼讀它。
留著一個程式碼做不到的規則，比沒有規則更糟 —— 它會讓後來的人以為舊存檔有保障。

要真的做到跨版本重播，需要把 ContentPack 改成參數注入（`runCareer(state, pack)`）
並建立版本 registry。那是一筆明確的工，不是一句註解。等到真的需要時再做。

**所以現在的規則很簡單**：動內容就等於發新版本，既有種子碼作廢。
golden 種子測試會在你動到內容時紅燈，那是提醒不是錯誤 —— 確認是刻意的之後更新它。

## 6. 絕不寫入真實球員姓名

所有球員程序生成。原型只描述「類型」（旅美左投），不描述「某人」。
`content/data/names.js` 的 `BLOCKED_NAMES` 只增不減。

**檢查**：`npm run lint:content` 會掃過整個 `content/` 與 `core/`

---

## 7. Golden 種子紅燈時，先查原因

`tests/determinism.test.js` 釘住了三個種子的完整結果。它紅燈代表**既有的種子碼會跑出
不同的人生**——朋友貼給你的種子碼失效了。

那不一定是 bug（有時是刻意的平衡調整），但一定需要一個人親自判斷。
**不要直接跑 `node tools/golden.js` 蓋掉。**確認是刻意的之後才更新，並在 commit
訊息裡寫清楚為什麼。

---

## 8. 分層方向是單向的

```
content/  ←  core/domain/  ←  core/sim/  ←  core/career/  ←  app/  ←  ui/
```

`core/career/` 可以 import `core/sim/`，反過來不行。
兩層都需要的規則（例如「投球負荷 → 有效疲勞」）放 `core/domain/`，
不要讓上層伸手進下層拿。

`core/career/career.js` 只是 re-export 入口，實作在同目錄的各檔案裡。
新增功能時放進對應的檔案，不要又把東西堆回入口檔。

## 9. 三個最陰險的具體坑

| 坑 | 症狀 | 做法 |
|---|---|---|
| `Object.keys` / `Set` / `Map` 迭代順序 | 偶發、難重現的不一致 | 一律走 `poolOrder` 這類明確的順序陣列 |
| 比較器回傳 0 時排序不穩定 | 同上 | 比較器必須全序，加 id 決勝（`byScoreThenId`） |
| `Array.prototype.sort` 就地修改 | 來源陣列被改掉 | 一律 `.slice().sort()` |

**檢查**：`tests/purity.test.js` 的「所有 .sort() 都作用在新陣列上」

---

## 平衡調整

所有平衡常數集中在 `content/tuning.js`。**不要**在 `core/` 裡寫裸露的魔術數字。

改完一定要跑：

```bash
node tools/balance.js games   --n 100
node tools/balance.js careers --n 200
```

兩者都有護欄（對日本勝率 15–42%、第一關淘汰率 < 35%、每種結局都要有人碰得到…）。
護欄用**區間**而非精確值，因為平衡最終是設計判斷，工具只負責把失控抓出來給人看。

**已知的陷阱**：對手球員的能力值本身就是由 `nation.strength` 生成的
（`core/sim/opponent.js`）。如果又在打席解算裡加一次「國家實力修正」，
強度會被算兩遍——早期版本就因為這樣把對日本勝率壓到 8%。
`TUNING.atBat.nationStrength` 刻意壓得很小，那不是筆誤。
