# 13 — Progression, difficulty measurement and level generation

*Lens: campaign structure, measured difficulty, searched-for levels. Written against an abstract
voyage model so it survives whatever the core-rules proposals settle on.*

## 0. The idea in one paragraph

Mise en Place measures a *sequential* puzzle with planners that look d moves ahead. This game is
a *configuration* puzzle: pick cargo, place it, set a bunker plan. People solve those by building
an instinctive first answer and then editing it while watching the gauges. So the simulated
players are **greedy starters plus local-search editors**. Mise en Place's *planning depth* becomes
**exchange depth** (how many pieces you must swap at once to reach the perfect load). Its *forced
decisions* become **sacrifices** (good cargo left on the quay), and its *bottlenecks* become
**decoys** (near-perfect loads where every single edit makes the number go down). Levels are built
golden-solution-first with planted decoys. An ablation test proves that the lesson changes the
optimum, and a hill climb tunes each level into its band of a 100-level sawtooth.

## 1. The model the scripts see (robust to the core rules)

All tooling is written against one small interface. The core designers can change the rules
behind it.

- **Pieces** *i*: weight `w` (t), freight `v`, origin port, destination port, footprint, tags
  (reefer, DG, heavy…). Identical pieces are grouped into types.
- **Route**: ports 0..p, legs 1..p. Each leg has a **burn chart**: an integer step function of the
  displacement on departure (cargo + fuel aboard). A weather multiplier is optional.
- **Ship**: deadweight (DWT), tank capacity, reserve (minimum ROB), a hold grid with stacking rules,
  and an optional max draft per port.
- **Plan** π = (selected set S, a stowage, bunkers b_j at each port).
  **Earnings** V(π) = Σ freight − Σ bunker price × b_j. Fuel has a price from level 1, so fuel above
  the reserve is money left in the tanks, and "just enough" is part of the optimum.
- The scripts need these operations: `evalSubset(S)` → best fuel plan, a feasible stowage, V, and
  the violated constraints; `neighbours(S, k)`; `relax(mechanic)` (ablation); `naturalStarts()`.

The key fact: **for a fixed cargo set, the cheapest fuel plan and a feasible stowage can be computed
exactly and quickly** (§6). So the solver searches only the subsets (≤ 2¹⁴), with fuel and stowage
as inner oracles. The *player* still decides fuel and placement, and the simulated players model
that.

## 2. What "difficulty" means here

### 2.1 Simulated players

**Natural starts.** These are what a person builds first. Live projection is on (§3), so each
greedy adds pieces in its preference order. It sets fuel to the minimum the projection asks for and
**skips any piece that turns the projection red**.

| Player | Preference |
|---|---|
| `G_val` | highest freight first |
| `G_den` | highest freight per tonne first |
| `G_fuel` | fills the tanks first ("better safe"), then `G_den` |
| `G_naive` | reserves the fuel the burn chart shows for an *empty* ship, then fills with `G_den`, then repairs (forgets that cargo and fuel weigh) |
| `G_myopic` | multi-port: optimises each leg on its own (no room left for pickups, no carrying cheap fuel forward) |

**Repair** R(π): while π is infeasible, drop the piece whose removal keeps the most value. This is
what a person does when the gauge turns red.

**Editors.** `H_k` is best-improvement local search over the *k-exchange neighbourhood*
N_k(S) = { S′ : |S∖S′| ≤ k, |S′∖S| ≤ k }. Fuel and stowage are re-solved by the oracle, as the live
projection does for the human. A 1-exchange is an add, a drop or a 1-for-1 swap.

- **Strong player** (a strong human's first session). It draws a natural start (G_den 40%, G_val
  30%, G_fuel 15%, G_naive/G_myopic 15%). It edits with `H_1` plus 2-for-1 and 1-for-2 moves, which
  are natural to make by dragging. It slips 5% of the time (takes a random improving move instead of
  the best). It stops after 20 edits or at a local optimum, and restarts once from another natural
  start. 64 runs.
