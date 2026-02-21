# MoGrassMoMoney — Proof of Concept (Tycoon Meta Game, Text-First)

## Goal
Build a playable proof of concept focused on the business-management layer that surrounds mowing, using text-based interaction first.

This POC should prove:
- The day-to-day decision loop is clear, fast, and replayable.
- Money and customer-count progression feel motivating ("number go up").
- A single played mowing result can drive outcomes for multiple jobs. (For the POC this is a mocked value from player input.)
- The full tycoon loop is validated before spending time on visual UI.
- Active customers are earned from performance, not granted on day start.

## Current Build Target
- Implemented in `/Users/zkendall/projects/MowGrassMoMoney/tycoon-poc-text`.
- Platform: browser-based text-first UI (no build step, static files).
- Deterministic hooks are required:
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`

## Scope (In)
- One playable meta loop across multiple in-game days.
- One region only (fixed starter region).
- Daily action-selection screen with limited but meaningful decisions.
- Lead pipeline plus active-repeat customer management.
- Simple assignment/resolution model:
  - Player manually mows one representative lawn (input score).
  - Remaining accepted jobs auto-resolve from that score.
- Basic economy:
  - Revenue per job.
  - Fuel + maintenance operating costs.
  - End-of-day net profit/loss.
- Minimal upgrade shop with 3 mower tiers.
- Simple retention logic for repeat customers.
- Text-based prompts and reports in an in-page console.
- Right-side status UI panels for quick scanning.

## Scope (Out)
- Real-time mowing gameplay implementation (reuse score input/stub).
- Polished GUI layouts, art direction, and visual UX.
- Multiple regions, weather simulation, or seasonal systems.
- Hiring crews, payroll depth, and staffing simulation.
- Narrative events, rivals, legal/HOA systems.
- Complex AI pricing, dynamic routing, or advanced analytics.

## Core Meta Loop
Each in-game day follows one repeatable structure:
1. Start Day: choose one action for the day.
   - `Solicit`
   - `Follow Up Leads`
   - `Mow Lawns`
   - `Shop for New Hardware`
2. If `Mow Lawns`:
   - Choose jobs from qualified leads and existing repeat customers.
   - Enter representative mowing score and pattern result.
   - Auto-resolve accepted jobs.
3. End Day Summary:
   - Revenue, costs, net, churn impact, leads/offer outcomes.
   - Hardware purchase result when shop activity is chosen.
4. Advance to next day.

## Gameplay Rules (POC)

### Job Generation
- Day 1 starts with zero repeat customers.
- Leads are created only via solicitation.
- `Mow Lawns` job pool = repeat customers + qualified leads.
- Each job has:
  - `lawn_size` (small/medium/large)
  - `complexity` (low/med/high)
  - `base_payout`
  - `distance_cost`
- Player can accept up to a fixed cap per day (example: 5 jobs).

### Day Actions
- `Solicit`:
  - Consumes the day.
  - Charges a small random materials cost.
  - Grants a probabilistic set of new raw leads.
- `Follow Up Leads`:
  - Consumes the day.
  - Attempts to upgrade raw leads into qualified (mowable) leads.
- `Mow Lawns`:
  - Uses planner/performance flow.
  - Available jobs come from qualified leads and existing repeat customers.
- `Shop for New Hardware`:
  - Consumes the day.
  - Player can buy next mower tier (if affordable) or skip.
  - Upgrade purchasing is only available through this action.

### Resolution Model
- Input `mow_score` from representative lawn (0-100).
- Job final score = `mow_score + equipment_bonus - complexity_penalty` (clamped 0-100).
- Job payout = `base_payout * quality_multiplier(final_score)`.
- Quality multiplier table (example):
  - 0-39: `0.5x`
  - 40-69: `0.9x`
  - 70-89: `1.0x`
  - 90-100: `1.15x`
- Pattern preference modifier:
  - Each customer has `pattern_preference`: `circle`, `stripe`, or `none`.
  - POC input includes delivered `pattern_result`: `circle`, `stripe`, or `none`.
  - If preference matches result: apply small bonus (example `+0.05x` payout multiplier).
  - If preference is not met (and preference is not `none`): apply small penalty (example `-0.05x` payout multiplier).

### Costs
- Fuel cost scales with jobs + mower type.
- Maintenance cost is flat per day by mower tier.
- Solicitation applies a random materials cost.
- Net = total payout - (fuel + maintenance + materials).

### Customer Retention
- Repeat customers track `days_since_service`.
- If unserved beyond threshold (example: 3 days), customer churns.
- Passing-grade customer offer flow (current implementation):
  - Lead jobs that finish with passing score (`final_score >= 70`) become regular-customer offers.
  - In report phase, player can accept or decline each offered customer.
  - Accepted offers are added to `repeat_customers` at next-day transition.

### Upgrades (Minimal)
Three tiers only:
1. `Manual Push` (starter): low speed bonus, low maintenance.
2. `Gas Push` (mid): moderate quality bonus, moderate maintenance.
3. `Riding Mower` (high): strongest quality bonus, highest maintenance.

Upgrade effect in POC:
- Adds small positive modifier to final score.
- Increases fixed daily maintenance.

## Interface Specification (Current)
Use a left-to-right workspace.

### Left Panel: Console
- Main text output for the current phase (`day_action`, `planning`, `performance`, `report`).
- Shows day summary, action options, job table, report breakdown, and prompt notes.

### Right Panel 1: Ongoing Stats
- Canvas-based compact status view.
- Shows:
  - day
  - cash
  - current mower tier
  - cash progress gauge
  - repeat customer count gauge

### Right Panel 2: Active Customers
- List of active repeat customers.
- Each line shows:
  - customer name/id
  - `pattern_preference`
  - `days_since_service`
  - `[risk]` marker when service delay is high.
- Starts empty on day 1 and fills only from accepted regular-customer offers.

### Controls (Current)
- Day action:
  - `Up` / `Down`: move day-action cursor
  - `Enter`: choose day action
- Planning:
  - `Up` / `Down`: move job cursor
  - `Space`: toggle selected job
  - `Enter`: confirm jobs
- Performance:
  - `Up` / `Down`: adjust representative `mow_score`
  - `Left` / `Right`: cycle delivered pattern (`circle` / `stripe` / `none`)
  - `Enter`: resolve day
- Report:
  - `Up` / `Down`: move regular-offer cursor
  - `Space`: accept/decline highlighted regular-offer customer
  - `Enter`: advance to next day
- Global:
  - `R`: reset run
  - `F`: fullscreen toggle

## Data Model (Suggested)
- `GameState`
  - `day`
  - `cash`
  - `mower_tier`
  - `repeat_customers[]`
  - `leads[]`
  - `accepted_jobs[]`
- `Customer`
  - `id`
  - `name`
  - `is_repeat`
  - `lawn_size`
  - `complexity`
  - `pattern_preference` (`circle` | `stripe` | `none`)
  - `base_payout`
  - `days_since_service`
- `Lead`
  - `id`
  - `name`
  - customer/job stats (`lawn_size`, `complexity`, `pattern_preference`, `base_payout`, `distance_cost`)
  - `lead_status` (`raw` | `qualified`)

## Success Criteria
POC is successful when all are true:
- Player can complete at least 7 in-game days without dead ends.
- Daily decisions change financial outcomes in understandable ways.
- Player can gain and lose customers via simple retention rules.
- Upgrade purchase presents clear trade-off (better performance vs higher costs).
- End-of-day summary makes results legible and debuggable.

## Technical POC Shape (Current)
- `game.js` contains:
  - core simulation logic (job generation, resolution, retention, upgrades)
  - text UI rendering (console + right-side customer panel)
  - status canvas rendering
- Deterministic support:
  - seeded RNG
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`

## Current Status
1. Implemented playable multi-day loop with 4 phases (`day_action`, `planning`, `performance`, `report`).
2. Implemented customer/job model including `pattern_preference`.
3. Implemented payout/cost/net math and report breakdown.
4. Implemented retention/churn and passing-grade regular-customer offers with explicit player acceptance.
5. Implemented 3-tier upgrade flow.
6. Implemented left/right panel UI with active customer list under stats.
7. Verified via Playwright state snapshots and screenshots.

## Open Questions (Next Iteration)
- Should `Mow Lawns` begin with a neighborhood day-map pass where the player chooses houses by marked risk/value/location before entering mowing?
- If we add neighborhood navigation, should only the owner crew be map-controlled while additional crews use abstract dispatch?
- Should day job cap scale with mower tier?
- Should we split quality into coverage + line-cleanness scores for meta resolution?
- Should active customers panel include quick-sort filters (risk/high-value/preference)?
- Should we add a simulation-only mode for balance sweeps without UI interaction?
