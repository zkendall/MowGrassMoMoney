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
  - `mode='test_regression_follow_up'` loads a day-action start with three raw leads for follow-up regression coverage.
  - `mode='test_regression_mow_offer_accept'` loads a day-action start with two qualified leads for mowing-offer regression coverage.
  - `mode='default'` (or `null`) clears the override and restores normal start behavior.
  - Optional URL shortcut: `?start_state=<mode>`.

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

## Game Design

- Incremental design spec and feature-expansion lens: [`GAME-DESIGN.md`](GAME-DESIGN.md)

## Testing

This project uses Playwright Test for regression and quick-verify flows, plus a small RNG determinism unit test.

### Setup

Install dependencies once:

- `npm --prefix tycoon-poc-text install`
- `npx --prefix tycoon-poc-text playwright install chromium`

Primary test files:

- Config: `tycoon-poc-text/playwright.config.js`
- Shared harness core utilities: `tycoon-poc-text/tests/harness/*.js` (`scenario`, `runtime`, `steps`, `artifacts`)
- Regression suite: `tycoon-poc-text/tests/regression.spec.js`
- Regression scenarios fixture (seed/start state/steps): `tycoon-poc-text/tests/fixtures/regression-step-plans.json`
- Quick-verify walkthrough: `tycoon-poc-text/tests/quick-verify.spec.js`
- Quick-verify fixture (seed/start state/steps): `tycoon-poc-text/tests/fixtures/quick-verify-step-plans.json`
- Long playthrough walkthrough: `tycoon-poc-text/tests/long-playthrough.spec.js`
- Long-playthrough fixture (seed/start state/steps): `tycoon-poc-text/tests/fixtures/long-playthrough-step-plans.json`

### Common Commands

Run RNG determinism unit test:

- `npm --prefix tycoon-poc-text run test:rng`

Run the golden regression suite (3 scenarios):

- `cd tycoon-poc-text && npx playwright test tests/regression.spec.js --config=playwright.config.js`

Run quick verify:

- `cd tycoon-poc-text && npx playwright test tests/quick-verify.spec.js --config=playwright.config.js`
- Headed mode: `cd tycoon-poc-text && npx playwright test tests/quick-verify.spec.js --config=playwright.config.js --headed`

Run long full-playthrough verify:

- `cd tycoon-poc-text && npx playwright test tests/long-playthrough.spec.js --config=playwright.config.js`
- Headed mode: `cd tycoon-poc-text && npx playwright test tests/long-playthrough.spec.js --config=playwright.config.js --headed`

Run headed regression:

- `cd tycoon-poc-text && npx playwright test tests/regression.spec.js --config=playwright.config.js --headed`

Update golden baselines after intentional behavior changes:

- `cd tycoon-poc-text && UPDATE_GOLDEN=1 npx playwright test tests/regression.spec.js --config=playwright.config.js`

### Trace Recording and Replay

To record and inspect a full quick-verify run:

- Record trace (headed): `cd tycoon-poc-text && npx playwright test tests/quick-verify.spec.js --config=playwright.config.js --headed --trace on`
- Open latest trace: `cd tycoon-poc-text && npx playwright show-trace "$(ls -t output/regression-tests/test-results/**/trace.zip | head -n 1)"`

### Artifacts and Notes

Quick-verify outputs are timestamped under `output/`:

- `<UTC-timestamp>-verify-web-game/`
- matching probe file: `<UTC-timestamp>-verify-probe.json`

Core Playwright mechanics are shared in `tests/harness/*` (state polling, mode waits, keypress helpers, scenario loading/URL building, and step-run wrappers). Suite-specific operations and assertions remain local inside each `*.spec.js`.

NPM scripts `test:regression`, `test:regression:update`, `verify:quick`, and `verify:long` call Playwright Test directly. Set `TYCOON_BASE_URL` only when you need a non-default target URL.
