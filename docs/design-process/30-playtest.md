# 30 — Blind playtest (30 levels)

Tester: one thoughtful puzzle player. I used only `bun scripts/playtest.ts show/try`, with no source, solver, levels.json or docs. I worked on paper (small arithmetic, no brute-force code).

How to read the table:
- **Att★ / Att★★★** count the plans I submitted with `try` before I got that star level. I usually worked out a plan on paper first, so 2 means "my instinct failed, then my reasoned plan worked". The paper work behind it is noted where it was large.
- **Instinct ★?** asks whether my first, instinctive plan (greedy: best boxes, fill her up) earned at least ★. Ideally the answer is "no" from L2 on.
- **Diff** is how hard the level felt, from 1 to 10.
- **Kind** is *aha* (one insight cracks it) or *arith* (grinding knapsack sums).

| Lvl | Name | Att★ | Att★★★ | Instinct ★? | Diff | Kind | The trick |
|---|---|---|---|---|---|---|---|
| 1 | Fuel Weighs | 2 | 2 | no (overweight) | 1 | tutorial | Fuel counts toward deadweight, so leave the 2 t box. |
| 2 | The Stripe | 2 | 2 | no (overweight) | 2 | small aha | Two 3 t boxes under the 10 t stripe beat the 4 t $10 box. ★ = ★★ ($6). |
| 3 | Two Calls | 2 | 2 | no ($10) | 3 | aha | Same as L2: leave the $10 5 t box so the 2-day leg stays ≤ 9 t. ★ = ★★. |
| 4 | Overload | 2 | 2 | no ($13) | 3 | aha | Heavy boxes come off at the first call. Sail leg 2 with only the 2 t $12 box (band ×1). |
| 5 | Full & Down | 2 | 2 | no ($21) | 2 | arith | Knapsack: swap the 1 t $4 box for the 3 t $7 box. ★ = ★★. |
| 6 | Leave Room | 2 | 2 | no ($12) | 3 | aha | Keep a stack and some weight free for the $12 pickup at ABZ. |
| 7 | Coastwise | 2 | 2 | no ($18) | 4 | arith | Pure 11 t knapsack. Fuel at $1 never matters. |
| 9 | Feeder Charter | 2 | 2 | no (overweight) | 5 | arith | The 12–12 t band is never worth it. A 1 t through-box fills the gaps on a 3-leg knapsack. |
| 10 | Dry Port | 2 | 2 | no (1 t short) | 3 | small aha | Carry fuel through the dry port and drop the 4 t long-haul box. A breather. |
| 13 | Channel Gale | 2 | 2 | no (fuel short) | 5 | aha | Ignore the shiny $12 VLI boxes. The dry CQF means fuel rides leg 0, so fill legs 1–2 with CQF pickups. |
| 15 | Never Bury | 2 (+1 harness NaN) | 2 | no ($28) | 3 | aha | Stack both ANR boxes in one stack to keep a stack clear for the SOU pickup. Same idea as L6. ★ = ★★. |
| 18 | Channel Charter | **1** | 2 | **yes, ★★ ($28)** | 7 | aha + arith | Slots are scarce, so leave the 2 t $9 ANR box. The dry ZEE makes leg 2 carry leg 3's fuel. |
| 19 | Over the Bar | 2 | 2 | no (bar) | 4 | aha | The Bremen bar caps cargo at 7 t, so spend leg 0's spare capacity on the short-haul $7 box. ★ = ★★. |
| 22 | Low Water | 2 (★★) | 3 | no (fuel short) | 8 | arith | Dry NTE plus the bar make a 3-leg knapsack. The final +$1 is swapping box 7 for boxes 5 and 8. |
| 27 | River Charter | 1 | 1 | naive: no ($17) | 6 | aha | MHG-bound boxes block HAM boxes, so take only one LGG→MHG box. 9 t of fuel rides through dry BRE. |
| 28 | Price Board | 2 | 2 | no ($27) | 4 | aha | Tanker $1 Dakar fuel and drop the $5 box to make room for it. ★ = ★★. |
| 32 | On the Mark | 2 | 2 | no ($6) | 3 | aha (repeat) | Same freight from short-haul boxes keeps leg 2 light. This is the L4 idea again. ★ = ★★. |
| 33 | Barge Lots | 2 | 2 | no ($15) | 4 | aha | Buy 3 lots at SCT so you skip GIB's lot of 3. ★ = ★★. |
| 36 | Bunker Charter | 2 | 2 (long paper) | no (overfilled tank → band ×3) | 8 | aha + arith | The tank cap rules out tankering to ABJ, so you must buy the $3 lot of 4. That lot makes leg 3's band free. Leave a slot for the LIS box rather than the 1 t BJL box. |
| 37 | Heavy Below | 2 | 2 | no (overweight) | 4 | aha | Heavy-below turns the 1 t KOP→GIT box into a stack-waster. Sail nearly empty from KOP. ★ = ★★. |
| 42 | Plugged In | 2 | 2 | no ($31) | 5 | aha | The 1 t $9 reefer steals a plug from the two $12 PIR reefers. ★ = ★★. |
| 45 | Liner Charter | 1 (★★) | **not reached, best ★★ $18** (4 tries + ~15 plans on paper) | no (fuel short) | 9 | arith wall | See below. Heavy-below makes the 1 t box a dead stack. I found many different plans that all land on $18. |
| 46 | Sealed | **1** | 4 | **yes, ★ ($28)** | 7 | real aha | Drop the best-$/t box (1 t $9) to free a slot and weight for both SCT pickups. |
| 51 | Cold Charter | 2 | 2 | no ($2) | 4 | aha | The $12 FNC reefer is a trap. Put the dry VLC boxes in the plugged stack. |
| 55 | Winter Mark | 2 | 2 | no (winter mark) | 3 | arith | The zone caps leg-0 cargo at 11 t. Leave a slot for the AES 5 t box. ★ = ★★. |
| 60 | Low Bridge | 2 | 2 | no ($24) | 5 | aha | Fuel is ballast for the bridge, then burns on leg 2. Pick light TOS cargo plus the short THN boxes. ★ = ★★. |
| 63 | Winter Charter | 2 | 2 | no ($28) | 6 | aha | The $12 REY→HFT box is the trap. Contracts force band ×3 anyway, so fill to the cap with the 5 t GOH pickup. |
| 64 | Outward Bound | **1** | 2 | **yes, ★ ($42)** | 5 | aha | Tanker $1 HAL fuel and carry both short-haul REY boxes. The pickups fill the bar. |
| 68 | Full and Down | 2 | 2 | no ($11) | 3 | aha (3rd repeat) | Same as L4 and L32. ★ = ★★. |
| 72 | Grand Voyage | 2 | 2 (~8 plans on paper) | no (fuel short) | 8 | arith + aha | The DKR bar plus a 3-day leg cap leg 2 at 4 t in any band. Overload the 1-day leg 0 with all three ANR boxes, even in band ×3. |