- **Careful player** (the fairness check). `H_3` from every natural start plus 6 random maximal
  loads. No slips. Keeps its best result.

Reported rates: **S★, S★★, S★★★** (share of strong runs that reach each star threshold) and
**C★★★**.

### 2.2 Structural metrics (exact, from the subset table)

Notation: 𝓕 is the set of feasible subsets, V\* the optimum, O the optimal set(s), and "tick" the
smallest difference between two plan values.

1. **Greedy gap** γ = 1 − max_g V(R(G_g)) / V\*.
2. **Near miss** σ: the smallest amount by which a natural start misses on a piece it rejects,
   in the lesson's resource (t of fuel, t of DWT, cm of draft, t·m of list). Teaching levels want
   σ = 1: the lesson shows up the moment you add the tempting crate.
3. **Exchange depth** X = min{ k : `H_k` from ≥ 50% of natural starts ends at V\* } (4 if none
   ≤ 3). This is the planning-depth analogue and the main structural dial.
4. **Decoys** δ = #{ S ∈ 𝓕 : S is a 1-exchange local optimum, 0.95·V\* ≤ V(S) < V\* }. Also the
   **trap distance** ρ: the Hamming distance from O to the decoy with the largest basin. A decoy at
   distance ≥ 3 is a true "aha".
5. **Basin share** β = the share of all maximal feasible subsets whose `H_1` descent ends at O. It
   uses no heuristic (the analogue of Mise en Place's random win) and is capped per band, so a level
   can't be "hard" only because the greedy players are dumb.
6. **Sacrifice** s = |P_den ∖ O|, where P_den is the density-sorted prefix of weight ≈ W(O): the
   obviously good pieces you must leave on the quay. **Odd takes** t = |O ∩ bottom-half density|.
7. **Load-bearing constraints** λ = #{ c : V\*(relax c) > V\* }, and **binding** b = #{ c : slack
   of c at O = 0 }. Together they count the rules that actually interact at the optimum.
8. **Uniqueness** ω = the number of optimal plans, counted modulo identical pieces and mirror
   stowage.
9. **Coupling** κ = 1 − V(R(G_myopic)) / V\*: how much the voyage punishes planning port by port.
10. **Fixpoint depth** φ: iterations of f ← burn(W(O) + f), starting at burn(W(O)), until the
    value settles. φ = 1 means reading the chart is enough. φ ≥ 2 means the fuel's own weight
    tips the ship into the next bracket.
11. **Effort**: pieces n, log₂|𝓕|, and the strong player's mean edits ε (a proxy for time).

**Difficulty index** (for plotting and ordering; not a search target on its own):

> **DI = 40·(1 − S★) + 30·(1 − S★★★) + 30·(1 − C★★★)** (0 = trivial, 100 = nobody wins)

The rates fold everything above into one number. The structural metrics are *requirements* that
make the difficulty the right kind (traps and sacrifices, not number-crunching). Playtest logs
(edits, time, star reached) recalibrate the weights after the first build.

### 2.3 Bands

Ranges are given for chapter 1 → chapter 10 (they slide linearly, like Mise en Place's normal
bands).

