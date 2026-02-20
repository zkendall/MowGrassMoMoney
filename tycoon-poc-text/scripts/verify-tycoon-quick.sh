#!/usr/bin/env bash
set -euo pipefail

# NOTE: Keep this verification flow legible.
# Prefer clean, explicit steps with documented intent over dense one-liners.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${1:-http://127.0.0.1:4174}"
HEADED=0
for arg in "${@:2}"; do
  if [[ "$arg" == "--headed" ]]; then
    HEADED=1
  fi
done
OUT_ROOT="$ROOT_DIR/output"
HISTORY_PATH="$OUT_ROOT/.verify-history.json"
STATE_TMP="$(mktemp)"

VERIFY_HEADED_RUNNER="$ROOT_DIR/scripts/verify-tycoon-headed-runner.js"
VERIFY_LABELER="$ROOT_DIR/scripts/compute-verify-label.js"
VERIFY_SUMMARIZER="$ROOT_DIR/scripts/summarize-verify-states.js"
VERIFY_URL="$(node -e "const u=new URL(process.argv[1]); if(!u.searchParams.has('start_state')) u.searchParams.set('start_state','test_all_actions'); console.log(u.toString());" "$URL")"

mkdir -p "$OUT_ROOT"

cleanup() {
  rm -f "$STATE_TMP"
}
trap cleanup EXIT

next_index() {
  local max=0
  local name base num
  for path in "$OUT_ROOT"/*-web-game; do
    [ -e "$path" ] || continue
    name="$(basename "$path")"
    base="${name%%-*}"
    if [[ "$base" =~ ^[0-9]+$ ]]; then
      num=$((10#$base))
      if (( num > max )); then
        max=$num
      fi
    fi
  done
  printf "%02d" $((max + 1))
}

LABEL="$(node "$VERIFY_LABELER" "$ROOT_DIR" "$STATE_TMP" "$HISTORY_PATH")"
RUN_ID="$(next_index)"
WEB_GAME_DIR="$OUT_ROOT/${RUN_ID}-${LABEL}-web-game"
PROBE_PATH="$OUT_ROOT/${RUN_ID}-${LABEL}-probe.json"

echo "[verify-tycoon-quick] URL: $VERIFY_URL"
echo "[verify-tycoon-quick] Run: $RUN_ID"
echo "[verify-tycoon-quick] Label: $LABEL"
if (( HEADED )); then
  echo "[verify-tycoon-quick] Browser: headed"
else
  echo "[verify-tycoon-quick] Browser: headless"
fi
echo "[verify-tycoon-quick] Output root: $OUT_ROOT"

# 1) Syntax check
node --check "$ROOT_DIR/game.js"

# 2) Run deterministic walkthrough and capture screenshots/state
if (( HEADED )); then
  (cd "$ROOT_DIR" && node "$VERIFY_HEADED_RUNNER" "$VERIFY_URL" "$WEB_GAME_DIR" false)
else
  (cd "$ROOT_DIR" && node "$VERIFY_HEADED_RUNNER" "$VERIFY_URL" "$WEB_GAME_DIR" true)
fi

# 3) Summarize captured state snapshots
node "$VERIFY_SUMMARIZER" "$WEB_GAME_DIR" "$PROBE_PATH" "$RUN_ID" "$LABEL"

# 4) Persist current state as baseline for "since last verify" comparison
cp "$STATE_TMP" "$HISTORY_PATH"

echo "[verify-tycoon-quick] Done."
echo "[verify-tycoon-quick] Artifacts:"
echo "  - $WEB_GAME_DIR"
echo "  - $PROBE_PATH"
