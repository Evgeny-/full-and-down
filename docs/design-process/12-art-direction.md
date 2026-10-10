# 12 · Art direction: identity, composition, juice

Lens: visual identity, scene composition, game feel. The mechanics are someone else's job, but the picture has to make them readable, so section 3 sets out a visual grammar for weight and fuel that any ruleset can use.

**In short:** pick **Signal Hoist**. It is a bright working harbour on a clear morning, and its UI is built from the International Code of Signals: flags, enamel plates, stencilled draft marks. On the open sea the water turns into a **living chart**. The camera shows the ship **broadside at the berth**, and the hull is the weight gauge: the waterline climbs the draft ticks toward the Plimsoll line, and the red antifouling paint left showing is the spare deadweight. Fuel is an amber **fuel train** of cells laid along the route, and each leg eats its share.

---

## 1. Three visual directions

What we must not look like:

| | Mise en Place | Pixel Picnic | Our guardrail |
|---|---|---|---|
| Palette | warm cream, terracotta, espresso ink | sand, candy pastels, purple | cool sea and navy, with saturated colour only as signal accents |
| Surfaces | menu paper, hard offset shadows | glossy rounded pills | enamel and painted steel, soft contact shadow, small radii |
| Type | Vollkorn + Jost | rounded bubbly sans | condensed industrial sans |
| Models | clay, rounded | toy blocks | crisp painted steel with chamfers |

### A. "Pilot Chart": the navigator's chart table
**Mood.** An Admiralty chart with buff land, blue shallows and a white deep sea; a magenta compass rose; soundings in tiny italics; brass dividers; pencilled course lines; a ruled logbook. Ports rise out of the paper like a pop-up book, and the ship is a painted lead model pushed across the chart.

**Palette:**
- chart buff `#F2E3B3` (land)
- paper `#FBFAF4` (deep water, panels)
- shallows `#A8D3E3` / `#CFE7EF`
- chart magenta `#B4237D` (routes, primary action)
- ink `#1A2230`
- graphite `#5E6670`
- compass red `#C8363D`
- brass `#B8913B` (stars)
- walnut `#4B2E22`

**Light and materials.** A warm desk-lamp spot with a vignette and a cool window fill. Matte paper with canvas-painted creases and foxing, varnished models, env-mapped brass.

**Type.** Literata (variable, true italic, Cyrillic), upright for land and italic for water as on real charts. PT Sans Narrow for labels, IBM Plex Mono for logbook figures.

**UI.** Cartouches, double hairline rules, a compass rose as the main button, brass dividers as the hint pointer.

**Verdict.** The most authentic, but it is **paper plus a serif on a warm ground**, a cousin of Carte du jour. It is also low-contrast on a phone and only covers the sea. *I keep its chart for the voyage and the campaign map.*

### B. "Blue Riband": the Art Deco liner poster
**Mood.** Cassandre-style bows towering from the waterline, banded streamlined funnels, airbrushed sunsets, sunbursts, speed lines, gold and chrome, oval luggage labels, ziggurat frames.

**Palette:**
- midnight `#0E1A33`
- liner navy `#1C3157`
- funnel red `#D3342F` (primary)
- porcelain `#EEF1EC`
- gold `#E2B044`
- sky `#F28C6B` → `#F9D2AE`
- sea teal `#18737C`
- black `#121212`

**Light and materials.** A low golden sun with a strong rim. A three-step toon ramp (`MeshToonMaterial` with a 3-texel gradientMap), a gradient sky dome, an airbrush gradient on hulls in the shader, chrome trim.

**Type.** Unbounded 800–900 (wide caps, Cyrillic) for titles, Poiret One for hero numerals only, Manrope for body.

**UI.** Luggage-label badges, stepped Deco frames, chrome porthole buttons, stars as ticket punches.

**Verdict.** Gorgeous for a poster, but Deco is about *passenger* liners, not bunkering and boxes. The heroic low camera fights puzzle readability, the wide face eats portrait width, and poster flatness goes mushy in motion. *I keep its low camera for the title and departure shots.*

