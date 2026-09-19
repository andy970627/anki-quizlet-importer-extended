# Unity 遊戲製作入門

這是一份給初學者的 Unity 遊戲開發入門教材，附上一個可直接匯入 Unity Editor 的最小專案骨架與三支範例腳本。跟著本文件操作一次，你就會完成一個「玩家移動 + 收集金幣 + 計分」的最小可玩原型。

> 這個資料夾是獨立的 Unity 專案，跟同一個 repo 裡的 Anki/Quizlet 匯入工具無關，純粹作為學習教材存放。

## 1. 事前準備

1. 安裝 **Unity Hub**：https://unity.com/download
2. 透過 Unity Hub 安裝一個 **LTS（長期支援）版本**的 Unity Editor，例如 2022 LTS 或更新的 LTS 版本。初學建議固定用同一個版本，避免升級版本時遇到相容性問題。
3. 安裝時勾選對應平台的 Build Support（例如要出 Windows/Mac 就勾對應模組），初學階段可以先只裝編輯器本體。

## 2. 用 Unity Hub 開啟本專案

1. 打開 Unity Hub → **Projects** → **Add** → **Add project from disk**。
2. 選擇這個資料夾（`unity-game-dev-101/`）。
3. Unity Hub 會提示選擇 Editor 版本，選你安裝的 LTS 版本即可。
4. 點開專案，Unity 第一次開啟時會自動產生 `Library/`、`Temp/` 等資料夾（這些是編輯器快取，已經寫進 `.gitignore`，不需要、也不應該進版控)。

## 3. Unity 編輯器介面導覽

開啟專案後會看到幾個主要面板：

| 面板 | 用途 |
|---|---|
| **Scene** | 場景編輯視窗，用滑鼠拖拉/擺放遊戲物件 |
| **Game** | 模擬實際執行遊戲時玩家會看到的畫面，按上方 ▶️ Play 鍵執行 |
| **Hierarchy** | 目前場景中所有 GameObject 的清單（樹狀結構） |
| **Inspector** | 選中某個 GameObject 後，顯示它掛載的所有 Component 與參數 |
| **Project** | 專案內所有檔案（Assets）的瀏覽器，對應到 `Assets/` 資料夾 |
| **Console** | 顯示 `Debug.Log`、警告、錯誤訊息，除錯必看 |

## 4. 核心觀念：GameObject 與 Component

Unity 採用「組合優於繼承」的架構：

- **GameObject**：場景中的任何一個「東西」（玩家、敵人、金幣、燈光、攝影機……）本身沒有行為，只是一個容器。
- **Component**：掛載在 GameObject 上的功能模組，例如 `Transform`（位置/旋轉/縮放，每個 GameObject 都必帶）、`Sprite Renderer`（顯示 2D 圖片）、`Rigidbody2D`（物理模擬）、`Collider2D`（碰撞偵測），以及你自己寫的 **C# 腳本**。
- 一個 GameObject 的行為 = 它身上掛的所有 Component 的組合。

## 5. C# 腳本基礎：MonoBehaviour 生命週期

每支掛在 GameObject 上的腳本都繼承 `MonoBehaviour`，常用的生命週期方法：

- `Awake()`：物件被建立時最早呼叫一次，適合做初始化、取得元件參照。
- `Start()`：在第一次 `Update` 之前呼叫一次，適合需要依賴其他物件已經 `Awake` 完成的初始化。
- `Update()`：每一影格呼叫一次，適合處理輸入、移動等即時邏輯。
- `FixedUpdate()`：以固定時間間隔呼叫，適合處理物理相關運算（例如施加力道給 Rigidbody）。

## 6. 動手做：建立最小可玩原型

本專案 `Assets/Scripts/` 已經寫好三支範例腳本，照下面步驟組裝場景：

### Step 1 — 建立玩家

1. `GameObject → 2D Object → Sprite → Square`（或任意 Sprite），改名為 `Player`。
2. Inspector 裡 `Add Component` 加上 `Rigidbody2D`（Gravity Scale 設 0，因為範例是俯視角移動，不需要重力）。
3. 再 `Add Component` 加上 `Box Collider 2D`。
4. 最後 `Add Component`，把 `PlayerController.cs` 拖上去掛載。
5. 在 Inspector 最上方的 **Tag** 下拉選單，將這個 GameObject 的 Tag 設成 `Player`（`CoinPickup.cs` 用這個 Tag 判斷是不是玩家碰到金幣）。

