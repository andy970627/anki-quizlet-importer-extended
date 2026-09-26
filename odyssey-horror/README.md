# Odyssey — 恐怖遊戲雛形

一個第一人稱恐怖遊戲的最小可玩雛形：黑暗走廊、手電筒視野受限、會巡邏並在發現玩家後追逐的怪物、驚嚇音效觸發點、被抓到後的 Game Over。跟著本文件組裝一次場景，就能有一個可以嚇到自己朋友的雛形。

> 跟同一個 repo 裡 `unity-game-dev-101/`（Unity 入門教學）是兩個獨立的 Unity 專案，各自用 Unity Hub 開啟。

## 設計概念：不用親身很敢面對恐怖，也能做恐怖遊戲

恐怖遊戲的「嚇人感」來自幾個可以拆解、逐一實作的機制，不需要開發者自己覺得可怕：

- **視野限制**：手電筒只照亮一小塊範圍，玩家看不到黑暗裡有什麼（`Flashlight.cs`）
- **不確定性**：怪物在偵測範圍外只是巡邏，玩家永遠不知道它什麼時候會發現自己（`EnemyChaser.cs`）
- **意外性**：轉角、開門這類玩家會突然靠近的地方放驚嚇音效觸發點（`ScareTrigger.cs`）
- **後果**：被抓到會真的失敗、要重來，讓追逐產生壓力（`HorrorGameManager.cs`）

自己開發時很容易對這些機關「免疫」（因為太熟悉了），所以做完雛形後**務必找別人試玩**，用他們的反應判斷夠不夠嚇人，而不是靠自己的感覺。

## 事前準備

跟 `unity-game-dev-101/` 一樣：安裝 Unity Hub，透過它安裝一個 LTS 版本的 Unity Editor，再用 Unity Hub 的 **Add project from disk** 開啟這個 `odyssey-horror/` 資料夾。

## 組裝場景步驟

### Step 1 — 建立場景與走廊

1. 新場景中用 `GameObject → 3D Object → Cube/Plane` 手動堆出一段走廊、幾個房間（初學階段先用方塊代替美術素材即可）。
2. `Window → Rendering → Lighting`，把 Environment Lighting 的 Intensity 調低，讓場景整體偏暗——這是恐怖遊戲基本氛圍的第一步。

### Step 2 — 建立玩家

1. `GameObject → Create Empty`，改名為 `Player`，Tag 設成 `Player`。
2. `Add Component` 加上 `Character Controller`。
3. 掛上 `FirstPersonController.cs`。
4. 在 `Player` 底下建立子物件 `GameObject → Camera`，把這個 Camera 拖進 `FirstPersonController` 腳本的 `Player Camera` 欄位。

### Step 3 — 建立手電筒

1. 在 `Player` 底下（跟 Camera 平行）建立 `GameObject → Light → Spotlight`，改名為 `Flashlight`。
2. 調整角度讓它朝玩家面向的方向照射，Range 跟 Spot Angle 依場景大小微調。
3. 掛上 `Flashlight.cs`。執行後預設是關的，按 `F` 開關，電量會慢慢消耗。

### Step 4 — 烘焙 NavMesh（給怪物走路用）

1. `Window → AI → Navigation`（若選單裡找不到，先透過 `Window → Package Manager` 安裝 `AI Navigation` 套件）。
2. 選到場景中所有地板/走廊的物件，在 Navigation 視窗的 Object 頁籤勾選 **Navigation Static**。
3. 切到 **Bake** 頁籤，按 **Bake**，場景地板會出現淺藍色網格，代表怪物可以在上面走動的範圍。

### Step 5 — 建立怪物

1. `GameObject → 3D Object → Capsule`，改名為 `Monster`。
2. `Add Component` 加上 `Nav Mesh Agent`。
3. 掛上 `EnemyChaser.cs`：
   - `Player` 欄位拖入場景裡的 `Player`。
   - `Patrol Points` 欄位可以拖入幾個空的 `GameObject`（放在走廊不同位置）當作巡邏路線，留空的話怪物只會站著不動直到偵測到玩家。
4. 建立空的 `GameObject → Create Empty`，改名為 `GameManager`，掛上 `HorrorGameManager.cs`。

### Step 6 — 加驚嚇點（選用）

1. 在走廊轉角放一個 `GameObject → Create Empty`，加上 `Box Collider` 並勾選 **Is Trigger**。
2. 加上 `Audio Source`（取消勾選 Play On Awake），拖入一段驚嚇音效。
3. 掛上 `ScareTrigger.cs`，把剛剛的 `Audio Source` 拖進 `Scare Audio` 欄位。

### Step 7 — 執行

按 ▶️ **Play**：WASD 移動、滑鼠環顧、`F` 開手電筒。怪物在偵測範圍外會沿巡邏點走動，靠近後會開始追你；被抓到後畫面滑鼠會解鎖、Console 顯示提示，按 `R` 重新開始。

## 下一步可以加什麼

- **Sanity / 恐懼值系統**：靠近怪物或黑暗中待太久時數值下降，數值太低觸發視覺/聽覺扭曲效果。
- **音效驅動的緊張感**：心跳聲隨怪物距離加速、環境音樂在怪物接近時漸強。
- **躲藏機制**：衣櫃、床底等可互動的躲藏點，怪物搜索時玩家要憋氣/維持不動。
- **Post Processing（URP/HDRP 的 Volume）**：暗角（Vignette）、色差、雜訊，加強壓迫感。
- 也可以用 `unity-game-dev-101/Tools/pixelate.py` 把恐怖場景參考照片轉成復古像素風格素材，做成不同美術風格的版本。
