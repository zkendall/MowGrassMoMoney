# MoGrassMoMoney Tycoon Game Design Spec

This document is the canonical game-design spec for the tycoon loop in `/Users/zkendall/projects/MowGrassMoMoney/tycoon-poc-text`.

Use it as the design lens for all feature work:
- keep progression incremental,
- keep decisions legible,
- keep trade-offs explicit.

## Design Lens

1. One-day decisions should create multi-day consequences.
2. Every major action should push at least one progression stream up and one down.
3. Growth should come from compounding loops (not one-off rewards).
4. Risk should be visible before failure (churn warnings, affordability, lead states).
5. Inputs and outcomes should remain deterministic and testable.
6. Each major day action should eventually have at least one upgrade path.

## Upgrade Lens

Use upgrades as the main progression language for the tycoon layer.

1. Action-linked upgrades:
- Upgrades should map to a specific day action (`solicit`, `follow_up`, `mow`, `shop_hardware`, future crew actions).

2. Stream-linked upgrades:
- Every upgrade should clearly affect one or more streams (cash, lead volume, qualification throughput, retention, capacity).

3. Trade-off-first upgrades:
- Upgrades should improve one dimension while increasing spend, risk, or complexity.

4. Tiered upgrade identity:
- Each upgrade tree should have clear tiers, increasing cost, and visible output impact.

## Current Playable Spec (Implemented)

### Core Day Loop

`day_action` -> (`solicit` | `follow_up` | `mow` | `shop_hardware`) -> `report` -> next day

`mow` sub-flow:
- `planning` (select jobs up to cap)
- `performance` (set representative score + pattern)
- resolve payout/cost/retention/offers
- `report`

### Work Trees

1. Acquisition Tree
- `Solicit` -> generate `raw` leads.
- `Follow Up Leads` -> convert `raw` to `qualified`.
- `Mow Lawns` on qualified leads.
- Passing result (`final_score >= 70`) creates regular-customer offers.
- Accepted offers become repeat customers next day.

2. Operations Tree
- Build a day plan from qualified leads + repeat customers.
- Select jobs (day cap) and set one representative mow result.
- Resolve all accepted jobs from that representative result.
- Apply revenue, fuel, maintenance, and net cash.

3. Retention Tree
- Repeat customers not serviced gain `days_since_service`.
- Serviced repeat customers reset to `0`.
- Customers churn when `days_since_service > 3`.
- Retention processing runs at day end, including non-mowing actions.

4. Hardware Tree
- Purchase path is action-gated: only via `Shop for New Hardware`.
- Tier progression is linear:
  - Manual Push -> Gas Push -> Riding Mower
- Higher tiers increase quality bonus and operating costs.

### Upgrade Trees (Current + Planned)

1. Hardware Upgrades (implemented)
- Action: `Shop for New Hardware`
- Purpose: improve mow quality power at higher cost.
- State today: fully implemented as a 3-tier chain.

2. Solicitation Upgrades (planned)
- Action: `Solicit`
- Purpose: increase response volume and lead generation consistency.
- Candidate tiers:
  - newspaper ads
  - billboard space
  - TV ads
  - social media ads

3. Lead Qualification Upgrades (planned)
- Action: `Follow Up Leads`
- Purpose: increase raw->qualified conversion throughput and reliability.
- Candidate tiers:
  - take a sales class
  - hire an Indian call center
  - hire an American call center
  - automate qualification with AI

4. Crew Building and Management Upgrades (future)
- Action family: future operations/crew actions.
- Purpose: raise capacity by hiring employees and building multiple crews.
- Design target: expand from owner-operator to multi-crew business with staffing trade-offs.

## Incremental Streams (Current)