**L45 notes.** Several different plans all score exactly $18:
- A′ is the obvious plan: NAP 0+2, GOA 8 on 7, buy 2 at MRS and 1 at GIT.
- H′ carries box 4 to MRS and box 9 to GIT in band ×3 on the 1-day leg.
- Variants without box 2 put 10+9 in the freed stack.

In every one, either 1 t of fuel has to be bought at a $3 port, or the 1-day leg drops into band ×3. If $19 exists, it is far better hidden than any other ★★★ in the set. Please re-verify it with the solver and write down the intended line.

## 1. Is the curve non-linear, with spikes and breathers?
Yes, broadly. The charters (18, 22, 27, 36, 45, 72, and to a lesser extent 63) are clear spikes. Regular levels drop back to 3–5 afterwards (10, 15, 19, 28/32/33, 37, 55, 68).

Felt difficulty, in order: 1 2 3 3 2 3 4 | 5 3 5 3 **7** 4 **8** 6 4 3 4 **8** 4 5 **9** 7 4 3 5 6 5 3 **8**.

Weak spots:
- L9 is called a charter but feels like an ordinary arithmetic level.
- From L45 to L72 the baseline stays flat at about 3–6. Late regular levels (55, 68) are among the easiest in the set.
- Almost every level took exactly 2 submissions once I reasoned on paper. The `try` readout is so clear that one failure teaches you the whole level.

