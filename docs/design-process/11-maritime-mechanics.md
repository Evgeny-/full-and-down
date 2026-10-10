# 11 — Maritime mechanics catalogue (the chief mate's lens)

*Lens: real shipping practice that becomes a puzzle rule. A chief mate's day is already a discrete
optimisation puzzle: the cargo intake, the stowage plan, the bunker plan and the load-line check are
integer sums with hard limits, and they all affect each other. The game should feel the same:
small sums, and constraints that collide.*

**Honesty principle.** Real bunkers are 2–5% of deadweight. In the game fuel is 20–40%, so the
tradeoff bites. Every effect has the right *direction* (fuel is weight, weight costs fuel, fresh
water floats you deeper, burning fuel lifts you), even where the size is exaggerated. Seafarers
forgive scale, but they don't forgive a wrong sign.

---

## 0. The ship in integers (the baseline the rules refer to)

- **Deadweight (DWT):** a whole number of blocks (say 12) shared by cargo, fuel and later ballast.
  The hull sinks visibly against the **marks** as blocks go aboard.
- **Hold:** stacks of slots. A cargo item has a *weight* (1–3), a *size* (slots) and a freight value.
- **Tanks:** fixed capacities. Fuel takes deadweight but no hold slots.
- **Voyage:** ports are nodes and legs have a length in days, with the burn printed on each route
  chip. The ship's state is checked at fixed moments: departure, arrival, crossing a line.
- **Scoring:** freight delivered (later minus fuel bought). It is all deterministic and finite.

---

## 1. The catalogue (25 mechanics)

Format: **Rule** (as the player reads it) · **Real** (what it comes from) · **Trap** (the decision) ·
**Looks** (the cozy 3D scene) · **Cost** (complexity 1–5, fit with the fuel/cargo core) · **When**.

### A. Weight and fuel: the core

**1. Shared deadweight ("down to the marks")**
- **Rule:** Fuel and cargo share one weight limit. Load until the waterline touches the mark.
- **Real:** Deadweight is everything aboard: cargo, bunkers, water, stores, ballast, "constant".
  The mate's first sum is the *cargo intake*: deadweight minus everything that isn't cargo.
- **Trap:** Every "just in case" tonne of fuel is a tonne of freight left on the quay.
- **Looks:** The hull settles toward the Plimsoll disc as crates swing aboard. One DWT bar, black
  for bunkers and coloured for cargo.
- **Cost:** 1 · it *is* the core. **When:** L1.

**2. ROB reserve**
- **Rule:** Arrive at every port with at least R fuel still in the tanks.
- **Real:** ROB means *Remaining On Board*. Company safety systems and charter parties require a
  margin, typically a few days' steaming, and nobody plans to arrive on fumes.
- **Trap:** The reserve is weight you carry over every leg and never burn, until you bunker again
  and it becomes usable fuel.
- **Looks:** A red line on the fuel gauge (a sounding tape). Arrive below it and a tug tows you in
  (a soft fail, undo).
- **Cost:** 1 · core. **When:** L1.

**3. Laden burn (heavier ships burn more)**
- **Rule:** Each leg costs *Light / Laden / Deep* fuel (e.g. `3 · 4 · 5`), whichever band your
  draft is in when you sail.
- **Real:** Consumption rises with displacement (Admiralty coefficient: fuel ∝ Δ^⅔·V³). That
  is why a charter party quotes separate *laden* and *ballast* consumption.
- **Trap:** Thresholds and circularity. One more crate tips you into Deep, the leg costs +1 fuel,
  and that fuel weighs 1 too, so you can lose two crates trying to gain one.
- **Looks:** Three coloured bands on the draft gauge, with the active number lit on the route chip.
  A deeper ship pushes a fatter bow wave.
- **Cost:** 2 · this is what turns the core into a real puzzle. **When:** L3.

**4. Cubes out or weighs out**
- **Rule:** The hold has N slots and the ship has a weight limit. Bulky cargo fills the slots
  first, and dense cargo hits the marks first.