| Stream | Primary Gain | Primary Loss | Main Player Levers |
| --- | --- | --- | --- |
| Cash | Job payouts | Fuel, maintenance, materials, upgrades | Action choice, job selection, score/pattern, buy/skip hardware |
| Lead Inventory | Successful solicit days | Leads serviced during mowing | Solicit vs other day actions |
| Qualified Work Queue | Follow-up conversions | Jobs completed | Follow Up Leads cadence |
| Repeat Customer Base | Accepted regular offers | Churn from delayed service | Offer acceptance + service prioritization |
| Service Power | Hardware upgrades | No direct decay; opportunity cost in spend | Shop action and upgrade timing |
| Retention Risk | Time without service | Service on mow days | Job prioritization of high-risk repeats |

## Current Numeric Rules (Source-Aligned)

- Starting cash: `$220`
- Day action options: `solicit`, `follow_up`, `mow`, `shop_hardware`
- Job cap per mow day: `5`
- Solicit:
  - Materials cost: `$5-$15`
  - Success chance: `45%`
  - New leads on success: `1-3` (`raw`)
- Follow up:
  - Per-raw-lead qualification chance: `40%`
- Passing threshold for repeat-offer eligibility: `70`
- Final score formula:
  - `score_input + mower_quality_bonus - complexity_penalty`
  - Complexity penalty: `low=0`, `med=7`, `high=15`
- Quality multipliers by final score:
  - `<40 => 0.5x`
  - `40-69 => 0.9x`
  - `70-89 => 1.0x`
  - `90-100 => 1.15x`
- Pattern modifier:
  - match => `1.05x`
  - mismatch (when preference is not `none`) => `0.95x`
  - preference `none` => `1.0x`
- Hardware tiers:
  - Manual Push: `quality +0`, `maintenance 6`, `fuel rate 4`, `cost 0`
  - Gas Push: `quality +6`, `maintenance 11`, `fuel rate 6`, `cost 320`
  - Riding Mower: `quality +11`, `maintenance 20`, `fuel rate 9`, `cost 790`

## Feature-Set Expansion Protocol

When adding a feature, define it in this order:

1. Tree placement:
- Which work tree does it extend (acquisition, operations, retention, hardware, or new)?

2. Stream impact:
- Which incremental streams go up?
- Which go down?
- Which new stream is introduced (if any)?

3. Decision impact:
- What new player decision exists?
- What existing decision becomes more meaningful?

4. Test impact:
- Which regression fixture(s) and golden JSON(s) must change?
- Which deterministic hook output field changes?

5. Documentation impact:
- Update this file first.
- Then sync `/Users/zkendall/projects/MowGrassMoMoney/tycoon-poc-text/POC-Tycoon.md` and `/Users/zkendall/projects/MowGrassMoMoney/tycoon-poc-text/README.md` if behavior/controls changed.

## Suggested Next Feature Ideas (Upgrade-Oriented, Not Yet Implemented)

1. Solicitation Upgrades
- Add a purchasable solicitation tree to improve response volume.
- Candidate upgrades:
  - newspaper ads
  - billboard space
  - TV ads
  - social media ads
- Design intent: improve solicit success chance and/or generated lead count.

2. Lead Qualification Upgrades
- Add a purchasable follow-up tree to improve qualification outcomes.
- Candidate upgrades:
  - take a sales class
  - hire an Indian call center
  - hire an American call center
  - automate the process with AI
- Design intent: improve raw->qualified conversion rate and/or reduce qualification friction.

3. Crew Building and Management
- Add hiring and crew-management progression.
- Core goals:
  - hire additional employees,
  - form multiple crews,
  - manage crew cost/performance.
- Design intent: unlock higher daily capacity and introduce labor-management trade-offs.

4. Pricing and Contracts
- Add per-job pricing decisions and customer acceptance sensitivity.
- Extend the cash stream with margin-management trade-offs.

5. Capacity and Scheduling
- Add time/capacity constraints and routing pressure.
- Tighten retention-vs-revenue decisions.

6. Reputation and Referrals
- Add reputation as a stream driven by quality and reliability.
- Use referrals as a second acquisition branch beside solicitation.
