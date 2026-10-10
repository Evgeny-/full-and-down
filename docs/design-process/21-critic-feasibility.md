# 21 — Feasibility, scope and build plan (the technical director's pass)

**Verdict.** Build **Full & Down** (slug `full-and-down`) on **Loop B, Port Rotation**, played port
by port: discharge, load into LIFO bays, bunker, cast off.

v1 ships:
- **60 levels in 6 chapters**, with **12 mechanics** introduced over time;
- the **Signal Hoist** look;
- one broadside berth scene;
- a voyage that is a sail-out in that same scene while the fuel train drains (not the chart-mode
  shader).

Everything else is cut or deferred.

**The engineering bet: the optimum decomposes exactly** into three parts:
- *which boxes* (a manifest bitmask);
- *the cheapest bunker plan for that manifest* (a tiny DP);
- *the fewest restows for that manifest* (a lazy stowage DFS).

I checked this with throwaway scripts. The decomposition and a naive full sequential search agree
on doc 10's levels: B2 = 15, and B3 = 23 with "next five at 22". They also agree on doc 13's L2
(144). A boss-sized draft (14 offers, 16,384 manifests) needs 9.6k fuel DPs: 0.3 s in Python, so
roughly 10–20 ms in TS. That leaves the generator room for hundreds of exact solves per level.

