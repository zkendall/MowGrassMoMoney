# Tycoon POC System Design

## Runtime Architecture

```mermaid
flowchart LR
  U["Player Input\n(Keyboard: Up/Down/Left/Right, Enter, Space, R, F)"] --> K["src/keyboard.js\nMode-aware input routing"]
  K --> A["src/dayActions.js\nDay loop, economy, retention, offers"]
  K --> P["src/processing.js\nTimed transitions + spinner"]

  I["src/index.js\nApp orchestrator + deterministic hooks"] --> S["src/state.js\nGame state + test start presets"]
  I --> M["src/stateMachine.js\nAllowed mode transitions"]
  I --> R["Render Layer\nconsoleView + statusPanel + activeCustomersView"]
  I --> L["src/logging.js\nConsole + __tycoonLogs ring buffer"]

  A <--> J["src/jobs.js\nRNG, lead/job generation, scoring, payouts"]
  A --> M
  P --> M
  A --> S
  P --> S
  K --> S
  S --> R

  R --> DOM["Browser UI\n`#console`, `#game` canvas, `#active-customers`"]
  I --> H["Public Hooks\n`render_game_to_text()`\n`advanceTime(ms)`\n`setTycoonSeed(seed)`\n`__tycoonTestSetStartStateOverride(...)`"]
```

## Verification Pipeline

```mermaid
flowchart LR
  T["npx playwright test\ntests/regression.spec.js"] --> PW["Playwright Test runner"]
  PW --> APP["Tycoon app in browser\nindex.html to game.js to src/index.js"]
  PW --> GS["Golden JSON checks\n/tests/golden/*.json"]
  PW --> RS["Regression summary\noutput/regression-tests/latest-summary.json"]

  Q["npx playwright test\ntests/quick-verify.spec.js"] --> QP["Playwright Test runner"]
  QP --> APP
  APP --> TXT["render_game_to_text snapshots"]
  QP --> SS["Screenshots + state JSON\noutput/<timestamp>-verify-web-game/"]
  QP --> VS["summarize-verify-states.js"]
  VS --> PR["Probe summary\noutput/<timestamp>-verify-probe.json"]
```

## Notes

- `src/index.js` is the composition root: initializes seeded state, attaches keyboard handlers, and drives rendering.
- Mode safety is centralized in `src/stateMachine.js`, while transition timing is mediated by `src/processing.js`.
- Economic outcomes and customer lifecycle behavior are concentrated in `src/dayActions.js` + `src/jobs.js`.
- Regression, quick-verify, and long-playthrough suites all run under Playwright Test (`tests/regression.spec.js`, `tests/quick-verify.spec.js`, `tests/long-playthrough.spec.js`).
- Regression, quick-verify, and long-playthrough flows are fixture-driven (`tests/fixtures/*.json`) and include per-scenario `start_state` metadata.
- Shared harness utilities under `tests/harness/*` centralize core runtime mechanics; scenario-specific gameplay ops and assertions remain in each suite file.
