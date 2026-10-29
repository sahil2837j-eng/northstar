#!/usr/bin/env bash
# Enable or disable NorthStar's login autostart entry.
#
# Usage:
#   scripts/autostart.sh enable
#   scripts/autostart.sh disable
#   scripts/autostart.sh status
#
# The entry runs `scripts/launch.sh --quiet`: it starts the loopback server
# without opening a browser. A running NorthStar is detected, so login does
# not start a second copy.
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
ENTRY="$AUTOSTART_DIR/northstar.desktop"

usage() {
  echo "Usage: $0 enable|disable|status" >&2
  exit 2
}

case "${1:-status}" in
  enable)
    mkdir -p "$AUTOSTART_DIR"
    cat >"$ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=NorthStar
Comment=Start the local NorthStar app quietly at login
Exec=/bin/bash "$APP_DIR/scripts/launch.sh" --quiet
Path=$APP_DIR
Terminal=false
NoDisplay=true
Hidden=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
EOF
    chmod +x "$ENTRY"
    echo "Enabled: $ENTRY"
    ;;
  disable)
    rm -f "$ENTRY"
    echo "Disabled: $ENTRY"
    ;;
  status)
    if [ -f "$ENTRY" ]; then
      echo "enabled: $ENTRY"
    else
      echo "disabled: $ENTRY"
    fi
    ;;
  *)
    usage
    ;;
esac
