# 配對互動驗證 — 2026-09-22

- 配對：鋒兄與牙妹、小塗與魚妹。
- `npm test`：12/12 通過；`npm run build` 通過，僅 bundle 大小警告。
- 瀏覽器載入四個實際 FBX，執行 `check-couples.js`：牽手 4 個手腕目標、抱抱 8 個手腕目標均可到達，最大誤差 4.58e-16 舞台單位。
- 牽手 → 抱抱 → 牽手反向切換後骨骼姿勢一致。
- 實際畫面已檢查，截圖：`couples-hold.png`、`couples-hug.png`。
- 載入器有既有 FBX material / skin weight 警告；favicon 404。未發現互動執行錯誤。
- 程序式 IK 不含手指抓握與衣物碰撞，細部仍可能穿插。
