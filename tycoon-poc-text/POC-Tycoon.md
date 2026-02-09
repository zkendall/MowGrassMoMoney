# Mow Grass Mo' Money — Proof of Concept (Tycoon Meta Game, Text-First)

## Goal
Build a playable proof of concept focused on the business-management layer that surrounds mowing, using text-based interaction first.

This POC should prove:
- The day-to-day decision loop is clear, fast, and replayable.
- Money and customer-count progression feel motivating ("number go up").
- A single played mowing result can drive outcomes for multiple jobs. (For the POC this wil be a mocked value, from player input.)
- The full tycoon loop is validated before spending time on visual UI.

## Scope (In)
- One playable meta loop across multiple in-game days.
- One region only (fixed starter region).
- Daily planning screen with limited but meaningful decisions.
- Customer list containing existing and new opportunities.
- Simple assignment/resolution model:
  - Player manually mows one representative lawn (input score).
  - Remaining accepted jobs auto-resolve from that score.
- Basic economy:
  - Revenue per job.
  - Fuel + maintenance operating costs.
  - End-of-day net profit/loss.
- Minimal upgrade shop with 3 mower tiers.
- Simple retention logic for repeat customers.
- Text-based prompts and reports (CLI or in-page text panel).

## Scope (Out)
- Real-time mowing gameplay implementation (reuse score input/stub).
- Polished GUI layouts, art direction, and visual UX.
- Multiple regions, weather simulation, or seasonal systems.
- Hiring crews, payroll depth, and staffing simulation.
- Narrative events, rivals, legal/HOA systems.
- Complex AI pricing, dynamic routing, or advanced analytics.

## Core Meta Loop
Each in-game day follows one repeatable structure:
1. Start Day: show cash, mower tier, active customers, and urgency warnings.
2. Choose Jobs: pick which customers to service today from a constrained list.
3. Play/Resolve Mowing:
   - Enter one representative mowing score (0-100) from minigame/stub.
   - Auto-resolve all accepted jobs using that score plus job modifiers.
4. End Day Summary:
   - Revenue, costs, net, satisfaction impact, retained/lost customers.
   - Optional offer: buy upgrade if affordable.
5. Advance to next day.

## Gameplay Rules (POC)

### Job Generation
- Daily job pool = repeat customers + new prospects.
- Each job has:
  - `lawn_size` (small/medium/large)
  - `complexity` (low/med/high)
  - `base_payout`
  - `distance_cost`
- Player can accept up to a fixed cap per day (example: 5 jobs).

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
- Net = total payout - (fuel + maintenance).

### Customer Retention
- Repeat customers track `days_since_service`.
- If unserved beyond threshold (example: 3 days), customer churns.
- High score days can convert prospects into repeat customers.

### Upgrades (Minimal)
Three tiers only:
1. `Manual Push` (starter): low speed bonus, low maintenance.
2. `Gas Push` (mid): moderate quality bonus, moderate maintenance.
3. `Riding Mower` (high): strongest quality bonus, highest maintenance.

Upgrade effect in POC:
- Adds small positive modifier to final score.
- Increases fixed daily maintenance.

## Text Interface Specification
Use text prompts and printed summaries only.

### 1) Day Start Summary
- Print day number, cash, mower tier, active repeat customers, and churn-risk warnings.

### 2) Job Selection Prompt
- Print customer/job list with numeric indices and key stats.
- Let player select accepted jobs via comma-separated indices.
- Enforce daily acceptance cap and re-prompt on invalid input.

### 3) Mowing Result Prompt (Stub)
- Prompt for representative `mow_score` (0-100).
- Validate and clamp input.

### 4) End-of-Day Report
- Print payout per job and total revenue.
- Print fuel + maintenance costs and net result.
- Print customer updates: retained, churned, converted prospects.
- Prompt to continue to next day or quit run.

## Data Model (Suggested)
- `GameState`
  - `day`
  - `cash`
  - `mower_tier`
  - `repeat_customers[]`
  - `prospects[]`
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

## Success Criteria
POC is successful when all are true:
- Player can complete at least 7 in-game days without dead ends.
- Daily decisions change financial outcomes in understandable ways.
- Player can gain and lose customers via simple retention rules.
- Upgrade purchase presents clear trade-off (better performance vs higher costs).
- End-of-day summary makes results legible and debuggable.

## Technical POC Shape (Recommended)
- `core` (pure logic): day generation, resolution math, retention, economy.
- `io_text` (adapter): prompt/parse/print loop.
- Deterministic mode support:
  - Seeded random generation for repeatable test runs.
  - Optional scripted input list for automated simulation tests.

## Build Order
1. Implement day state + core data structures as pure functions.
2. Add text day-start summary and job selection parser with validation.
3. Add stub mowing score prompt and job auto-resolution.
4. Add revenue/cost accounting and end-of-day printed report.
5. Add retention/churn and prospect conversion rules.
6. Add 3-tier upgrade logic and purchase prompt in text flow.
7. Add seeded simulation mode for fast balancing passes.
8. Tune numbers for understandable early-game progression.

## Open Questions (For Next Draft)
- Exact daily job cap and whether it increases with upgrades.
- Whether distance should be abstracted into one fixed operating-cost modifier.
- Whether "line cleanness" should be a second score in meta resolution, or deferred.
- Whether the text POC should be CLI-only or embedded in the existing web page as a text panel first.
