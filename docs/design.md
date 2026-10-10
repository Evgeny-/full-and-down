# Full & Down — design

*"Load her to the marks. Not a tonne more."*

**Full and down** is the chartering phrase for a ship whose holds are full and which sits down to her
load-line marks. It is also this puzzle's perfect solution.

How we got here: four designers wrote proposals in parallel (`docs/design-process/10–13`), and three
critics reviewed them (`20–22`): a puzzle lead, a technical director, and a seafarer with a mobile UX
designer. This document records the decisions. Where the critics disagreed, the ruling and its
reason are given.

## The core puzzle: a passage plan

A level is a short liner voyage: **ports in rotation order**, with a **leg** between each pair.
Every box on the quays is visible from the start (perfect information). The player plans **one
port call per port** (all but the last):
- which offered boxes to load, and on which stack;
- how much fuel (bunkers) to buy, where there's a pump.

Then the ship sails the whole plan once, as the payoff.

**Port tabs (critics 20 and 22 against 21).** The route strip is a tab bar. Tapping a port shows the
ship *as she will be at that call*:
- after that port's discharge;
- with the quay holding that port's offers.

Every edit re-simulates the whole voyage. If an earlier change makes a later action illegal, that
action bounces back to its quay and the port's tab gets a red dot. The cause (one port) and the
effect (another) are on screen together, and there is no rewinding through animations.

### The physics (integers)

- **Deadweight `C`.** Cargo plus fuel aboard may not exceed it at departure: she would be over her
  marks. The hull sinks visibly as weight goes aboard, and the red antifouling showing above the
  water is the room left.
- **Burn bands.** 2–3 bands over 0..C, named LIGHT / LADEN / DEEP and burning ×1 / ×2 / ×3 per sea
  day. A leg lasts 1–3 days.
  - `burn = days × rate(band of the weight aboard at departure)`
  - The **departure band holds for the whole leg** (no mid-leg re-banding).
  - Fuel weighs too, so taking more fuel can tip her into the next band. This is the feedback loop
    at the heart of the game.
- **MIN ROB (critic 22).** Arrive at every port with at least the company reserve (usually 1 t).
  The grey line on every fuel gauge *is* empty. Arriving exactly on it is perfect. Dry tanks are
  never the goal: for a sailor, that's an incident report.
- **Freight** is paid when a box is discharged at its port. **Bunkers** cost $/t at each pump.
  - `Profit = freight − bunkers`
  - Fuel left over above the reserve is money wasted.
- **Stacks.** The hold is `bays × tiers` stacks (at most 5 × 3). You drop a box on a *stack*, never
  on a cell, and it lands on top.
- **Never bury (from tiers ≥ 2).** A box may not stand on a box that leaves earlier. An overstow is
  a **refused drop**, not a restow fee (critic 20): a forbidden state is a rule you can reason with.
- **Discharge** happens automatically on arrival: the boxes for this port come off, with +$ pops.

### What the player sees and does

- **Tap a box, then tap a stack** (drag also works). Every legal stack glows. While a box is held,
  the deadweight bar shows the cells it would take, and the legs pulse with the cells they would
  gain.
- **Tap a box aboard** that was loaded at this call to land it again.
- **Bunkers.**
  - In World 1, bunkering is **automatic**: the Chief orders the cheapest safe plan for your cargo.
    With one price and a pump everywhere, that is provably optimal.
  - From World 2 the **valve** unlocks: a `− n +` stepper per port, plus **NEED** (enough to
    reach the next port on the reserve). NEED is myopic, which is exactly the trap at dry ports.
- **SAIL** (the Blue Peter button) is enabled only when the whole plan is safe **and** earns at
  least ★. Otherwise the button names the reason in the voice of whoever would stop you:
  - `CHIEF: 2 t short for the Oslo leg.`
  - `MATE: over her marks by 1 t at Kiel.`
  - `PILOT: 1 t too deep for the Hamburg bar.`
  - `OFFICE: ★ needs $14.`

  You never sail into a failure the projection already showed (critic 20).

### Stars

- **★ (the contract)** beats every instinctive plan: greedy by freight, greedy by freight per
  tonne, and fill-the-tank.
- **★★** beats the best decoy, a plan where every single change makes things worse.
- **★★★ is par**, the solver's optimum, shown on the freight bar from the start.
- **Separation:** each threshold is at least 2 coins above the one below.
- **The arrival report** carries three remarks a sailor knows:
  - **ON THE MARK** (deadweight used to the tonne at a departure)
  - **CLEAN STOW** (every box comes off without moving another; always true under never-bury)
  - **ON THE RESERVE** (ROB exactly at the minimum at the last berth)

### Formats

- **Spot** (most levels): choose from the offers.
- **Contract**: some boxes carry a contract seal and must sail; the rest are top-offs.
- **Full & Down**: the exact-fit breather. One load fills the marks to the tonne and arrives on the
  reserve.

## Mechanics, in campaign order

Each one changes *how you think*. All of them pass the ablation test: switch the rule off and the
optimum changes.

