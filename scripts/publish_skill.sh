#!/bin/bash

# Publish SKILL.md to multiple locations and publish to clawhub
# Source: skills/wallet/SKILL.md

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

SOURCE="$PROJECT_ROOT/skills/wallet/SKILL.md"
PACKAGE_JSON="$PROJECT_ROOT/package.json"

# Destination paths
FRONTEND_DEST="$PROJECT_ROOT/frontend/public/SKILL.md"
AGENT_SKILLS_DEST="$PROJECT_ROOT/../agent-skills/skills/wallet/SKILL.md"

# Check if source file exists
if [ ! -f "$SOURCE" ]; then
    echo "Error: Source file not found: $SOURCE"
    exit 1
fi

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
echo "Updated package.json"

# Copy to frontend/public
echo "Copying to $FRONTEND_DEST"
cp "$SOURCE" "$FRONTEND_DEST"

# Copy to agent-skills (create directory if needed)
echo "Copying to $AGENT_SKILLS_DEST"
mkdir -p "$(dirname "$AGENT_SKILLS_DEST")"
cp "$SOURCE" "$AGENT_SKILLS_DEST"

# Publish to clawhub
echo "Publishing to clawhub..."
clawhub publish skills/wallet --slug agentwallet --name "Agent Wallet" --version "$NEW_VERSION"

echo "Done! SKILL.md published to all locations and clawhub (v$NEW_VERSION)."