### C. "Signal Hoist": the working harbour, spoken in code flags (favourite)
**Mood.** Code flags snapping in a breeze. Fresh paint: navy topsides, a black boot-top, red antifouling, a white superstructure, a funnel in our fictional line's colours. Stencilled draft numerals and a Plimsoll disc. Riveted enamel harbour signs, a yellow quay edge, colourful container stacks under crisp shadows, deep clean teal water, gulls on bollards. References: Mini Motorways for clarity, Alba for light, Townscaper for water, a real feeder port at 7 a.m. for honesty.

| Token | Hex | Use |
|---|---|---|
| flag red / yellow / blue | `#D62F2B` / `#F5C518` / `#1E4FA3` | danger and Bravo / highlight, "on the mark", Q / primary (Blue Peter) |
| signal white / black | `#F8F7F2` / `#15181E` | enamel, text, stencils |
| hull navy | `#1F2E4D` | topsides, dark enamel, night panels |
| boot-top / antifouling | `#1A1E26` / `#B8432F` | hull bands; red = spare deadweight |
| superstructure | `#F2F1EA` | accommodation, mast |
| sea deep / mid / shallow / foam | `#17607F` / `#2D8DAF` / `#4DB3BF` / `#EAF9FB` | water bands |
| concrete / quay edge | `#CFCAC0` / `#F2B300` | apron, coping |
| **fuel amber** | `#EE8B1E` | fuel only, used nowhere else |
| ballast green | `#3DA57A` | reserved for a ballast mechanic |
| chart magenta | `#C2257E` | routes, track, current port |
| sky top / horizon | `#BFE3F5` / `#F4F1E6` | backdrop |
| containers | `#B44A2E` `#2F8A72` `#2C5DA8` `#D9A02F` `#6F7A86` `#E6ECEF` `#7B3F6E` | rust, teal, cobalt, ochre, slate, reefer, plum |

**Lighting.** A crisp morning:
- hemisphere `#DDF1FF` over `#6E8C99` at 0.9
- sun `#FFF6E6` at about 2.6 from the upper left and slightly behind the camera, so hull faces stay lit and shadows fall away
- a small PMREM room environment at 0.3 for a paint sheen
- cloud shadows drifting over everything

Each sea region gets its own hour: North Sea grey-green morning, Mediterranean noon, Red Sea gold, Singapore dusk with sodium `#FFB347`. Night is a navy harbour (sea `#0E2A3D`, warm deck lights, stretched additive lamp reflections), never a black slab.

**Materials.**
- Satin painted steel: roughness 0.5, metalness 0, with `ExtrudeGeometry` bevels so every edge catches a highlight.
- Canvas-painted rust streaks under the hawse pipes.
- Containers corrugated by a stripe texture.
- Speckled concrete with joints.
- Matte black rubber fenders and hoses.
- Flag cloth: Lambert with a vertex wave.

**Type.**
- **Oswald** (`@fontsource-variable/oswald`, Cyrillic) for every number and title. Its tall condensed numerals *are* draft-mark numerals, and the same face is painted on the hull, the boxes and the HUD.
- **Sofia Sans** and **Sofia Sans Condensed** (`@fontsource-variable/sofia-sans*`, Cyrillic, italics) for body text and small-caps labels. Sea names on the chart are Sofia Sans Italic, letterspaced: the chart convention in our own face.
- Scene stencils are Oswald painted on canvas, with bridges erased by `destination-out` bars, so no stencil font is needed.

**UI component language.**
- **Code-flag buttons.** A flat field with the flag's true pattern, 3 px corners, a halyard and a wooden toggle on the hoist side, and a cloth ripple on press. The flags *mean* their action:
  - **Sail** = **Blue Peter** (P: "about to proceed to sea").
  - **Bunker** flies **Bravo** (B, the red flag shown while taking fuel).
  - Arrival hoists **Q** (yellow: requesting free pratique).
  - A ship out of fuel hoists **V** ("I require assistance").
  - Winning means **dressing overall**: a line of every flag from stem to masthead to stern.
  - Undo has no flag, so it is a plain enamel token.
