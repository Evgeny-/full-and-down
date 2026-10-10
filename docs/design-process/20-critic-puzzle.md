# 20 — Critic review (lens: a fun, deep, readable puzzle on a phone)

*Reviewer: puzzle design lead. Inputs: 00, 10–13, and Mise en Place's `design.md`. Verdict tags:
**ACCEPT**, **MODIFY**, **REJECT**.*

## The short version

The four proposals are strong and mostly agree. They share one danger: each can slide into
**knapsack with a pretty gauge**, where you drag crates until a coin counter goes up. Doc 10 admits
this about Loop A. Doc 13's chapters 1–2 then spend twenty levels there: one pump, no stowage,
freight like $99 / $72 / $52, and a "perfect load" that beats the instinctive one by $3 out of
$144. That is the prototype I would kill.

What survives: **Loop B's content**, under **doc 13's information regime** (live projection, editor
bots), on **one screen organised by port call**, in **doc 12's Signal Hoist look** cut to 358 px.

One piece of analysis drives several verdicts:

> **On one leg with one pump, the minimum fuel f(c) only grows with cargo weight c, so
> "c + f(c) ≤ DWT" is simply a weight cap.** Without a fuel price, bands only move that cap and the
> level is a plain knapsack. With a price, every stripe is a cost cliff anywhere in the range, so
> the *free tonne* and the *cliff tonne* exist below the marks.

Hence: single-port levels are onboarding only (L1–L5). Fuel is priced from L1. The fuel *amount* is
automatic until there's more than one place to buy it.

## Decisions at a glance

| # | Decision | Verdict |
|---|---|---|
| 1 | Core loop | **Hybrid "Passage Plan."** Plan the whole voyage before sailing, editing one port call at a time (port tabs on the route strip). Live projection of physics only. Sail once, as the payoff. |
| 2 | Burn | Per leg, from the band at departure: days × rate(band of cargo + fuel). 2 bands, then 3, never 4. |
| 3 | Score | Freight − bunkers, in coins. A flat price from L1 with AUTO bunkering; per-port prices from World 4. ★ beats every natural start, ★★ beats the best decoy, ★★★ = par (shown). Structural separation between stars. |
| 4 | Stowage | Stacks from L1 (drop on a stack, never a cell). "Never bury" is load-bearing from L15. An overstow is a refused drop, not a fee. At most 5 × 3. |
| 5 | Mechanics | 17 rules over 72 levels. 15 rejected; 6 kept back for endless. |
| 6 | Formats | Tramp ≈ 55%, Charter with top-offs ≈ 33%, Full-and-Down exact fits ≈ 11%. |
| 7 | Failure | Cast-off blocked while anything is red. One scripted stranding in L1. |

---

## 1. Core loop — MODIFY: Loop B's content, doc 13's regime, port tabs

- **Loop A — ACCEPT, for L1–L5 only.** It's a knapsack.
- **Loop C — REJECT as the core.** Thumb path-drawing is fiddly, and its tuning collapsed into
  "carry nothing". Its draft idea returns as the bar and the zone line.
- **Loop B as written — MODIFY the rhythm.** A P0 mistake surfaces at P2 after two sailing
  animations, and then you rewind and replay. That makes trial-and-error slow, not hard.
- **Doc 13's one-screen configuration — MODIFY the layout.** One quay holding every port's cargo
  doesn't fit 358 px and hides *when* things happen.

**The hybrid, "Passage Plan"**, puts three layers on one screen:

