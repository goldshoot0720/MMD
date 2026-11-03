# PV 畫面移除標點

- 四種語言共 36 版均從 PV 顯示文字移除 Unicode 標點類別，包括中英文逗號、句號、撇號、引號、破折號及日文括號。
- 原始歌詞、音檔與同步時間保留。背景圖案、音符、角色與喵掌手勢保留。
- 歌詞斷行、字寬及字卡尺寸依移除標點後的文字計算。
- npm test：31 項通過；npm run build：通過。
- Headless Chrome 逐一載入 36 版，抽查片頭、章節、歌曲中段與結尾，攔截實際 Canvas fillText／strokeText，54,547 次文字繪製均未出現標點。紀錄見 no-punctuation.json。
- 抽查圖：no-punctuation-wedding-en.jpg、no-punctuation-s028-ja.jpg、no-punctuation-s102-en.jpg。
- 先前輸出已停止。新批次輸出至 pv/neweffects-no-punctuation-20261103，完整影片檢查結果將寫入該目錄 manifest.json。