- **Enamel plates** for the HUD and panels: radius 6 px, a rim 8% darker, four rivets, one gloss streak, a soft shadow. No hard offsets, no pills.
- **Draft-mark chips** for numbers. **Hazard tape** only for real warnings.
- **Loupes**: engineering "DETAIL A" callouts magnifying part of the 3D scene.
- **Stamps** on a **triplicate form**: white, pink and yellow carbon copies on a steel clipboard with a printed blue grid. Office stationery, not menu paper.
- **Ports are flags.** Each port in a level gets a code-flag letter. Its cargo wears a matching flag sticker, its apron lane is painted in that flag's colours, and its node on the route shows the same flag. ICS flags differ by *pattern*, so this is colour-blind-safe for free.

**Why C:**
1. Every motif is diegetic. Seafarers will grin at Blue Peter, Bravo, Q and dressing overall, and everyone else sees bold, friendly flags.
2. Signal colours were designed to be read at sea, so they stay top-contrast over a teal and navy scene, with the patterns as a second channel.
3. It is clearly no sibling: cool where Mise en Place is warm, steel and enamel instead of paper, condensed sans instead of serif, flags instead of purple pills. To avoid drifting into candy, the *world* stays muted (concrete, navy, teal) and saturated colour is spent only on UI and accents.
4. The hull's draft marks and Plimsoll disc become the hero gauge, in the same Oswald numerals as the HUD.
5. Cheap: flags are planes with canvas textures, enamel is CSS, ships and boxes are extrusions.

A's chart becomes the sea between ports and the campaign map (in C's palette, with magenta tracks). B's low camera becomes the title and departure shot.

---

## 2. Scene composition (portrait, 390×844)

### The camera rig
**Orthographic, with the ship broadside across the screen.** The alternatives:
- **Top-down, ship upright on screen**: uses the height, but shrinks the waterline (the core drama) to a sliver.
- **A full cross-section**: reads the tanks perfectly, but it is a horizontal 2D drawing.
- **Broadside**: makes the hull side, waterline, draft marks and Plimsoll disc the clearest thing on screen, maps directly to bays × tiers, and shows **trim** if a mechanic uses it.

Settings:
- pitch about 38° (vertical faces at ×0.79, decks at ×0.62)
- yaw 0 in play
- the ship spans 92% of the width
- **chunky stylised proportions**: length to hull depth about 6:1 (a real feeder is about 12:1), so the hull side is about 55 px tall and the disc is a real icon
- bigger ships add bays at the same width, capped at about 9 bays (about 40 px per 20-foot slot)

The **quay is in the foreground**, with a visible strip of water and fenders, so the quay edge never hides the waterline. The **bunker barge lies off the far side**, as in real life. Its low deck and wheelhouse peek above the ship's silhouette, and its hose arcs high over the rail to the manifold aft: the most photogenic line in the scene. Small ports bunker from a road tanker on the quay, and some ports have no fuel at all.

**Holds and tanks.** Deck cargo is fully visible. When a level uses holds or tanks, the plating over them becomes a **Biesty-style cutaway** (a jagged ink section edge), shown always for holds and on the X-ray button or automatically while pumping for tanks. The plating amidships stays whole to carry the Plimsoll mark.

