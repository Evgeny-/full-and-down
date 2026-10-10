# 22 — Critic: the seafarer and the UX designer

*Two chairs at once. The first is a second officer who runs loadicator figures and bunker plans on
container feeders and product tankers: the friend this game is for. The second is a mobile UX
designer who has watched casual players struggle with puzzle games on phones. The design under test
is the recommended one: Loop B "Port Rotation" in the Signal Hoist style, with the ship broadside,
the quay below, the passage strip above and a dock of buttons.*

---

## Part 1 — The seafarer's review

### 1.1 Would I play it?

Yes, and I'd post it in the crew group chat. Loop B is my job with the boring parts cut out. It has a
load list per port and a bunker plan. Its boxes are **coloured by port of discharge, which is exactly
what a printed bay plan looks like**. And the Chief Engineer won't sign if the figures don't close.

Doc 11's honesty principle is right. I forgive fuel at 30% of deadweight and a burn that doubles at
a stripe. I don't forgive a wrong sign or a wrong word.

**What rings true:**
- the fuel train, which is an honest bunker plan
- Bravo while bunkering, Q on arrival, Blue Peter to sail
- "showing her red" when she's light
- restows via the quay
- bunkering after the bar
- "cubed out means fuel is free"
- the barge lying off the far side
- rank stripes

**What would make me close the app:**
- **Dry tanks as the triumph.** That's doc 10's ★★★ and doc 13's "ROB 0.0 — on fumes". Arriving
  empty is an incident report: you need fuel to manoeuvre onto the berth. Perfection is **ROB
  exactly on the company minimum**. The puzzle doesn't change: draw a grey **MIN ROB** line from
  level 1 and call that "empty".
- **Ten single-leg knapsack levels** before a second port. Doc 13's chapter 1 does this, and doc 11
  holds bunker ports back to L21 and stacks to L31. That's the accounting half of my job. Get to the
  rotation by L3.
- **Film-pirate talk.** Nobody on a merchant bridge says "Belay that".

### 1.2 Authenticity check