| # | Rule | How it changes thinking |
|---|---|---|
| 1 | Fuel weighs (shared deadweight, priced fuel) | Fuel is a box you can't sell. |
| 2 | Burn bands (LIGHT/LADEN ×1/×2) | One tonne over the stripe doubles the burn, and that fuel weighs too. |
| 3 | Three bands | Pick the band first, then fill it; inside a band the next tonne is free. |
| 4 | Second port, discharge | Later legs are lighter; near-port cargo buys a cheaper band downstream. |
| 5 | Pickups | Free deadweight now is an investment in cargo you can't load yet. |
| 6 | Manual bunkers + dry port | How much to carry past a port with no pump; carried fuel is cargo lost on leg 1. |
| 7 | Stacks two high, never bury | Order in space: where a box goes decides whether a later pickup has a home. |
| 8 | Harbour bar | The check is on arrival: deliver first, burn down, bunker after the bar. |
| 9 | Price spreads | Cheap heavy fuel now vs dear light fuel later. |
| 10 | Barge lots | Bunkers come in lots of 3: "4 or 7?" |
| 11 | Heavy below light | Rotation order and weight order collide in one stack. |
| 12 | Reefers | Need a plugged stack, and burn +1 per leg each: where a box stands costs fuel. |
| 13 | Contract cargo | The sealed boxes must sail; everything else is a top-off. |
| 14 | Winter zone line | A bar at sea: load past it, because you'll burn down to it. |
| 15 | Low bridge (air draft) | An inverted limit: too *light* won't pass. |

**Rejected** (another number, or noise): restow fees, trim/list moments, tank discipline, weather,
tides, currents, laycan, ECA two-fuel tanks, FWA as a free tonne (physically wrong, per the
seafarer), sludge, lightering.

## Campaign

**8 sea areas × 9 levels = 72 levels**, in a double sawtooth inside each area:

| x.1 | x.2 | x.3 | x.4 | x.5 | x.6 | x.7 | x.8 | x.9 |
|---|---|---|---|---|---|---|---|---|
| B2 intro | B3 | B4 | **B5 spike** | B1 Full & Down | B2 twist | B3 | B4 | **B6 boss** |

- Every new rule arrives on a gentle level.
- Every peak is followed by a breather.
- Bands slide harder across areas.

Areas: North Sea, the Coast, Up the Rivers, Bunker Calls, Liner Loop, Reefer Run, Winter Passage,
Grand Voyage.

## Difficulty is measured, not guessed

The model is Mise en Place's approach, carried over to a planning puzzle (docs 13 and 21):
- **The exact solver** (`src/core/solver.ts`) decomposes a plan into a manifest (which boxes sail),
  the cheapest bunker plan for that manifest (a DP), and a feasible stowage (a search). Every level
  has a known optimum.
- **Simulated players:**
  - greedy loaders (by freight, by freight per tonne, fill the tank first, myopic port by port);
  - a *strong* editor that hill-climbs from those starts with add, drop and swap moves and
    sometimes slips;
  - a *careful* editor (3-exchange);
  - a **random tinkerer** (critic 20's gate): it may not reach ★★★ on B3+ levels in more than 10%
    of runs.
- **Metrics:**
  - greedy gap;
  - exchange depth (how many boxes must change at once to reach par from the instinctive load);
  - decoys (local optima ≥ 90% of par);
  - uniqueness of the optimum;
  - ablation of each mechanic.
- **The generator** hill-climbs random drafts toward each level's difficulty band. Tutorials and a
  few intro levels are authored by hand.

## Look and feel: "Signal Hoist"

Doc 12 is the reference.
- **The scene.** A bright working harbour on a clear morning. The ship lies broadside at the quay
  under an orthographic camera at about 28°, with chunky stylised proportions. The hull carries the
  emotion: the waterline, the red disappearing, the settle spring.
- **The deadweight bar (critics 20 and 22).** A horizontal bar under the ship, one cell per tonne:
  - cargo in port colours, fuel in amber, the reserve in grey;
  - the LIGHT / LADEN / DEEP zones beneath.

  It carries the precision the hull can't.
- **UI built from the International Code of Signals.**
  - Port identity: letter first, flag pattern second, colour third.
  - SAIL is Blue Peter.
  - Bunkering flies Bravo, and Q goes up on arrival.
  - A three-star arrival dresses the ship overall.
  - Enamel plates, Oswald numerals, Sofia Sans text.
- **The fuel train.** Each leg on the route strip shows its burn as amber cells, coloured by band,
  with ROB on arrival under each port. A shortfall is hazard tape.
- **The arrival report.** Its rubber stamps are the stars.
- **Voices instead of red toasts:** Chief Engineer (fuel), Mate (marks, stowage), Pilot (draft),
  Harbour Master (bridges), Office (money).
- **Words a sailor uses.** "box", not "crate"; "bunkers", "ROB", "draft", "discharge"; "t" for
  tonnes, never MT, which on a box ship means *empty*.