### Loading berth (the puzzle screen)
```
┌──────────────────────────────────────────┐
│ [II][⌂]    LEVEL 14 · KIEL     goal 42 t │ enamel tokens
│┌PASSAGE PLAN────────────────────────────┐│
││ ⚑K KIEL ═▮▮▮═▶ ⚑A AARHUS ═▮▮▮▮═▶ ⚑O OSLO││ legs + burn cells
││ fuel ▮▮▮▮▮▮▮▮▮  ROB 6 → 2 ✓            ││ the "fuel train"
│└────────────────────────────────────────┘│
│  skyline · lighthouse · breakwater · gulls│
│    ▂▃▂ barge ⚑B ⌒⌒⌒⌒ hose ⌒⌒⌒╮           │ far side
│  ┌┐ ⚑P                         ╲          │
│ ▕██▏ [2][ ][3]   [■][ ]   [ ][ ][ ] ╲    │ deck: bays × tiers
│ ▕██▏═╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤══◣    │
│ ███████████████(⊖)LR S████████████████◣  │ navy topsides
│ 8M ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ 8M  (A)  │ waterline · loupe
│ ▓▓▓▓ antifouling red = spare weight ▓▓▓  │
│ ◘══◘══◘══ fenders ══◘══ quay edge ▚▚▚▚▚▚ │
│  ⚑A lane [3][2][2]   ⚑O lane ◎◎4  ▭▭1     │ cargo on the apron,
│  ⚑A lane [5][1]      ⚑O lane ⊞2  ▭▭1      │ lanes by port flag
│ ┌───────┬───────┬───────┬──────────────┐ │
│ │ ↶UNDO │ HINT  │ X-RAY │  ⚑P  SAIL     │ │ flag buttons
│ └───────┴───────┴───────┴──────────────┘ │
└──────────────────────────────────────────┘
```
- **Loupe A**: a 96 px circle with a hairline leader to the disc. It shows the disc and the TF/F/T/S/W ladder at 3× with the live waterline lapping, and a "▲3 t to the mark" chip. It is a 256² render target from a second orthographic camera, refreshed only while the water near it moves, with a canvas-drawn version on low-end devices.
- **Drag** a cargo piece and its ghost hovers over the bays: valid slots glow and a **ghost waterline** shows the predicted draft. Drop it and the crane does the lift.
- **Bunker**: tap the barge or the fuel train and a red **valve handwheel** appears. Each quarter turn ratchets one cell in; ± taps also work.

### Voyage
After Blue Peter, the horn, cast-off and the tug nudge, the camera yaws 25° low past the breakwater (the Blue Riband shot), then **cranes up to top-down** while the water cross-fades into **chart mode**: isobath tints, contour lines, soundings, buff land with an ink coast, a compass rose. The ship stays the same model, scaled up 4× as a token.
```
┌──────────────────────────────────────────┐
│ LEG 1/2  KIEL ▶ AARHUS     [▶▶2×][skip]  │
│                            ⚑A AARHUS     │
│ ▓▓▓buff land▓▓▓   ·12  ·15   ╱           │
│ ▓▓▓▓▓▓▓▓▓▓▓  ~~isobath~~  ╱ magenta track│
│        ·20      ·24     ╱                │
│  ✧ compass rose     ⛴≈≈ wake  ☁ shadow   │
│ ▓▓land▓▓          ╱                      │
│               ⚑K KIEL                    │
│┌────────────────────────────────────────┐│
││ FUEL ▮▮▮▮▮▯▯▯  each ▯ = 1 t burned      ││
││ ROB at AARHUS: 3 ✓       draft 7.4 m    ││
│└────────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### Port arrival
The camera swoops onto the port's little diorama and the chart turns back into harbour water. Yellow Q goes up, then the orange pilot boat and two tugs bring her alongside in the same broadside framing. This port's flagged cargo comes off and the ship **rises** (the red returns). If the level has decisions here (load more, bunker), the berth UI returns; otherwise it is a 3-second vignette.
```
┌──────────────────────────────────────────┐
│          ═══ ⚑A  AARHUS ═══              │ enamel port sign drops in
│  pilot boat ▸        ◂ tug    tug ▸      │
│   ⚑Q up → stamps → Q down → dress ship   │
│   ⛴ broadside, crane lifts ⚑A boxes off  │
│   ship rises · red antifouling returns   │
│┌PORT CALL───────────────────────────────┐│
││ discharged 9 t · ROB 3 t · fuel here 🛢 ││
││ [ LOAD / BUNKER ]       [ ⚑P SAIL ON ] ││
│└────────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### Results
```
┌──────────────────────────────────────────┐
│  ship dressed overall · fireboat arcs    │ 3D, softly dimmed
│ ┌clipboard (white/pink/yellow copies)──┐ │
│ │ PORT CLEARANCE  Nº 014   ( )( )( )   │ │ 3 stamp slots
│ │ Cargo delivered   42 t  ■■■■■■■■…    │ │
│ │ Best possible     44 t               │ │
│ │ Fuel on arrival    1 t  ▮ spare      │ │
│ │ Left on the quay  ⬚⬚ (2 t ghosts)    │ │
│ │ ⚑K ✓  ⚑A ✓  ⚑O ✓   port stamps       │ │
│ └──────────────────────────────────────┘ │
│   [↺ RETRY]            [ ⚑P NEXT VOYAGE ] │
└──────────────────────────────────────────┘
```

