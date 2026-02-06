#!/bin/bash

# Publish all SKILL.md files to multiple locations and publish to clawhub
# Skills: wallet, polymarket

set -e

# clawhub auth fix
# re: https://github.com/openclaw/clawhub/issues/99
# re: https://github.com/openclaw/clawhub/pull/101
# export CLAWHUB_REGISTRY="https://www.clawhub.ai"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_JSON="$PROJECT_ROOT/package.json"

# Check if package.json exists
if [ ! -f "$PACKAGE_JSON" ]; then
    echo "Error: package.json not found: $PACKAGE_JSON"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' "$PACKAGE_JSON" | sed 's/.*"version": "\([^"]*\)".*/\1/')
echo "Current version: $CURRENT_VERSION"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump patch version
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
echo "New version: $NEW_VERSION"

# Update package.json with new version
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
echo "Updated package.json to v$NEW_VERSION"

# --- Wallet skill ---
WALLET_SOURCE="$PROJECT_ROOT/skills/wallet/SKILL.md"
if [ ! -f "$WALLET_SOURCE" ]; then
    echo "Error: Wallet skill not found: $WALLET_SOURCE"
    exit 1
fi

echo ""
echo "=== Publishing wallet skill ==="

# Copy to frontend/public
mkdir -p "$PROJECT_ROOT/frontend/public/agentwallet"
cp "$WALLET_SOURCE" "$PROJECT_ROOT/frontend/public/agentwallet/SKILL.md"
echo "Copied to frontend/public/agentwallet/SKILL.md"

# Publish to clawhub
echo "Publishing wallet to clawhub..."
clawhub publish skills/wallet --slug agentwallet --name "Vincent - Wallet" --version "$NEW_VERSION"

# --- Polymarket skill ---
POLYMARKET_SOURCE="$PROJECT_ROOT/skills/polymarket/SKILL.md"
if [ ! -f "$POLYMARKET_SOURCE" ]; then
    echo "Error: Polymarket skill not found: $POLYMARKET_SOURCE"
    exit 1
fi

echo ""
echo "=== Publishing polymarket skill ==="

# Copy to frontend/public
mkdir -p "$PROJECT_ROOT/frontend/public/vincentpolymarket"
cp "$POLYMARKET_SOURCE" "$PROJECT_ROOT/frontend/public/vincentpolymarket/SKILL.md"
echo "Copied to frontend/public/vincentpolymarket/SKILL.md"

# Publish to clawhub
echo "Publishing polymarket to clawhub..."
clawhub publish skills/polymarket --slug vincentpolymarket --name "Vincent - Polymarket" --version "$NEW_VERSION"

echo ""
echo "Done! All skills published to all locations and clawhub (v$NEW_VERSION)."
