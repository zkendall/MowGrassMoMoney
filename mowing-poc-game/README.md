# Mowing POC Game

Simple single-scene top-down mowing prototype based on `POC-Mowing.md`.

## Run locally

From repo root:

```bash
cd mowing-poc-game
python3 -m http.server 4173
```

Open: `http://localhost:4173`

## Controls

- Hold left mouse: drive forward + mow
- Move cursor left/right of mower heading: steer
- Hold right mouse: reverse
- Release mouse button(s): stop
- `F`: fullscreen toggle
- `R`: reset

## Win condition

Reach 95% mow coverage.


# Ideas

## Mechanics
We gotta figure out smooth/fun mechanics
Maybe just have the user draw on the screen with their finger/cursor, which draws a continuous thick band overlay. Then they can confirm it, which shows the mower following that path. This seems more chill and easier to get comfortable than real-time steering of the mower.