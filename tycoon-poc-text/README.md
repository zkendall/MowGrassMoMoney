# Tycoon Text POC

Text-first proof of concept for the tycoon meta loop from `POC-Tycoon.md`.

## Run

From repo root:

```bash
cd tycoon-poc-text
python3 -m http.server 4174
```

Open `http://127.0.0.1:4174`.

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

## Snapshot Numbering Guideline

- Run verification with:
  - `./scripts/verify-tycoon.sh http://127.0.0.1:4174`
- Each run creates indexed artifacts directly under `output/` with a concise change label:
  - `NN-<change-label>-web-game/`
  - matching probe file: `NN-<change-label>-probe.json`
- Label is computed from changes since the last successful verify run.
- Label is intentionally short (`gameplay`, `ui`, `docs`, `verify`, or a compact file-based fallback).
- If no tracked changes are detected, label becomes `no-change`.
- Use matching index pairs when reviewing a run (`NN-...-web-game` + `NN-...-probe.json`).
