#!/usr/bin/env bash
set -euo pipefail

# Compatibility wrapper while callers migrate to the JS entrypoint.
# Primary runner: scripts/run-regression-tests.js --suite quick

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT_DIR/scripts/run-regression-tests.js" --suite quick "$@"