### Campaign: "the Pilot Chart"
A vertical-scrolling 3D chart in the same chart-mode water. Regions are sea areas going north, then round the world:
- North Sea
- Kiel Canal (a lock gate)
- Baltic
- Biscay
- Mediterranean
- Suez
- Red Sea
- Indian Ocean
- Malacca
- the Horn

Each region has its own tints, coast colour and port architecture, and each gate introduces a mechanic.
- Port nodes are chart harbour symbols.
- Finished ports carry their stamps.
- The current port has the ship token and a pulsing magenta ring.
- Locked legs are pencil-dashed.
- A region's main port is a small 3D diorama standing up out of the chart.
```
┌──────────────────────────────────────────┐
│ [★ 41]  PILOT CHART · BALTIC    [⚙]      │
│    ~ isobath bands ~        ▓ buff coast │
│      ⚓18 · · · · (pencil dash, locked)  │
│     ╱                                    │
│  ⚓17 ◉⛴  ← current, magenta pulse       │
│    ╲   [stamp][stamp]                    │
│    ⚓16 [stamp][stamp][stamp]   ✧ rose   │
│    ╱              B A L T I C   S E A    │
│  ⚓15 ...                                │
│ ══ KIEL CANAL · lock gate · new rule ══  │
│ [  ⚑P  SAIL TO 17  ]                     │
└──────────────────────────────────────────┘
```

---

## 3. Making numbers physical

**One unit glyph everywhere: the square tick ■ = 1 t.** It is printed on cargo, ticked on the hull and celled in the tanks, always grouped in fives (■■■■■ ■■), so players count by subitising. Digits are always there too, but they only confirm what the picture says.

- **Deadweight = the hull.** Between the light waterline and the summer line, the draft scale has exactly N ticks, one per tonne she may take. Each tonne sinks her one tick. Each tick fills with the colour of what made it (a cargo colour or fuel amber), so the scale is a **stacked bar disguised as draft marks**, topped by the Plimsoll disc and the **S** line.
- **Hide the red.** The red antifouling shows exactly while deadweight is spare. Overloading drowns the S line, and the submerged marks glow red.
- **Cargo.** Footprint = *space* (slots), pips = *weight*, so density is visible: a steel coil is small with ■■■■, a car or a cotton bale is big with ■, a box has 1–4 stencilled pips plus a numeral, and an empty box is grey with "MT" stencilled (real slang). The lift proves it: the cables stretch, the boom dips, and a load-cell dial on the crane cab reads the weight.
- **Fuel** is amber cells in the tanks, and each cell on board is also an amber tick on the hull. The trade-off becomes literal: an amber tick is a tick no box can use.
- **Burn per leg: the fuel train.** In the passage plan, the fuel on board is a row of amber cells under the route. Each leg's bracket claims its run of cells, and what is left after the last port is **ROB**, drawn as hollow cells beside a "could have been cargo" ghost box.
- **Heavier burns more.** The hull scale is tinted in faint zones (light, laden, deep) with burn-rate badges. When the waterline crosses into a deeper zone, the leg brackets each gain a cell, with a +1 pop and a glug. Cause on the hull, effect on the route, both in view.
- **A shortfall is shown, not computed.** If the train runs dry before a port, the rest of that leg becomes hazard-tape dashes, with a drifting ghost ship where the fuel ends.
- **Trim** (if used): a clinometer bubble on the bridge front, and different draft numerals at bow and stern, the way a chief officer reads them.

---

## 4. Juice list

These recipes assume Mise en Place's toolkit: `Tweens`, an instanced `FxView`, canvas textures, one sun shadow map.

