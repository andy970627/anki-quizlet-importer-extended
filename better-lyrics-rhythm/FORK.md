# Better Lyrics + 歌詞節奏模式（非官方 fork）

這個資料夾是 [Better Lyrics](https://github.com/better-lyrics/better-lyrics) 的非官方 fork，基於上游 commit
[`1d0e056`](https://github.com/better-lyrics/better-lyrics/commit/1d0e05644341cd964d264de053eb2d16e00122b9)（2026-09-26）。
fork 在原本的功能上加了一個**歌詞節奏模式**：在 YouTube Music 播歌時，畫面上會出現 osu 風格的打擊圈，
每個圈會在對應的歌詞「被唱出來」的那一刻縮到定位。

它跟這個 repo 裡另一個 `youtube-music-rhythm-extension/` 最大的差別是：音符的時間**直接來自 Better Lyrics
已經取得的同步歌詞**（逐字或逐行時間軸），不需要自己輸入 BPM 或 Tap Tempo。

## 授權

- 原專案與這個 fork 都是 **GNU GPL v3.0**，完整條款見 [LICENSE](LICENSE)。
- 如果你把這個 fork（原始碼或建置好的擴充套件）分享給別人，必須一起提供完整原始碼、保留 LICENSE，
  並維持 GPL-3.0 授權。
- 著作權屬於 Better Lyrics 的原作者群（見 [README.md](README.md) 的 contributors 名單）。fork 新增的部分同樣以 GPL-3.0 釋出。
- 這不是官方版本。請不要把 fork 的問題回報給原作者。

## 改了什麼（2026-09-26）

新增檔案：

| 檔案 | 用途 |
| --- | --- |
| `src/modules/rhythm/notes.ts` | 把同步歌詞轉成音符譜面：逐字或逐行模式、太密的音符合併（間隔 < 140ms）、依歌曲固定的 osu 式跳躍位置，以及判定和評級規則 |
| `src/modules/rhythm/rhythmGame.ts` | 遊戲本體：shadow DOM 面板、Canvas 繪圖、判定、計分、結果畫面；透過 `RhythmGameSource` 介面取得歌詞，不直接依賴 AppState |
| `src/modules/rhythm/connect.ts` | 把遊戲接到 Better Lyrics：讀 `AppState.parsedLyrics`、套用使用者的歌詞 offset、MV/音訊版本的 segment map 時間位移，以及跳轉播放位置 |
| `FORK.md` | 這份說明 |

修改檔案：

| 檔案 | 修改內容 |
| --- | --- |
| `src/index.ts` | 內容腳本啟動時呼叫 `initLyricRhythmMode()`；卸載時一起 `destroy()` |
| `manifest.json` | 改名為「Better Lyrics + 歌詞節奏模式（非官方 fork）」；拿掉官方的 `key`、`edge:key`、`chrome:update_url`，並把 Firefox 的 `gecko.id` 換掉，避免跟官方版的擴充套件 ID 衝突 |
| `README.md` | 最上面加了 fork 聲明 |

沒有帶進來的上游檔案：`.github/`（CI 設定，在子資料夾裡不會執行）、`.vscode/`、`tsconfig.tsbuildinfo`（建置快取）。

## 遊戲怎麼運作

- **時間來源**：沿用 Better Lyrics 本來就在用的 `blyrics-send-player-time` 事件（頁面播放器公開的播放進度），
  用跟側欄歌詞動畫一樣的方式在兩次回報之間插值。**不會擷取、錄製或下載任何音訊**。
- **譜面**：
  - 逐字模式：歌詞供應來源有逐字時間（richsync）時，每個字一個音符。
  - 逐行模式：每行一個音符；如果歌曲只有逐行時間，逐字模式也會自動改用逐行。
  - 未同步的歌詞沒有時間軸，所以不會產生音符。
- **偏移**：遊戲套用 Better Lyrics 的全域 offset、單曲 offset 與 richsync/逐行 trim，所以用 Better Lyrics 的 offset 調好歌詞，遊戲也會一起對準。
- **判定**（對歌詞時間的誤差）：PERFECT ≤ 90ms、GREAT ≤ 180ms、OK ≤ 280ms，超過算 MISS。每個音符的基本分是 300/100/50，另外加上 `min(連擊, 20) × 2` 的連擊加分。
- **評級**：SS / S / A / B / C / D，依準確率計算（S 需要 95% 以上而且沒有 MISS）。
- **操作**：點擊音符，或把準星移到音符上按 `Z` / `X`。游標停在輸入框時按鍵會被忽略，不影響打字。
- **跳轉與暫停**：拖動進度條時，畫面上的音符會清掉，從新的位置繼續；暫停歌曲時時間也會停住。「從頭挑戰」會跳到第一個音符前 3 秒重新開始。

## 建置與安裝

需要 Node.js ≥ 22.12。

```bash
cd better-lyrics-rhythm
npm ci
npm run build          # 輸出到 dist/chrome、dist/edge、dist/firefox
```

Chrome：打開 `chrome://extensions` → 開啟「開發人員模式」→「載入未封裝項目」→ 選 `better-lyrics-rhythm/dist/chrome`。

如果你已經裝了官方的 Better Lyrics，請先停用它，不然兩個都會去改 YouTube Music 的歌詞畫面。

打開 music.youtube.com，播一首有同步歌詞的歌，左下角會出現「♪ 歌詞節奏模式」按鈕，點它就能打開遊戲面板。

## 已知限制

- 因為拿掉了官方的擴充套件 key，擴充套件 ID 會不同，所以依賴官方 ID 的 **Unison 登入不能用**。一般歌詞顯示不受影響。
- 節奏準不準取決於歌詞供應來源本身的時間軸。有些來源的逐字時間本來就有誤差，可以用 Better Lyrics 的 offset 微調。
- 遊戲介面固定是繁體中文，沒有接 Better Lyrics 的多語系（`_locales`）系統。
- 我在開發環境做了這些測試：
  - 型別檢查（`tsc`）、biome 檢查與完整建置都通過。
  - 用假的播放時間和假歌詞跑過遊戲流程。
  - 確認建置好的擴充套件在 Chromium 會掛上按鈕。
  - 沒有在真正的 music.youtube.com 上實際玩過，因為測試環境無法連到 YouTube。
