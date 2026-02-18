#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRADE_MANAGER_DIR="$REPO_ROOT/trade-manager"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="$TRADE_MANAGER_DIR/testRunLogs/$TIMESTAMP"
mkdir -p "$LOG_DIR"

echo "=== Test Run: $TIMESTAMP ==="
echo "Log directory: $LOG_DIR"
echo ""

PIDS=()

cleanup() {
  echo ""
  echo "=== Cleaning up background processes ==="
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping PID $pid..."
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 2
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force killing PID $pid..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  echo "=== Cleanup complete ==="
}

trap cleanup EXIT INT TERM

wait_for_endpoint() {
  local url=$1
  local label=$2
  local timeout=${3:-60}

  echo "  Waiting for $label at $url..."
  for i in $(seq 1 "$timeout"); do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo "  $label is ready! (${i}s)"
      return 0
    fi
    sleep 1
  done
  echo "  WARNING: $label didn't respond after ${timeout}s, continuing anyway..."
  return 0
}

# --- Step 1: Start Vincent backend ---
echo "[1/4] Starting Vincent backend (npm run dev:all from repo root)..."
cd "$REPO_ROOT"
npm run dev:all > "$LOG_DIR/vincentBackend.log" 2>&1 &
VINCENT_PID=$!
PIDS+=($VINCENT_PID)
echo "  PID: $VINCENT_PID"
wait_for_endpoint "http://localhost:3000" "Vincent backend"

# --- Step 2: Remove old test database ---
echo ""
echo "[2/4] Removing old test database..."
rm -f /tmp/trade-manager-test.db
echo "  Done"

# --- Step 3: Start Trade Manager ---
echo ""
echo "[3/4] Starting Trade Manager (npm run dev:all from trade-manager/)..."
cd "$TRADE_MANAGER_DIR"
npm run dev:all > "$LOG_DIR/tradeManager.log" 2>&1 &
TM_PID=$!
PIDS+=($TM_PID)
echo "  PID: $TM_PID"
wait_for_endpoint "http://localhost:19000/health" "Trade Manager"

# --- Step 4: Run Claude agent test ---
echo ""
echo "[4/4] Running Claude agent test..."
echo "  Logging to: $LOG_DIR/agent.log"
echo "  (stream-json format with full tool calls + thinking)"
echo ""
cd "$REPO_ROOT"

# --output-format stream-json captures everything: tool calls, thinking, results
# --verbose enables extra debug output
# --dangerously-skip-permissions allows unattended execution (no permission prompts)
claude -p \
  --verbose \
  --output-format stream-json \
  --dangerously-skip-permissions \
  "Read trade-manager/LOCAL_TESTING_PROMPT.md and run the tests" \
  > "$LOG_DIR/agent.log" 2>&1

AGENT_EXIT=$?

echo ""
echo "=== Test run complete (agent exit code: $AGENT_EXIT) ==="
echo "Logs:"
echo "  Vincent backend: $LOG_DIR/vincentBackend.log"
echo "  Trade Manager:   $LOG_DIR/tradeManager.log"
echo "  Agent output:    $LOG_DIR/agent.log"