1. **Route strip (top).** Ports are flag nodes showing the pump (its price, or crossed out), a bar
   sign (from World 3) and **ROB on arrival**. Legs are arrows **coloured by the band she'll sail
   them in**, with their **burn shown as amber cells** (doc 12's fuel train). A failing leg turns to
   hazard tape with "short 2". Tapping a node **selects that port call**.
2. **The ship at the selected call (middle).** Her state after that port's discharge: the stacks,
   the waterline, and a precise **draft board** for her departure weight (§10).
3. **The quay (bottom).** That port's offers only, plus the pump/valve.

You edit calls in any order, and every edit re-simulates the whole plan. A later action that no
longer fits (a full stack, a buried box) **bounces back to its quay**, and that port's flag gets a
red dot. **Let go** works only when the plan is safe and meets the contract. It then plays the
whole voyage once: at most 8 s, tap for 2×.

**Projected live: physics only, for the whole plan.** Band and burn per leg, ROB at every port,
draft against limits, and the legality of each placement. While you drag, a ghost waterline shows,
and the leg brackets pulse ±cells.

**Never projected: advice.** No "best fuel" button, and no hints about what to take. Unlike Mise's
shaded columns, crates that would overload are **not pre-greyed**, because the *attempt* is the
lesson (doc 13's σ = 1). You drop the tempting crate, the Chief pumps, she crosses the stripe, and
it swings back: "+2 fuel → 1 t over the marks".

**Does live projection kill the puzzle?** No. It kills *arithmetic*, which the brief bans anyway.
The difficulty has to live in the landscape: decoys where every single edit lowers the score, and a
par 2–3 exchanges from the instinctive load (doc 13's X and ρ). The projection says *that* you're
short, never which crate to leave ashore. Against "tap around and win", two guardrails are
non-negotiable:

- **A random-tinkerer gate** (new). A bot makes 40 random legal edits and keeps any edit that
  doesn't lower the score. On B3+ levels it may reach ★ in at most 50% of runs and ★★★ in at
  most 10%.
- **Few decisions.** At most 5 offers per port, 10 pieces per normal level and 12 per boss. Doc 13's
  14 is too many for a phone.

**Why the aha lands best here.** Doc 10's ahas are all *a cause at one port, an effect at another*:
"b keeps leg 2 out of the green", "buy leg 2's fuel at home", "P1's own cargo is a trap". The strip
shows both at once: add the P1 pickup, leg 2 goes red, and the cause sits visibly on leg 1. The
sequential loop shows the effect after you've left the cause behind. The flat screen loses the time
order entirely.

## 2. Burn model — ACCEPT doc 10 B's rule, simplified

- The ship has deadweight C and **2–3 bands** over 0..C, with rates **×1 / ×2 / ×3**, painted on the
  draft board and the hull. Never 4 bands: doc 13 allows them, but it's one number too many.
- Each leg lasts **1–3 sea days**.
- At departure, **W = cargo + fuel** (after discharge, loading and bunkering), and **burn = days ×
  rate(band of W)**. Casting off needs fuel ≥ burn and W ≤ C.
- On arrival, fuel and W both drop by the burn; arrival W only matters for arrival limits. Leftover
  fuel is worth nothing.
- **REJECT day-by-day re-banding** (doc 10 A). Mid-leg band changes are invisible to players; only
  the solver enjoys them.
- **REJECT the ROB reserve** (doc 11 #2).

**Days stay**, as leg length only: one ship-wide band table, legs that differ, and a hook for reefers.
The player never multiplies, since legs show cells and days are just tick marks. A per-leg step
function reads well; per-leg burn tables (doc 11 #3) don't.

**The feedback loop stays physical.** On AUTO, the Chief pumps cell by cell: she sinks, crosses a
stripe, the brackets grow, he pumps again, until she settles or the crate swings back. The fixpoint
*is* the animation.

## 3. Economy and stars

**ACCEPT coins: freight − bunkers.** **REJECT tonnes as the score** (doc 12's "goal 42 t"). Routes
must pay differently, and carry-vs-buy needs one currency for fuel and freight; tonnes still appear
on the results card. **REJECT port, restow and canal fees**: each is just another number.

**Fuel price from L1 — ACCEPT, with AUTO bunkering.** Doc 13's reason ("just enough is part of the
optimum") is a chore under live projection. The real reason is the analysis above: a price makes
stripes bite below the marks.

- **World 1:** 1 coin per cell, and from L2 the **valve is locked on AUTO** (the Chief visibly orders
  the minimum). With one price and a pump everywhere, AUTO is provably optimal.
- **World 2 (L10):** the valve unlocks. AUTO now means "top up to the next port": honest, myopic, and
  the natural trap at dry ports.
- **World 4:** per-port prices from {1, 2, 3}, as the carry-vs-buy mechanic.

**Number palette:** freight 1–9, weights 1–5, days 1–3, rates 1–3, C ≤ 30, tank ≤ 12. **REJECT doc
13 §3.3's numbers.** Its lesson is right, but $141 vs $144 is bookkeeping. Rebuild it so the trap
costs at least 2 coins *and* a whole crate.

**Stars — ACCEPT doc 13 §3.2, plus a separation rule.** Par sits on the freight bar from the start:
knowing that 23 is possible turns optimisation into a target puzzle.

| Star | Tramp condition |
|---|---|
| ★ (contract) | Beats every natural start: greedy by value, greedy by density, fill the tank, myopic. From L2 on, the instinctive load never passes. |
| ★★ | Beats the best decoy (a 1-exchange local optimum). |
| ★★★ | Par. |

**The separation rule** (it kills doc 10's "★★★ by one coin"):

- Each threshold is at least 2 coins above the one below.
- The best plan below a threshold must differ from every plan above it in **manifest, stowage or
  pump choice**, never by ±1 cell at the same pump.
- Doc 13's "legible gap" check stays.
- On B1/B2 lesson levels, all three stars may coincide.

**Charter stars are structural:** ★ delivers the charter, ★★ adds one top-off parcel, ★★★ adds
both. **"Full and down"** (W = C at departure, every slot full) is a cosmetic stamp and the hook for
the title.

## 4. Stowage

- **The hold is stacks from L1 — MODIFY doc 10 A's free grid.** You drop on a *stack* (one target at
  least 52 px wide), never a cell, and the box lands on top: Mise's pantry columns.
- **"Never bury" (LIFO): live from L6, load-bearing from L15**, not L31 as docs 11 and 13 propose.
  It's the most readable second axis and the strongest echo of Mise.
- **An overstow is a refused drop — REJECT doc 10's restow fee.** The rule: *nothing may sit on a box
  that leaves earlier.* A fee is a trade-off you compute; a forbidden state is a rule you reason
  with, and it keeps "you never lose to a misclick". It still produces doc 10 B3's best aha (leave a
  P3 box exposed for the P1 pickup).
- **Grid:** 2×2 → 3×2 → 3×3 → 4×3, **capped at 5 stacks × 3 tiers**. **REJECT doc 12's 9 bays at
  40 px**, too small for a destination, a weight and a freight tag.
- **Bulky crates** span two stacks of equal height. They arrive in World 1 as the "cubed out" piece
  and gain stowage meaning once LIFO is live, so there's no separate 40-ft mechanic.
- **Hub restows go in the drawer.** They turn a placement rule into a voyage-time check.

## 5. Mechanics: what makes the cut

**72 levels: 8 worlds × 9** (MODIFY doc 13's 100), plus generated endless levels. Each world has a
major rule at x.1 and a twist at x.6; World 1 is denser because its rules are the core concepts.
ACCEPT doc 13's ablation test: every rule must change the optimum in every level that uses it.

| W | Lvl | Rule | How it changes thinking |
|---|---|---|---|
| 1 | 1 | Shared deadweight, priced fuel | Fuel is a crate you can't sell. |
| 1 | 2 | Burn bands (3 from L4) | Thresholds: stay under the stripe, or fill the band to its top. |
| 1 | 5 | Bulky crates | Two limits (slots and marks); the worthless light crate is the filler. |
| 1 | 6 | Second port, discharge | Later legs are lighter; near-port cargo buys a cheaper band downstream. |
| 1 | 7 | Pickups | Free deadweight now is an investment in cargo you can't load yet. |
| 2 | 10 | The valve + dry ports | How much to carry past a port with no pump; carried fuel is cargo lost on leg 1. |
| 2 | 15 | Never bury (LIFO) | Order in space: where a box goes decides if a later pickup has a home. |
| 3 | 19 | Harbour bar (max W on arrival) | The check is on arrival: deliver first, burn down, bunker after the bar. |
| 3 | 24 | Zone line (a bar at sea) | The binding moment is mid-voyage; load past it, because you'll burn down to it. |
| 4 | 28 | Price spreads | Cheap heavy fuel now vs dear light fuel later. |
| 4 | 33 | Barge limit (k cells) | You can't buy it all here, so you split the bunkering. |
| 5 | 37 | Heavy below light | Rotation order and weight order collide in one stack. |
| 5 | 42 | Reefers (plug slots, +1 rate) | Where a box stands now costs fuel. |
| 6 | 46 | Ballast + minimum draft | *Too light* is a problem; a cheap crate beats seawater because it earns. |
| 6 | 51 | Bridge (air draft) | An inverted limit: sink to pass under, rise for the bar. |
| 7 | 55 | Choose the port order | You decide who lightens whom. |
| 7 | 60 | Canal vs Cape | The route depends on the load, and the long way's fuel weighs too. |
| 8 | 64–72 | Remixes, then a Grand Voyage boss | — |

**REJECT** (another number, or noise): ROB reserve, redelivery window as a rule, tank capacity as a
headline, fresh-water allowance, currents, weather multipliers, sealed bunkers, lightering, MOLOO
(it dissolves the integer fit), sludge, tidal windows, all fees, list (invisible in broadside),
hatch covers (LIFO with a lid), hog/sag.

**Drawer (endless only):** trim (two sums per leg), two fuels/ECA (a second gauge), eco speed +
laycan (a third resource), DG segregation (adjacency sudoku that never touches fuel), optional
calls, hub restows. Doc 11's world tour survives, re-ordered so each region follows its mechanic.

## 6. Formats

ACCEPT doc 13's double-tooth sawtooth, remapped to 9 levels per world:

| x.1 | x.2 | x.3 | x.4 | x.5 | x.6 | x.7 | x.8 | x.9 |
|---|---|---|---|---|---|---|---|---|
| B2 · Charter | B3 · Tramp | B4 · Tramp | **B5** · Tramp | B1 · Full&Down | B2 · Charter | B3 · Tramp | B4/5 · Tramp | **B6** · Charter |

- **Tramp** (choose from the offers, par shown): about 55%, where the optimisation lives.
- **Charter** (sealed boxes must all be delivered; top-offs earn ★★/★★★): about 33%. Use it for
  **every rule intro from L6 on** and every boss: it's binary, so the new rule *is* the puzzle.
  (Single-port charters are degenerate under AUTO.) The ★★★ manifest must be unique.
- **Full and Down** (exact fit: the marks to the tonne, every slot full, tanks dry on arrival): one
  per world, at x.5. **Yes, some levels should be pure logic:** kakuro with a ship, where exactly
  one load of at most 6 pieces meets two or three constraints. They're the fast breathers the
  sawtooth needs, and they keep the name's promise.

## 7. Failure and feedback — block cast-off (ACCEPT doc 13)

Let go stays disabled while any leg is red or the contract is unmet, and the button names the
reason ("Leg 2 short 2 — no pump at Kiel"). Sailing into a stranding the projection already showed
teaches nothing and costs ten seconds. The failure that matters, "I can't find a plan above the
contract", is a planning failure: Mise's rule exactly.

**One exception: L1 lets you cast off dry, once.** She coughs, drifts, hoists V, and a tug tows her
home ("TOWAGE INVOICE"). Then: "From now on the Chief won't sign off a short plan." That one scene
teaches what red means. The gag returns in **Captain's Licence** mode (doc 13: projection off,
post-game — ACCEPT, low priority).

## 8. Levels 1–10

*Each line gives band · format · rule, then the lesson and the trap.*

1. **Fuel Weighs** — T0 · Tramp · one burn rate, *manual* pump (World 1's only one). Fuel cells eat
   ticks on the marks; includes the scripted dry cast-off. Trap: none; "fill the tank" visibly
   leaves room for one crate.
2. **The Stripe** — B2 · Tramp · 2 bands, AUTO from here. One tonne over the stripe doubles the burn,
   and that fuel weighs and costs. Trap: the best-paying crate tips her over; par leaves it ashore
   and stays green (σ = 1).
3. **The Free Tonne** — B3 · Tramp. Once over the stripe, the band is free to its top. Trap: the
   efficient little crate that stops just past the stripe; par takes the heavy, dull one.
4. **Overload** — **B5 spike** · Tramp · 3 bands, 8 crates. Pick the band first, then fill it. Trap:
   three decoys at ≥ 95%; the instinctive near-full load sits in the dearest band, and par is 3
   exchanges away.
5. **Full and Down** — B1 delight · exact fit · bulky crates. Two limits; the light bulky crate is the
   filler. Trap: dense crates hit the marks with slots empty; exactly one load fills both.
6. **Sail Light** — B2 · Charter + 1 top-off · second port. Near-port cargo drops leg 2 a band. Trap:
   the richer through-crate rides both legs in the red; the top-off fits only alongside the
   near-port crate.
7. **Leave Room** — B2/B3 · Tramp · pickups. Sail from P0 light to make room for P1's rich pickup.
   Trap: L5's instinct, since full and down at P0 leaves no room.
8. **Coastwise** — B4 · Tramp · 3 ports, 9 offers. A box costs fuel on every leg it rides. Trap: the
   top freight is the longest haul; s = 2 (both best-looking crates stay ashore).
9. **The Feeder Charter** — **B6 boss** · Charter + 2 top-offs · all of World 1. Both limits bind on
   leg 1, and leg 3 must stay green. Trap: the richest top-off blocks P2's pickup.
10. **Dry Port** — B2 · Charter · the valve unlocks; P1 has no pump. AUTO fills only to the next
    port, so leg 2 goes red; leg 2's fuel must come from home and weighs on leg 1. Trap: topping up
    at P0 tips leg 1 over a stripe and costs the P0 top-off; ★★★ takes the P1 top-off, which rides
    only the lighter leg.

Neighbouring levels never share a lesson template (doc 13's audit — ACCEPT).

## 9. Top 5 risks to fun, and how to kill each

1. **Spreadsheet feel.** Kill it with the random-tinkerer gate, exchange depth ≥ 2 from B3 (3 on
   spikes), charters and exact fits for about 45% of levels, and the small number palette. After
   ★★★, show doc 13's logbook line naming the trap (ACCEPT): it closes the lesson.
2. **Too much information for 358 px.** Use one channel per element: destination = colour + flag
   pattern; weight = a stencil numeral on the side face; freight = a brass tag (on the quay and the
   top box only). Per leg, show only cells, colour and ROB. Allow at most 4 ports (5 in bosses).
   Run a 3-second glance test in every playtest: "Which leg is red? Which box leaves first?"
3. **Port tabs make time confusing.** Switching tabs plays a 0.4 s re-dress: that port's boxes fly to
   the quay as "delivered +7", and the sign and lane colours swap. The selected node pulses. L6
   walks the player through it.
4. **Fuel bookkeeping.** Keep the AUTO valve and one flat price until World 4, and apply the
   separation rule. ±1 cell never splits two stars.
5. **Scope eats the puzzle.** Doc 12 lists 32 juice items, a chart-mode voyage and a loupe render
   target. Build the planner flat and ugly first, together with the generator and bots, and
   playtest L1–L10 before dressing it. The juice MVP is 8 items: settle spring, ghost waterline,
   AUTO pump cascade (one glug per cell), band-change pop, crane lift and clunk, no-go wiggle,
   fuel train draining, and dressing overall with stamps. Everything else is v2.

## 10. Art direction — readability at 390×844

**ACCEPT Signal Hoist and the broadside camera.** It's unlike every sibling, diegetic, and
colour-blind-safe through flag patterns. **But the hull can't be the precise gauge.** A 55-px hull
side at ×0.79 gives 1–2 px per tonne at C = 24, which nobody can read.

Vertical budget, about 760 px usable after safe areas:

| Band | px | Content |
|---|---|---|
| HUD | 44 | Level, freight bar with ★ marks and par |
| Route strip + fuel train | 92 | Flags, pumps, band-coloured legs, burn cells, ROB |
| Backdrop | ≤ 40 | Skyline silhouette only |
| Ship + draft board | 240 | ≤ 5 × 3 stacks, hull, waterline, board at the bow |
| Quay | 140 | ≤ 5 offers, pump/valve |
| Buttons | 64 | Undo · Hint · Let go |
| Slack | ~140 | Breathing room, the drag ghost |

- **MODIFY: add a draft board.** An enamel ruler at the bow, at least 8 px per tonne, with band zones,
  ×1/×2/×3 badges and the Plimsoll mark on top. It fills in cargo colours and fuel amber: doc 12's
  "stacked bar disguised as draft marks", moved off the hull. The hull keeps the emotion (waterline,
  the red antifouling disappearing, the settle spring).
- **REJECT the loupe and the X-ray button.** The board and the train already show it, always.
- **MODIFY the barge.** Never above the deck stacks, where the drag ghost lives. Dock it at the stern
  manifold, and show it only while pumping.
- **ACCEPT the fuel train, the hazard-tape shortfall and the ghost waterline**, doc 12's best
  readability ideas.
- **MODIFY the box grammar:** colour = destination port (not a line livery), an Oswald numeral =
  weight, a brass tag = freight. **MODIFY the pitch** to 25–30°, so the side faces that carry the
  information get the pixels. **MODIFY the flag buttons** to print "LET GO" and "BUNKER".
- **Defer** the chart-mode voyage, gulls, cloud shadows and the fireboat. MVP voyage: broadside,
  parallax sea, the train draining, 2-second arrivals.
- **ACCEPT the clearance form and stamps**, with coins against par.

## 11. Name — ACCEPT *Full and Down*

It's a real chartering phrase that names the perfect solution, and it follows the owner's pattern:
a trade phrase that is also the puzzle, like Mise en Place. Use `/games/full-and-down/`; "Full &
Down" can be painted on the bow. Tagline: *"Load her to the marks. Not a tonne more."*

The alternatives fall short: *Down to the Marks* is long and glum, *Plimsoll* is a British gym
shoe, *Laden* and *Load Line* are dry, and *Bunker Down* undersells the cargo. **REJECT *Blue
Peter*:** it's a famous BBC children's programme.
