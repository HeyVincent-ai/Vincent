#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-periodic}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/logs/sentry-triage"
mkdir -p "$LOG_DIR"

ENV_FILE="${HOME}/.openclaw/credentials/sentry-runner.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$ROOT_DIR"

COMMON_ARGS=(--hours 24 --limit 25)

if [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  COMMON_ARGS+=(--syncGithubIssues true --minConfidence 0.85)
fi

if [ "$MODE" = "morning" ]; then
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    COMMON_ARGS+=(--sendTelegram true)
  fi
  npm run -s sentry:triage -- "${COMMON_ARGS[@]}" >> "$LOG_DIR/morning.log" 2>&1
else
  npm run -s sentry:triage -- "${COMMON_ARGS[@]}" >> "$LOG_DIR/periodic.log" 2>&1
fi