| Band | S★ | S★★★ | C★★★ | X | Other requirements | DI |
|---|---|---|---|---|---|---|
| **T0** tutorial | – | – | – | – | authored | 0 |
| **B1** breather / delight | ≥ 90% | 50–90% | 100% | 1 | greedy misses ★★★; n ≤ 6; ω = 1 | 10–25 |
| **B2** intro | 75–100 → 65–90% | 30–70 → 20–55% | ≥ 90% | ≤ 2 | naive start rejects a piece because of the lesson (σ = 1); ablation binds | 15–30 → 25–40 |
| **B3** normal | 60–90 → 50–75% | 15–45 → 10–30% | ≥ 75% | 2 | δ ≥ 1, s ≥ 1, λ ≥ 2, γ ≥ 5% | 25–40 → 40–55 |
| **B4** normal-high | 45–75 → 35–60% | 8–30 → 5–20% | ≥ 60% | 2–3 | δ ≥ 2, s ≥ 2, λ ≥ 3, ω ≤ 2 | 35–50 → 50–65 |
| **B5** hard (spike) | 25–55 → 20–45% | ≤ 15 → ≤ 10% | 35–75% | 3 | δ ≥ 3, ρ ≥ 3, ω = 1, β ≤ 10% | 50–65 → 65–78 |
| **B6** boss | 15–45 → 10–35% | ≤ 8 → ≤ 5% | 25–60% | ≥ 3 | δ ≥ 4, s ≥ 3, λ ≥ 4, ω = 1, κ ≥ 5% (multi-port) | 60–75 → 75–88 |

## 3. Winning, stars, and the "test sail" question

### 3.1 The information regime (the decision that shapes all measurement)

| Regime | What the player sees | Verdict |
|---|---|---|
| **A. Live projection** | The route strip shows ROB, draft and trim at every port as you edit. "Short 1 t at Port B" appears the moment a crate goes in. | **Recommended.** |
| B. Free test sail | Gauges show only DWT; you press *Sail* to see where the fuel runs out (4 s animation). | Trial-and-error gets slow, not hard. People will spam it, and that feels bad. |
| C. Limited sea trials | 3 test sails, then commit. | Becomes mental arithmetic, which the brief explicitly rejects. Failures read as "I can't add" rather than "I didn't see the trap". |

Regime A makes trial-and-error cheap, which is exactly why **we measure assuming it**: the strong
player *is* a local-search editor with perfect evaluation. In a well-built level the difficulty
lives in the landscape, and live feedback does not dissolve that. From a decoy, every single edit
makes the earnings go *down*. The way out is to trade good crates for odd ones, against the
gradient. That is the "aha", and no gauge gives it away. Hard levels get X = 3 and ρ ≥ 3, so
tinkering one or two pieces at a time from the instinctive load can't reach ★★★.

Consequences:
- **You can't sail unsafe.** The Chief Engineer won't sign: *Cast off* is disabled while any port
  shows red, and the reason names the constraint. As in Mise en Place, you never lose to a misclick,
  only to planning.
- **The voyage is the payoff, not the test.** The fuel needle drains leg by leg, the hull rises as
  fuel burns and cargo is discharged, and the ship arrives at the last port with ROB flashing
  "0.0 — on fumes". That is the juice.
- An optional **Captain's licence** mode after the campaign: projection off, 3 sea trials per level,
  for experts. It needs its own measurement (players without the oracle). Low priority.

### 3.2 Pass and stars

- **Pass (★, "contract met")**: earnings ≥ T1 and safe on every leg. *Cast off* lights up once the
  plan meets the contract, and the earnings bar turns from grey to brass.
- **★★** at T2, **★★★ "Perfect load"** at T3 = V\*. The bar shows all three marks with their
  numbers. In an optimisation puzzle, knowing that something better exists is half the motivation
  (like a par in golf).
- The thresholds come from the measurements, not from fixed percentages:
  - **T3 = V\***.
  - **T1 = the best natural start (repaired if needed) + 1 tick.** The contract is never met by
    the instinctive load, which keeps "from level 2 you must think" true for *passing*, not just
    for stars. From B3 on the band asks for γ ≥ 5%, which leaves room between T1 and V\*. On
    single-insight lesson levels (B1/B2), T1 may coincide with T3.
  - **T2 = the best decoy (a 1-exchange local optimum ≠ O) + 1 tick, if that is above T1;
    otherwise midway between T1 and T3.** ★★ means "you escaped the main trap". It is usually
    95–99% of V\*.
