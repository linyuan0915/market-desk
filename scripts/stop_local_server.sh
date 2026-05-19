#!/usr/bin/env bash
set -euo pipefail

if [[ -f output/local_keeper.pid ]] && kill -0 "$(cat output/local_keeper.pid)" >/dev/null 2>&1; then
  kill "$(cat output/local_keeper.pid)" >/dev/null 2>&1 || true
fi
pkill -f "scripts/keep_local_server_alive.sh" >/dev/null 2>&1 || true
if lsof -tiTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  kill "$(lsof -tiTCP:8000 -sTCP:LISTEN)" >/dev/null 2>&1 || true
fi
rm -f output/local_keeper.pid output/local_server.pid

echo "Stopped Market Desk local server."
