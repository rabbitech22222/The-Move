#!/usr/bin/env bash
set -uo pipefail
cd -- "$(dirname -- "$0")"
node scripts/start-live.mjs
move_exit_code=$?
read -r -p "Enter를 누르면 창을 닫습니다."
exit "$move_exit_code"