- **Partial credit vs binary**: pass is binary, stars are graded, and the best result is kept
  (stars only go up). No pure partial credit, because a "62% load" with no threshold is not a goal.
- **"On the mark" stamp** (cosmetic): the ship departs sitting exactly on its Plimsoll line, with
  DWT used to the tonne. Breather levels are often built around it.
- No clean-run rule (unlike Mise en Place). This is an editor, and undo is just editing.

### 3.3 Worked example: level 2 ("Heavy ships burn more")

DWT 20 t, one leg, bunkers $2/t. Burn chart by displacement (cargo + fuel): **≤ 12 t → 3 t;
13–16 t → 4 t; 17–20 t → 5 t.** So any cargo of 16 t or more can't sail: 4 t of fuel puts 20 t
aboard, which burns 5, and 5 t of fuel goes over the DWT. Crates: **9 t $99**, 7 t $72, 5 t $52,
4 t $41, 3 t $30. The 9 t crate is the best by freight *and* by freight per tonne.

- `G_val` takes 9 t, then tries 7 t: 16 t of cargo, and the gauge turns red, **"short 1 t"**. It
  takes 5 t (14 t, fuel 5), and the 4 t and 3 t crates no longer fit. Earnings: $151 − $10 =
  **$141**.
- `G_den` lands on the same 9 + 5 load ($141).
- The perfect load **leaves the best crate on the quay**: 7 + 5 + 3 = 15 t with 5 t of fuel
  (20 t aboard, burn 5, ROB 0): $154 − $10 = **$144**.
- From 9 + 5, every single add, drop or swap lowers the earnings. That makes 9 + 5 a decoy at 98%,
  and you need a 1-out-2-in move to escape it (X = 2, s = 1).
- The fixpoint depth is 2: 15 t of cargo first suggests 4 t of fuel, but the fuel's own weight
  takes the ship to 19 t, which burns 5.
- Contract = Perfect = $144. Both instinctive loads stop at $141, so on this single-insight lesson
  level all three stars arrive together.
- Ablation: with a flat burn of 3, the optimum becomes 9 + 5 + 3 (17 t of cargo), so the lesson
  binds.

## 4. Campaign structure

**100 levels in 10 chapters of 10.** Each chapter is a sea area on the chart and a rank on the
player's cuff (Cadet → Master). The ship grows twice: a coaster (no stowage grid yet), a feeder
with a 4×3 hold from chapter 4, and a handysize with a 5×3 hold from chapter 7. Then a daily
charter and an endless mode (§7).

**Mechanic cadence**: a **major** rule at x.1 and a **minor** twist at x.7, so something new
arrives about every 5 levels (about 20 in total). A new rule is always introduced on a gentle level
(B2), never on a spike. Every mechanic present in a level must be **load-bearing** (λ counts it). A
rule that doesn't change the optimum is removed from that level, the way Mise en Place requires ice
to cut ≥ 15% of the winning lines.

**The sawtooth inside every chapter** (a double tooth, about 4 levels between peaks):

| Position | x.1 | x.2 | x.3 | x.4 | x.5 | x.6 | x.7 | x.8 | x.9 | x.10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Band | B2 intro | B3 | B3 | B4 | **B5 spike** | B1 delight | B2 twist | B3/B4 | B4/B5 | **B6 boss** |
| Pieces | 5–7 | 7–9 | 7–10 | 8–11 | 9–12 | 4–6 | 6–8 | 8–11 | 9–12 | 11–14 |

Every peak is followed by a breather. The delight level (x.6) is small, with one trick and often an
"on the mark" fit, so it is fast *and* satisfying. Chapters 1–2 stay at the low end of the piece
ranges (bosses ≤ 10). The bands slide across chapters, so chapter 7's breather is harder than
chapter 2's normal levels.

### 4.1 Chapters 1–2 in full

