#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p output

if ! lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  nohup /bin/bash scripts/start_local_server.sh > output/local_server.log 2> output/local_server.err.log &
  echo $! > output/local_server.pid
fi

for _ in 1 2 3 4 5; do
  if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ -f output/local_keeper.pid ]] && kill -0 "$(cat output/local_keeper.pid)" >/dev/null 2>&1; then
  :
else
  if command -v setsid >/dev/null 2>&1; then
    setsid /bin/bash scripts/keep_local_server_alive.sh >> output/local_server.log 2>> output/local_server.err.log &
  else
    nohup /bin/bash scripts/keep_local_server_alive.sh >> output/local_server.log 2>> output/local_server.err.log &
  fi
  echo $! > output/local_keeper.pid
fi

if ! lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Market Desk failed to start. See output/local_server.err.log" >&2
  exit 1
fi

echo "Market Desk background service is available at http://127.0.0.1:8000"