1. **Settle to draft.** The ship's `y` chases the target draft on an underdamped spring (ζ≈0.35, 0.8 s): it overshoots, bobs twice and settles. Heavier means a deeper dip.
2. **Waterline wobble and wet band.** The hull shader takes `waterY` and draws a foam line at `waterY + sin(x·k+t)·a`. A dark wet band below a `wetY` uniform dries down over 2 s.
3. **Landing ripples.** An 8-slot `vec4` array (x, z, t0, strength) in the water shader draws concentric bands. No meshes.
4. **Hide the red, on the mark.** When the last red sinks exactly at S, a yellow shimmer runs along the waterline, the disc and loupe get a yellow rim, a gold glint sweeps the disc (an additive quad), and the bell dings.
5. **Ghost waterline.** While dragging, a dashed predicted waterline appears, the ticks the piece would take blink in its colour, and leg brackets that would grow pulse +1.
6. **Overload.** S drowns, hazard tape crawls round the loupe, a harbour master's launch scoots up blinking, and Blue Peter jams half-mast. It stops you without a fail screen.
7. **Crane slew and sway.** A boom tween, with the load on a 2D damped pendulum driven by the trolley's acceleration. Cables are thin cylinders restretched each frame. Weight shows as cable stretch and boom dip, and heavy lifts are 30% slower.
8. **Twist-lock clunk.** 6% squash with an outBack recovery, four corner dust puffs, and the stack below compressing 2% a frame later.
9. **Roll impulse.** An off-centre load kicks the roll spring about 1.5° and she rights herself.
10. **No-go wiggle.** At an invalid slot the dangling box shakes "no" to a two-tone reversing beeper.
11. **Bunker hose.** A pre-built `TubeGeometry` with a vertex shader: sway `sin(t·1.3+u·3)·u(1−u)` plus a **peristaltic bulge** where `fract(u − 0.8t)` is near 0. One bulge = one glug = one cell.
12. **Tank fill.** A per-cell liquid shader with a sloshing meniscus and 3 bubble sprites. A full cell flashes white along its top and a "+1" floats up.
13. **Bravo and the handwheel.** The red B runs up the mast for the pump (a blinking red light at night). The DOM wheel ratchets in 4 notches with an 8 ms vibrate, and the 3D valve on the barge turns in sync.
14. **Flags everywhere.** `PlaneGeometry(1,.66,10,3)` with `z += sin(x·6−8t)·0.08x`. All 40 ICS flags are painted on one canvas atlas (crosses, stripes, squares, diagonals, discs), with an instance attribute for the UV cell: one draw call for every flag.
15. **Blue Peter.** When the plan becomes valid, P races up the halyard and the Sail button unfurls in step.
16. **The horn.** Two white steam puffs from the whistle, a 1.2% zoom punch, every gull lifting off at once.
17. **Cast off and tug.** Mooring lines (Bezier lines) go slack, splash and whip aboard. A tug noses into the bow quarter, its prop wash a fan of foam decals, and the bow swings out.
18. **Funnel smoke.** The puff rate follows engine load: white at idle, grey at full power, black rings when sputtering.
19. **Bow wave and wake.** A crescent at the stem with scrolling foam, scaled with speed, and instanced foam blobs dropped every 0.15 s that widen and fade into a Kelvin V. On the chart the wake becomes a pencil-dotted track.
20. **Laden motion.** At sea, roll period and amplitude come from the load. Deep ships wallow slowly, light ones bob quickly. Weight is felt.
21. **Harbour to chart.** One `chartMix` uniform quantises the depth into 4 isobath tints, draws contour lines at band edges, fades in sounding quads from an atlas, and blends the land caps to buff with an ink `EdgesGeometry` coast.
22. **Cells burn.** On the chart each cell leaves the fuel train as an amber puff that flies to the funnel, with a tick. Tap for 2×.
23. **Out of fuel** (funny, not punishing). The funnel coughs black rings, the engine stutters and dies, and she drifts sideways. V goes up, a gull lands on the funnel and stares, then a tug chugs in and tows her home with a cheeky toot. A "TOWAGE INVOICE" stamp, then Retry.
24. **Dressing overall.** Q comes down on berthing and about 20 flags pop onto a line from stem to masthead to stern, one every 50 ms with rising ticks, the line sagging on a catenary. A 3★ arrival adds a fireboat water salute (two arcs of spray particles).
25. **Signal-flag confetti.** The `FxView` paper particles get tiny flag textures from the atlas.
26. **Customs stamps.** Each star is a different port stamp (circle, octagon, double-ring rectangle, in violet `#5B3FA0`, red or green ink). It drops from ×2.4 at ±8°, slams with outBack, shakes the clipboard 4 px, splats ink specks, and its mask fills in as the ink bleeds.
27. **Ghost cargo.** In the results, cargo that could have fitted stands on the quay as hatched white outlines, and the leftover fuel cells morph into them.
28. **Cloud shadows.** Shared materials get one world-space cloud-texture fetch (`onBeforeCompile`) scrolling with the wind.
29. **Sun glints and harbour life.** Water noise is thresholded into twinkles near the sun's reflection. IALA buoy lights blink (and swap colours in American ports, an easter egg for sailors), and a lighthouse beam sweeps at dusk.
30. **Gulls.** An instanced body and wing quads, about 30 birds in 2 draw calls, with the flap in the vertex shader. They circle, perch on bollards, scatter from the crane, and their blob shadows ride the water.
31. **Hint as an Aldis lamp.** A signal lamp on the bridge wing blinks Morse at the suggested slot, then a spotlight cone settles on it.
32. **Undo as rewind.** The crane carries the last piece back along its exact path at 2× with a reversed whoosh, and the waterline and ripples play backwards.

