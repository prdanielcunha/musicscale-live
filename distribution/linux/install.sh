#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/musicscale-live"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_FILE="$SYSTEMD_DIR/musicscale-live-node.service"
EXE="$INSTALL_DIR/MusicScaleLiveNode"

echo "Installing MusicScale Live Node..."

mkdir -p "$INSTALL_DIR/web" "$SYSTEMD_DIR"
cp "$SOURCE_DIR/MusicScaleLiveNode" "$EXE"
chmod +x "$EXE"
rm -rf "$INSTALL_DIR/web"
cp -R "$SOURCE_DIR/web" "$INSTALL_DIR/web"
cp "$SOURCE_DIR/README-INSTALL.md" "$INSTALL_DIR/README-INSTALL.md"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=MusicScale Live Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$EXE
Restart=always
RestartSec=2
Environment=MUSICSCALE_LIVE_NODE_HOST=0.0.0.0
Environment=MUSICSCALE_LIVE_NODE_PORT=4317

[Install]
WantedBy=default.target
EOF

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user enable --now musicscale-live-node.service
else
  echo "systemd user services are unavailable on this Linux system."
  echo "Start the node manually with: $EXE"
fi

sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:4317/node" >/dev/null 2>&1 || true
fi

echo
echo "MusicScale Live Node installed."
echo "Local console: http://127.0.0.1:4317/node"
echo "Install directory: $INSTALL_DIR"
