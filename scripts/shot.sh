#!/usr/bin/env bash
# Usage: scripts/shot.sh <path> <width> <height> <out.png>  (needs `next start -p 3130` running)
P=$HOME/snap/firefox/common/tmp; mkdir -p "$P/prof"
timeout 90 /snap/bin/firefox --headless --no-remote --profile "$P/prof" --window-size="$2,$3" --screenshot "$P/shot.png" "http://localhost:3130$1" >/dev/null 2>&1
cp "$P/shot.png" "$4"
