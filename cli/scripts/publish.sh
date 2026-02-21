#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CLI_DIR"

# Bump patch version
npm version patch --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")

echo "Publishing @vincentai/cli@$NEW_VERSION..."
npm publish

echo "Published @vincentai/cli@$NEW_VERSION"