| # | Pos | Band | Mechanics present | Lesson / notes |
|---:|---|---|---|---|
| 1 | 1.1 | T0 | DWT shared by cargo and fuel, one burn bracket | Authored tutorial: 3 crates, one leg. Every sensible load wins. Teaches drag-to-hold, fuel ±, the draft gauge. |
| 2 | 1.2 | B2 | + burn brackets | §3.3: the 7 t crate makes the instinctive load exactly 1 t of fuel short. The perfect load leaves the best crate ashore. |
| 3 | 1.3 | B2 | same | "Fuel weighs too": φ = 2, the fuel needed tips the ship into the next bracket. Ablation: weightless fuel. |
| 4 | 1.4 | B3 | same | "Step down a bracket": a lighter load burns 1 t less fuel and nets more. The first ★ needs a load *below* the bracket edge. |
| 5 | 1.5 | **B5** | same, 9 crates | "The Overload": three decoys at ≥ 95%. The perfect load is 3 exchanges from greedy. |
| 6 | 1.6 | B1 | same, 5 crates | "On the mark": exactly one load fills the ship to the tonne at a bracket edge. |
| 7 | 1.7 | B2 | + reserve (ROB ≥ 2 t) | The reserve shifts the bracket arithmetic, and the optimum changes (ablation). |
| 8 | 1.8 | B3 | all ch. 1 | Two near-equal plans, only one perfect (ω = 1). |
| 9 | 1.9 | B4 | all ch. 1 | s = 2: the two best-looking crates both stay ashore. |
| 10 | 1.10 | **B6** | + 2 legs, no bunkering between | "First charter": fuel for leg 2 is dead weight on leg 1. |
| 11 | 2.1 | B2 | + intermediate port, discharge | "Sail light": a cheaper crate for the *near* port beats a richer one for the far port, because leg 2 burns less. |
| 12 | 2.2 | B3 | 2 ports | "The long-haul tax": freight per tonne vs. legs carried. |
| 13 | 2.3 | B3 | 3 ports | Discharge order changes which brackets each leg falls in. |
| 14 | 2.4 | B4 | 3 ports | Decoy at distance 2: the near-port load the greedy players love. |
| 15 | 2.5 | **B5** | 3 ports | "Round the headland": κ ≥ 5%. Planning one leg at a time fails. |
| 16 | 2.6 | B1 | 2 ports, 5 crates | Delight: unloading at B drops leg 2 into the cheapest bracket exactly. |
| 17 | 2.7 | B2 | + pickups at intermediate ports | "Leave room": a valuable pickup at B needs free DWT on leg 2, and fuel for it bought at A. |
| 18 | 2.8 | B3 | pickups | Myopic loading at A blocks the pickup. |
| 19 | 2.9 | B4/B5 | pickups, 3 ports | Two pickups compete; one must be refused. |
| 20 | 2.10 | **B6** | 3 ports, pickups, reserve | "Coastal charter". |

### 4.2 Chapters 3–10

