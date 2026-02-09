# Mow Grass Mo' Money — Proof of Concept (Mowing Minigame Only)

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
Player drives a lawn mower around a single yard. As the mower cuts grass, lawn tiles/splat areas change from an unmowed visual to a mowed visual.

### Controls (POC)
- Hold mouse click to drive mower forward.
- Move cursor left/right relative to mower heading to steer.
- Release mouse click to stop mower movement.
- Optional: secondary mouse button for reverse.
- Mower blade is always on during prototype play.

### Mowing Rules
- Grass starts in `unmowed` state.
- Grass under mower deck changes to `mowed`.
- Mowed grass stays mowed (no regrowth in-session).
- Coverage percent updates in real time.
- Level completes when coverage reaches target threshold (example: 95%).

### Failure/Constraint Rules (Minimal)
- Colliding with obstacle blocks movement.
- Timer is optional for first pass; if used, keep generous (example: 5 minutes).

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
- Player can drive mower smoothly in top-down view.
- Lawn clearly transitions between unmowed and mowed visuals.
- Coverage percentage reaches completion target and ends level.
- Obstacles create light routing decisions without frustration.
- All scene objects are separate assets.

## Build Order
1. Block out lawn scene and boundaries.
2. Implement mower movement and collision.
3. Implement mow-state system (unmowed -> mowed).
4. Add coverage tracking + win condition.
5. Hook up simple temporary art assets.
6. Replace with final minimal POC assets.
