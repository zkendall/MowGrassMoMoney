# Tycoon Text POC

Text-first proof of concept for the tycoon meta loop from `POC-Tycoon.md`.

## Run

From repo root:

```bash
cd tycoon-poc-text
python3 -m http.server 4174
```

Open `http://127.0.0.1:4174`.

To run with a deterministic seed:

```bash
open "http://127.0.0.1:4174/?seed=2"
```

## Controls

- `Up` / `Down`: move cursor (day action, planner jobs, or report offers)
- `Enter`: confirm/continue (select day action, confirm phase transitions)
- `Space`: toggle highlighted selection (planner jobs or regular-offer acceptance)
- `Up` / `Down`: adjust representative mow score in performance
- `Left` / `Right`: cycle delivered pattern (`circle` / `stripe` / `none`)
- `R`: reset run
- `F`: fullscreen toggle

## Day Flow

- Start each day by choosing one action:
  - `Solicit`: spend the day and pay random materials cost; may generate new raw leads.
  - `Follow Up Leads`: spend the day qualifying raw leads into mowable leads.
  - `Mow Lawns`: select jobs from qualified leads and active repeat customers.
  - `Shop for New Hardware`: spend the day visiting shop; choose buy or skip.
- Hardware upgrades are only purchased in `Shop for New Hardware`.
- New active customers are never granted at day start.
- Active customers are earned only when:
  - a lead is mowed with passing score (`final_score >= 70`), and
  - the player accepts that customer as a regular in the report phase.

## Deterministic Hooks

- `window.render_game_to_text()` returns concise JSON state.
- `window.advanceTime(ms)` advances deterministic simulation ticks.
- `window.setTycoonSeed(seed)` resets the run with a new deterministic seed.
- `window.__tycoonTestSetStartStateOverride(mode, applyNow)` sets a test-only start-state override:
  - `mode='test_all_actions'` loads an explicit mid-game snapshot with populated repeat customers, leads (raw + qualified), planning jobs, accepted jobs, pending offers, and prior report data.
  - `mode='default'` (or `null`) clears the override and restores normal start behavior.
  - Optional URL shortcut: `?start_state=test_all_actions`.

## Code Structure

- `game.js`: thin loader that imports the app entrypoint.
- `src/index.js`: app wiring (state initialization, render loop, exported hooks).
- `src/stateMachine.js`: centralized mode transitions (`state.mode` changes happen here).
- `src/dayActions.js`: gameplay action handlers and day-loop logic.
- `src/jobs.js`: customer/lead generation, payout and retention helpers.
- `src/processing.js`: timed processing/spinner transitions.
- `src/render/*`: console, status panel, and active customer rendering.
- `src/keyboard.js`: per-mode input routing.

## System Design

- Architecture diagram: [`SYSTEM-DESIGN.md`](SYSTEM-DESIGN.md)

## Snapshot Naming Guideline

- Verify and regression suites share one runner: `scripts/run-regression-tests.js` (different `--suite` modes).
- Run verification with:
  - `npm --prefix tycoon-poc-text run verify:quick -- --url http://127.0.0.1:4174`
  - headed mode: `npm --prefix tycoon-poc-text run verify:quick -- --url http://127.0.0.1:4174 --headed`
- Each run creates timestamped artifacts directly under `output/` with a concise change label:
  - `<UTC-timestamp>-<change-label>-web-game/`
  - matching probe file: `<UTC-timestamp>-<change-label>-probe.json`
- Label is computed from changes since the last successful verify run.
- Label is intentionally short (`gameplay`, `ui`, `docs`, `verify`, or a compact file-based fallback).
- If no tracked changes are detected, label becomes `no-change`.
- Use matching timestamp pairs when reviewing a run (`<timestamp>-...-web-game` + `<timestamp>-...-probe.json`).

## Regression Tests

- Install test dependencies:
  - `npm --prefix tycoon-poc-text install`
  - `npx --prefix tycoon-poc-text playwright install chromium`
- Run RNG determinism unit test:
  - `npm --prefix tycoon-poc-text run test:rng`
- Run the golden scenario suite (3 scenarios):
  - `npm --prefix tycoon-poc-text run test:regression -- --url http://127.0.0.1:4174`
- Runner supports suites explicitly:
  - regression: `node tycoon-poc-text/scripts/run-regression-tests.js --suite regression --url http://127.0.0.1:4174`
  - quick verify: `node tycoon-poc-text/scripts/run-regression-tests.js --suite quick --url http://127.0.0.1:4174`
- Update golden baselines after intentional behavior changes:
  - `node tycoon-poc-text/scripts/run-regression-tests.js --url http://127.0.0.1:4174 --update-golden`
