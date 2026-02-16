#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.config/systemd/user"
cp "$(dirname "$0")/../systemd/openclaw-trade-manager.service" "$HOME/.config/systemd/user/openclaw-trade-manager.service"
systemctl --user daemon-reload
systemctl --user enable openclaw-trade-manager
systemctl --user restart openclaw-trade-manager
