#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p output

if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Market Desk is already running at http://127.0.0.1:8000"
  if [[ "${MARKET_DESK_LAUNCHD:-0}" == "1" ]]; then
    while lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; do
      sleep 60
    done
  else
    exit 0
  fi
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"
exec "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
