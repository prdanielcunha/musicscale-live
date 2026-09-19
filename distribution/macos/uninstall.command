#!/bin/zsh
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/MillionsNestLive"
LEGACY_INSTALL_DIR="$HOME/Library/Application Support/MusicScaleLive"
PLIST="$HOME/Library/LaunchAgents/com.millionsnest.live-node.plist"
LEGACY_PLIST="$HOME/Library/LaunchAgents/com.millionsnest.musicscale-live-node.plist"

launchctl bootout "gui/$UID/com.millionsnest.live-node" >/dev/null 2>&1 || true
launchctl bootout "gui/$UID/com.millionsnest.musicscale-live-node" >/dev/null 2>&1 || true
rm -f "$PLIST" "$LEGACY_PLIST"
rm -rf "$INSTALL_DIR" "$LEGACY_INSTALL_DIR"

echo "MillionsNest Live Node removido."
