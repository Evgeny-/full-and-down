# 10 — Core loops (lens: the core puzzle loop)

Three different core loops built on the seafarer's idea, each with exact integer rules, three
worked levels and a solver plan, followed by a recommendation. **Every number in the example levels
was checked by exhaustive search** with throwaway brute-force solvers (all loads, all stowages, all
bunker amounts, all routes). The "greedy" lines are real policies run on the same rules, not guesses.

## 0. The shared physics (all three loops)

- **Deadweight `C`** (tonnes, integer). On board = cargo + fuel = `W`. Casting off needs `W ≤ C`.
  The hull *is* the gauge: the waterline climbs the side toward the **Plimsoll mark** as you load.
- **Burn bands.** Painted stripes on the hull split `0..C` into 2–3 bands (green / yellow / red).
  Burn per sea-day (or per tile) is the band's rate: 1 / 2 / 3. **Steps, not a formula**: a step is
  readable at a glance, and it creates the two feelings the whole game runs on: the **free tonne**
  (inside a band, one more tonne costs nothing extra) and the **cliff tonne** (one tonne over a stripe
  doubles the burn, and the extra fuel weighs too, so the feedback can cost two or three tonnes).
- **Fuel cells.** One cell = one tonne, drawn as glowing cells in the double-bottom tanks under the
  hold. They drain one by one on the voyage and the ship visibly rises.
