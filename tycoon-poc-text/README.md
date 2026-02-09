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

- `Up` / `Down`: move day-planner cursor
- `Space`: toggle highlighted job
- `Enter`: confirm/continue
- `Up` / `Down`: adjust representative mow score
- `Left` / `Right`: cycle delivered pattern (`circle` / `stripe` / `none`)
- `A`: buy shown upgrade during report
- `R`: reset run
- `F`: fullscreen toggle

## Deterministic Hooks

- `window.render_game_to_text()` returns concise JSON state.
- `window.advanceTime(ms)` advances deterministic simulation ticks.
