#!/usr/bin/env bash
set -euo pipefail
cd /workspace/The-Move
test -f package-lock.json
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node 24 or later is required")'
npm ci --cache /tmp/the-move-npm-cache
npm run setup:local
npm run db:generate
npm run typecheck
npm test
npm run build
