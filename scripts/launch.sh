#!/usr/bin/env bash
# One-click launcher for NorthStar (local web app).
#
# Starts the production server if it is not already running, then opens the
# browser. The optional local AI is reached through the same-origin /ollama
# proxy, so no CORS setup is needed.
#
# Usage:
#   scripts/launch.sh             # start if needed, open browser
#   scripts/launch.sh --rebuild   # rebuild first, then start/open
#   scripts/launch.sh --quiet     # start only (used by login autostart)
#   NORTHSTAR_NO_OPEN=1 scripts/launch.sh   # start only (for checks)
set -euo pipefail

# Desktop autostart does not always inherit the interactive shell PATH.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/northstar"
LOG="$STATE_DIR/server.log"
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"

cd "$APP_DIR"
mkdir -p "$STATE_DIR"

notify_error() {
  local message="$1"
  if command -v kdialog >/dev/null 2>&1; then
    kdialog --title "NorthStar" --error "$message"
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "NorthStar" "$message"
  fi
}

# The health endpoint is unique to this app. A plain "northstar" string check
# would also match the older Northern v2 page.
is_running() {
  local body
  body="$(curl -sf --max-time 2 "$URL/api/health" 2>/dev/null)" || return 1
  grep -q '"app":"northstar"' <<<"$body"
}

open_app() {
  if [ "${NORTHSTAR_NO_OPEN:-0}" = "1" ]; then
    return 0
  fi
  xdg-open "$URL" >/dev/null 2>&1 || true
}

if [ "${1:-}" = "--quiet" ]; then
  export NORTHSTAR_NO_OPEN=1
fi

REBUILD=0
if [ "${1:-}" = "--rebuild" ]; then
  REBUILD=1
fi

if [ "$REBUILD" = "0" ] && is_running; then
  open_app
  exit 0
fi

# --rebuild: stop the NorthStar listener we just identified, rebuild, restart.
if [ "$REBUILD" = "1" ] && is_running; then
  lsof -ti:"$PORT" -sTCP:LISTEN | xargs -r kill || true
  for _ in $(seq 1 20); do
    is_running || break
    sleep 0.25
  done
fi

# Build only when needed, or when explicitly requested after code changes.
if [ "$REBUILD" = "1" ] || [ ! -f "$APP_DIR/dist/index.html" ]; then
  if ! npm run build >>"$LOG" 2>&1; then
    notify_error "Build failed. See $LOG"
    exit 1
  fi
fi

# Do not kill or silently open a different app that owns the port.
if curl -s --max-time 2 "$URL" >/dev/null 2>&1; then
  notify_error "Port $PORT is in use by another app (not NorthStar). Stop it first, or set PORT."
  exit 1
fi

# Bind to loopback only: the app is single-user and the AI proxy has no auth.
PORT="$PORT" setsid nohup npm start >>"$LOG" 2>&1 < /dev/null &

for _ in $(seq 1 60); do
  if is_running; then
    open_app
    exit 0
  fi
  sleep 0.5
done

notify_error "NorthStar did not start. See $LOG"
exit 1
