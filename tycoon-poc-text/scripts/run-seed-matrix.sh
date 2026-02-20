#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${1:-http://127.0.0.1:4174}"
SEEDS="${2:-2,17,29,41,53,67,83,97,111,131}"

node "$ROOT_DIR/scripts/run-regression-tests.js" \
  --url "$URL" \
  --seed-matrix-only \
  --seeds "$SEEDS"