- **Real:** Stowage factor (m³/t). Steel coils "weigh out" with the holds half empty, while timber
  "cubes out" with the ship floating high. The ideal is *full and down*: holds full and the ship
  down to her marks.
- **Trap:** When you're cubed out, **fuel is free** because tanks use no slots, so fill up cheap.
  When you're weighed out, every tonne of fuel costs cargo. Hitting both limits is the three-star
  line.
- **Looks:** Squat steel coils, big pale timber bundles, fluffy cotton bales, a slot grid in the
  hold.
- **Cost:** 2 · excellent with bunker prices (#13). **When:** L7.

**5. Redelivery window**
- **Rule:** Finish the voyage with between A and B fuel aboard.
- **Real:** Time charters fix *bunkers on redelivery*, either "about the same as on delivery" or a
  min–max. The charterer pays for what's left, so arriving heavy gives money away and arriving
  short brings a claim.
- **Trap:** This is the friend's brief made into a rule: no over-bunkering *and* no
  under-bunkering. It forces precision at the *last* bunkering stop.
- **Looks:** A surveyor with a sounding tape on the final quay, and a green window on the gauge.
- **Cost:** 1 · works as a level format and as a star condition. **When:** from W3.

### B. Water under the keel (and over the mast)

**6. Port draft limit**
- **Rule:** A port with a depth sign accepts you only if your draft *on arrival* is ≤ N.
- **Real:** Every channel has a maximum permissible draft (depth minus required under-keel
  clearance). Ships call at shallow ports part-loaded, or late in the rotation.
- **Trap:** The check is on *arrival*, so fuel burned en route and earlier discharges both count.
  The classic answer is to **bunker after the bar**.
- **Looks:** A depth board at the harbour mouth and the seabed visible through clear water. Too
  deep and you touch bottom with a soft thunk.
- **Cost:** 2 · the core's natural second dimension. **When:** L11.

**7. Fresh water allowance**
- **Rule:** In a river port the ship floats 1 deeper. You may load past the mark by that 1, because
  she'll rise back to it at sea.
- **Real:** Fresh water is less dense than seawater, so the Load Line Convention lets a ship
  loading in fresh water submerge her mark by the FWA (Δ / (4·TPC) mm). The F and TF lines are part
  of every load-line mark.
- **Trap:** It cuts both ways: a free extra block when you *sail* from a river port, but a ship
  *arriving* from sea sinks 1 deeper against that port's draft limit.
- **Looks:** The water turns brown-green upriver, and the F/TF bars on the load-line mark light up.
- **Cost:** 2 · a one-line twist on #6. **When:** L16.

**8. Seasonal load-line zones**
- **Rule:** The sea is tinted Tropical / Summer / Winter. Wherever the ship is, she must not be
  deeper than that zone's mark.
- **Real:** The 1966 Load Line Convention zones and seasonal areas, with T 1/48 of summer draft
  above S and W 1/48 below. A ship leaving a tropical port may load to T only if she will have
  burned down to S by the summer-zone line.
- **Trap:** The binding moment is the **zone line, not the quay**, so fuel burned before the line
  is extra cargo. Bunkering just *after* a winter line, not before it, is the pro move.
- **Looks:** Zone tints on the chart with a buoy on each dashed line. The hull's T/S/W bars glow in
  turn.
- **Cost:** 3 · the most "chief officer" rule of all. **When:** L41.

**9. Tidal windows**
- **Rule:** This port's depth is N at low water and N+2 at high water, on the days shown.
- **Real:** Tidal ports (the Elbe, the Bristol Channel, Saint-Malo) take deep ships only around
  high water, so masters time the ETA to the tide table.
- **Trap:** Arrive deep on the right day or light on any day. Arriving early means waiting at
  anchor, and waiting burns fuel.
- **Looks:** The quay water rises and falls, with a brass tide clock on the port.
- **Cost:** 3 · needs time (#23). **When:** late garnish.

**10. Air draft**
- **Rule:** To pass under a bridge, waterline-to-top-of-deck-stack must be ≤ N.
- **Real:** The Kiel Canal bridges, the Bayonne Bridge (raised in 2017 because new ships no longer
  fit), Panama's Bridge of the Americas. Light ships ride high and ballast down to pass.
- **Trap:** It **inverts everything**: here being *light* is the problem. Discharging before the
  bridge lifts you, and tall deck stacks add height. Fix it with ballast or by stowing low.
- **Looks:** A steel arch over the channel. The ship squeezes under, mast flexing, bosun ducking.
- **Cost:** 2 · beautiful with #6 (a draft *window*). **When:** L76.

**11. Canal transits**
- **Rule:** A canal is a short leg with a max draft (sometimes an air draft too) and a toll. The
  long way round has no limits but many more days.
- **Real:** Suez (draft limit by beam, tolls on Suez Canal Net Tonnage, convoys) and Panama
  (Neopanamax locks 15.2 m TFW; Gatun Lake is *fresh water*; drought cut drafts in 2023), against
  the Cape of Good Hope or Cape Horn.
- **Trap:** Too deep for the canal? Load less, or go round. Going round needs more fuel, which
  weighs more and cuts cargo further.
- **Looks:** Lock chambers stepping up, a toll booth, and the long dotted route round a cape.
- **Cost:** 2 · a map feature, not a new rule. **When:** from L46.

**12. Lightering and top-off**
- **Rule:** At an offshore point, pass cargo to a barge (it delivers at half pay) or load more from
  one past the shallow stretch.
- **Real:** STS lightering lets deep tankers into shallow US Gulf ports. Paraná grain ships load to
  the river draft at Rosario, then top off at Bahía Blanca or Necochea.
- **Trap:** Overload and shed the excess outside at lower pay, or sail short and fill after the bar.
- **Looks:** A stubby barge comes alongside, fenders squeak, a crane swings.
- **Cost:** 2 · good with #6/#7. **When:** mid garnish (W2/W6).

### C. Bunkers

**13. Bunker ports and prices**
- **Rule:** Only ports with a bunker barge sell fuel, each at its own price. Your score is freight
  minus fuel bought.
- **Real:** Prices vary a lot from port to port. Ships deviate to Gibraltar, Las Palmas, Fujairah,
  Singapore or Rotterdam to bunker, and *lift extra* cheap fuel when the next ports are expensive or
  unreliable. West Africa is the textbook case.
- **Trap:** Cheap fuel now costs cargo now and raises burn, while dear fuel later is lighter to
  carry. If the next port sells nothing, you carry fuel for the round trip.
- **Looks:** A bunker barge with a fat black hose, the price chalked on a board, coins clinking.
- **Cost:** 2–3 (adds money) · the "where to bunker" half of the friend's brief. **When:** L21.

**14. Tank discipline**
- **Rule** (three sub-rules, taught one at a time): (a) never mix two ports' fuel in one tank;
  (b) new fuel is *sealed* for one leg until the lab clears it; (c) at sea, at most one tank may be
  part-full.
- **Real:** Stems from different suppliers can be incompatible (asphaltenes drop out as sludge), so
  common company practice is to segregate new bunkers and wait for the ISO 8217 lab analysis.
  Slack tanks add free-surface effect, so mates keep tanks pressed up or empty.
- **Trap:** You reach the cheap port with half a tank of old fuel, and that tank can't take the new
  stem. Sealing means you arrive with enough *old* fuel for the next leg too, so ROB becomes a plan.
- **Looks:** Cutaway tanks with sloshing fuel, and a padlock with a test tube on new fuel.
- **Cost:** 3 · a sorting puzzle *inside* the fuel core. **When:** sealed bunkers L26, tanks W6–W8.

**15. Two fuels and ECAs**
- **Rule:** Green-hatched sea (an Emission Control Area) must be crossed on blue low-sulphur fuel.
  Elsewhere you may burn the cheap black fuel. Each fuel has its own tank.
- **Real:** MARPOL Annex VI allows 0.10% sulphur inside ECAs (North Sea, Baltic, North American,
  US Caribbean, the Mediterranean since May 2025) against 0.50% globally. Ships carry MGO and
  VLSFO segregated and change over before the line.
- **Trap:** A transatlantic voyage needs blue at *both* ends and black in the middle. Blue may be
  cheap only at the start, and each tank caps its fuel. The wrong fuel is dead weight.
- **Looks:** Blue and black gauges side by side, and the funnel smoke clears at the line.
- **Cost:** 3 · splits the fuel budget in two. **When:** L71.

### D. Stowage

**16. Port rotation and restows**
- **Rule:** Cargo is stacked and only the top box can come off. Digging out a lower box means a
  *restow*: landing the ones above on the quay and loading them back, at a cost.
- **Real:** Bay plans follow the port rotation, so first-out goes on top. Overstows force restows,
  which mean crane moves and money. Hubs (Algeciras, Marsaxlokk) let you land boxes on the quay and
  shuffle.
- **Trap:** You load at *several* ports, so port 2's boxes land on top of port 1's boxes bound
  for port 4. At a hub the quay is a temporary buffer, much like Mise en Place's counter.
- **Looks:** Containers in port colours with little flags. The gantry plucks from the top, and a
  restowed box swings to the quay and back.
- **Cost:** 2 · adds the spatial axis. **When:** L31.

**17. Heavy below light**
- **Rule:** A box may never stand on a lighter box.
- **Real:** Stability (GM) and stack weight limits put heavy containers in the low tiers. Heavy on
  top means a tender ship and broken lashings.
- **Trap:** The heavy box for the first port wants to be on *top* for the rotation and at the
  *bottom* for stability. Two orderings collide.
- **Looks:** Weight shown by 1–3 rivet dots. An illegal box wobbles and refuses to land.
- **Cost:** 2 · a pure "aha" generator. **When:** L36.

**18. Trim**
- **Rule:** Forward and aft weight must be within 2, with the stern equal or heavier. Draft limits
  check the *deeper* end.
- **Real:** Ships sail slightly by the stern for propeller immersion and steering, and trim to even
  keel to cross a bar, because the deepest end is what touches. Bunkers sit aft by the engine room.
- **Trap:** A full bunker load trims you by the stern, so you need cargo forward. As fuel burns the
  trim shifts, and the *arrival* trim can end up by the head. Variant: **hog/sag** (the midships
  load must stay close to the ends' average).
- **Looks:** The ship visibly noses up or down, with a spirit-level bubble on the bridge wing.
- **Cost:** 3 · makes the fuel's *position* matter, not just its amount. **When:** L51.

**19. Ballast and minimum draft**
- **Rule:** At sea the ship must sit at least at her ballast mark. If too light, pump in seawater
  ballast: free, but it's weight that earns nothing.
- **Real:** A light ship needs ballast for propeller immersion, forward draft against slamming,
  and stability. Ballast also corrects trim and list.
- **Trap:** **Ballast cargo**: a low-paying parcel beats seawater because it weighs *and* earns.
  Ballast fixes trim and ducks you under bridges, but must go out before the shallow port.
- **Looks:** Water gushes in through the sea chest, double-bottom tanks fill blue, and the ship
  settles.
- **Cost:** 2 · gives the player a tool, not just a limit. **When:** L52.

**20. Deck and hold**
- **Rule:** A hatch cover separates each hold from the deck stack above it, and to reach the hold
  the deck must be cleared.
- **Real:** Deck containers sit on hatch covers. Getting at an under-deck box means landing the
  deck boxes and lifting the cover, even when those deck boxes are for a later port.
- **Trap:** LIFO with a lid. Early-port cargo belongs on deck, but deck stacks face air draft,
  lashing limits and weather.
- **Looks:** A hatch-cover panel lifts on the crane like a pot lid, showing the shadowed hold.
- **Cost:** 2 · deepens #16. **When:** W4 late / W7.

**21. Reefer plugs**
- **Rule:** Reefer boxes must stand on a plug slot, and each plugged reefer burns +1 fuel per leg.
- **Real:** Reefers draw power from a fixed number of sockets in fixed positions, and a big reefer
  load runs extra generators, which means extra fuel.
- **Trap:** Reefers pay best, but plug slots may sit in the wrong stack for the rotation, and the
  power bill grows with voyage length.
- **Looks:** White boxes with a snowflake, a coiled cable and little frost puffs, with yellow
  glowing sockets.
- **Cost:** 2 · ties stowage back to fuel. **When:** W4 garnish (Valencia oranges).

**22. Dangerous goods segregation**
- **Rule:** Hazard boxes with clashing placards can't be in neighbouring stacks, and flammables
  can't stand next to the fuel tanks or the accommodation.
- **Real:** The IMDG Code segregation table ("away from", "separated from", "separated by a complete
  compartment or hold from"), plus stowage provisions such as clear of living quarters.
- **Trap:** Adjacency breaks your tidy rotation stacks. The only legal slot may be in a stack bound
  for another port.
- **Looks:** Diamond placards (flame, flaming circle, skull), with red sparks between clashing
  neighbours.
- **Cost:** 3 · adds pure spatial logic. **When:** W7.

### E. Time and route

**23. Speed and laycan**
- **Rule:** Sail each leg *Eco* (one day longer, cheaper) or *Full* (shorter, costlier). Cargo
  exists only inside its laycan window: too late and it's cancelled, too early and you wait at
  anchor, burning 1 a day.
- **Real:** Fuel per day rises roughly with the cube of speed, hence slow steaming since 2008.
  Laycan (laydays/cancelling) sets when the ship must tender notice of readiness, and *just-in-time
  arrival* avoids burning fuel in the berth queue.
- **Trap:** Full speed costs fuel, which costs cargo, and rushing to a congested port only means
  waiting.
- **Looks:** A brass engine-telegraph lever, a calendar strip, anchored ships blinking at dusk.
- **Cost:** 3 · adds time as a dimension. **When:** L61.

**24. Weather routing and lashing**
- **Rule:** The forecast puts a storm on given legs on given days. Crossing it costs +2 fuel, and
  no deck stack may be taller than 2.
- **Real:** Weather routing steers round heavy weather, which adds resistance. Container losses
  from parametric rolling make masters cap deck stacks in winter.
- **Trap:** Go round (longer), wait it out (the laycan clock), or go through (fuel plus a deck
  restow). The route now dictates the stowage.
- **Looks:** A swirling cloud on the chart that moves one step a day, with the ship pitching and
  lashing bars tight.
- **Cost:** 3. **When:** L66.

**25. Currents**
- **Rule:** A current arrow on a leg: −1 fuel with it, +1 against.
- **Real:** The Gulf Stream, Kuroshio and Agulhas change speed over ground, and passage planners
  ride favourable sets.
- **Trap:** Round trips become asymmetric, which changes where you bunker.
- **Looks:** Animated flow streaks on the water.
- **Cost:** 1 · seasoning for any world. **When:** from W5.

*Smaller ideas kept in the drawer:* **MOLOO** cargo ("12 ± 2, more or less in owner's option": you
pick the quantity), **sludge** (every 5 fuel burned makes 1 sludge, which must be landed at a port
with a reception facility, an engineers' in-joke), **heavy lifts** (a 2-slot piece that only a
port with a heavy crane can handle), **list** (port/starboard balance, a simpler cousin of trim),
**port congestion** (a berth free from day N), and **ice convoys** (Baltic icebreaker departs on
set days).

---

## 2. Signature "aha" moments (the levels I would build first)

1. **Bunker after the bar.** A shallow port mid-voyage, cheap fuel beyond it. (#6 + #13)
2. **When you cube out, fuel is free**, and on the next level, dense cargo makes it cost
   everything. (#4 + #13)
3. **Burn down to the line.** Load to T, because you'll be at S by the zone line. (#8)
4. **The heavy box for the first port.** Rotation says top, stability says bottom. (#16 + #17)
5. **Ballast cargo.** A low-paying parcel beats seawater. (#19 + #3)
6. **Duck and lift.** Ballast under the bridge, then pump out before the lock. (#10 + #6 + #19)
7. **Keep old fuel for the lab.** Arrive with enough unsealed ROB for the next leg. (#14 + #2)
8. **Slow is light.** Eco speed frees a crate, if the laycan allows it. (#23 + #1)

---

## 3. Recommended introduction order (≈90 levels, 12 rules)

Each row has to change *how you think*, not just add a number.

| # | Level | Rule | You start thinking about… |
|---|---|---|---|
| 1 | 1 | Shared deadweight + ROB | fuel is cargo you can't sell |
| 2 | 3 | Laden burn (bands) | weight has a running cost, and thresholds |
| 3 | 7 | Cubes out / weighs out | which limit binds, and when fuel is free |
| 4 | 11 | Port draft limit (+ FWA twist L16) | the ship's state on *arrival*, and the order of calls |
| 5 | 21 | Bunker ports & prices (+ sealed bunkers L26, redelivery format) | *where* to buy, and fuel as an investment |
| 6 | 31 | Port rotation stacks (+ hub quay) | order in space (last in, first out) |
| 7 | 36 | Heavy below light | two orderings that fight |
| 8 | 41 | Load-line zones (+ canal routes L46) | the binding moment is mid-voyage |
| 9 | 51 | Trim + ballast | *where* weight sits, and how burning shifts it |
| 10 | 61 | Speed & laycan | time as a resource |
| 11 | 66 | Weather & lashing | the route reshapes the stowage |
| 12 | 71 | Two fuels & ECA (+ air draft L76) | a split budget, and being too *light* |

Levels 81–90 form a finale that combines rules and adds nothing new.

**Reasoning.** Rules 1–5 stay in the **weight/fuel plane**, the friend's brief: how much, where
to buy, what lightens you. Then the game adds **space** (6–7), **geography as constraint** (8),
**position** (9), **time** (10–11), and finally a **split resource and an inverted limit** (12).
Each block reuses the earlier ones: zones are moving draft limits, trim is stowage that cares about
fuel, and weather is time that cares about stowage.

**Sawtooth.** Each world opens with a breather (new rule, generous numbers), climbs, dips at a
"twist" level where the second rule arrives, and ends on a spike (a full voyage, a "Master's
exam"). DG (#22), reefers (#21) and tides (#9) are garnish inside worlds. They never headline,
so they can't break the 12-rule rhythm.

**Held back for endless/post-game:** hog/sag, list, sludge, MOLOO, ice convoys.

---

## 4. Campaign geography: a voyage round the world

Ten levels per world, eastbound round the world and home in winter. Every region was picked
because a real mate there *has to* think about that rule.

| W | Region & ports | Headline / twist | Why here |
|---|---|---|---|
| 1 | **North Sea Feeder**: Rotterdam, Felixstowe, Bremerhaven, Esbjerg, Aberdeen | Deadweight, ROB, laden burn, cube/weight | Short hops. It is all ECA, so one fuel is *true to life* for feeders. |
| 2 | **Up the Rivers**: Elbe to Hamburg, Scheldt to Antwerp, Seine to Rouen, Thames | Draft limits, FWA | The feeder master's daily draft headache, in fresh or brackish water. |
| 3 | **Canaries & West Africa**: Las Palmas, Gibraltar, Dakar, Tema, Lagos | Bunker prices, sealed bunkers, round-trip fuel | Classic cheap bunker calls, then ports with dear or no fuel: carry it for the way back. |
| 4 | **Mediterranean Loop**: Algeciras, Valencia, Genoa, Piraeus, Marsaxlokk | Rotation stacks, heavy-below-light, hub quay, reefers | A liner loop with hubs, and Valencia citrus in reefers. |
| 5 | **Suez & the Gulf**: Jebel Ali, Dammam, Jeddah, Suez, Port Said, (the Cape) | Load-line zones, canal vs Cape | Tropical-to-summer is the textbook load-line exam, and Suez vs the Cape the classic route choice. |
| 6 | **Monsoon Coast**: Chittagong, Haldia, Colombo, Singapore | Trim, ballast, tank discipline | Bar ports demand even keel. Singapore is the world's biggest bunker port, and the monsoon seasonal areas bring back #8. |
| 7 | **Typhoon Pacific**: Shanghai, Busan, Kaohsiung, Yokohama → Long Beach | Speed & laycan, weather & lashing, DG, Kuroshio current | Typhoon routing, the long crossing, DG-heavy exports. |
| 8 | **Panama & the American ECA**: Balboa, Gatun Lake, Colón, Savannah, New York | Two fuels, air draft (Bayonne Bridge) | The ECA reaches 200 nm offshore, Gatun Lake is fresh water, and Bayonne is the famous air-draft story. |
| 9 | **The Seaway & the Winter North Atlantic**: Montreal, the St Lawrence locks, Halifax → Kiel Canal → Baltic | Finale: everything | Seaway locks and bridges make a fresh-water draft window. Then the WNA mark, Kiel Canal limits and a Baltic winter. Home for Christmas. |

Each world has its own palette: North Sea pewter, Med terracotta, Gulf sand haze, monsoon green,
Pacific indigo, Seaway snow.

---

## 5. Authentic vocabulary for the UI

| Label | Plain-language gloss | Where |
|---|---|---|
| **Let go** | Cast off and start the voyage | Sail button |
| **Full away** | Sea passage begun | Voyage animation banner |
| **FWE** (Finished With Engines) | Voyage complete | Win stamp |
| **Belay that** | Cancel the last order | Undo |
| **Ask the Pilot** | A hint | Hint button |
| **Mate's Receipt** | Proof the cargo was received | Results card with stars |
| **Loadicator** | The ship's loading computer | Live check panel (draft, trim, stability) |
| **DWT / Deadweight** | How much the ship can carry | Main bar |
| **Draft** (UK *draught*) | How deep she sits | Gauge |
| **Marks / Plimsoll** | How deep she may sink | Hull and gauge |
| **Bunkers / Stem** | The ship's fuel / one fuel delivery | Fuel bar, barge card |
| **ROB** | Fuel remaining on board | Gauge reserve line |
| **Laden / In ballast** | Loaded / running empty | Burn bands |
| **Port rotation** | The order of ports | Route strip |
| **Overstow / Restow** | A box blocking another / shifting it | Stowage warnings |
| **Trim, by the stern / head** | Nose up / nose down | Trim bubble |
| **UKC / Air draft** | Water under the keel / height above water | Depth sign, bridge gauge |
| **Laycan** | The cargo's date window | Cargo card |
| **ECA, MGO / VLSFO** | Clean-fuel-only sea; clean fuel / cheap fuel | Chart hatch, two gauges |
| **FWA** | Fresh water lets her float deeper | River-port tooltip |

The voice is warm and laconic, like a good chief mate's notes: "Draft on arrival 9. Port takes 8.
Something has to give."

---

## 6. Game names (10 candidates)

1. ★ **Full and Down** *(favourite)*: the chartering phrase for a ship loaded to full cubic
   capacity *and* down to her marks, which is the perfect solution. Like *Mise en Place*, it is a
   trade phrase that also describes the puzzle, and it names the three-star condition.
2. **Down to the Marks**: loaded right to the load line, and very evocative for seafarers.
3. **Plimsoll**: one iconic word and a ready-made logo (the disc and bar). The risk is that in
   Britain it also means a gym shoe.
4. **Even Keel**: calm and balanced, it suits a cozy game and nods to trim.
5. **Freeboard**: the hull above water, with a "free board" puzzle pun.
6. **Shipshape**: everything in good order. Friendly, but generic and probably taken.
7. **Bunker Down**: a pun on "hunker down" and bunkers. Playful, but it undersells the cargo half.
8. **Load Line**: clear to non-sailors, though a little dry.
9. **Laden**: short, elegant, unusual as a game name.
10. **Remaining On Board**: the poetic expansion of ROB. Quiet and literary, but long.

---

## 7. Deliberate simplifications (so seafarers know we know)

Fuel scale is exaggerated. Bunker tanks all sit aft, while real ships also have double-bottom and
wing tanks. Burn uses three bands instead of the Admiralty curve. Zone lines are stylised per
level. Sealed bunkers are company practice, not a convention, and the tooltip says so.
