#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/musicscale-live"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_FILE="$SYSTEMD_DIR/musicscale-live-node.service"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now musicscale-live-node.service >/dev/null 2>&1 || true
fi

rm -f "$SERVICE_FILE"
rm -rf "$INSTALL_DIR"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload
fi

echo "MusicScale Live Node removed."
