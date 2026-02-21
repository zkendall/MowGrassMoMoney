# MoGrassMoMoney — Proof of Concept (Mowing Minigame Only)

## Goal
Build a playable proof of concept focused on one top-down mowing minigame.

This POC should prove:
- Mowing feels satisfying moment-to-moment.
- Mowed vs unmowed state is immediately readable.
- A single lawn scene can support clean pathing and obstacle navigation.

## Scope (In)
- One lawn scene only.
- One mower controlled by the player from top-down view.
- No player character model (mower-only control).
- Basic collision with a small set of obstacles.
- Lawn state change from unmowed to mowed.
- Simple win condition based on mowing coverage.

## Scope (Out)
- Business management systems.
- Upgrades, economy, customers, or progression.
- Multiple regions or weather systems.
- NPCs, crew members, or pedestrians.
- Polished VFX/audio beyond basic feedback.

## Core Gameplay
Player plans a mowing route by drawing it, reviews that route, then watches the mower execute it. As the mower runs the accepted route, lawn cells change from unmowed to mowed.

### Controls (POC)
- Left-click + drag to draw a route using a circular brush overlay.
- Release to enter review mode.
- In review mode, click `Accept` to execute the route or `Retry` to redraw.
- During animation, hold `Space` to fast-forward playback.
- `F` toggles fullscreen, `R` resets progress, and `M` toggles music.

### Mowing Rules
- Grass starts in `unmowed` state.
- Grass under mower deck changes to `mowed`.
- Mowed grass stays mowed (no regrowth in-session).
- Coverage percent updates as the accepted route is animated.
- Coverage persists across route attempts until reset.
- The level completes when an animation run finishes and coverage is at least the target threshold (95%).
- During playback, only the centerline is shown (black dashed line); brush swath visualization is hidden.

### Failure/Constraint Rules (Minimal)
- Crash checks use the route centerline position (line-overlap behavior), not mower body width.
- On each obstacle entry overlap during playback, the mower performs a flip, a red `-$1` popup appears, and animation continues.
- Route playback is clamped to lawn bounds; leaving bounds does not apply a boundary crash penalty.
- No timer is used in the current prototype.

## One Lawn Scene Specification
Create exactly one small-to-medium suburban lawn designed for readability.

### Scene Layout
- Rectangular play area with clear boundaries.
- House footprint at top edge (non-playable block).
- Driveway strip on one side (non-grass surface).
- Main mowable lawn area as the central play space.
- 3-5 static obstacles (example: tree, flower bed, rock, sprinkler, garden gnome).

### Camera
- Fixed top-down camera.
- Keep entire lawn visible or near-visible without dramatic zoom.
- Prioritize gameplay readability over cinematic framing.

## Art Direction for POC (Very Simple)
Keep art intentionally simple and functional.

### Grass Readability Requirement
Use only two lawn states:
1. `Unmowed`: one base color + one simple texture.
2. `Mowed`: one different base color + one different simple texture.

Implementation guidance:
- Ensure clear value/hue contrast between states.
- Textures should be subtle but visibly different at gameplay zoom.
- Avoid noisy detail or high-frequency patterns.

### Style Constraints
- Flat/shaded 2D top-down sprites/tiles.
- Minimal palette.
- No detailed character art.
- No complex lighting or shader effects required.

## Asset List (Separate Assets Per Object)
Create separate files/assets for each object (no single merged scene painting).

### Required Assets
- Lawn base (unmowed texture/material).
- Lawn mowed overlay/variant (mowed texture/material).
- Mower sprite set (top-down): idle, move, optional turn variants.
- House footprint sprite.
- Driveway tile/sprite.
- Fence or boundary edge pieces.
- Obstacle sprites (separate asset each):
  - Tree
  - Flower bed
  - Rock
  - Sprinkler
  - Garden gnome

### Optional Supporting Assets
- Simple wheel-track or cut feedback decal.
- Basic UI elements: coverage meter, completion text.

## Technical Prototype Notes
- Track mow coverage by grid cells, tile states, or render mask.
- Update visual state immediately when mower overlaps unmowed area.
- Keep logic deterministic and easy to debug.
- Favor simple collision shapes (box/circle) for obstacles.

## Success Criteria
POC is successful when all conditions are true:
- Player can draw, review, and execute routes in a clear loop.
- Lawn clearly transitions between unmowed and mowed visuals.
- Coverage percentage can be built over multiple runs and reaches completion target.
- Obstacles create routing decisions with clear feedback via line-overlap crash penalties.
- All scene objects are separate assets.

## Build Order
1. Block out lawn scene and boundaries.
2. Implement route drawing + review flow (`Accept` / `Retry`).
3. Implement route playback animation and mow-state updates (unmowed -> mowed).
4. Add crash handling, penalties, and feedback during playback.
5. Add coverage tracking with end-of-route win evaluation.
6. Hook up simple temporary art assets and polish readability.
