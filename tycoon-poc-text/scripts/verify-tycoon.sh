#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${1:-http://127.0.0.1:4174}"
OUT_ROOT="$ROOT_DIR/output"
HISTORY_PATH="$OUT_ROOT/.verify-history.json"
STATE_TMP="$(mktemp)"

WEB_GAME_CLIENT="${WEB_GAME_CLIENT:-$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js}"

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

LABEL="$(node -e "const fs=require('fs'); const path=require('path'); const crypto=require('crypto'); const root=process.argv[1]; const stateOut=process.argv[2]; const historyPath=process.argv[3]; function walk(dir, rel=''){ const entries=fs.readdirSync(dir,{withFileTypes:true}); let out=[]; for(const e of entries){ const childRel=rel?path.posix.join(rel,e.name):e.name; const full=path.join(dir,e.name); if(e.isDirectory()){ if(childRel==='output' || childRel==='.git' || childRel==='node_modules') continue; out=out.concat(walk(full, childRel)); } else { out.push(childRel); } } return out; } const files=walk(root).sort(); const hashes={}; for(const rel of files){ const full=path.join(root, rel); const buf=fs.readFileSync(full); hashes[rel]=crypto.createHash('sha1').update(buf).digest('hex'); } const prev=fs.existsSync(historyPath)?JSON.parse(fs.readFileSync(historyPath,'utf8')):{hashes:{}}; const changed=[]; const keys=new Set([...Object.keys(prev.hashes||{}), ...Object.keys(hashes)]); for(const k of keys){ if((prev.hashes||{})[k]!==hashes[k]) changed.push(k); } const has=(re)=>changed.some(p=>re.test(p)); const categories=[]; if(has(/(^|\/)game\.js$/)) categories.push('gameplay'); if(has(/(^|\/)(index\.html|styles\.css)$/)) categories.push('ui'); if(has(/(^|\/)(README\.md|POC-Tycoon\.md|progress\.md)$/)) categories.push('docs'); if(has(/(^|\/)scripts\/verify-tycoon\.sh$/)) categories.push('verify'); const leaf=(p)=>p.split('/').pop()||p; const slug=(s)=>s.replace(/\\.[^.]+$/,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase(); let label='no-change'; if(changed.length){ if(categories.length){ label=categories.slice(0,2).join('-'); } else { label=slug(leaf(changed[0])) || 'misc'; } } label=label.slice(0,32).replace(/-+$/,''); fs.writeFileSync(stateOut, JSON.stringify({hashes, changed, label, computed_at:new Date().toISOString()}, null, 2)); console.log(label);" "$ROOT_DIR" "$STATE_TMP" "$HISTORY_PATH")"
RUN_ID="$(next_index)"
WEB_GAME_DIR="$OUT_ROOT/${RUN_ID}-${LABEL}-web-game"
PROBE_PATH="$OUT_ROOT/${RUN_ID}-${LABEL}-probe.json"

echo "[verify-tycoon] URL: $URL"
echo "[verify-tycoon] Run: $RUN_ID"
echo "[verify-tycoon] Label: $LABEL"
echo "[verify-tycoon] Output root: $OUT_ROOT"

# 1) Syntax check
node --check "$ROOT_DIR/game.js"

# 2) Run the standard action-loop client and capture screenshots/state
node "$WEB_GAME_CLIENT" \
  --url "$URL" \
  --iterations 2 \
  --screenshot-dir "$WEB_GAME_DIR" \
  --actions-json '{"steps":[{"buttons":["enter"],"frames":4},{"buttons":["enter"],"frames":4},{"buttons":["down","enter"],"frames":4},{"buttons":["enter"],"frames":4}]}'

# 3) Summarize captured state snapshots
node -e "const fs = require('fs'); const path = require('path'); const dir = process.argv[1]; const files = fs.readdirSync(dir).filter(f => /^state-\\d+\\.json$/.test(f)).sort(); if (!files.length) { console.error('No state files found'); process.exit(1); } const states = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); const first = states[0]; const last = states[states.length - 1]; const summary = { run_id: process.argv[3], label: process.argv[4], iterations: states.length, first: { day: first.day, mode: first.mode, cash: first.cash, repeat_customers: (first.repeat_customers || []).length, leads: (first.leads || []).length }, last: { day: last.day, mode: last.mode, cash: last.cash, repeat_customers: (last.repeat_customers || []).length, leads: (last.leads || []).length }, any_pending_offers: states.some(s => (s.pending_regular_offers || []).length > 0), modes_seen: [...new Set(states.map(s => s.mode))] }; fs.writeFileSync(process.argv[2], JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary, null, 2));" "$WEB_GAME_DIR" "$PROBE_PATH" "$RUN_ID" "$LABEL"

# 4) Persist current state as baseline for "since last verify" comparison
cp "$STATE_TMP" "$HISTORY_PATH"

echo "[verify-tycoon] Done."
echo "[verify-tycoon] Artifacts:"
echo "  - $WEB_GAME_DIR"
echo "  - $PROBE_PATH"