---

## 5. Sound design (all synthesised)

The identity is harbour foley played like an instrument: steel, rope, water, air. It is wet and low where Mise en Place is wood and glass, with no accordion (the trattoria owns it) and no marimba (Pixel Picnic owns it).

| Name | Sound | Recipe |
|---|---|---|
| `horn` | ship's typhon | two detuned saws (≈110 and 165 Hz), lowpass 900 Hz, 120 ms attack, slight vibrato, breath noise, big room; pitch scales with ship size |
| `toot` | tug or pilot | the same voice, 2 octaves up, short |
| `crane` | slew and hoist motor | a saw through a bandpass that tracks speed (300→700 Hz) plus a chain rattle (jittered noise clicks); heavy loads drop it a fifth |
| `clank` | twist-lock, landing | 5 inharmonic steel partials with a fast decay over a sine thump falling 90→50 Hz; heavier is lower |
| `glug` | pump pulse | noise through a resonant lowpass sweeping 400→150 Hz in 120 ms, one per hose bulge |
| `cell` | fuel cell full | a tick and a soft "tink" climbing a major pentatonic |
| `ratchet` | handwheel notch | three tiny metal clicks |
| `waves` | ambience | brown noise, lowpass 500 Hz, two slow amplitude LFOs, occasional slaps on the quay |
| `gull` | "kee-ow" | a sine falling 2.2→1.3 kHz with 18 Hz vibrato and breath, 2–3 calls |
| `bell` | ship's bell | slowly beating modal partials, struck in sailor's pairs (ding-ding) |
| `pipe` | bosun's call, level start | a sine glide 1.6→2.4 kHz, a trill, a fall |
| `engine` | run loop | a pulsed 35–55 Hz sine (pulse rate = RPM) plus harmonics |
| `sputter` | out of fuel | engine pulses dropping out, two backfire pops, silence, one drip |
| `flag` | hoist | a halyard squeak and bandpassed cloth ruffles |
| `stamp` | customs stamp | a thump, a paper slap, a desk resonance |
| `aldis` | every UI button | an Aldis-lamp shutter: two crisp clicks |
| `whistle` | harbour master | a pea-whistle trill around 3 kHz |

Optional music for later: a slow shanty-ish reed organ with plucked bass and brushes, recoloured per region, ducking under the horn.

---

## 6. Models (in order of importance)

1. **Hull generator** (build first).
   - 14 lofted stations, each a 10-point half-section: flat bottom, bilge radius, vertical sides with a parallel midbody, flare and a V forward, a transom aft. Mirror them and stitch into a `BufferGeometry` of about 600 verts, with sheer and stem rake from per-station offsets.
   - Paint is a height-mapped canvas: antifouling, boot-top, topsides, a sheer line.
   - Draft numerals, the Plimsoll disc with LR and the load-line ladder, and the name and port are separate decal planes on the flat midbody, bow and stern, so they stay razor-sharp.
