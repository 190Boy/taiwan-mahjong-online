# 🀄 台灣十六張麻將・線上房號對戰

在瀏覽器就能玩的台灣十六張麻將。開房拿到 **4 位數房號**，朋友輸入房號就能一起打；人數不夠時**空位由電腦補上**（2～3 個人也能玩）。也保留「單機玩（對電腦）」模式。

**直接玩**
- GitHub Pages（單機秒開，線上模式自動連到 Render 伺服器）：<https://190boy.github.io/taiwan-mahjong-online/>
- Render（同一套畫面，由伺服器直接提供）：<https://mahjong-online-wee6.onrender.com>

單機與線上是**同一份程式碼**（`docs/` 資料夾）：Render 用 `server.js` 提供它，GitHub Pages 直接發佈 `docs/`。
從 Pages 打開時，線上模式會連 `wss://mahjong-online-wee6.onrender.com/ws`；要換伺服器可在網址加 `?server=wss://你的主機/ws`。

- 伺服器負責所有牌局邏輯（洗牌、判胡、計台），每個人只會收到自己的手牌，無法作弊
- 吃／碰／槓／胡、自摸、補花、流局、台數計算、連莊與累計分數
- 出牌限時 20 秒、吃碰槓胡限時 9 秒（畫面有倒數，時間到自動處理）
- 重新整理或斷線：同一支手機／電腦再打開網址，會自動回到原本的座位；斷線期間由電腦代打
- 角色頭像（眨眼、搖頭晃腦、胡牌開心、放槍難過）、音效與國語喊牌在每個人自己的裝置上播放
- 房間沒人在線 10 分鐘後自動清除；分頁切到背景超過 10 分鐘、或 30 分鐘沒操作會自動斷線（不會讓免費主機一直醒著）
- 規則：搶槓、天胡、地胡、八仙過海、七搶一、獨聽；摸牌後任何一輪都能加槓／暗槓
- 電腦難度：簡單／普通／困難（會看現物、筋、牌河做防守）
- 聽牌鎖定（自動摸打）：聽牌時按「🔒 鎖定聽牌」（或選牌時按「打出並鎖定」），之後摸到不能胡的牌自動打掉、吃碰槓自動略過；摸到或別人打出胡牌會停下來問你（可勾「自動胡」）。線上版由伺服器代為打牌，重新整理也會保持鎖定
- 線上語音通話：房間或牌桌按「🎤 加入語音」（按了才會問麥克風），可靜音、離開；頭像上顯示語音中／靜音／正在說話，點別人的圖示可以只在自己這邊關掉他的聲音。聲音是玩家之間點對點（WebRTC），不經過伺服器；只用免費的公用 STUN，少數網路（公司／學校、部分手機網路）可能連不上，會顯示「語音連線失敗」
- 10 位角色各有自己的聲音：喊吃／碰／槓／胡、報牌、快捷聊天都用該座位角色的聲音（線上每台裝置都跟著各座位的頭像），選角色時可按 🔊 試聽。聲音是預先用免費的 edge-tts 神經語音產生、再用 ffmpeg 調音高語速的 mp3（`docs/voices/`，約 1.4 MB，每位角色約 140 KB，用到才載入）；還沒載入或載入失敗時改用裝置內建語音，依角色換聲音、音高、語速。重新產生：`python3 -m venv venv && venv/bin/pip install edge-tts && venv/bin/python tools/gen_voices.py`（需要 ffmpeg）
- 線上快捷聊天（固定短語＋表情，會顯示對話泡泡）
- 戰績：單機每個角色的戰績、線上本房計分板、自己的線上生涯戰績（存在瀏覽器裡）

---

## 部署到 Render（免費）— 一步一步來

> 需要：一個 GitHub 帳號、一個 Render 帳號（可直接用 GitHub 登入）。不用寫程式。

### 方法 A：Blueprint 一鍵部署（推薦）

1. 打開 <https://dashboard.render.com>，用 **GitHub 帳號登入**。
2. 右上角按 **New ＋** → 選 **Blueprint**。
3. 第一次會請你連結 GitHub：按 **Connect GitHub**，允許 Render 讀取 `taiwan-mahjong-online` 這個 repo。
4. 在清單中選 **taiwan-mahjong-online** → 按 **Connect**。
5. Render 會讀到專案裡的 `render.yaml`，顯示一個名為 `mahjong-online` 的服務（Free 方案）。按 **Apply / Deploy Blueprint**。
6. 等 2～5 分鐘，狀態變成 **Live** 就完成了。

### 方法 B：手動建立 Web Service

1. Render 右上角 **New ＋** → **Web Service**。
2. 選 **Build and deploy from a Git repository** → 選 `taiwan-mahjong-online` repo → **Connect**。
3. 依下表填寫，其他保持預設：

| 欄位 | 填這個 |
|---|---|
| Name | `mahjong-online`（隨意，會變成網址的一部分） |
| Region | Singapore（離台灣最近） |
| Branch | `main` |
| Runtime / Language | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

4. （選填）Advanced → Health Check Path 填 `/healthz`。
5. 按 **Create Web Service**，等狀態變成 **Live**。

### 開始玩

- 網址在服務頁面左上角，長得像 `https://mahjong-online-xxxx.onrender.com`。
- 把網址傳給朋友。一個人按 **開房**，把房號（或「複製邀請連結」）傳給大家，其他人輸入房號按 **加入房間**，房主按 **開始**。

### 關於免費方案

- 免費主機約 **15 分鐘沒人使用會睡著**，下次打開要等 **30～60 秒**喚醒（畫面會顯示「伺服器喚醒中…」，等一下就好）。
- 主機重新啟動（例如睡著、更新程式）時，進行中的房間會消失，重新開房即可。

### 之後要更新程式

改好的檔案推到 GitHub 的 `main` 分支，Render 會自動重新部署，GitHub Pages 也會自動更新（設定：Settings → Pages → Deploy from branch → `main` / `/docs`）。

---

## 在自己電腦上測試（給開發者）

```bash
npm install
npm start            # 打開 http://localhost:3000
```

可用環境變數：`PORT`（預設 3000）、`TURN_MS`（出牌時限，預設 20000）、`CLAIM_MS`（叫牌時限，預設 9000）、`ROOM_IDLE_MS`（空房清除時間，預設 600000）。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `server.js` | 網頁伺服器＋WebSocket 房間與牌局（伺服器權威） |
| `docs/index.html` | 畫面與樣式 |
| `docs/logic.js` | 麻將規則、判胡、計台、電腦 AI（伺服器與單機模式共用） |
| `docs/app.js` | 介面、頭像、大廳／線上連線、聊天、戰績 |
| `docs/avatar-img.js` | 角色頭像圖片 |
| `test/` | `node test/rules.test.js` 規則測試、`node test/ai-sim.js normal hard 200` AI 對戰模擬 |
| `render.yaml` | Render Blueprint 設定 |
