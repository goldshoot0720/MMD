#!/bin/bash
# Local PV check: unit tests, then the player on http://127.0.0.1:5173/?song=s102
set -euo pipefail
cd "$(dirname "$0")/.."
echo "HyperStage 本地測試"
npm test
echo
echo "播放器：http://127.0.0.1:5173/?song=s102"
echo "單格預覽可在網址加上 &t=36。輸出 MP4：npm run pv -- s102"
exec npm run dev
