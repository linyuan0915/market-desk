#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p output
echo $$ > output/local_keeper.pid

while true; do
  if ! lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    nohup /bin/bash scripts/start_local_server.sh >> output/local_server.log 2>> output/local_server.err.log &
    echo $! > output/local_server.pid
  fi
  sleep 5
done
