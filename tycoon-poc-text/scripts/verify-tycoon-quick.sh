#!/usr/bin/env bash
set -euo pipefail

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

LABEL="$(node -e "const fs=require('fs'); const path=require('path'); const crypto=require('crypto'); const root=process.argv[1]; const stateOut=process.argv[2]; const historyPath=process.argv[3]; function walk(dir, rel=''){ const entries=fs.readdirSync(dir,{withFileTypes:true}); let out=[]; for(const e of entries){ const childRel=rel?path.posix.join(rel,e.name):e.name; const full=path.join(dir,e.name); if(e.isDirectory()){ if(childRel==='output' || childRel==='.git' || childRel==='node_modules') continue; out=out.concat(walk(full, childRel)); } else { out.push(childRel); } } return out; } const files=walk(root).sort(); const hashes={}; for(const rel of files){ const full=path.join(root, rel); const buf=fs.readFileSync(full); hashes[rel]=crypto.createHash('sha1').update(buf).digest('hex'); } const prev=fs.existsSync(historyPath)?JSON.parse(fs.readFileSync(historyPath,'utf8')):{hashes:{}}; const changed=[]; const keys=new Set([...Object.keys(prev.hashes||{}), ...Object.keys(hashes)]); for(const k of keys){ if((prev.hashes||{})[k]!==hashes[k]) changed.push(k); } const has=(re)=>changed.some(p=>re.test(p)); const categories=[]; if(has(/(^|\/)game\.js$/)) categories.push('gameplay'); if(has(/(^|\/)(index\.html|styles\.css)$/)) categories.push('ui'); if(has(/(^|\/)(README\.md|POC-Tycoon\.md|progress\.md)$/)) categories.push('docs'); if(has(/(^|\/)scripts\/(verify-tycoon\.sh|verify-tycoon-quick\.sh)$/)) categories.push('verify'); const leaf=(p)=>p.split('/').pop()||p; const slug=(s)=>s.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase(); let label='no-change'; if(changed.length){ if(categories.length){ label=categories.slice(0,2).join('-'); } else { label=slug(leaf(changed[0])) || 'misc'; } } label=label.slice(0,32).replace(/-+$/,''); fs.writeFileSync(stateOut, JSON.stringify({hashes, changed, label, computed_at:new Date().toISOString()}, null, 2)); console.log(label);" "$ROOT_DIR" "$STATE_TMP" "$HISTORY_PATH")"
RUN_ID="$(next_index)"
WEB_GAME_DIR="$OUT_ROOT/${RUN_ID}-${LABEL}-web-game"
PROBE_PATH="$OUT_ROOT/${RUN_ID}-${LABEL}-probe.json"

echo "[verify-tycoon-quick] URL: $URL"
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

# 2) Run action loop and capture screenshots/state
if (( HEADED )); then
  # Headed path intentionally uses real-time keypress spacing so flows are watchable.
  (
    cd "$ROOT_DIR"
    node -e "const fs=require('fs'); const path=require('path'); const { chromium }=require('playwright'); (async()=>{ const url=process.argv[1]; const outDir=process.argv[2]; fs.mkdirSync(outDir,{recursive:true}); const browser=await chromium.launch({ headless:false, args:['--use-gl=angle','--use-angle=swiftshader'] }); const page=await browser.newPage(); const errors=[]; page.on('console',(msg)=>{ if(msg.type()==='error'){ errors.push({ type:'console.error', text:msg.text() }); } }); page.on('pageerror',(err)=>{ errors.push({ type:'pageerror', text:String(err) }); }); await page.goto(url,{ waitUntil:'domcontentloaded' }); await page.waitForTimeout(800); const press=async(key,waitMs)=>{ await page.keyboard.press(key); await page.waitForTimeout(waitMs); }; await press('Enter', 1400); await page.waitForTimeout(1700); await press('Enter', 1100); await press('ArrowDown', 500); await press('Enter', 1200); await page.waitForTimeout(1500); await press('Enter', 1000); await page.screenshot({ path:path.join(outDir,'shot-0.png'), fullPage:true }); const text=await page.evaluate(()=> typeof window.render_game_to_text==='function' ? window.render_game_to_text() : null); if(text){ fs.writeFileSync(path.join(outDir,'state-0.json'), text); } if(errors.length){ fs.writeFileSync(path.join(outDir,'errors-0.json'), JSON.stringify(errors,null,2)); } await browser.close(); })().catch((err)=>{ console.error(err); process.exit(1); });" "$URL" "$WEB_GAME_DIR"
  )
else
  node "$WEB_GAME_CLIENT" \
    --url "$URL" \
    --headless true \
    --iterations 2 \
    --screenshot-dir "$WEB_GAME_DIR" \
    --actions-json '{"steps":[{"buttons":["enter"],"frames":4},{"buttons":[],"frames":90},{"buttons":["enter"],"frames":4},{"buttons":["down","enter"],"frames":4},{"buttons":[],"frames":90},{"buttons":["enter"],"frames":4}]}'
fi

# 3) Summarize captured state snapshots
node -e "const fs = require('fs'); const path = require('path'); const dir = process.argv[1]; const files = fs.readdirSync(dir).filter(f => /^state-\\d+\\.json$/.test(f)).sort(); if (!files.length) { console.error('No state files found'); process.exit(1); } const states = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); const first = states[0]; const last = states[states.length - 1]; const debugLogs = states.flatMap(s => s.debug_log_tail || []); const hasRollLogs = debugLogs.some(entry => /roll=/.test(entry.message || '')); const summary = { run_id: process.argv[3], label: process.argv[4], iterations: states.length, first: { day: first.day, mode: first.mode, cash: first.cash, repeat_customers: (first.repeat_customers || []).length, leads: (first.leads || []).length }, last: { day: last.day, mode: last.mode, cash: last.cash, repeat_customers: (last.repeat_customers || []).length, leads: (last.leads || []).length }, any_pending_offers: states.some(s => (s.pending_regular_offers || []).length > 0), modes_seen: [...new Set(states.map(s => s.mode))], debug_log_entries: debugLogs.length, debug_roll_logs_found: hasRollLogs }; if (!hasRollLogs) { console.error('Expected debug roll logs were not found in state payload.'); process.exit(1); } fs.writeFileSync(process.argv[2], JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary, null, 2));" "$WEB_GAME_DIR" "$PROBE_PATH" "$RUN_ID" "$LABEL"

# 4) Persist current state as baseline for "since last verify" comparison
cp "$STATE_TMP" "$HISTORY_PATH"

echo "[verify-tycoon-quick] Done."
echo "[verify-tycoon-quick] Artifacts:"
echo "  - $WEB_GAME_DIR"
echo "  - $PROBE_PATH"