### Step 2 — 建立金幣

1. `GameObject → 2D Object → Sprite → Circle`，改名為 `Coin`。
2. 加上 `Circle Collider 2D`，勾選 **Is Trigger**（讓它只偵測碰撞、不產生物理阻擋）。
3. 掛上 `CoinPickup.cs`。
4. 把 `Coin` 拖到 `Project` 視窗做成 **Prefab**，再多複製幾個放在場景不同位置。

### Step 3 — 建立 GameManager

1. `GameObject → Create Empty`，改名為 `GameManager`。
2. 掛上 `GameManager.cs`。
3. （選用）在場景加一個 `UI → Legacy → Text` 顯示分數，把它拖進 `GameManager` 腳本 Inspector 上的 `Score Text` 欄位。沒有設定也沒關係，分數一樣會印在 Console。

### Step 4 — 執行

按上方 ▶️ **Play**，用方向鍵/WASD 移動玩家，碰到金幣會消失並加分，Console（或 UI 文字）會顯示目前分數。

## 7. Pixel Art 素材製作：把照片轉成像素畫風格

`Tools/pixelate.py` 是一個獨立的 Python 小工具，把一張普通照片轉成復古像素畫風格，方便快速產生遊戲用的素材（角色、背景、道具貼圖）。

原理很單純：先把圖片縮小成一堆大色塊（每個色塊代表一個「像素」），把顏色數量壓縮成一組有限色盤，再用最近鄰插值放大回原尺寸，讓邊緣維持銳利的方塊感，而不是模糊漸層。

### 使用方式

```bash
cd unity-game-dev-101/Tools
pip install -r requirements.txt

python pixelate.py 你的照片.jpg 輸出.png --pixel-size 8 --colors 32
```

參數說明：

| 參數 | 說明 |
|---|---|
| `--pixel-size` | 每個「像素方塊」對應原圖幾個像素，數字越大畫面越粗糙、越復古（8 是不錯的起點） |
| `--colors` | 輸出圖片的色盤數量，數字越小風格越強烈（16、32 都是常見的懷舊色深） |

### 把輸出的圖片匯入 Unity 當作 Sprite

1. 把產生好的 `.png` 拖進 `Assets/`（可以在裡面新增 `Sprites/` 資料夾整理）。
2. 選中該圖片，Inspector 裡設定：
   - **Texture Type**: `Sprite (2D and UI)`
   - **Filter Mode**: `Point (no filter)` ← 關鍵！否則 Unity 預設會把像素邊緣模糊化
   - **Compression**: `None`，避免壓縮把顏色又搞糊
3. `Apply` 套用後，就能把它拖到場景上的 `Sprite Renderer` 使用，或做成 Prefab（例如取代前面章節用的方形 `Player`、圓形 `Coin`）。

## 8. 下一步可以學什麼

- **Prefab 與 Instantiate**：動態生成物件（例如敵人、子彈）。
- **Animator / Animation**：角色動畫狀態機。
- **Scriptable Object**：資料驅動設計，管理道具、關卡設定。
- **Unity Input System（新版輸入系統）**：取代 `Input.GetAxis` 的官方套件，支援手把、觸控。
- **場景切換 `SceneManager.LoadScene`**：做主選單、關卡切換、Game Over 畫面。
- **打包發布**：`File → Build Settings`，選擇目標平台輸出執行檔。

## 專案結構

```
unity-game-dev-101/
├── Assets/
│   └── Scripts/
│       ├── PlayerController.cs  # 玩家移動控制
│       ├── CoinPickup.cs        # 可收集道具
│       └── GameManager.cs       # 分數與遊戲狀態管理
├── Packages/
│   └── manifest.json            # 套件相依清單
├── ProjectSettings/
│   └── ProjectVersion.txt       # 指定 Unity Editor 版本
├── Tools/
│   ├── pixelate.py              # 照片轉像素畫風格工具
│   └── requirements.txt         # pixelate.py 的 Python 相依套件
└── README.md                    # 本文件
```
