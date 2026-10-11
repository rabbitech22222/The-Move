#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 24 or newer from https://nodejs.org/en/download"
  read -r -p "Press Enter to close..." answer
  exit 1
fi
node scripts/start-demo.mjs
result=$?
if [ "$result" -ne 0 ]; then
  read -r -p "Press Enter to close..." answer
fi
exit "$result"