**Rulings where the proposals disagree:**
1. **Departure band for the whole leg** ("2 days × 2 = 4"), not Loop A's per-day re-evaluation.
2. **Port-by-port play with live projection** (doc 13's regime A). Cast off is refused only for
   *this* leg, so getting stranded at a no-pump port remains the "deep" error.
3. **Difficulty is measured on the manifest landscape** (doc 13: editors, decoys, exchange depth),
   **plus doc 10's sequential greedy players**, which capture stranding and wrong bunker ports.
4. **60 levels, not 100**: the pipeline extends later.

---

## 1. Scope verdicts

MUST = v1 · SHOULD = v1 if time, in table order · LATER = v2 · CUT.

### 1.1 Loop, formats, helpers

| Item | Verdict | Reason |
|---|---|---|
| Loop B, Port Rotation | **MUST** | Where, how much, which and what order are all decisions. A port call is the natural move for undo, hints and simulated players. |
| Loop A as a mode (hull grid, FEU) | CUT | Knapsack with a gauge. It survives as the 1-leg levels of chapter 1. |
| Per-day band re-evaluation | CUT | The departure band is readable, and the fuel DP stays trivial. |
| Loop C chart routing | CUT | Thumb path-drawing and touchy tuning. Its draft rule returns as the harbour bar. |
| Tramp format · grand-voyage boss at x.10 | **MUST** | The boss is just a bigger generator spec. |
| Charter format (mandatory boxes) | SHOULD | One flag and one refusal give binary "it just fits" levels. |
| Live projection; Cast off disabled when this leg is unsafe | **MUST** | Players lose to planning, never to arithmetic. |
| Test sails, limited trials, Captain's licence | CUT | Trial spam or homework. |
| "Bunker to need" one-tap button | **MUST** | It does the lookup. *Where* to bunker stays the decision. |
| Stranded at a no-pump port (soft fail, "belay to previous port") | **MUST** | The deep error that makes hard levels hard. |
| Unlimited undo, across ports too | **MUST** | The game is an editor in time. |
| Hint ("Ask the Pilot") from the live solver | **MUST** | Shows the next optimal action, or "belay N" when you've left the perfect line. |
| Pilot tokens (3, +1 per new ★★★) | SHOULD | About 30 lines. Hints are free until then. |
| Stars: T1 = best greedy + 1, T2 = best decoy + 1, T3 = V\* | **MUST** | Measured, as in doc 13. |
| "Down to her marks" stamp (W = C at departure) | **MUST** | Cheap, and it's the title. |
| Logbook sentence on the result card | SHOULD | Templated from the greedy-vs-optimum diff. |
| Skip, plan logbook, daily, endless, coins, liveries, i18n | CUT / LATER | Daily and endless need in-browser generation. English only. |

### 1.2 Mechanics (in campaign order)

| Mechanic | Verdict | Ch | Reason |
|---|---|---|---|
| Fuel weighs (shared deadweight) | **MUST** | 1 | The core. |
| Burn bands (2–3 stripes on the hull) | **MUST** | 1 | Creates the free tonne and the cliff tonne. |
| Cubed out vs weighed out | **MUST** | 1 | Free: it emerges from bay slots vs C. |
| Discharge midway; pickups | **MUST** | 2 | Multi-port is the loop. Pickups force "leave room". |
| Bunker prices; no-pump port | **MUST** | 3 | The "where to bunker" half of the brief, and the deep error. |
| Tiers (LIFO) + restows | **MUST** | 4 | The spatial axis. The ship grows from coaster to feeder. |
| Heavy below light | SHOULD | 4 | One rule and a strong aha. Weight pips are its only art. |
| Harbour bar (W ≤ limit while in port) | **MUST** | 5 | The best single addition: one inequality in the fuel DP. |
| Reefers (plug bays, +1 burn per leg each) | SHOULD | 6 | Ties stowage back to fuel. |
| ROB reserve | SHOULD | 6 | One number. A minor twist only. |
| Load-line zones, eco speed/laycan, port order/optional calls/canals, ECA, air draft, trim/ballast, DG, 40-ft, currents | LATER | – | Each needs new UI, a mid-leg check, or breaks the stack model. |
| FWA, tides, lightering, sealed bunkers, redelivery window, hatch covers, weather, MOLOO, sludge, ice, congestion | CUT | – | Subtle or sum-heavy, for little new thinking. |

### 1.3 Screens and UI

| Item | Verdict | Reason |
|---|---|---|
| Signal Hoist identity (enamel, ICS flags, Oswald + Sofia Sans) | **MUST** | Distinct from the sibling games, and mostly CSS. |
| Route strip: port flags, legs + days, pumps/prices, bars, **fuel train** with forecast | **MUST** | The HUD grammar. |
| Port peek sheet (future offers) | **MUST** | Perfect information. |
| DWT bar (cargo / fuel / free), ghost segment while holding a box | **MUST** | Makes the tradeoff literal. |
| Code-flag buttons (Blue Peter = Sail) as CSS/SVG | **MUST** | The cloth-ripple press is CUT. |
| Map: 2D SVG pilot chart, sea areas as chapters | **MUST** | Same structure as Mise's map. A 3D chart with dioramas is CUT. |
| Results: clearance form with three customs stamps | **MUST** | Triplicate carbon copies SHOULD. |
| Mechanic intro cards, L1 coach marks, pause/settings | **MUST** | |
| Boot loader (hull sinks to the mark) | SHOULD | Mise pattern, about 40 lines of CSS. |
| Title screen with the bow dolly | CUT | Boot goes straight to the map, like Mise. |
| Loupe render target | CUT | The framing makes the marks big. A DOM chip says "▲3 t to the mark". |
| Bunker handwheel | CUT | ± with hold-repeat, plus "to need". |
| Landscape layout | SHOULD | Desktop must work, but a letterboxed portrait view is fine for v1. |
| Night mode | SHOULD | Palette swap plus deck lamps. Cheap if `palette.ts` is tokenised from day 1. |

### 1.4 Scene, juice, audio

| Item | Verdict | Reason |
|---|---|---|
| Broadside ortho camera, ship 92% wide, chunky 6:1 hull | **MUST** | The hull is the gauge. |
| Hull generator + painted canvas (antifouling red up to the S line) | **MUST** | 75-min timebox. "Red showing = spare deadweight" falls out of `y = y0 − k·W`. |
| Plimsoll disc, draft numerals, band stripes with burn badges | **MUST** | Decals. |
| Superstructure, funnel, mast; one ship's crane | **MUST** | Chamfered boxes. |
| Containers as individual meshes with canvas faces (flag, pips, freight) | **MUST** | ≤ 30 boxes, so no instancing atlas. Reefer skin SHOULD. |
| Fuel cells: amber blocks in an aft tank cutaway above the deep waterline | **MUST** | Sells the fantasy. The meniscus shader is CUT. |
| Quay, fenders, bollards, apron lanes in port colours | **MUST** | |
| Water: one shader plane (depth tint, bands, foam ring, 8 ripple slots, scroll) | **MUST** | Glints and cloud shadows CUT. |
| Chart-mode water (`chartMix`, isobaths, soundings) | LATER | Hours of shader work for a 3-second transition. |
| Bunker barge (reused hull generator) · skyline + lighthouse per chapter | SHOULD | Road tanker, buoys, tug and pilot boat CUT. |
| Flag atlas: about 12 flags (port letters + P, B, Q, V), vertex wave | SHOULD | Not all 40. The DOM uses SVG flags with the same patterns. |
| Gulls | LATER | An hour of work that carries no information. |
| Juice MUST | **MUST** | Settle-to-draft spring; on-the-mark glint + ding-ding + stamp; crane lift with pendulum sway (60-min timebox, fallback Mise's `arc()` hop); twist-lock squash + puffs; no-go wiggle + beeper; cells pop in, then burn out one by one on the passage as she rises a tick each; "+$7" pops and money roll-up; over-the-marks red S line; horn + steam; stamps slam. |
| Juice SHOULD | SHOULD | 3D ghost waterline; roll impulse, laden bob, funnel smoke, bow wave + wake (cheap with `FxView`); Blue Peter hoist, dressing overall, flag confetti (need the atlas); hose bulge; undo as crane rewind (v1 snaps, like Mise's `syncAll`). |
| Juice CUT | CUT | Mooring lines, tug nudge, out-of-fuel drift + tug tow (you can't run dry at sea), fireboat, ghost cargo, Aldis-lamp hint, harbour-master launch. |
| SFX: horn, clank, crane, glug/cell tick, bell pair, Aldis click, beeper, whoosh, stamp, star, win, undo; ambience: waves + engine pulse | **MUST** | Synthesised with Mise's `dsp.ts`. Gull, bosun's pipe, flag squeak SHOULD. |
| Music | LATER | Mise's song engine is about 1,700 lines of tuning. |

### 1.5 Measurement and generation

| Item | Verdict |
|---|---|
| Exact solver; sequential greedies; strong/careful manifest editors; DI; exchange depth, decoys, ω, greedy gap; intro-mechanic ablation | **MUST** |
| Basin share, sacrifice; ablation of every mechanic present | SHOULD |
| Near miss σ, fixpoint φ, "lesson clarity" | CUT |
| Golden-first lesson templates | LATER. Generic draft → climb plus a decoy-planting mutation instead. |
| In-browser generation | CUT |

---

## 2. Architecture

### 2.1 v1 rules (the solver, sim and tests all follow these)

1. **The ship.** Deadweight `C`, tank `T`, `bays × tiers` slots, `bands` (W ≤ upTo → rate per day).
   W = cargo + fuel.
2. **A call at port i:**
   - **Discharge (automatic).** In each bay, the lowest box bound for i and everything above it
     lift. Boxes for i pay their freight. The others are **restows**: −R each, put on the quay,
     and they *must* be reloaded this call, into any bay.
   - **Load.** Push quay boxes onto bays with room (subject to the heavy and plug rules). A box
     loaded this call can be taken back while it is on top.
   - **Bunker.** ± cells at `price_i`, refundable within the call, up to fuel ≤ T.
3. **Cast off** requires all of these:
   - restows and charter boxes are aboard;
   - W ≤ C;
   - W ≤ this port's bar;
   - fuel ≥ `days_i·rate(W) + reefers + reserve`;
   - arrival W (W − burn) ≤ the next port's bar.

   The **departure band** fixes the burn for the whole leg.
4. **Stranded.** At a no-pump port, if the fuel can't cover the next leg even with only the
   mandatory reloads aboard, the voyage is stranded.
5. **End.** At the last port, everything is discharged. Profit = freight − fuel bought −
   R·restows. Starting fuel is free.

Doc 10's A1/A2 numbers used the per-day rule, so re-solve them rather than copying. B1–B3 follow
these rules and become test fixtures.

### 2.2 Module layout

```
src/
  main.ts               App.init(), or ?lab=ship|ui|sfx|icon (isolated dev pages)
  core/                 pure TS, no DOM/three — runs in vitest, bun scripts, browser
    types.ts            THE CONTRACT (below), frozen at M0
    rules.ts            rateOf, burnOf, discharge, placeRefusal, castOffRefusal
    sim.ts              VoyageSim: mutable, snapshot/restore, emits VoyageEvent[]
    project.ts          Projection for the HUD
    solver.ts           manifest table + fuel DP + B&B; solveFrom(state)
    stow.ts             stowage oracle (greedy check + exact min-restow DFS)
    players.ts          sequential greedies, gas-station fuel policy, manifest editors
    metrics.ts          LevelStats, ablation, thresholds, DI
    targets.ts progression.ts generator.ts logbook.ts rng.ts
  data/levels.json      built campaign; authored.ts overrides tutorials
  game/Game.ts          input → sim → view, undo stack, hint, demo, sailing lock
  render/               stage anim FxView AdaptiveRenderScale (from Mise) palette layout
                        hull ShipView CargoView CraneView WaterView HarbourView FlagView GameView
  ui/                   dom dialogs (from Mise) flags Hud RouteStrip DwtBar PortSheet Dock
                        MapScreen ResultCard IntroCards Coach Settings styles/*.css
  app/                  App.ts (flow, debug flags) save.ts levels.ts
  audio/                audio.ts + dsp.ts (from Mise, music bus stubbed) sfx.ts ambience.ts
scripts/                build-levels.ts audit-levels.ts shots.mjs demo-run.mjs (+ shot.mjs)
```

**Reuse from Mise en Place.**
- **Copied verbatim:** `anim.ts` (Tweens, `arc`, `squash`), `AdaptiveRenderScale.ts`, `dom.ts`,
  `dialogs.ts` (restyled), `dsp.ts`, `rng.ts`.
- **Already in this repo:** `vite.config.ts`, `shot.mjs`, and `deploy.yml` (with `__SLUG__`).
- **Adapted:**
  - `stage.ts`: morning-harbour lights;
  - `FxView.ts`: adds foam, smoke and flag-confetti particles;
  - `audio.ts`: drop the `Band`/`Song` imports;
  - the App/Game/Hud skeletons: snapshots, `settleAt`, the debug-flag parser.
- **Rewritten:** `MapScreen.ts`.

### 2.3 Core types

```ts
// src/core/types.ts
export type PortIx = number;                 // index in Level.ports = rotation order
export type BoxId = number;                  // index in Level.boxes
export interface Band { upTo: number; rate: number }   // W ≤ upTo burns `rate` per day

export interface Ship {
  name: string;
  capacity: number; tank: number;            // deadweight C; max fuel cells (1 cell = 1 t)
  bays: number; tiers: number;               // tiers 1 = no overstow (chapters 1–3)
  bands: Band[];                             // ascending; last.upTo === capacity
  plugs?: number[]; heavyBelowLight?: boolean;
}
export interface Port {
  name: string; flag: string;                // "Esbjerg", ICS letter (colour + pattern)
  fuel: number | null;                       // price per cell; null = no pump
  bar?: number;                              // W ≤ bar while in this port
}
export interface Box {
  id: BoxId; from: PortIx; to: PortIx;       // from < to
  weight: number; freight: number;           // 1–5 t; paid on delivery
  reefer?: boolean; charter?: boolean;
}
export type Mechanic = 'dwt' | 'bands' | 'discharge' | 'pickup' | 'prices' | 'noPump'
  | 'tiers' | 'heavy' | 'bar' | 'charter' | 'reefer' | 'reserve';

export interface Call { load: { box: BoxId; bay: number }[]; bunker: number }  // push order
export interface Plan { calls: Call[]; profit: number }    // one call per port but the last

export interface Level {
  n: number; chapter: number; local: number; title: string;
  band: 'T0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
  ship: Ship; ports: Port[]; days: number[]; boxes: Box[];
  startFuel: number; reserve: number; restowFee: number;
  stars: [number, number, number];           // T1 pass, T2, T3 = V*
  mechanics: Mechanic[]; intro?: Mechanic;
  best: Plan; stats?: LevelStats; logbook?: string;
}

export interface VoyageState {
  port: PortIx; phase: 'call' | 'sailing' | 'finished' | 'stranded';
  bays: BoxId[][];                           // bottom → top
  quay: BoxId[]; mustLoad: BoxId[];          // offers + restows; restows/charter still ashore
  loadedHere: BoxId[];                       // may be taken back while on top
  fuel: number; boughtHere: number;          // boughtHere refundable until cast off
  delivered: BoxId[]; freight: number; fuelCost: number; restowCost: number;
}

export type Refusal = 'bayFull' | 'notTop' | 'heavy' | 'plug' | 'mustLoad' | 'overMarks'
  | 'bar' | 'barAhead' | 'shortFuel' | 'tankFull' | 'noPump' | 'reserve';

export interface Projection {
  cargo: number; fuel: number; w: number; band: number; onMark: boolean;
  legs: { burn: number; band: number; fuelAfter: number; short: number }[]; // no new loads/bunkers
  needToNextPump: number; toNeed: number;
  castOff: Refusal | null;                   // null → Blue Peter goes up
  profit: number;
}

export type VoyageEvent =
  | { t: 'berth'; port: PortIx }
  | { t: 'discharge'; box: BoxId; bay: number; tier: number; freight: number }
  | { t: 'restow'; box: BoxId; bay: number; tier: number; fee: number }
  | { t: 'load' | 'unload'; box: BoxId; bay: number; tier: number }
  | { t: 'bunker'; delta: number; fuel: number; price: number }
  | { t: 'settle'; w: number; band: number; onMark: boolean }
  | { t: 'castOff'; leg: number; burn: number; band: number; w: number }
  | { t: 'burn'; leg: number; fuel: number; w: number }       // one per cell
  | { t: 'stranded'; port: PortIx; short: number }
  | { t: 'finish'; profit: number; stars: 0 | 1 | 2 | 3 };

export interface LevelStats {
  optimum: number; optimal: number;          // V*, ω (identical boxes merged)
  manifests: number; feasible: number;
  greedy: Record<'freight' | 'density' | 'tank' | 'myopic', number | null>;  // null = stranded
  gap: number; decoys: number; exchange: number; basin?: number; sacrifice?: number;
  strong: [number, number, number]; careful: number;         // S★ S★★ S★★★, C★★★
  ablation: Partial<Record<Mechanic, number>>;               // V*(relaxed) − V*
  di: number; ms: number;
}
```

### 2.4 Simulation is truth, the view animates events

This follows Mise's `Game.take()`.

**The loop:**
1. `Game.act()` pushes `sim.snapshot()`.
2. The sim **mutates logically first** and returns `VoyageEvent[]` (or a `Refusal`).
3. `view.apply(events)` schedules tweens and returns the seconds until settled.
4. The HUD re-reads `sim.project()`.

**Rules:**
- The view never computes rules. Positions come from `(bay, tier)`, so quick taps never fight
  the animation queue.
- `castOff()` returns the whole passage in one list: `castOff`, n × `burn`, `berth`, then the
  next port's discharge. That plays for about 3–4 s, and a tap skips it (`tweens.flush()`).
- Undo is `restore()` plus `view.sync()`, which snaps. Undoing a cast-off returns to the previous
  berth.
- Sound cues fire from the view, at the moment of the animation.
- A refusal triggers a wiggle, a beeper and a one-line toast ("Over her marks by 2 t").

```ts
interface GameViewApi {
  load(level: Level, s: VoyageState): void;  sync(s: VoyageState): void;
  apply(ev: VoyageEvent[]): number;                                  // seconds until settled
  preview(p: Projection | null, box?: BoxId, bay?: number): void;   // ghost while holding
  pick(x: number, y: number): { box?: BoxId; bay?: number } | null;
  hint(h: { box?: BoxId; bay?: number; bunker?: number; castOff?: boolean } | null): void;
  skip(): void; setNight(on: boolean): void; resize(w: number, h: number): void;
}
```

**Input** is one pointer state machine in `Game`:
- **Drag:** a quay box lifts onto the hook, the bay under the finger shows a preview, release
  loads.
- **Tap-tap:** tap a box, then a bay.
- **Take back:** tap the top box loaded this call.
- **Desktop keys:** 1–9 for bays, ⌘Z, +/−, Enter.
- **Hit targets:** invisible per-bay hit boxes, taller than the visuals, for thumbs.

---

## 3. Solver, players, generator

### 3.1 Exact optimum

A **manifest** M is the set of optional boxes shipped; charter boxes are always in it. Fixing M
fixes three things:
- every leg's cargo weight and reefer count;
- every draft check;
- what is aboard at each port.

Fuel then depends only on that per-leg weight profile. Stowage only changes restow fees, since a
restow is reloaded in the same call and moves no weight. So
`V(M) = freight(M) − minFuel(profile(M)) − R·minRestows(M)`, and `V* = max V(M)`.

1. **Manifest table.**
   - At most 16 optional offers (the campaign caps at 14), so at most 65k bitmasks.
   - Per-leg weight, slot count and reefer count are computed incrementally (lowbit trick,
     `Int16Array` per leg).
   - Prune: slots ≤ bays × tiers; reefers ≤ plug slots; cargo ≤ bar.
2. **Fuel DP, memoised by profile.**
   - Forward over (port, fuel on arrival), buying 0..T−f at pump ports.
   - Checks C, both bars, burn + reserve, and the tank. About 1k ops per profile.
   - Measured on the boss-sized draft: 16,384 manifests share 9,564 profiles, which takes about
     10–20 ms in TS. A typical level (≤ 10 offers) takes under 2 ms.
3. **Branch and bound.**
   - UB = freight − fuel. Bucket-sort the manifests by UB (an integer).
   - Walk down the list, calling the stowage oracle, until UB < incumbent. This is exact, since
     restows cost ≥ 0.
4. **Stowage oracle.**
   - First, a greedy stowage: each box goes on the bay whose top has the latest destination ≥
     its own. If greedy finds 0 restows, that is exact.
   - Otherwise, an exact DFS over each call's placements, memoised on (port, canonical bays) and
     pruned by the incumbent.
   - Calls have ≤ 4 boxes, so each takes well under 1 ms.
5. **Plan reconstruction.**
   - The DP's argmin gives the bunkering, the oracle gives the placements, and together they
     form a `Plan`.
   - Ties break deterministically: the earliest cheapest pump, then the lowest bay.

**`solveFrom(state)`** runs the same code from the current state:
- The aboard boxes and `loadedHere` are fixed. Only undecided offers vary.
- The DP starts from `fuel − boughtHere`, because in-call bunkering is refundable.
- The oracle starts from the current bays.

**The hint** is built on it:
- If `solveFrom(now) = V*`, highlight the next action of that plan's current call: a box and
  bay, else a bunker change, else Cast off.
- If not, walk back the undo stack to the latest snapshot that still reaches V\* and offer
  "Belay N steps".
- If the start of this call can't reach V\* either, say where the perfect voyage was lost ("at
  Esbjerg").

**The test oracle** is a ~60-line naive sequential solver: every subset × push order × bunker
amount per call, memoised on (port, bays, fuel). In my Python check it agreed on B2 and B3 and
needed only 1,685 states on B3. It is too slow for bosses, so it is used only on tiny random
levels.

### 3.2 Simulated players

**Sequential greedies** play through `VoyageSim`, so they can get stranded:
- `freight`: highest freight first.
- `density`: highest freight per tonne first.
- `tank`: fill the tank at the first pump, then play `density`.
- `myopic`: an exhaustive search per call over freight loaded − fuel to the next pump.

They bunker by the **gas-station rule**: buy enough to reach the next pump, or more if this pump
is cheaper. The weight of carried fuel breaks that rule, and that is the trap. Their results give
the greedy gap, T1, and the **natural starts** for the editors.

**Manifest editors** run on the table (doc 13).
- The **strong** player starts from a natural start and takes best-improvement moves: add, drop,
  1↔1, 2↔1 and 1↔2. It slips 5% of the time and stops after 20 edits. It runs 64 times and uses
  the gas-station fuel.
- The **careful** player runs H₃ from every natural start plus 6 random maximal loads, with exact
  fuel.

**Outputs:** S★/S★★/S★★★, C★★★, exchange depth X, decoys (1-exchange local optima ≥ 90% V\*), ω,
and DI = 40(1−S★) + 30(1−S★★★) + 30(1−C★★★).

**Ablation** re-solves the level with one mechanic switched off, and stores the change in V\*. The
relaxed versions are:
- one burn band;
- equal prices, or a pump at every port;
- no bars;
- R = 0 with unlimited tiers;
- no heavy rule;
- no reefer burn.

**Thresholds:**
- T3 = V\*.
- T2 = best decoy + 1, if that is above T1. Otherwise the midpoint between T1 and T3.
- T1 = best greedy + 1, capped at T2 − 1. The tutorial passes on any profit above 0.

### 3.3 Generator (offline, Mise's `guided.ts` pattern, simplified)

1. **Spec from the ladder row:**
   - band, mechanics and intro;
   - 2–5 ports with 2–4 offers each;
   - C 10–30, T 6–16, 2–3 bands, rates 1–3, days 1–3, prices 1–3, R 2–4.
2. **Draft:** a random level that honours its mechanics (a `noPump` level gets a no-pump port).
   Freight ≈ weight × legs carried ± noise.
3. **Score:** `Σ linBand(metric, target)` over S★, S★★★, C★★★, X, decoys and gap. Large penalties
   apply when:
   - the intro mechanic's ablation Δ = 0;
   - ω > 1 on B4 and above;
   - a greedy player reaches T3;
   - T1 = T3 outside B1/B2;
   - the T2 decoy is within Hamming 1 of the ★★★ manifest (★★★ must never be bookkeeping).
4. **Mutations:**
   - box weight ±1, freight ±1–2, shift origin/destination, add or remove a box;
   - price ±1, pump on/off;
   - band edge, C, T, a day or a bar ±1;
   - **plant a decoy:** a high-freight box exactly 1 t too heavy for the optimum's band, or a
     cheap-fuel lure.

   A mutation is kept if the score is not worse. Each draft climbs 200–300 steps, with
   4 drafts × 2 seeds per level.
5. **Finalize:** holdout stats, thresholds, the `best` plan, the logbook sentence.

**Cost.** Quick stats take 10–40 ms, so one level takes 15–50 s. **60 levels on 8 processes take
about 5 minutes.**

**`build-levels.ts`** mirrors Mise's builder:
- `LEVELS=`, `RESUME=1`, `SALT=`, `JOBS=8`;
- a checkpoint after every level;
- `authored.ts` overrides. These are L1, L2 (doc 13's "Heavy ships burn more", re-solved = 144)
  and L3 (doc 10's B1).

Any intro level that won't converge in 2 seeds gets authored by hand.

**`audit-levels.ts`:**
- replays every `best` plan through the sim (profit must equal T3);
- re-solves each level;
- checks that no mechanic appears before its intro;
- writes `docs/difficulty.md`.

### 3.4 The 60-level ladder

Each chapter follows doc 13's double sawtooth:
- x.1 B2;
- x.2–x.3 B3;
- x.4 B4;
- **x.5 B5**;
- x.6 B1 delight;
- x.7 B2 twist;
- x.8 B3/4;
- x.9 B4/5;
- **x.10 B6**.

| Ch | Sea / ship | Major (x.1) | Minor (x.7) | Boss |
|---|---|---|---|---|
| 1 North Sea | coaster, 3–4 bays × 1 tier | fuel weighs (L1), bands (L2) | 2 legs, one pump | 2 legs |
| 2 The Coast | coaster | discharge midway | pickups | 3 ports |
| 3 Bunker Calls | coaster, 4 bays | two pumps, two prices | no-pump port | 4 ports, carry vs buy |
| 4 Liner Loop | feeder, 3–4 × 2–3 | tiers + restows | heavy below light | full hold |
| 5 Up the Rivers | feeder | harbour bar | charter cargo | bar + no pump |
| 6 Reefer Run | feeder, 4 × 3 | reefers | ROB reserve | L60 Grand Voyage (5 ports) |

---

## 4. Build order

There is always a playable build from M2 on.

| # | Clock | Milestone | Who |
|---|---|---|---|
| M0 | 0:00–0:40 | **Bootstrap.** `git init`, slug, copy Mise infrastructure, fonts (`@fontsource-variable/oswald`, `sofia-sans`), `index.html` + boot loader. **Lead writes `types.ts` + `rules.ts`**, the authored and fixture levels, and `?lab=` routing. | Lead |
| M1 | 0:40–2:30 | **Parallel modules.** **A Core:** sim, project, solver, stow, tests vs fixtures and the naive oracle. **B Render:** hull, ship, water, quay, cargo, crane on `?lab=ship` (W slider, mock bays). **C Audio:** sfx + ambience on `?lab=sfx`. **D UI:** CSS identity, RouteStrip, DwtBar, Dock, PortSheet, dialogs, ResultCard on `?lab=ui` with mock Projections. **Lead:** Game + GameView shell, input, undo. | A B C D + Lead |
| M2 | 2:30–3:30 | **Vertical slice.** One authored 3-port level end to end: load, bunker, sail, discharge, pickup, finish, result, undo. **First deploy.** Judge readability on a real phone *now*. | Lead merges |
| M3 | 3:30–5:00 | **Rules complete + generator** (A): all 12 mechanics, players, metrics, build/audit scripts. **Juice** (Lead + B): settle spring, crane sway, cells in/out, voyage, stamps, horn, smoke. **D:** map, intro cards, coach, settings. | A, Lead + B, D |
| M4 | 5:00–6:15 | **Campaign:** build 60 (`JOBS=8`), tune bands, author stragglers, `difficulty.md`. Mechanic visuals (reefer skin, bar board, crossed-out pump, pips); night palette. | A, Lead + B |
| M5 | 6:15–7:15 | **QA (§5):** shot matrix, `demo-run` over all 60, interaction scripts, perf, fixes fanned out. | Lead + helpers |
| M6 | 7:15–8:00 | **Ship:** icons/OG, README, `docs/development.md`, final deploy, verify the live `version.json`. | Lead |
| – | 8:00–10:00 | Buffer, then SHOULD items in table order. | |

**Parallelisation rules:**
- Helpers work in **git worktrees** on disjoint folders: A `src/core` + build scripts + tests;
  B `src/render` except `GameView.ts`; C `src/audio`; D `src/ui`.
- The lead owns `types.ts`, `app/`, `game/` and `GameView.ts`, and merges at the end of M1 and
  twice during M3.
- Every helper delivers a `?lab=` page plus screenshots.
- Nothing merges to `main` unless `npm run build && npm test` passes.

---

## 5. Testing and QA

**Unit tests (vitest, under 60 s in CI; heavy runs behind `SLOW=1`):**
- **rules:** band edges, reefer burn, restow semantics, the bar on arrival *and* departure,
  heavy/plug refusals, every Cast-off refusal.
- **sim:** snapshot round-trip; the events for each action; `level.best` replays to T3 for
  **every** level in `levels.json`; 500 random playouts hold the invariants (W ≤ C at departure,
  0 ≤ fuel ≤ T, stacks ≤ tiers).
- **solver:**
  - B2 = 15 (manifest ladder 15/12/12);
  - B3 = 23, unique, with five manifests at 22;
  - L2 = 144 (decoy 141);
  - **decomposition = naive search on 300 random tiny levels**;
  - following the hint from the start reaches V\*.
- **players:** on B3, `freight` gets stranded at P1.
- **generator:** deterministic per seed; a small spec lands in its band.

**Debug URL flags (Mise's set):**
- `?level=N`
- `?debug` (unlock all; overlay with V\*, live best-from-here, band, DI, draw calls; Auto-solve
  and Skip in the pause menu)
- `?demo` (the solver plays with full animation), `?demo=all&fast` (chains the campaign)
- `?port=k` (fast-forward along `best` to berth k)
- `?end`, `?progress=N`, `?reset`, `?slow=0.3`, `?night=1`, `?lab=…`
- `window.game` for puppeteer

**Screenshot pipeline.** `scripts/shots.mjs` drives the existing `shot.mjs` (Metal GPU) against
`vite preview`.
- About 14 canonical URLs:
  - map, and map at `?progress=34`;
  - L1 with coach marks;
  - L2 holding a box;
  - L12 `?port=1`;
  - L35 with a full 3-tier hold;
  - L45 with a bar warning;
  - L55 with reefers;
  - mid-voyage frames (`SHOT_FRAMES`);
  - the 3★ result, the stranded dialog, an intro card, settings.
- Sizes: **390×844@3**, **360×640@2**, 820×1180@2, **1440×900@1**.
- `SHOT_SCHEME=dark` for 4 key screens.
- Output: `.cache/shots/` plus a `contact.html`. The lead reviews the PNGs at every milestone.

**Interaction scripts** (like Mise's `undo-check.mjs`):
- drag a box → the state changes;
- cast off → berth 1;
- undo → identical bays at berth 0;
- a refusal → a toast.

**`demo-run.mjs`** loads `?demo=all&fast` headless and asserts T3 on all 60 levels with zero
console errors. This catches sim/view desync.

**Perf targets** (`SHOT_FPS`):
- at least 55 fps at phone size;
- at most 100 draw calls and 150k triangles;
- `LOW_END` + `AdaptiveRenderScale` as in Mise.

---

## 6. Deployment

Mirror Mise en Place's workflow. The scaffolded `.github/workflows/deploy.yml` already *is* that
workflow, with `__SLUG__` placeholders.

1. Replace all `__SLUG__` with `full-and-down`. That covers the concurrency group, the rsync path,
   `git add`, the commit message and the public-URL poll.
2. `git init -b main`, then `gh repo create Evgeny-/full-and-down --source . --push`. Use the same
   account and visibility as `Evgeny-/mise-en-place`.
3. **Owner action:** add `SITE_DEPLOY_KEY` (the SSH deploy key with write access to
   `evgenyio/evgenyio.github.io`) to the repo's Actions secrets. The agent never handles the
   private key. The workflow's first step fails loudly if the key is missing.
4. **What the pipeline does:**
   - `npm ci && npm test && npm run build`;
   - if this commit is still the latest on main, check out the site repo and
     `rsync -a --delete dist/ site/games/full-and-down/`;
   - commit, retrying rebase-and-push up to 3 times;
   - poll `https://evgeny.io/games/full-and-down/version.json` until it serves this build. The
     `version.json` plugin and `base: './'` are already in `vite.config.ts`.
5. **Deploy at M2** so that problems with the secret, the path or Pages show up at hour 3, not
   hour 9.
6. **Page assets:** `index.html` title/OG tags, `favicon.svg` (the Plimsoll disc),
   `apple-touch-icon.png` and `og.jpg` rendered by `shot.mjs` from `?lab=icon`, and
   `manifest.webmanifest`.

---

## 7. Top risks

| Risk | Mitigation |
|---|---|
| **Information density on a phone**: destinations, weights, freight, prices, days, bands, bars. | The projection does every sum. Port colour + flag pattern is the primary signal. v1 levels mostly have ≤ 4 ports × ≤ 4 offers, and each level adds one idea. Judge the slice on a real phone at M2, before the juice. |
| **★★★ won by one coin of bookkeeping.** | ω = 1 on B4+. The T2 decoy must differ from the ★★★ manifest by Hamming ≥ 2. The logbook sentence names the trap. |
| **The generator doesn't converge.** | Exact solves take milliseconds, so the budget goes to search. `JOBS=8` with `RESUME` checkpoints. Hand-authored fallbacks for intro levels. Ship at 60 levels; extend only if fast. |
| **3D art eats the session.** | Timeboxes: hull 75 min, crane 60, water 45. Placeholders first, `?lab=ship` screenshots, and helper B owns the art. Fallbacks: an extruded-profile hull, `arc()` hops, flat banded water. |
| **Parallel agents collide.** | `types.ts` frozen at M0, disjoint folders, worktrees, lab pages, fixed merge points, a green build before every merge. |
| **Sim/view desync** on fast taps, undo during the voyage, or skip. | Logical first, visual after. Undo flushes and snaps. `demo-run` over 60 levels plus random-playout tests. |
| **Deploy blocked** by a missing secret or repo. | Ask the owner for the key at M0 and deploy at M2. |
| **Phone performance.** | One shadow map, no post-processing, `LOW_END`, `AdaptiveRenderScale`, an FPS gate in `shots.mjs`. |
| **Fonts or npm unavailable.** | Install at M0. Fallback stack: `Oswald, "Arial Narrow", system-ui` with `font-stretch: condensed`. |
| **Scope creep**: 25 mechanics and 32 juice items were proposed. | This document is the gate. LATER needs an explicit decision. SHOULD items are pulled in table order only after M6 is green. |
