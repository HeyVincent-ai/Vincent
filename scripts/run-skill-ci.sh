#!/usr/bin/env bash
# Trigger the Skill CI Tests workflow for the current branch's PR.
#
# Usage:
#   ./scripts/run-skill-ci.sh          # auto-detect PR preview URL from current branch
#   ./scripts/run-skill-ci.sh <url>    # use a specific preview URL
#   ./scripts/run-skill-ci.sh --watch  # auto-detect + watch the run

set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)
WATCH=false
PREVIEW_URL=""

for arg in "$@"; do
  case "$arg" in
    --watch) WATCH=true ;;
    *) PREVIEW_URL="$arg" ;;
  esac
done

# If no URL provided, derive from PR number
if [ -z "$PREVIEW_URL" ]; then
  PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null || true)
  if [ -z "$PR_NUMBER" ]; then
    echo "Error: No open PR found for branch '$BRANCH'. Pass a preview URL explicitly."
    exit 1
  fi
  PREVIEW_URL="https://safeskill-vincent-pr-${PR_NUMBER}.up.railway.app"
  echo "PR #$PR_NUMBER detected → $PREVIEW_URL"
fi

# Health check
echo "Checking preview health..."
if ! curl -sf "$PREVIEW_URL/health" > /dev/null 2>&1; then
  echo "Warning: Preview at $PREVIEW_URL/health is not responding. Triggering anyway (workflow will wait)."
fi

echo "Triggering Skill CI Tests on branch '$BRANCH'..."
gh workflow run "Skill CI Tests" --ref "$BRANCH" -f preview_url="$PREVIEW_URL"

# Wait for the run to appear
echo "Waiting for run to start..."
sleep 5
RUN_ID=$(gh run list --workflow="Skill CI Tests" --limit=1 --json databaseId -q '.[0].databaseId')
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
RUN_URL="https://github.com/$REPO/actions/runs/$RUN_ID"

echo ""
echo "Run: $RUN_URL"
echo ""

if [ "$WATCH" = true ]; then
  gh run watch "$RUN_ID" --exit-status || true
  echo ""
  # Show test output on failure
  CONCLUSION=$(gh run view "$RUN_ID" --json conclusion -q .conclusion)
  if [ "$CONCLUSION" != "success" ]; then
    echo "--- Test output ---"
    gh run view "$RUN_ID" --log-failed 2>&1 | tail -40
  fi
else
  echo "Run --watch to follow output, or view at the link above."
fi
