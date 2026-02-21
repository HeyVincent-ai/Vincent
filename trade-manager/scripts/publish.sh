#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRADE_MANAGER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$TRADE_MANAGER_DIR"

echo "Current version: $(node -p "require('./package.json').version")"

npm version patch --no-git-tag-version
NEW_VERSION="$(node -p "require('./package.json').version")"
echo "Bumped to: $NEW_VERSION"

echo "Publishing @lit-protocol/trade-manager@$NEW_VERSION..."
npm publish

echo "Done! Published @lit-protocol/trade-manager@$NEW_VERSION"
