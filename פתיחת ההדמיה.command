#!/bin/bash
# HELLO TLV — opens the interactive 3D experience in the browser (local server)
cd "$(dirname "$0")"
PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
( sleep 1.2; open "http://127.0.0.1:$PORT/" ) &
echo "HELLO TLV פועל בכתובת http://127.0.0.1:$PORT  —  לסגירה: סגרו את החלון הזה"
python3 -m http.server $PORT --bind 127.0.0.1
