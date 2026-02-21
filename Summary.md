# TODO
- Fill in business loop more. What are the screens, etc.
- 

# Summary
This is a lawn mowing empire building simulation game. There are two primary activities: Mowing lawns and building the business.

The player's goal is to make money, "number go up".

The game should balance cozy aesthetic and ambition (like Stardew Valley), with a top-down 2D visual style and somewhat muted, indie-leaning color tones.

## Mini-Game Lens
Treat each major day action as a potential mini-game lane, but only ship lanes that feel fun and distinct.

### Current Lanes That Fit
1. `Solicit` (promotion)
- Flyer Drop: on-foot route mini-game where you deliver flyers across a neighborhood efficiently.
- Drive-By Flyer Throw: vehicle-based mini-game where timing and positioning affect delivery success.
- House Picking Layer: pre-run target selection where you choose houses/blocks likely to produce better jobs.

2. `Mow`
- Existing mowing mini-game remains the core skill expression.
- One representative mow performance still scales to same-day customer outcomes.
- Planned extension: a neighborhood navigation layer where houses are visible targets and the player chooses service order by location/risk/value.

3. `Neighborhood Navigation` (planned bridge layer)
- Navigate around a neighborhood map with house markers (repeat customer, churn risk, qualified lead, value hints).
- Choose which houses to service based on both vibe and strategy.
- Keep this as owner-crew control, then scale with an abstract dispatch model for additional crews.

### Lens Rules
- Keep mini-games short and replayable.
- Tie each mini-game to a clear tycoon stream (lead volume, lead quality, payout quality, retention risk).
- Prefer mini-games where real-time play adds meaningful texture over a pure menu choice.
- Leave actions as strategic decisions until a strong mini-game concept exists.

### Parked for Now
- `Follow Up Leads`: keep as a strategic/system action for now.
- `Shop for Hardware`: keep as an economy decision for now.
- `Crew/Management`: keep as a management layer for now.

# Mow Lawns 
You will mow lawns in real time using the controller, and paid based on customer satisfaction.

## Gameplay
You will mow one lawn a day, and that performance will scale to all the lawns in your portfolio.
   
- For example, if you have 5 customers for the day, you will pick one of their lawns to mow, and mow it using controller. Your performance of that lawn will be used to auto-resolve the other 4 customers lawns. So if all the lawns are the same difficulty and you get a score of 5/10, then you will get a payout from all customers based on the 5/10 score.

You can get mower upgrades, that improve your stats.

You can offer upselling of fertilizer.

## Controller mechanics
- Press the move button (screen/mouse) and the mower will drive forward
- Move your cursor and the mower will swing left or right to steer. 
- Un-pressing the button stops
- Another button reverses
- Maybe: User can set mower speed

## Mow Performance
A few factors go into payment
1. Lawn coverage; missing spots is a penalty
2. Line cleanness; clean lines is a bonus

The player must also navigate other obstacles
- Weather
- Noise tolerance (HOA ordinances)
- Physical obstacles
- Lawn complexity (water features, etc)

## Other Costs
- Fuel; the longer you take to mow the long or the less efficient you are the more fuel you burn
- Maintenance; more expensive mowers have more maintenance costs. Push mower is cheap. Electric has little costs.

## Equipment Choices
Different equipment will impact the game in different ways.
- Speed
- Fuel type (gas vs electric vs none)
- Fuel efficiency
- Noise level

### Equipment examples
- Manual push mower (cheap, low coverage, low speed)
- Gas push mower
- Gas push with auto drive
- Gas seated mower (costly, more coverage, more speed)
- Electric push mower
- Solar panels for trailer


# Build an Empire 
Make more money by managing your business

## Gameplay
Start by selecting your business region, which have trade-offs of mechanics and aesthetics.

### Activity Selection
Each day you can decide to mow or promote the business.

#### Promotion
You canvas a neighborhood with fliers. This gives you more options for mowing.

(Have some kinda rock/paper-scissors mechanic here for neighborhood selection: Trading off equipment vs cost vs payout vs sentiment (rich people don't want noisy gas or slow push))


### Customer Selection
Each day, you are given a list of houses to mow.

#### Repeat Customers
The list includes houses in your existing rotation with how many days since you've mowed it. If you neglect a house you will lose the customer.

#### New Customers
You will get random customers who want your service. You can see their stats
Stat ideas: Lawn size, distance, complexity, fanciness, equipment preferences

### Crews
You can decide to hire more workers.

Workers cost a daily wage but increase daily lawn limit.

Hiring is a similar mechanic to customer selection. You will be offered a set of options to choose from based on stats and a brief bio.
You can buy more equipment and setup multiple crews.

Deciding how much to pay, balancing profit with loyalty. If you pay them too little they will quit and maybe create rival firms.


## Region options
These should each have their own aesthetic, and encourage slightly different game mechanics.

- PNW (Long work seasons, but no snow)
- Rockies (Long alternative snow season)
- New England (Potential old money)
- Sunbelt (Low wages, more competition)

## Other Game Modes [Ignore]
- Winter snow shoveling 
- Fertilizer spreading
- Influencer mode (Less time to mow, different equipment, the worse house you more the more followers you get)
- Pot selling :)



## Example Game Loop

1. You decide to start a lawn business.
2. You choose a used push mower. 