## 2. Is level 2 already a "think" level?
Mildly. The instinctive "fill to deadweight" plan fails, and the fix needs one small insight: two 3 t boxes beat the $10 box because of the stripe. It takes about 30 seconds. It is a good teaching beat but not a puzzle. L3 repeats the exact same idea, and L4 is the first level that taught me something new.

## 3. Too easy, too hard, unfair, boring
- **Too easy / generous ★:**
  - L18: a sensible first plan earned ★★.
  - L46: the instinctive plan scores $28 against ★ at $22.
  - L64: the instinctive plan earned ★ ($42 against $41).
  - L10, L55, L68 are breathers that are maybe too thin.
- **Too hard / possibly unfair:** L45. ★★★ was never found, and many structurally different plans plateau at the same $18, which reads as "the threshold is wrong". L22 and L72 are hard mostly through arithmetic volume rather than insight.
- **Boring / repetitive:**
  - "Short-haul heavy boxes so the last leg is light" appears in L4, L32 and L68.
  - "Leave a slot for the pickup" appears in L6, L15, L36, L46 and L63.
  - L7 is pure knapsack with fuel at $1 that never matters.
  - L9 and L22 finish with $1 swaps.
- **Two-tier stars:** ★ = ★★ on 13 of the 30 levels (2, 3, 5, 15, 19, 28, 32, 33, 37, 42, 55, 60, 68), so the middle star means nothing there.

## 4. Rules that were confusing as worded
- **Band index.** `try` prints the band 0-based ("band 2") while `show` lists ranges with ×1/×2/×3. "band 2" looks like ×2 but means ×3. Print the multiplier instead.
- **Harbour bar.** "max N t aboard in port" also applies on departure after loading. I only learned this by failing L27. Say "on arrival and on departure".
- **Winter zone.** "after 2 days" on a 2-day leg is just a bar at the next port (L55). It is unclear whether "aboard there" means after that many days of burn. Say "weight after N days' burn ≤ X".
- **Low bridge.** "at least N t aboard" doesn't say where it is measured: at departure, or at the bridge after some burn?
- **Heavy-below.** It doesn't say whether equal weights are allowed.
- **Odd bands.** "12–12 t" and "0–1 t ×1" (L9, L45, L51, L55) look like typos. "0–1 t" carries no information.
- **Rules line.** It shows internal keys (`noPump`, `tiers`, `lot`, `calls`, `pickup`, `zone`). Use player words or drop the line.
- **Harness.** On manual-bunker levels, leaving out `"bunker"` prints NaN instead of an error (L15).

## 5. Concrete suggestions
1. Split ★ and ★★ on the 13 equal-threshold levels, for example ★★ = the "obvious fix" score and ★★★ = the insight.
2. Raise the floor where instinct passes:
   - L18 ★ $24 → about $28 and ★★ → $29.
   - L46 ★ $22 → about $29.
   - L64 ★ $41 → $43.
3. L45: re-verify the $19 line. If it hinges on something non-obvious, add a nudge or set ★★★ to $18.
4. Replace L68, or move it early as a deliberate callback. It is the third copy of the L4 trick.
5. L55: put the zone mid-leg ("after 1 day" of a 2-day leg), as L63 does, so burn-before-the-line matters and it doesn't play like a bar.
6. L7 and L51: make fuel and bands matter. Right now L7 is a pure knapsack and L51's bands are cosmetic.
7. L22 and L9: make the last star come from an idea rather than a $1 box swap.
8. Readout: show the multiplier (×3), arrival weight against any bar or zone, and free slots per stack after each port. The 0-based band index and the hidden departure check were my only real stumbles.
9. Add one level where the obvious tankering is a trap because of the tank cap, before L36. L36's tank-cap twist was a great surprise but arrived unannounced in a charter.
