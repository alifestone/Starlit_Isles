# 星嶼 宣傳影片

成品：`starlit-isles-trailer.mp4`（1920×1080、60 fps、約 80 秒）與封面 `poster.jpg`。

`record.mjs` 輸出的原始高畫質版在 `out/`（約 97 MB，不放進 git）。repo 裡的是重新壓縮的網頁版（約 31 MB），
畫質與原始版幾乎相同（SSIM 0.99）。重新錄製後可以用下面的指令更新：

```sh
ffmpeg -i out/starlit-isles-trailer.mp4 -c:v libx264 -preset slower -crf 24 -tune film -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart starlit-isles-trailer.mp4
cp out/poster.jpg poster.jpg
```

畫面與配樂都直接從遊戲本身產生：導演腳本放進遊戲的 module 裡執行，紙鶴沿著預先安排的路線飛，
每個鏡頭的攝影機另外設定，剪接點對齊遊戲音樂的小節線（76 BPM，每 8 個八分音符換一個聲部）。

## 重新產生

```sh
./build.sh                          # 由 ../src 組出 build/video.html 與 build/audio.html
node record.mjs full --scale 1.5    # 逐格錄影（1.5 倍超取樣）→ 離線算配樂 → 混音合成，約 10 分鐘
node record.mjs stills --every 1    # 只輸出半解析度靜態畫面，調鏡頭時用，約 10 秒
```

中間檔預設放在 `out/work/`，可用環境變數 `TRAILER_WORK` 指定其他位置。

## 檔案

| 檔案 | 作用 |
|---|---|
| `director.js` | 分鏡表、紙鶴飛行路線、攝影機、字幕與片尾卡動畫 |
| `overlay.html` | 字幕、閃光、片尾卡的 HTML／CSS，並隱藏遊戲原本的 UI |
| `sound-stub.js` | 錄影時把所有聲音呼叫記成時間表，不實際發聲 |
| `audio-driver.js` | 用 OfflineAudioContext 重播時間表，讓遊戲原本的音樂引擎離線算出配樂 |
| `record.mjs` | 用 DevTools 協定控制無頭 Chromium，逐格前進並截圖，交給 ffmpeg 編碼 |

## 分鏡（秒）

| 時間 | 畫面 | 字幕 |
|---|---|---|
| 0–6.6 | 從月亮與極光往下搖，看見沉睡的群島 | |
| 6.6–12.9 | 月光下枯睡的世界樹 | 天空群島沉睡了太久。 |
| 12.9–19.3 | 繞著紙鶴轉一圈的特寫 | 你是一隻會發光的紙鶴。 |
| 19.3–25.6 | 遊戲視角，連續收集星種 | 收集散落的星種， |
| 25.6–31.9 | 加速穿過三個光環 | |
| 31.9–38.2 | 與天鯨並肩飛過月亮 | |
| 38.2–47.7 | 衝進光柱，櫻之島甦醒 | 把光送回每一座浮島， |
| 47.7–54.0 | 楓、螢、紫苑、金穗四島接連甦醒 | 每喚醒一座島，天空的樂曲就多一個聲部 |
| 54.0–63.5 | 盤旋上世界樹，開花、天燈、煙火 | 讓整片天空， |
| 63.5–69.8 | 迎著日出飛行 | 迎來第一道黎明。 |
| 69.8–80.5 | 片尾卡：星嶼 · 光之旅 | |