| Claim (doc) | Verdict | Fix |
|---|---|---|
| Deadweight = cargo + bunkers + water + stores + constant (11 #1) | Correct | Add a fixed grey "STORES 1 t" block to the DWT bar. It's free authenticity. |
| A laden ship burns more; Admiralty Δ^⅔·V³ (11 #3) | Correct. The real gap is 10–20%, not ×2. | Fine as is. Name the bands **LIGHT / LADEN / DEEP**. |
| "Cubed out, fuel is free" (11 #4) | Correct, and it's how operators think | Keep. |
| "Below the reserve, a tug tows you in" (11 #2) | Wrong. You arrive and write a report. | Keep the tow only for genuinely dry tanks (expert mode). |
| Redelivery: "the charterer pays for what's left" (11 #5) | **Wrong way round.** Under NYPE, the *owners* buy back the bunkers on redelivery. | Tooltip: "Owners buy back what's left, for less than you paid." That gives a rule: leftover fuel refunds at half price. |
| Port draft limit; "touch bottom with a thunk" (11 #6) | The limit is right; a grounding is a casualty | Use "The pilot won't take her in." |
| FWA: "a free extra block when you sail from a river port" (11 #7, 10) | **Wrong.** At her F mark in fresh water she displaces the same as at S in salt water. FWA only stops you *under*-loading. | Keep the true half: arriving from sea, she sinks deeper against a river port's limit. The real free tonnes are the fuel burned on the river passage. Merge that with #8 as "burn down to the line". |
| Seasonal zones; T and W 1/48 of summer draft from S (11 #8) | Correct, and the CoC exam classic | "Bunker just after a winter line" is muddled, because the W mark applies everywhere inside the zone. The real pro move: take fuel where the deeper mark applies and burn it before the line. |
| ECA 0.10% vs 0.50%; Med SECA since May 2025 (11 #15) | Correct | Simplify to "a leg that touches green burns blue all the way", since changeover must finish before the line. |
| Rotation, restows, heavy below light, reefers, IMDG (10, 11) | Correct | |
| Laycan for box cargo (11 #23) | A voyage-charter word | For boxes, say **berth window** and **cut-off**. |
| "The mast flexing" under a bridge (11 #10) | Masts don't flex | Coasters have a **hinged mast** that folds. It's real, and a great animation. |
| Flags P, B, Q, V and dressing overall (12) | All correct | Keep B, P, Q and V for their UI meanings, never as port flags. |
| "Burn by displacement (cargo + fuel)" (13) | Displacement includes the lightship | Say "weight aboard". |
| "Tramp" for the choose-your-cargo format (10) | Tramp means *no fixed route*, the opposite of a rotation | Call the formats **Spot** (you choose) and **Contract** (the whole list sails). |
| Results as a Mate's Receipt (11) or Port Clearance (12) | Wrong documents: issued at loading and on departure | Use the **Arrival Report** (drafts, ROB), signed off **FWE**. |

### 1.3 The moment

> She's on her summer mark at Kiel, every Aarhus box is on top, and in Oslo the Chief sounds the
> tanks and reads exactly the reserve I planned. No restows. FWE.

The game can detect three remarks in that, and they should be its signature:
- **ON THE MARK**: deadweight used to the tonne at departure.
- **CLEAN STOW**: no restows all voyage.
- **ON THE RESERVE**: ROB equals the minimum at the last berth.

All three together means she's dressed overall. The generator should prefer ★★★ optima that earn
at least two of them.

### 1.4 Words

| Use | Avoid |
|---|---|
| box (TEU/FEU only as a subtitle) | crate (breakbulk, and a landlubber word) |
| load, discharge, restow, overstow | unload, dig out |
| bunkers, to bunker, stem, $/t | fuel "cells" in text (cells are only the picture) |
| ROB, MIN ROB, reserve | "on fumes" or "dry" as praise |
| draft, marks, Plimsoll, LIGHT / LADEN / DEEP | displacement, "weight class" |
| leg, port call, rotation, port codes (KIE, AAR, OSL) | stop, node |
| **SAIL** on the Blue Peter button; "Let go all lines", "Full away" and "FWE" as captions | "Let go" on the button (it also means dropping anchor) |
| Arrival Report, Notice to Mariners, Company Circular, Master's Ticket | Mate's Receipt, Port Clearance, "Captain's licence" |
| t for tonnes | **MT** for tonnes (on a box ship, MT means *empty*) |
| ship, she | boat, ahoy, matey, belay that |

**Give each constraint the voice of the person who would really stop you:**
- **Chief Engineer**: fuel
- **Chief Officer**: marks and stowage
- **Pilot**: draft
- **Harbour Master**: berths and air draft
- **The Office**: money

For example: "CHIEF: 2 t short for the Oslo leg. No bunkers at Aarhus." It's authentic, and it's
better error UX than a red toast.

### 1.5 Three I want, three that bore me

**I want:**
1. **Carry vs buy with a no-pump port** (tankering). This *is* my friend's sentence.
2. **Draft limits** at a bar or river port: discharge first, bunker after the bar, and sink deeper in
   fresh water.
3. **Burn down to the line**: seasonal zones plus the river-passage allowance. It's the exam question
   everyone remembers, and it feels like magic.

**These bore me:**
1. **Tank discipline** (11 #14). It's engine-room paperwork, a sorting chore. One "sealed stem" level
   at most.
2. **Trim, hog/sag and list by moments.** The loadicator's job. On a 55 px hull it turns into
   arithmetic. A clinometer bubble as decoration is enough.
3. **Weather, lashing, laycan and tide calendars.** Waiting at anchor is the dullest part of the job.
   Keep eco speed only.

### 1.6 What the designers missed

- **Bunker deviation.** An off-route hub (the Skaw, Gibraltar, Fujairah): a day of extra burn, no
  cargo, cheap fuel. It's the most real bunker decision there is.
- **Minimum stem.** The barge sells in lots of 3, which creates real "4 or 7?" decisions.
- **Empties (MT boxes).** They weigh 1 t, pay little and can come off at *any* later port: filler
  cargo and a stowage release valve.
- **Optional port of discharge.** "OPT AAR/OSL": you choose where it comes off.
- **A tanker world.** Liquid parcels where you choose the quantity, grades that can't share a tank,
  and Bravo flying for cargo too. Half my career is tankers.
- **Reserve counted in days** (a late twist). MIN ROB is one day's burn at your band, which is how
  real company orders are worded.

---

## Part 2 — UX review

### 2.1 The first three minutes

**0:00–0:10.** Title, tap, Blue Peter, horn. On first launch go **straight into L1**, and show the map
only after the first report.

**0:10.** The ship sits broadside at the quay, with four boxes on the apron and a bunker card. People
don't read; they tap the most saturated thing, so the first box pulses. Three things will confuse
them:
- **"Is the red bad?"** A coach mark explains it, and overload uses hazard tape, never red.
- **"Is 4 the weight or the money?"** The weight is the big stencil **4t** on the box face. The
  freight is a small $ tag below it.
- **"Where does it go?"** Every legal stack glows as soon as a box is picked up.

**0:30–1:00.** Players load everything, as they always do. She settles onto her marks, and SAIL says
"CHIEF: no fuel aboard". They tap +, and it's blocked: "Full. Fuel weighs too. Land a box." **The
whole game in one aha, discovered rather than told.** L1's boxes fill the deadweight exactly.

**1:00–2:00.** They land a box, tap NEED and sail. A six-second passage: the fuel train drains to the
MIN line, she berths, the Arrival Report comes up with its stamps.

**2:00–3:00.** L2 adds the stripe. They load greedily and watch the leg's burn jump from 2 cells to 4
as the waterline crosses. They land the best box, and win.

### 2.2 Tutorial script

Rules for coach marks: one at a time, never covering their target, and a tap advances an
informational line. From L4 on there are no coach marks, only new-rule cards (wireframe D).

**L1 "Fuel weighs too"**: one leg, one band, MIN ROB 1 t. Boxes of 4, 3, 2 and 1 t fill her 10 t.
1. [hull] "Red showing means room aboard."
2. [first box, pulsing] "Tap a box to pick it up."
3. [glowing stack] "Tap the ship to load it."
4. [all loaded] "Down to her marks. Now she needs fuel."
5. [+ blocked] "No room. Fuel weighs too. Land a box."
6. [boxes aboard] "Tap a box aboard to land it."
7. [route leg] "This passage burns 2 t. Keep 1 in reserve."
8. [NEED] "Tap NEED for just enough."
9. [SAIL] "All clear. Hoist Blue Peter and sail."
10. [report] "On the mark, on the reserve. Perfect."

**L2 "Heavy ships burn more"**: one leg, two bands.
1. [hull stripe] "Past this stripe she burns double."
2. [first crossing, cells pop] "See? This passage now burns twice as much."
3. [profit rule] "★ needs $14. Can you get there?"
4. (only after 45 s below ★) "Lighter can pay more. Try landing one."

**L3 "Two calls"**: KIE → AAR → OSL, with bunkers at Kiel only.
1. [strip] "Two calls: Aarhus, then Oslo."
2. [box faces] "Colour and letter say where it goes."
3. [AAR tab] "Tap Aarhus to see her there."
4. [discharge ghosts] "Aarhus boxes come off. She rises."
5. [leg 2 cells] "Lighter ship, cheaper leg."
6. [KIE tab] "Tap any port to change its plan."
7. [SAIL] "Whole voyage clear. Sail it."

### 2.3 Information at phone size

| Information | Always visible | Behind a tap |
|---|---|---|
| Box weight | A big stencilled **4t** on the box face (Oswald 600, 18 px) | |
| Freight | A $ tag under the box, only while it's on the quay | $/t and legs carried (long-press) |
| Destination | Box colour + port letter + flag sticker | Full port name |
| Fuel aboard | Amber cells in the tank cutaway *and* in the DWT bar | Which port each stem came from |
| Burn per leg | Amber cells under each leg arrow, the arrow tinted by band | "2 days × 2 t/day (LADEN 10–15 t)" (tap the leg) |
| Band thresholds | Zones under the DWT bar; a chip "▲1 t to DEEP" | The full band table |
| ROB per port | "ROB 2 ✓" under each port node | |
| Fuel price | "$1/t" at each node, or "no pump" | |
| Profit vs stars | A rule in the HUD: marker plus ★ / ★★ / ★★★ notches with $ values | Freight − bunkers − restows |

**The key change to doc 12: the hull can't be the readable gauge.** At 55 px of hull side, 20
tonne-ticks are 2.7 px each. Keep the hull for the feel (the sinking, the red, the mark), and add a
**horizontal deadweight bar** under the waterline:
- 358 px wide, one cell per tonne
- cargo cells in port colours, fuel in amber, stores and MIN in grey
- band zones beneath

That retires both the loupe and the X-RAY button. The tanks are always shown, because fuel *is* the
game.

**Port colours.** There are at most four destinations per level. Use cobalt, teal, plum and slate,
each with a letter. **Never ochre**: it collides with fuel amber, which must stay the only orange.

### 2.4 Interaction design

- **Loading: tap the box, then tap the stack, and drag also works.**
  - A dragged box hides its target under the thumb, so tap is primary. Casual players try dragging
    first, so accept both.
  - On pick-up, show the weight preview straight away: a ghost waterline, pulsing DWT cells, and +1
    on any leg that would grow.
  - Each legal stack shows a stowage badge: ✓, or "restow at AAR −$3".
  - The whole stack column is the hit area, at least 64 px wide, so a phone level has at most 4
    stacks.
- **Removing.** Tap a top box loaded *at this call* and it returns to the quay. A box from an earlier
  call shows a padlock with "Loaded at KIE. Edit there →".
- **Fuel.** A stepper `[−] 6 [+]` with hold-to-repeat, plus **NEED**: the minimum to reach the next
  pump with MIN ROB. The handwheel is only the animation. Never drag an exact integer.
- **Port tabs instead of "back to the previous port".**
  - Doc 10's sequential play (plan, sail, discover the problem at P1, rewind) makes going back a
    rewind through animation. All offers are visible anyway, so make the passage strip a **tab bar**.
  - Tap a port, or swipe the ship sideways, to see her as she *will be* at that call and plan it
    there.
  - Edits ripple forward. A later action that becomes illegal bounces back to its quay, and its tab
    gets a red badge.
  - SAIL replays the voyage exactly as planned. This is also doc 13's editor model.
- **Intermediate ports.**
  - Discharge is automatic: ghost boxes lift off with +$ pops.
  - Restows go back to their original stack when that's legal; otherwise they wait on the quay with
    an orange tag.
  - Loading and bunkering are the player's choices.
  - A port with nothing to decide gets a dimmed "auto" tab.
- **Undo.** One global stack. Each undo flips to the tab where the action happened. A run of fuel
  taps merges into one step.
- **Casting off.**
  - SAIL (bottom right) lights when every call is safe *and* the plan meets ★. Otherwise a reason
    chip in the objector's voice offers "Show me", which jumps to the offending tab.
  - The voyage plays in 6–8 s for three ports (tap for 2×). The full cinematics run on world openers
    and on ★★★.
- **The dock** holds UNDO, PILOT (hint), PLAN and SAIL. PLAN opens a manifest table, and sailors live
  in spreadsheets.

### 2.5 Wireframes (390 px; notes outside the frame)

**A. The port call** (level 8, at Kiel). Ship: 18 t deadweight; LIGHT ≤ 9 t, LADEN 10–15 t, DEEP
16–18 t. Aboard: 1 t of stores, 8 t of cargo and 6 t of fuel. Leg 1 burns 4 t, Aarhus takes 4 t off,
and she drops to LIGHT. Leg 2 then burns 1 t, and she arrives on the reserve.

```
┌──────────────────────────────────────────────┐
│ ‖  ⌂      8 · TWO CALLS, ONE PUMP      ☆☆☆   │  HUD
│ $15 ━━━━━━━━━━━━━━━━━━●━━━┿━━━━━━┿━━━━━┿     │  profit rule
│                          ★12    ★★16  ★★★18  │
├──────────────────────────────────────────────┤
│ ▐KIE▌━━ 2d ━━▶  AAR  ━━ 1d ━━▶  OSL          │  port tabs
│ $1/t  ▮▮▮▮ −4   no pump   ▮ −1   final       │  burn per leg
│       LADEN     ROB 2 ✓  LIGHT   ROB 1 ✓     │  ROB forecast
├──────────────────────────────────────────────┤
│                P                             │  Blue Peter
│   ▐▀▌      ┌────┐  ┌────┐  ┌────┐            │
│   ▐ ▌      │ O3 │  │    │  │    │            │  stacks: whole
│   ▐ ▌      │ A4 │  │ O1 │  │    │            │  column = target
│ ══╧═╧══════╧════╧══╧════╧══╧════╧═══◣        │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (S) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓◣         │
│ ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈        │
│   ░░░░░ red showing: 3 t room ░░░░░          │
├──────────────────────────────────────────────┤
│ ▒▤▤▤▤▤▤▤▤▮▮▮▮▮▮▯▯▯|S  15/18 t  ▲1 to DEEP    │  DWT bar
│ LIGHT 1/d ······│LADEN 2/d ····│DEEP 3/d     │  band zones
├──────────────────────────────────────────────┤
│ QUAY · KIEL                 BUNKERS · $1/t   │
│ ┌────┐ ┌────┐ ┌────┐       ┌───┬─────┬───┐   │
│ │A 2t│ │O 2t│ │A 1t│       │ − │  6  │ + │   │  thumb zone
│ └─$3─┘ └─$5─┘ └─$1─┘       └───┴─────┴───┘   │
│                            [   NEED 6   ]    │
├──────────────────────────────────────────────┤
│ [↶ UNDO] [? PILOT] [≡ PLAN]  [ P   SAIL ▸ ]  │  dock
└──────────────────────────────────────────────┘
 ▒ stores  ▤ cargo (port colour)  ▮ fuel (amber)  ▯ spare
```

**B. The voyage moment** (chart mode, top-down).

```
┌──────────────────────────────────────────────┐
│ LEG 1 OF 2 · KIE ▶ AAR · DAY 1     [2×] [»]  │
│ KIE ━━━━━━▶━━━━ AAR ─────────── OSL          │  strip shrinks
│ ▮▮▮▮▮▯ fuel        ROB 2 ✓         ROB 1 ✓   │  train drains
├──────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓  buff coast        ·14    (A) AAR    │
│ ▓▓▓▓▓▓▓▓▓      ·18  ~ isobath ~  ╱           │
│ ▓▓▓▓▓▓▓▓▓▓▓▓            ·22     ╱            │
│ ▓▓▓▓▓▓▓▓▓      ══▶ ≈≈ wake     ╱ magenta     │  ship token
│ ▓▓▓▓▓▓▓    ·16      ╱‾‾‾‾‾‾‾‾‾‾  track       │
│ ▓▓▓▓▓    (K) KIE  ╱             ✧            │
│ ▓▓▓           ○ ○ ○  amber puff = 1 t        │  cells fly to
├──────────────────────────────────────────────┤  the funnel
│ LADEN · 2 t/day                 FREIGHT $0   │
│ next: AAR · +$9 · ROB 2 · rises to LIGHT     │  what to expect
└──────────────────────────────────────────────┘
```

On arrival there's a 3-second automatic sequence: Q goes up, the crane lifts the A boxes with +$
pops, she rises, and the freight counter ticks.

**C. The results card.**

```
┌──────────────────────────────────────────────┐
│       (Oslo quay · dressed overall)          │
│ ┌──────────────────────────────────────────┐ │
│ │ ARRIVAL REPORT   Nº 008   OSL   FWE 0640 │ │
│ │                                          │ │
│ │          ( ★ )   ( ★ )   (   )           │ │  stamps
│ │                                          │ │
│ │ Freight delivered                 $ 31   │ │
│ │ Bunkers  KIE 8 t × $1            −$  8   │ │
│ │ Restows                          −$  0   │ │
│ │ ──────────────────────────────────────── │ │
│ │ NET                               $ 23   │ │
│ │ $ ━━━━━━━━━★━━━━━━━━━★★━●━━━━★★★         │ │
│ │                                          │ │
│ │ REMARKS  ✓ On the mark at KIE            │ │
│ │          ✓ Clean stow                    │ │
│ │          ✗ ROB 3 t, min 1: 2 t extra     │ │
│ │ Best plan earns $28. Look at bunkers.    │ │
│ └──────────────────────────────────────────┘ │
│ [ ↺ IMPROVE PLAN ]       [ P  NEXT VOYAGE ]  │
└──────────────────────────────────────────────┘
```

After ★★★, the "Best plan" line is replaced by doc 13's logbook line naming the trap.

**D. The new-rule card**, shown once on the gentle level that introduces the rule. Geography rules
arrive as a Notice to Mariners; company rules (reserve size, restow fees) as a Company Circular.

```
┌──────────────────────────────────────────────┐
│     (harbour dims; Hamburg depth board)      │
│ ┌──────────────────────────────────────────┐ │
│ │ NOTICE TO MARINERS        Nº 21 · ELBE   │ │
│ │ ════════════════════════════════════════ │ │
│ │ HAMBURG: MAX 12 t ABOARD ON ARRIVAL.     │ │
│ │                                          │ │
│ │   ⟨ship 14 t⟩ ━━ burns 2 ━━▶ ┃12┃ ✓      │ │  3 s loop:
│ │   ⟨ship 15 t⟩ ━━ burns 2 ━━▶ ┃12┃ ✗      │ │  pass / refuse
│ │   PILOT: "Not at that draft."            │ │
│ │                                          │ │
│ │ Arrive light: burn it off,               │ │
│ │ discharge first, or bunker after.        │ │
│ │                                          │ │
│ │                           [  NOTED  ]    │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 2.6 Making a mistake feel fair

1. **Cause and effect share a frame.** The stripe flashes on the hull *as* the leg gains cells *as*
   the profit drops.
2. **Every block names the constraint, the port and the amount**, in the objector's voice. Never just
   "invalid".
3. **Red means it can't be fixed downstream.** A shortfall the next pump can cover is amber ("buy 3
   at AAR").
4. **The playback is the projection.** The voyage never differs from what the strip promised.
5. **Below ★★★, the report says how far off and where to look.** After ★★★, the logbook line names
   the trap.
6. **Restows show their cause.** A thin line links the lifted box to the buried box that forced it
   off.
7. **★★★ differs from ★★ structurally**: other cargo, another pump or another stowage, never one tonne
   of fuel. Missing a star by $1 feels like arithmetic, not insight.

### 2.7 Accessibility

- **Colour blindness.** Port identity is the letter first, the flag pattern second and colour third.
  Bands use a navy value ramp with 1/2/3 burn pips, never green/yellow/red. Overload is hazard tape.
  Check protan simulation: flag red and black merge for protans.
- **Text.** At least 12 px for small-caps labels and 14 px for any number. Oswald at weight 500 or
  more. Coach marks at 16 px. Contrast at least 4.5:1.
- **Reach.** The quay, stepper and dock (everything tapped often) sit in the bottom 45%. The tabs are
  at the top but also reachable by swiping the ship. A left-handed option mirrors the dock.
- **Also.** Targets at least 44 px. Under `prefers-reduced-motion`, a one-second voyage summary.
  Haptic ticks per tonne. Nothing is conveyed by sound alone.

---

## Part 3 — Verdicts

| Idea (doc) | Seafarer | UX | Verdict |
|---|---|---|---|
| Loop B as the core (10) | My job, the good half | Dense, but tabs tame it | **ACCEPT** |
| Loop A as onboarding (10) | Accounting | Teaches gestures | **MODIFY**: L1–2, then breathers only |
| Loop C path drawing (10) | Bars are real | Fiddly with thumbs | **REJECT**; draft limits move into B |
| Step bands, fixed at departure (10) | Like laden/ballast figures | Readable | **ACCEPT**, named LIGHT / LADEN / DEEP |
| ★★★ on dry tanks; leftover fuel worthless (10, 13) | An incident report | – | **MODIFY**: MIN ROB line, ★★★ = on the reserve |
| Perfect information (10) | Load lists come early | Fairness | **ACCEPT** |
| Sequential calls + "back to port" (10) | – | Rewinds through animation | **MODIFY**: port tabs, then sail |
| Restows reloaded by hand (10) | Correct | Busywork | **MODIFY**: auto-return when legal |
| Tramp / Charter formats (10) | Wrong word | – | **MODIFY**: Spot / Contract |
| Draft limits as the first add-on (10, 11) | Daily life | One number per port | **ACCEPT**, chapter 2 |
| FWA as a free tonne (10, 11) | Physically wrong | – | **MODIFY**: arrival draft + river-burn allowance |
| Load-line zones (10, 11) | The exam classic | Needs chart tints | **ACCEPT**, mid-campaign |
| Bunker prices, no-pump ports (10, 11, 13) | The brief itself | Price at the node | **ACCEPT** by L7, not L21 |
| ROB reserve (11, 13) | Correct | One grey line | **ACCEPT** from L1 |
| Redelivery window (11) | Real; tooltip wrong | A good format | **ACCEPT**, with the buyback fixed |
| Cubed out / weighed out (11) | Real | Needs slot limits | **ACCEPT** |
| Tank discipline (11) | Paperwork | A sorting chore | **REJECT** |
| Trim, hog/sag, list (11; 13 ch. 5) | The loadicator's job | Moment arithmetic | **REJECT** as a chapter |
| Ballast, air draft (11) | Real | An inverted limit is fresh | **ACCEPT** late, with the hinged mast |
| Heavy below light, reefers, DG, hatch covers (11) | Real | Spatial and readable | **ACCEPT** as twists |
| Speed, laycan, weather, tides (11) | Bookkeeping | Calendar UI | **MODIFY**: eco speed only |
| Vocabulary (11) | Mostly right | – | **MODIFY**: drop Belay that, Mate's Receipt, Let go |
| Name "Full & Down" (11, 12) | The right trade phrase | Short | **ACCEPT** |
| Signal Hoist; flags mean their action (12) | Grin-worthy | High contrast | **ACCEPT** |
| Ports as flags (12) | Fine | Patterns blur at 14 px | **MODIFY**: letter first; no B, P, Q or V |
| Hull as the gauge, loupe, X-RAY (12) | The hull is lovely | Unreadable past ~12 t | **MODIFY**: add a DWT bar; drop loupe and X-RAY |
| The fuel train (12) | It *is* a bunker plan | The best idea in the set | **ACCEPT** |
| Drag with ghost waterline; handwheel (12) | – | Occluded, imprecise | **MODIFY**: tap-tap + drag; stepper with NEED |
| Chart-mode voyage (12) | Lovely | Long when repeated | **ACCEPT**, 6–8 s, skippable |
| Port Clearance clipboard (12) | Wrong document | Good layout | **MODIFY**: Arrival Report with remarks |
| Configuration model, live projection (13) | – | Matches tabs | **ACCEPT** |
| SAIL disabled with a named reason (13) | "The Chief won't sign" | Never lose to a misclick | **ACCEPT**, with voices |
| Measured stars shown on a bar (13) | Like par | Motivating | **ACCEPT**; ★★★ must differ structurally |
| Ten single-leg levels; stacks in ch. 4 (13) | Boring | Slow | **MODIFY**: two calls at L3, stacks at L11 |
| Hints: word, bearing, mark (13) | "Ask the pilot" | Good escalation | **ACCEPT** |
| Logbook line naming the trap (13) | Like a debrief | Closure | **ACCEPT** |
| Captain's licence mode (13) | Wrong title | An expert option | **MODIFY**: "Master's Ticket" |
| Rank stripes, world chart (11–13) | Real ranks | A Mise-style map | **ACCEPT** |

### Top 10 recommendations

1. **Make MIN ROB the zero.** A grey reserve line from L1. ★★★ celebrates ON THE MARK, CLEAN STOW
   and ON THE RESERVE, never dry tanks.
2. **Plan the whole rotation in port tabs, then sail.** Edits ripple forward, later calls that break
   get badges, and the voyage replays the plan. This replaces "back to the previous port".
3. **Tap to pick, tap to place, with drag too.** The weight preview shows on pick-up, and each stack
   carries a stowage badge.
4. **Add a horizontal deadweight bar.** One cell per tonne, with band zones underneath. The hull keeps
   the drama. Drop the loupe and X-RAY.
5. **The route strip is the bunker plan.** It shows:
   - port codes as tabs
   - $/t or "no pump" at each port
   - leg burn as amber cells tinted by band
   - the ROB forecast at each port

   Tap a leg to see the multiplication.
6. **A bunker stepper with NEED** on a quay-side card. Amber means fuel and nothing else.
7. **Build L1 around the natural mistake.** Every box fits her to the marks, so there's no room for
   fuel, so land one. After that:
   - two calls at L3
   - a second, dearer pump at L7
   - two-high stacks with restows at L11

   Single-leg levels survive only as breathers.
8. **Every block speaks in a voice** (Chief, Mate, Pilot, Harbour Master, Office), with the amount,
   the port and a "Show me" jump. Red means "can't be fixed downstream".
9. **Fix the errors a sailor will spot:**
   - the FWA free tonne
   - the redelivery buyback
   - the winter-line wording
   - "displacement"
   - "crate"
   - "Belay that"
   - "Tramp"
   - Mate's Receipt / Port Clearance → Arrival Report
   - MT for tonnes
10. **Add the real decisions the designers missed:**
    - bunker deviation to an off-route hub
    - minimum stems
    - empties and optional-discharge boxes
    - later, a tanker world