The mechanic names are placeholders. The cadence and the slots are the point, and any catalogue
(for example doc 11's) slots straight in.

| Ch | Levels | Sea area / ship | Major (x.1) | Minor twist (x.7) | Boss (x.10) |
|---|---|---|---|---|---|
| 3 | 21–30 | North Sea, coaster | Bunker ports with different prices; one port with none | Tank capacity | 4 ports, 2 bunker stops: buy cheap, but cheap fuel weighs |
| 4 | 31–40 | Channel, **feeder 4×3** | Stowage grid with discharge order (no restows: earlier-port cargo stays accessible) | Stack weight limit (heavy goes low) | Full grid, 3 ports, s ≥ 3 |
| 5 | 41–50 | Biscay | List and trim limits (moments, checked on every leg as fuel burns and cargo leaves) | Ballast water: fixes trim, costs DWT | Trim shifts mid-voyage after discharge |
| 6 | 51–60 | Baltic | Draft limit at a port (max displacement on arrival) | Load-line zone: winter mark on one leg | Bunker *after* the shallow port |
| 7 | 61–70 | Biscay → Med, **handysize 5×3** | Reefers need powered slots | Dangerous-goods segregation; 2-cell oversized pieces | Mixed special cargo, 4 ports |
| 8 | 71–80 | North Atlantic | Forecast sea state per leg (burn ×); eco/full speed vs port windows | Route choice per leg (short and stormy vs long and calm) | Weather routing charter |
| 9 | 81–90 | Mediterranean | You choose the port rotation | Optional ports (skip a call) | Rotation + bunkers + draft |
| 10 | 91–100 | Pacific | No new rule: remixes, longest voyages | – | **L100 Grand Charter** (14 pieces, 4 ports, every load-bearing rule) |

Every chapter after the first re-uses earlier rules as "remix" rows, like Mise en Place's ladders,
so no level carries more than three or four active mechanics. Endless levels (101+) cycle the
chapter 6–10 rows with full late bands.

## 5. Level generation pipeline

Mise en Place guarantees solvability through the golden line. Here solvability is trivial (an
empty ship can always sail), so the real guarantee needed is **a known optimum that teaches the
intended lesson**. The pipeline:

1. **Spec from the ladder row**: ship, ports, piece-count range, mechanics, lesson id, band,
   number palette (weights 1–12 t; freight in multiples of 5 or 10; burn charts with 3–4 brackets).
2. **Golden first.** A lesson template constructs O so that the lesson's constraint binds *exactly*
   at O: DWT full at the top of a bracket, fuel equal to burn + reserve, draft exactly at the limit.
3. **Plant decoys** (from the template):
   - *Overshoot decoy*: a set that is 1 unit heavier than O, earns more, and is infeasible by
     exactly 1 unit of the lesson's resource. Its pieces are given higher density so that `G_den`
     and `G_val` walk straight into it (σ = 1).
   - *Local-optimum decoy*: a feasible set at distance ≥ 2 (≥ 3 on B5/B6), worth 93–98% of V\*,
     that the repair of the overshoot lands in.
   - *Fillers*: 1–3 low-density pieces that create many feasible combinations (the search space
     grows) but are never in O.
4. **Solve exactly** (§6). If V\* > V(O), either adopt the better plan when it still shows the
   lesson, or reject the draft.
5. **Ablation (the lesson must bind).** Relax the lesson mechanic (flat burn, weightless fuel, no
   draft limit, free stowage, equal fuel prices, myopic planning…). Require:
   (a) V\*(relaxed) > V\* and O(relaxed) ≠ O;
   (b) in the real level, at least one natural start rejects a piece *because of* this constraint,
   and at least 70% of the strong player's first rejections name it ("lesson clarity");
   (c) every other mechanic present has Δ > 0, or it is removed from the level.
6. **Hill climb to the band.** Mutations: a piece's weight ±1 or freight ±5; a piece's destination
   or footprint; add or remove a filler; a bracket edge ±1; DWT, tank or reserve ±1; a port's fuel
   price; an obstacle cell in the hold. Objective, like `planObjective`:
   Σ wₘ · linBand(metricₘ, bandₘ), plus large penalties when an ablation check fails or the
   number palette is broken. Keep a change if the score is not worse (plateau moves allowed).
   Restart from new drafts when stuck. Among on-target levels, aim for the middle of the bands
   (`planAim`).
7. **Finalise.** Run the full metrics with holdout seeds. Set T1/T2/T3 (§3.2). Store the pieces, the
   charts, the thresholds, one optimal plan, all metrics and the *trap line* for the logbook (§7).
8. **Audit script**: every stored optimum replays and earns T3, and a re-solve finds nothing
   better. No mechanic appears before its intro. Neighbouring levels never share a lesson template.
   The script regenerates `docs/difficulty.md` with tables like Mise en Place's.

**Lesson templates** (the starting library; one per mechanic, several variants each):

| Lesson | Golden O | Built-in trap | Ablation |
|---|---|---|---|
| Heavy burns more | DWT full at a bracket's top edge | Greedy prefix 1 t heavier, 1 t of fuel short | Flat burn |
| Fuel weighs too | O's own fuel crosses a bracket (φ = 2) | `G_naive`'s load | Weightless fuel |
| Sail light | Takes the near-port piece | Far-port piece richer and denser | All cargo to the last port |
| Leave room | Exact free DWT for the pickup | `G_myopic` fills leg 1 | Pickup removed (κ > 0) |
| Bunker where cheap, not too much | Buys exactly 2 legs of fuel at the cheap port | `G_fuel` fills the tank there and loses cargo | Equal prices |
| Discharge order | First-off cargo stowed on top | `G_den`'s set cannot be stowed | Free stowage |
| Trim | Heavy pieces paired across the centreline | Heavy greedy load lists | No list limit |
| Draft limit | Bunkers after the shallow port | `G_fuel` arrives too deep | No draft limit |

## 6. Solver

The formulation splits into an outer subset search and inner exact oracles:

- **Subset table.** For each bitmask S, compute the per-leg cargo weight incrementally (lowbit
  trick, O(2ⁿ·p)). Store V or −∞ in a `Float64Array(2ⁿ)`. Identical pieces collapse to counts,
  which shrinks the space further.
- **Fuel oracle.** It depends only on the per-leg weight profile, so it is memoised by profile (a
  few hundred to a few thousand distinct profiles). With one bunker port it is a backward fixpoint
  per leg: need_ℓ = min f such that f − burn_ℓ(W_ℓ + f) ≥ need_ℓ₊₁, over at most ~60 integer
  values. With priced bunkers at several ports it is a DP over (port, ROB) with F ≤ 60: O(p·F²)
  ≈ 15k operations.
- **Stowage oracle.** Exact DFS that places pieces in discharge-then-weight order into the ≤ 15
  cells, memoised on (remaining multiset, occupancy/heights). It breaks symmetry on identical pieces
  and mirror columns, and checks trim/list moments for each leg (after discharge and burn). It is
  called **lazily**: only on masks that pass weight and fuel and are candidates (incumbents, local
  optima, players' plans). It is cached by multiset signature.
- **V\* alone** (fast path for the hill climb): branch-and-bound in density order. The bound is the
  current value plus a fractional knapsack over DWT − the minimum fuel at light load.
- Every metric then reads from the table: local optima (each mask checks its ≤ n + in·out
  1-exchange neighbours), basins, decoys, climbers and greedy players. A 3-exchange neighbourhood
  at n = 14 is ≤ 64² ≈ 4k lookups per step.
- When the player chooses the port rotation, build one table per rotation (p! ≤ 24).

| Level size | Masks | Fuel oracle | Stowage calls | Full table + metrics (TS, laptop) |
|---|---:|---|---:|---|
| L2: 5 pieces, 1 leg | 32 | trivial | – | < 1 ms |
| Normal: 10 pieces, 3 ports, 4×3 | 1,024 | ~300 profiles × 2k ops | ~200 × ≤ 1 ms | 20–60 ms |
| Boss: 14 pieces, 4 ports, 5×3 | 16,384 | ~3k profiles × 15k ops | ~2k × ≤ 1 ms | 0.3–1.5 s |
| Endless: 18 pieces | 262,144 | memoised | lazy | 3–10 s offline; in-browser B&B + sampled metrics |

Hill-climb budget: quick stats (B&B V\*, greedy players, `H_1`/`H_2` from the natural starts) take
5–30 ms, so 2,000 steps take about a minute per level, and the campaign builds in about 2 hours on
one core. In-browser endless generation follows Mise en Place: a 1.5 s worker budget, 3 drafts, 40
climb steps, quick stats only, and the next level prefetched.

## 7. Helpers and meta (modest, tasteful)

- **Undo / redo**: unlimited and free. The **logbook** keeps your best plan per level, and any
  earlier plan can be restored.
- **Live projection** (always on) is the main helper. A one-tap **"Bunker to need"** sets the
  minimum safe fuel for the current cargo at the current port. *Where* to bunker, in multi-port
  levels, stays the player's decision.
- **Hints, in three escalating taps**, each costing one *pilot token*:
  1. *Pilot's word*: names the binding constraint in the template's voice ("Watch the burn chart
     at 17 t").
  2. *Bearing*: "A perfect load is 2 changes from yours" (the Hamming distance to the nearest
     optimum). This is very informative in an optimisation puzzle, and cheap to compute.
  3. *Pilot's mark*: pins one piece in or out: the one in the nearest optimum that differs from
     your plan and is most surprising (usually the top-density crate that must stay ashore).
- **Harbour pilot** (the skip): sets the contract-meeting plan *nearest to yours*. It earns ★ only,
  with a small pilot pennant. ★★ and ★★★ remain to be earned.
- **Tokens**: start with 3, +1 per first-time ★★★, capped at 9. No coins, no shop, no ads.
- **Map**: a portrait nautical chart that scrolls through the sea areas. Levels are ports on a
  dotted route, and the player's ship model sits at the current one. Bosses are chart cartouches
  ("Charter"). A chapter opens once the previous boss is *passed*; stars are never a gate. Stars
  unlock liveries (hull and funnel colours) and the rank stripes at chapter ends.
- **Result card**: "Freight $154 · Bunkers $10 · ROB 0.0 · ★★★ Perfect load". It has *Next
  voyage* and *Improve load* (back to the plan, load intact). Below ★★★ it shows the gap ("Perfect
  load: $312, +18"). After ★★★ it shows the **logbook line**: one sentence naming the trap
  ("The 9 t crate was the best on paper. Leaving it ashore let 15 t sail on the same 5 t of fuel").
  This is the lesson's closure.
- **Daily charter** (a pool level picked by date) and **endless** after L100.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Simulated editors don't predict humans | Several starter players plus heuristic-free caps (β, decoys), as Mise en Place uses two planner families. Refit the DI weights and bands from playtest logs. |
| Live projection makes it a tinkering toy | Difficulty must come from X ≥ 2 (3 on spikes), decoys and sacrifices, which resist 1-step edits. The fallback is the Captain's licence mode. |
| Arithmetic fatigue on a phone | ≤ 14 pieces, small integers, a fixed number palette, the projection does all sums, burn charts have ≤ 4 brackets. |
| A lesson doesn't land (passed without being understood) | Ablation, σ = 1 on the lesson resource, ≥ 70% of first rejections naming it, and the logbook line. |
| Ambiguous "perfect" (several optima) | ω = 1 on B5/B6 and ω ≤ 2 on B4. Equivalent pieces are collapsed so they don't count as different answers. |
| The visible gap gives the answer away ("I'm $40 short, and the 4 t crate is worth $40") | Flag "legible gaps" (the gap from the strongest decoy equals one piece's freight or a pairwise difference). Fine on lesson levels; rejected on B4+. |
| Stars feel stingy | ★ is within reach (S★ ≥ 45% on normal levels), ★★ marks escaping the trap, ★★★ is optional mastery, and the Bearing hint helps. |
| Core rules change late | All tooling targets the §1 interface. A new mechanic needs only an oracle constraint, a `relax()` and a lesson template. |
| Solver blow-up on big levels | Lazy stowage, profile memoisation, collapsed identical pieces, B&B for V\*, at most 14 pieces in the campaign. |
| Sawtooth feels random | Delight levels are also *shorter* (n ≤ 6), and spikes carry a gale pennant on the map, so players expect them. |
