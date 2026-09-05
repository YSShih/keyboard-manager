# 霜民鍵盤總教練

> **你行你上**

2026 年經典賽，中華隊預賽 2 勝 2 敗、小組未晉級，最終第 13 名。總教練下台。

現在協會找上你。第一關是 **2027 年台北的世界 12 強**——亞洲區只有一張洛杉磯奧運門票，
你得壓過日本或韓國才拿得到。壓不過，就沒有 2028。

一個在瀏覽器裡跑的中華隊總教練模擬器。比賽自動推進，只在關鍵局面停下來問你：
現在換不換投？觸擊還是強攻？敬遠這一棒嗎？每個選項都明碼標示成功率，
而且點得開，看得到那個數字是怎麼算出來的。

---

## 怎麼跑

**沒有建置步驟。** 沒有 bundler、沒有轉譯、不用 `npm install`。

```bash
python3 -m http.server 8080
```

然後開 <http://localhost:8080>。

任何靜態檔案伺服器都可以（`npx serve`、`php -S localhost:8080`、VS Code Live Server…）。
**不能**直接用 `file://` 打開 `index.html`——ES modules 有 CORS 限制，瀏覽器會擋。
需要 server 只是為了把檔案送出去，不是建置。

要部署就是把整個目錄推上 GitHub Pages。全部走相對路徑，丟到哪個子目錄都能跑。

## 怎麼測

測試與型別檢查需要 **Node 22 以上**（用到內建的 `node --test`）。
本專案附 `.nvmrc`：

```bash
nvm use
npm install        # 只裝開發工具（TypeScript、Vue 的型別），遊戲本身不需要
npm test           # 67 個測試，含決定論、golden 種子與棒球規則
npm run typecheck  # JSDoc 型別檢查，永不產出檔案
npm run lint:content   # 內容靜態檢查（含真實球員姓名黑名單）
```

平衡測試（headless 批次模擬）：

```bash
node tools/balance.js games   --n 100      # 對各國勝率、K/BB/HR 率、每場決策數
node tools/balance.js careers --n 200      # 結局分布、奧運門票取得率、被解僱率
```

兩者都內建護欄，數值跑掉會以非零狀態碼結束。

---

## 技術棧：為什麼是零建置

| 面向 | 做法 |
|---|---|
| 模組 | 原生 ES modules，`<script type="module">`，瀏覽器直接載入 `.js` |
| 框架 | Vue 3.5.13，ESM 版，**vendor 進 repo**（`vendor/`），用 importmap 對應 |
| CSS | 手寫，custom properties。字體 Noto Serif TC ＋ JetBrains Mono |
| 型別 | JSDoc ＋ `// @ts-check`，`tsc --noEmit` 只在開發期檢查 |
| 測試 | `node --test`，直接跑 `core/` 的 `.js`，不需要 build |

Vue 是下載一份放進 `vendor/` 而不是執行期打 CDN。開發體驗一樣（改完存檔、重整就看到），
但 CDN 掛掉或被擋時遊戲不會整個開不起來，版本也被鎖死。

**取捨**：原生 ESM 每個模組一個 HTTP request（目前 30 個）。在 HTTP/2 下可忽略，
模組數破百才需要考慮合檔。

---

## 種子碼

每一局都由一組 **世界種子** 決定。相同種子 ＋ 相同選擇 ＝ **完全相同的一段人生**：
一樣的 40 人球員池、一樣的對手、一樣的每一顆球。

```
0800-4TJG-AFH
```

把種子碼貼給朋友，他會拿到一模一樣的牌。同樣的陣容、同樣的賽程，看他打不打得比你好。
也可以直接打一句話當種子（「中華隊加油」）。

種子碼用 Crockford Base32，會自動修正手抄時最常錯的 `I→1`、`L→1`、`O→0`，
大小寫與連字號都無所謂。抄錯太多則會被 checksum 擋下，而不是靜默跑出另一段人生。

結局畫面另外提供 **完整存檔字串**（種子＋你按過的每一個決策，約 700 字元），
貼回去可以完整重播你那一局。

---

## ⚠️ 球員資料聲明