2. **Deck kit**: liftable ribbed hatch pontoons, cell guides and lashing bridges (thin boxes), bulwark, bunker manifold, winches (cylinders), bollards (lathe).
3. **Superstructure aft**: chamfered stacked boxes with a canvas window strip, bridge wings, an extruded rounded funnel in the line's colours (yellow, blue band, black top), a mast with a spinning radar bar and halyards, an orange free-fall lifeboat (a capsule) on a stern ramp.
4. **Containers**: one `InstancedMesh` each for 20 and 40 ft, with per-instance colour and a canvas atlas (corrugation, door ends with locking bars, weight pips, fictional line logos, a reefer grille).
5. **Breakbulk**:
   - steel coils (a lathe ring)
   - timber packs (instanced boxes)
   - bagged pallets
   - cars (two rounded boxes and four wheels)
   - drums
   - one project cargo per region (a wind-turbine blade from an extruded airfoil, a transformer, a yacht on a cradle)
6. **Ship's cranes**: pedestal, cab, a tapered box boom with a painted truss, cable cylinders, a hook or spreader. They sit on the centreline, so no quay gantry blocks the view.
7. **Water**: one plane and one shader. Depth comes from a canvas map per harbour, plus band quantisation, hull foam from a capsule distance function (ship position, heading and size as uniforms), the ripples, the glints and `chartMix`. No depth texture, no reflections.
8. **Quay**: concrete apron, yellow coping, tyre and cylinder fenders, rails, light masts, a corrugated warehouse, lane paint in the port flag colours.
9. **Bunker barge and road tanker**: the hull generator set low and wide, with a manifold, hose reel, Yokohama fenders (capsules) and a Bravo mast. The truck is boxes, a cylinder tank and wheels.
10. **Tug and pilot boat**: short hull presets, a wheelhouse box, a bow fender torus.
11. **Flags and gulls**: the atlas, cloth and instanced birds (juice #14 and #30).
12. **Navigation aids**: lathe buoys, a striped lathe lighthouse, an extruded breakwater.
13. **Regional skylines**: instanced low-poly houses with per-region palettes (brick gables, red Baltic timber, white Mediterranean cubes, sand towers, Singapore blocks). No real landmarks.
14. **Chart pieces**: extruded islands with buff tops, a compass-rose decal, port dioramas.

**Budget.** About 80 draw calls, under 120k triangles, one 1024² shadow map fitted to the ship and quay, adaptive pixel ratio (reuse `AdaptiveRenderScale`), one instanced particle system, no post-processing (any vignette is CSS).

---

## 7. App icon and title screen

**Name** (a proposal for the naming round): **Full & Down**. It is a real chartering term for a ship whose holds are *full* and which is *down* to her marks, which is exactly a perfect solution. Alternates: *Down to the Marks*, *Blue Peter*, *Load Line*.

**Icon: "On the mark."** Navy hull plating with the Plimsoll disc (a ring and its bar) in signal white. Teal sea `#2D8DAF` fills the lower half, its white foam line **exactly through the bar**, and a tiny amber cell sits in place of the "L R". At 16 px it is a white ring and line on a navy and teal split, unlike a tomato or a beaver. A maskable variant keeps the disc in the safe zone.

**Boot loader** (inline SVG and CSS, playing before any script, like the tomato loop). A side-on hull bobs. Three boxes drop on and she sinks a tick with each as the red shrinks. On the third the waterline meets the disc, a yellow glint plays, Blue Peter runs up, and the boxes lift off to loop. The title types in letter by letter in Oswald. It holds still under `prefers-reduced-motion`.

**Title screen.** Dawn, in the Blue Riband low framing. The camera dollies slowly along a looming navy bow at the waterline, with gulls, a lighthouse beam fading into sunrise, and flags stirring. The title is **painted on the bow** like a ship's name, in white Oswald, with the home port on the stern. A "TAP TO SAIL" hoist hangs below. On tap: Blue Peter goes up, the horn sounds, and the camera cranes up and over the ship into the Pilot Chart, landing on the player's current port.