- **Freight** is a coin tag on each box; fuel costs coins per cell. Profit = freight − fuel − fees.
  Fuel left at the end is worth nothing: over-bunkering costs money *and* deadweight; under-bunkering
  is a fail (the ship can't cast off, or is shown drifting to a stop on the preview).

**A key finding from working the numbers:** on a single passage the fuel decision **collapses into a
lookup**: for a given cargo weight there is one minimum fuel, and the game must show it (asking the
player to compute it is homework). The fuel-vs-cargo tradeoff only becomes a *real decision* when
there is **time**, meaning several legs, several places to bunker, or a constraint you can burn down to (a
shallow bar, a load-line zone). That finding drives the recommendation.

---

## Loop A — "Down to Her Marks" (verb: *pack*)

*One berth, one passage. Fill the hold, take just enough fuel, and cast off with the waterline on the
mark and an empty tank at the far quay.*

### Rules

- Ship: deadweight `C`, tank capacity `T`, a **hold grid** in side view (bays × tiers; some cells
  blocked by the deckhouse). Boxes: **TEU** (1 cell) or **FEU** (2 adjacent cells in one tier).
  Optional gravity (every cell rests on the floor or a box).
- Box = `(weight 1–5 t, freight, size)`. The passage is `L` days. Fuel price `p` per cell.
- The player places any subset of boxes and sets fuel `F ≤ T`. Cast off if `cargo + F ≤ C`.
- Voyage, day by day: `r = rate(W)` from the band `W` is in *this morning*; if `fuel < r` → adrift
  (fail, shown on the chart); else `fuel −= r`, `W −= r`. The ship can climb out of a band mid-passage.
- Score = freight − `p·F`.

### On the phone

Top: a voyage strip with `L` day-ticks and a **range arrow** that moves live. Middle: the ship in
side view, cut away to show the hold grid; the waterline slides against the painted bands; the tank
cells sit under the hold. Bottom: the quay with boxes. Drag a box into a cell (snap; drag out to
remove); drag the fuel level up/down (or tap +/−). The arrow tells you where you'd run dry. "Cast
off" plays the passage: cells drain, the hull rises, a band change flashes and chimes.

### Win and stars

★ arrive with profit ≥ a pass bar that the obvious loads miss (from L2 on); ★★ near-optimal;
★★★ the unique optimum, stamped "Down to her marks" when the hold is full, `W = C` and the tank is
dry on arrival: the **triple click**. The generator keeps only levels whose optimum is unique.

### Why it makes you think

Traps: **fill the tank** (no room for cargo); **most valuable box first** (one heavy box puts you over
a stripe); **best freight per tonne** (light boxes leave the hold half-empty under the marks);
**cubed out vs weighed out** (light bulky FEUs fill the hold before the marks, dense TEUs reach the
marks with empty cells). Ahas: *the top of a band is free* and *the worthless-looking light box is the
filler that completes the load*.

### Example levels

**A1 — tutorial "Fuel weighs too".** `C=10`, 3 cells, 3 days, bands `≤5: 1/day`, `6–10: 2/day`,
price 0, boxes 3 t, 2 t, 2 t, 1 t (freight = tonnes). Minimum fuel by cargo: 0–2 t → 3; 3 t → 4;
4 t → 5; 5 t → impossible (needs 6 fuel, 11 > 10). Full tank (10) = no cargo. Optimum: 4 t + 5 fuel
(`W` 9 → 7 → 5 → dry). Lesson: the tank holds 10, you need 5, and the 5th tonne of cargo won't fit.

**A2 — "The free tonne".** `C=20`, 6 cells, 4 days, bands `≤8: 1`, `9–14: 2`, `15–20: 3`, price 1.

| Box | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| weight / freight | 5 t / 7 | 4 t / 7 | 3 t / 6 | 3 t / 6 | 3 t / 3 | 2 t / 5 |

Fuel curve: cargo 7 t → 7, **8 t → 9 (cliff), 9 t → 10, 10 t → 10 (free)**, 11 t → impossible.

| Player | Load | Fuel | Profit |
|---|---|---|---|
| Full tank (12) | B + C | 12 | 1 |
| Most freight first | A + B (9 t, then nothing fits) | 10 | 4 |
| Best freight per tonne | F + C + D (8 t) | 9 | 8 |
| **Optimum (unique)** | **B + C + D = 10 t, `W = 20`, dry on arrival** | 10 | **9** |

The aha: at 8 t you already pay 9 fuel; the 9th and 10th tonnes together cost one more. Drop the
efficient little F, take the 4-tonner.

**A3 — "Cubed out, weighed out".** `C=24`, hold 4 bays × 2 tiers minus one cell (7 cells), 5 days,
bands `≤8: 1`, `9–16: 2`, `17–24: 3`, tank 14, price 1. Fuel curve: … 7 t → 9, 8 t → 11, 9 t → 12,
10 t → 12, 11 t → 13, 12 t → impossible.

| Box | FEU 1 | FEU 2 | FEU 3 | TEU 1 | TEU 2 | TEU 3 | TEU 4 | TEU 5 |
|---|---|---|---|---|---|---|---|---|
| weight / freight | 4 / 10 | 2 / 8 | 1 / 4 | 5 / 10 | 4 / 9 | 4 / 7 | 3 / 5 | 2 / 5 |

| Player | Load | Cells | Profit |
|---|---|---|---|
| Full tank | FEU 1 + FEU 3 + TEU 1 | 5 | 10 |
| Best freight per cell | TEU 1, 2, 5 | 3 | 11 |
| Most freight first | FEU 1, TEU 1, FEU 2 (11 t) | 5 of 7 | 15 |
| Best freight per tonne | FEU 2, 3, 1, TEU 5 (9 t) | 7 | 15 |
| **Optimum (unique, next 16)** | **FEU 1 + 2 + 3 + TEU 2: 11 t, 7 cells, `W = 24`, dry** | 7 | **18** |

The 10-coin steel TEU 1 is the trap; the 1-tonne FEU worth 4 (the "worst" box) is the key: two cells
for almost no weight. Both the hold and the marks bind at the optimum.

### Solver and difficulty

Exhaustive: `2^n` subsets × fuel (A3: 256 subsets, 108 feasible loads), then a packing check for the
grid (tiny backtracking). Difficulty = greedy gaps (value / ratio / per-cell / full-tank), the margin to
the runner-up, the count of near-misses, and a **hill-climber player** (add / remove / swap one box,
watching the live preview) whose success rate within N edits measures how deep the local optima are.

### Risks

This is **knapsack with a pretty gauge**. The live preview turns fuel into a lookup, so all the
thinking sits in the subset choice, and the optimum often wins by one coin over a crowd of runners-up
(A3 has one 16 and eight 15s): that is accounting, not insight. There is no "think ahead", so Mise's planner-depth
measurement doesn't apply. Mitigations: binary "charter" goals (everything listed must fit), spatial
rules that make uniqueness geometric, few boxes. **Best use: the onboarding levels and the loading
screen of a bigger loop.**

---

## Loop B — "Port Rotation" (verb: *sequence*)

*A short liner voyage, P0 → P1 → P2 → P3. At every call you discharge, load, restow and bunker. Cheap
fuel at home is heavy on every leg; fuel bought later is light but dear; cargo stacked in the wrong
order is buried two ports later.*

### Rules (engine spec)

- Ship: deadweight `C`, tank `T`, hold = `k` stacks × `h` tiers (all boxes one cell; LIFO per stack).
- Rotation: ports `0..n`; leg `i` (port `i` → `i+1`) lasts `dᵢ` days. Port `i` sells fuel at `pᵢ`
  per cell or not at all. Restow fee `R` per box.
- Box = `(origin, destination, weight 1–5, freight)`. **All offers at all ports are visible from the
  start** on the voyage sheet (perfect information; the puzzle is planning, not luck).
- **Port call at `i`:**
  1. *Discharge (automatic):* in each stack find the lowest box bound for `i`; every box from there up
     is lifted. Boxes for `i` pay their freight; the others are **restows**: `−R` each, put on the quay
     and must be reloaded before departure.
  2. *Load (player):* put any quay box (port `i` offers + restows) on top of a stack with room; a box
     loaded this call can be taken back. Boxes already aboard cannot be landed early.
  3. *Bunker (player):* buy cells at `pᵢ` (refundable within the call), `fuel ≤ T`.
  4. *Cast off* when restows are aboard, `W ≤ C`, and `fuel ≥ dᵢ · rate(W)`. Burn
     `dᵢ · rate(W)`, **using the band you leave port in** (simple to read: the leg arrow shows
     "2 days × 2 = 4" as drops).
- At the last port: discharge, done. Profit = freight − fuel − restows.
- Formats: **Tramp** (choose cargo; stars on profit) and **Charter** (sealed boxes must all be
  delivered; usually exactly one stowage + bunker plan works: a binary puzzle).

### On the phone

Top strip: the rotation as islands with port colours, leg arrows with day counts, pump icons with
prices (crossed-out pump = no bunkers). Middle: the ship side-on, Plimsoll bands on the hull, `k`
stacks visible in the cutaway, tank cells under them. Bottom: the quay. **Drag** a box onto a stack
(boxes wear their port's colour and flag, a weight numeral and a freight tag). **Tap** the pump for
+1 (long-press for "enough to reach the next port", a helper that only looks one leg ahead). The leg
arrow shows the burn for the current weight; a forecast line shows "arrives with N" for every leg
if nothing else changes. Swipe up for the voyage sheet. Undo per action, and "back to previous port".

### Win and stars

★ = profit above a pass bar that the greedy players miss (from L2 on); ★★ = near-optimal;
★★★ = the solver's unique optimum, often with the click: *down to her marks at P0, a leg sitting
exactly on a stripe, tanks dry at the last berth*.

### Why it makes you think

- **Carry vs buy:** fuel bought at home is cheap but rides (as weight) through every leg before it is
  burned; fuel bought later is dear but light. The answer changes with every price spread.
- **No-bunker ports:** a mistake at P0 shows at P1, where you can't cast off (a *deep* error).
- **Bands across legs:** a box for P2 is weight on legs 1 *and* 2; if it keeps leg 2 out of the green
  band it costs you twice.
- **Stowage:** the order you stack at P0 decides whether the pickup at P1 has a legal place to go.
- **Discharge lightens:** delivering at P1 is what lets you take the heavy pickup there.
- Greedy fails in distinct ways: "most freight now" strands you; "fill up where it's cheap" leaves no
  room; "load what's for the next port" wastes deadweight that cheap fuel should use.

### Example levels

**B1 — tutorial "The green band".** P0 → P1, 3 days. `C=12`, bands `≤6: 1/day`, `7–12: 2/day`, tank 8,
fuel 1, hold 2×2. Offers (all for P1): a 3 t/6, b 2 t/2, c 2 t/2, d 4 t/5.
Optimum (unique, profit 3): **a + 3 fuel**, `W = 6`, green band, 3 burned. Most freight (a + b, 6 fuel) → 2.
Fill the tank → −2. a + d never fits (7 t + 6 fuel = 13). One picture: *stay in the green and burn half.*

**B2 — "Bunker where it's cheap, but not too much".** P0 → P1 → P2, 2 + 2 days. `C=14`, bands
`≤7: 1/day`, `8–14: 2/day`, tank 10, hold 2×2, restow 2. Fuel: P0 1, P1 2.

| Offer | a | d | b | c | e |
|---|---|---|---|---|---|
| route | P0→P1 | P0→P1 | P0→P2 | P0→P2 | P1→P2 |
| weight / freight | 4 / 9 | 2 / 3 | 3 / 5 | 2 / 3 | 3 / 6 |

| Player | Plan | Profit |
|---|---|---|
| Fill the tank at P0 | only a fits (4 + 10 = 14); P1: e, buy 4 | −3 |
| Most freight now | a, b, c + 4 fuel (`W` 13); P1: e, buy 4 at 2 (`W` 12, burn 4) | 11 |
| Sensible human | a, b, d + 5 fuel; P1: e, buy 3 at 2 | 12 |
| **Optimum (unique)** | **a, d, c + 6 fuel → `W = 14` (marks), burn 4, 2 left. P1: e, no fuel → `W = 7` exactly, green: burn 2, dry at P2** | **15** |

Runners-up: 14 and 13 (same cargo, 1 or 2 cells bought at P1). The aha is double: *b pays more than c
but keeps leg 2 out of the green band*, and *the 2 cells for leg 2 are bought at home at half price*.
Ladder: 1 plan scores 15, 1 scores 14, 1 scores 13, 4 score 12 (of 1,284 distinct manifests).

**B3 — "No bunkers at Port 1".** P0 → P1 → P2 → P3, legs 2, 1, 2 days. `C=16`, bands `≤8: 1/day`,
`9–16: 2/day`, tank 10, **hold 2 stacks × 2 tiers**, restow 3. Fuel: P0 1, P1 none, P2 3.

| Offer | a | e | c | b | d | f | g | h |
|---|---|---|---|---|---|---|---|---|
| route | P0→P1 | P0→P1 | P0→P2 | P0→P3 | P0→P3 | P1→P3 | P1→P2 | P2→P3 |
| weight / freight | 2 / 3 | 4 / 7 | 2 / 5 | 4 / 11 | 1 / 5 | 3 / 7 | 1 / 1 | 3 / 7 |

Optimum (unique, 23; next five plans at 22):

| Call | Do | `W` / burn | Fuel |
|---|---|---|---|
| P0 | load b, c, d; stow **[b, c] and [d]**; buy 9 | 16 (marks) / 4 | 5 |
| P1 | deliver nothing; load f **on d** | 15 / 2 | 3 |
| P2 | deliver c (+5); load h on b; buy 1 at 3 | 15 / 4 | 0 |
| P3 | deliver b, d, f, h (+30) | | dry |

| Player | What happens | Profit |
|---|---|---|
| Most freight now | e, b, c, d, fuel for leg 1 only → **stranded at P1** (no pump) | fail |
| Fill the tank at P0 | 10 fuel leaves room for b + c only | −1 |
| Fuel-aware greedy (buys to reach the next pump) | a, b, c, d + 6; P1: f; P2: h + 4 cells at 3 | 20 |
| Wrong stowage of the optimal load | c alone in a stack → f must go on c → restow at P2 | 20 |

Four ideas stack up: P1's own cargo is a **trap** (a's 3 coins of freight use deadweight that 3 cheap
home cells should fill, saving 6 at P2's pump); **no pump at P1** means legs 1–2 come from home;
**stow c on a P3 box and leave a P3 box exposed** for f (2 of the 6 stowings lose 3); g is a decoy.
State space: 91,597 complete plans, 9,064 distinct manifests; exhaustive search < 1 s in Python.

### Solver and difficulty

Memoized DFS over `(port, stacks as destination sequences + box ids, fuel)`, branching on offer
subsets × stack assignments (within one call, later destinations go lower: that dominates) × fuel.
Typical levels (4–5 ports, ≤ 5 offers per port, 2–3 stacks × 2–3 tiers) are 10⁵–10⁶ plans: an
offline generator in TS handles them easily. **Mise's measurement carries over directly, with the
port call as the move:** greedy players (most freight now; fill up where cheap; fuel-aware), planners
looking `d` calls ahead with a position value (money + freight aboard − fuel to deliver it), a strong
player (1 call ahead, slips) and a careful one (2 ahead); **forced** calls (the greedy call loses),
**deep** calls (the error shows two calls later: stranded, buried, no room for the pickup),
**tight** (one tonne or one slot less changes the optimum), random pass rate. Generation: start from a
golden voyage, add decoys that tempt each greedy, hill-climb weights / freight / prices toward the
targets, reject ties at ★★★.

### Risks

Information density (destination, weight and freight on each box; prices, days, bands on the strip)
and per-leg arithmetic. Mitigations: small integers (weights 1–5, days 1–3, rates 1–3, prices 1–3);
port colours as the main signal; the game *always* shows burn, forecast and band (never ask the
player to multiply); 3–5 ports per level; one new idea per level. Second risk: ★★★ winning by one coin
on bookkeeping. The generator should demand a structural difference between ★★★ and ★★ plans (other
cargo, other pump, other stowage), not ±1 cell.

---

## Loop C — "Crossing the Bar" (verb: *route*)

*A small sea chart. Shoals and harbour bars admit only a light ship. You leave port deep and burn down to
the bar; you deliver the heavy box first so you float over the next one.*

### Rules

- Grid (≤ 5×7 in portrait): water, **shoal `2`** (no deep ships), **bar `1`** (light only), land, ports.
- Bands give both a burn per tile and a **draft**: light (burn 1, draft 1), laden (burn 1–2, draft 2),
  deep (burn 2, draft 3).
- Move to a neighbouring tile: draft and burn come from `W` *before* the move; entering a shoal needs
  `draft ≤ depth`; `fuel ≥ burn`; then `fuel −= burn`, `W −= burn`.
- Entering a port: auto-discharge boxes bound for it; load offers; bunker if there is a pump.
- The voyage ends at the final port. Profit = freight − fuel.

### On the phone

The chart fills the screen; drag a path from the ship tile by tile. The path draws itself in band
colours and counts fuel down; a tile you can't enter (too deep, too far) turns red under your finger.
At a port a bottom sheet opens with the quay and the pump. The hull gauge sits in a corner.

### Why it makes you think

Draft turns weight into **access**, and burning fuel *changes access over time*. Ahas: *leave heavy and
burn down to the bar*; *deliver first to rise*; *buy the next leg's fuel after the bar*; *cargo for
the last port is better picked up halfway than loaded at home*.

### Example levels

**C1 — tutorial "Crossing the bar".** `H · · · ≈ D` (≈ = bar). `C=12`, light `≤6` (1/tile), laden
`7–12` (2/tile), fuel 1. Cargo H→D: a 3 t/9, b 2 t/5, c 2 t/5, d 1 t/3.
Optimum (4): **a + d + 8 fuel** → `W = 12` (marks), burns 2, 2, 2 → `W = 6` exactly at the bar →
1, 1 → dry. Staying light all the way (d + 5 fuel) → −2; b + c → 2; all 8 t → can never cross.

**C2 — "Lighten up".**

```
H · · A
· ▓ ▓ ·
· ▓ ▓ ≈
· · ≈ B
```

`C=14`, light `≤7` (1/tile, draft 1), laden `8–14` (2/tile, draft 2). Fuel: H 1, A 2, B none.
Cargo at H: a→A 4/8, d→A 2/2, b→B 3/9, c→B 2/5. At A: e→B 2/6.
Optimum (unique, 10): **a + b + 7 fuel** (marks) → 3 tiles laden → A with 1 cell; deliver a; load e;
**buy 3 at A's double price** → `W = 9` → one tile → `W = 7`, light → over the bar → dry at B.
The B cargo first (b + c, the best freight) → 3; fill the tank → 5; a + b + c → impossible.

**C3 — "Two shoals".**

```
▓  ▓  H  ▓  ▓
▓  ▓  ·  ▓  ▓
A  ≈2 ·  ≈1 B
·  ▓  ·  ▓  ·
·  ·  ·  ·  ·
```

`C=18`, light `≤6` (1/tile, d1), laden `7–12` (1/tile, d2), deep `13–18` (2/tile, d3). Pump only at H
(1). Cargo at H: a→A 5/12, b→B 3/8, c→B 2/6. At A: d→B 4/11.
Optimum (unique, 14): **a + 9 fuel** (`W = 14`, deep: the first tile burns 2) → laden over shoal 2 →
A; deliver a; load d → `W = 8` → back over the shoal → `W = 6` at the junction → over the bar → dry at
B. B's own cargo b + c (14 freight) is the trap: it forces the 8-tile deep-water detour → 5. Full tank
→ 2. One extra cell → 13 (it burns itself off by keeping her deep one tile longer).

### Solver and difficulty

DP over `(tile, fuel, cargo aboard, offers left, moves left)`; these levels are 10³–10⁵ states.
Measured like B with port calls as decisions plus route planners with tile lookahead.

### Risks

**Two puzzles in one** (a path and a manifest), the economics are **touchy** (tuning these, most random
cargo sets collapsed into "carry nothing, go straight"), per-tile fuel adds up to long sums, and path
drawing on a small grid is fiddly with thumbs. Draft is its gift, and it transplants cleanly into B.

---

## Comparison

| | A Down to Her Marks | B Port Rotation | C Crossing the Bar |
|---|---|---|---|
| Verb | pack | sequence | route |
| Real fuel decision? | no (lookup) | **yes**: where, how much, carry vs buy | yes: burn down to a bar |
| Spatial element | hold grid | **LIFO stacks** | chart |
| Thinks ahead | no | **2–4 port calls** | path + calls |
| Mise-style measurement | weak (static) | **direct** (call = move) | medium |
| Phone fit | excellent | good (needs a clean HUD) | fair (path drawing) |
| Main risk | knapsack homework | information density | fiddly tuning |
| Authentic touches | marks, FEU/TEU | rotation, restows, bunker ports | bars, draft |

## Recommendation: Loop B, "Port Rotation", absorbing A and C

B is the only loop where **every element of the seafarer's sentence is a decision**: how much fuel,
*where* to bunker, which cargo, in what order, to one or more ports. Its errors show late (stranded at
a no-pump port, a box buried two calls down), which is what made Mise's hard levels hard, and the port
call is a natural "move" for the solver, the simulated players and the guided generator. It also
contains the other two:

- **A is B with one port.** Use A's loading screen as the look of every port call (cutaway hold, bands,
  fuel cells, the triple-click stamp), and A1/A2-style single passages as the first levels.
- **C's draft becomes a B mechanic.** A port behind a bar is a port with a draft limit; a mini chart
  with an optional call or a choice of port order arrives late in the campaign.

Suggested opening: L1 one port (fuel weighs), L2 one port with a stripe (the free tonne), L3 two ports,
L4 two pumps at two prices, L5 spike: the first no-pump port. After that one new mechanic per shift.

### Secondary mechanics to layer on B (in rough campaign order)

1. **Harbour bars / draft limits.** A port admits `W ≤ X` on arrival (or departure). Discharge first,
   burn down, or bunker *after* the bar on purpose. (From C; the strongest single addition.)
2. **Bunker logistics.** No-pump ports, a barge with only 3 cells for sale, wide price spreads, and
   later an **ECA zone** whose legs need low-sulphur fuel from a second, smaller tank.
3. **Load-line zones (T / S / W marks).** The real Plimsoll rule: you may load to the Tropical mark if
   she will have burned down to the Summer mark by the zone boundary; Winter legs have a lower cap.
   This is the "burn down to a limit" idea in open water, and very authentic.
4. **Reefers.** Need one of a few powered slots and **burn +1 fuel per day each** (the plugs run off the
   generators), so reefers cost fuel even when light.
5. **40-ft boxes and heavy lifts.** Span two stacks of equal height; a heavy lift must sit on the hold
   floor. Stowage becomes shape, not only order.
6. **Dangerous goods (IMDG segregation).** A DG box can't sit next to / above another class or over
   the fuel tanks; deck-only boxes go on the top tier.
7. **Speed choice and windows.** Eco speed: one band lower burn, +1 day; a port with a closing window
   (laycan) or a tide (bar open on even days) forbids eco everywhere.
8. **Optional calls and port order.** A small chart: skip a port, or choose A-then-B vs B-then-A.
   Order decides who lightens whom (C's best idea, brought in late).

Later, sparingly: trim/list (port vs starboard stacks within ±2, the ship visibly lists), and fresh-
water allowance (a river port lets you load one tonne past the mark because she rises in salt water).
Formats inside a world: Tramp (optimize), Charter (deliver everything, one exact plan), and a
"grand voyage" every tenth level (5–6 ports, the Mise banquet).