**這個遊戲裡的所有球員都是程序生成的虛構人物，與任何真實球員無關。**

球員的「原型」只描述類型——「旅美左投」「中職重砲」「守備型內野」——不指涉特定真人。
姓名由姓氏與用字隨機組合產生，並且比對一份真實球員黑名單後才採用。
`tools/contentLint.js` 會掃過整個 `content/` 與 `core/`，確保沒有真實球員姓名被寫進資料。

國家隊實力值純為遊戲平衡而定，不代表任何真實排名。

---

## 致謝

靈感來自 **[YaKyoLife 棒球人生模擬器](https://www.yakyolife.com/)**（v1.5.12），
作者 [最先生 Mr.TheMost](https://www.threads.com/@mr.themost)。

本作參考的是它的**機制設計**，不是它的程式碼或內容：

1. **種子碼決定論**——「相同種子＋相同選擇＝相同人生」，可貼朋友的種子碼重跑
2. **明碼機率的風險報酬選擇**——不藏骰子，低機率＝大幅度，玩家自己承擔
3. **敘事與數字並置**——每個結果都有一句有記憶點的話，配上具體的數值增減

如果你喜歡這個遊戲，去玩玩看原作。

---

## 賽事資料來源

**已查證**（實作依此為準）：

- [2026 WBC 中華隊成績與最終排名（遠見）](https://www.gvm.com.tw/article/127165)
  ／[2026 年世界棒球經典賽（維基百科）](https://zh.wikipedia.org/zh-tw/2026%E5%B9%B4%E4%B8%96%E7%95%8C%E6%A3%92%E7%90%83%E7%B6%93%E5%85%B8%E8%B3%BD)
- [Premier12 2027 擴編 16 隊與新賽制（WBSC）](https://www.wbsc.org/en/news/expanded-wbsc-premier12-2027-unveils-new-format-as-road-to-tokyo-takes-shape)
  ／[2027 WBSC Premier12（維基百科）](https://en.wikipedia.org/wiki/2027_WBSC_Premier12)
  — 16 隊、四階段、開幕兩輪在台北、超級循環與獎牌戰在東京巨蛋、發放兩張 LA28 奧運門票
- [LA28 棒球賽程確認（WBSC）](https://www.wbsc.org/en/news/baseball-and-softball-competition-schedules-confirmed-for-la28-olympic-games)
  ／[Baseball at the 2028 Summer Olympics（維基百科）](https://en.wikipedia.org/wiki/Baseball_at_the_2028_Summer_Olympics)
  — 2028/7/13–19、道奇球場、僅 6 隊

**未查證，本作以遊戲化方式處理並在資料檔中標明**：

- Premier12 2027 的實際分組與對手名單（官方尚未公布）→ 自訂
- 晉級改用「最低勝場數」而非完整 16 隊積分模擬——玩家需要的是「再輸一場就出局」這種
  看得懂的壓力，不是一張看不懂的積分表
- 「亞洲最高名次」用一條明講的規則代替全隊模擬：**最終名次前 4，且至少擊敗日本或韓國一次**
- 2030 WBC 賽制（P2 才會用到）

---

## 開發狀態

**目前：P1 完成**——2027 世界 12 強單屆完整可玩。

| 階段 | 內容 | 狀態 |
|---|---|---|
| P1 | 種子碼、機率帳本、比賽引擎、關鍵決策、名單、能力分配、5 種結局、重播式存檔 | ✅ |
| P2 | 多屆生涯串接、球員成長衰退與世代替換、民調解僱、賽季間事件卡 | 未開始 |
| P3 | 旅外徵召談判、投手用量輿論、賽後記者會、協會關說 | 未開始 |
| P4 | 內容擴充至 60+ 卡、系統性平衡調校、生涯統計頁 | 未開始 |

設計決策與理由記錄在 [`docs/design/20260905-design.md`](docs/design/20260905-design.md)。
動手改之前請先讀 [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)——
裡面那些規則違反了不會報錯，只會靜默壞掉。

## 授權

程式碼 MIT。`vendor/vue.esm-browser.prod.js` 為 Vue 3，MIT，(c) Yuxi (Evan) You and Vue contributors。
