#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/com.market-desk.local.plist"
WRAPPER_DIR="$HOME/.market-desk"
WRAPPER_PATH="$WRAPPER_DIR/start_local_server.sh"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3)}"

mkdir -p "$PLIST_DIR" "$ROOT_DIR/output" "$WRAPPER_DIR"

cat > "$WRAPPER_PATH" <<WRAPPER
#!/usr/bin/env bash
set -euo pipefail
cd "$ROOT_DIR"
export PYTHON_BIN="$PYTHON_BIN"
export MARKET_DESK_LAUNCHD=1
mkdir -p output
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  while lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; do
    sleep 60
  done
fi
exec "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
WRAPPER
chmod +x "$WRAPPER_PATH"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.market-desk.local</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$WRAPPER_PATH</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/anaconda3/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PYTHON_BIN</key>
    <string>$PYTHON_BIN</string>
    <key>MARKET_DESK_LAUNCHD</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/market_desk_local_server.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/market_desk_local_server.err.log</string>
</dict>
</plist>
PLIST

chmod +x "$ROOT_DIR/scripts/start_local_server.sh"
launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/com.market-desk.local"

echo "Installed LaunchAgent: $PLIST_PATH"
echo "Market Desk will stay available at http://127.0.0.1:8000"
