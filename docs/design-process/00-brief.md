# Design brief: a bunkering & loading puzzle game

## Where the idea comes from

A friend (a seafarer) asked for:

> "A game for sailors: you have to bunker (take on fuel), load cargo and sail to one or more ports,
> maximizing the cargo — without over-bunkering and without under-bunkering. Enough fuel to reach
> the port, but so that you can take more cargo."

So the heart of it is the **fuel vs. cargo tradeoff**: every tonne of fuel you take is a tonne of
cargo you can't carry (deadweight is shared), and a heavier ship burns more fuel. Take too little
fuel and you never arrive; take too much and you left money on the quay.

## What the owner wants

- A **level-based** puzzle game, every level different, with **many mechanics that appear over
  time** to keep it fresh and deepen it.
- **Not too easy**: level 1 can be a tutorial, but from level 2 on the player must *think* — no
  "tap around and it works out". Difficulty must **grow non-linearly**: a sawtooth with breathers
  and spikes, not a straight ramp.
- **A unique visual style** of its own (not a reskin of the owner's other games), 3D, juicy,
  lots of nice effects. Mobile-first web game (phone portrait primary, desktop works too).
- English UI. Plays in the browser, deployed to evgeny.io/games/<name>/.
- A good name.

## The quality bar: the owner's sibling games (read them!)

All in `~/Projects/`:

- **Mise en Place** (`~/Projects/cooking`) — the favourite. A cozy 3D (three.js, orthographic,
  clay-like models built in code) kitchen puzzle. Read `docs/design.md`, `docs/difficulty.md`,
  `docs/ui-style.md`, `README.md`, and the screenshots in `docs/screens/*.jpg`. Note especially:
  difficulty is **measured** with a solver and simulated players (planners that look d moves
  ahead, "forced"/"deep" decisions, random win chance), and levels are **searched for** by a
  guided generator that hill-climbs toward per-level difficulty targets. Every level is solvable
  by construction. A distinctive UI identity ("Carte du jour": menu paper, ink outlines, hard
  offset shadows, Vollkorn + Jost). Map screen (a food street). Undo/hint helpers, 3 stars.
- **Pixel Picnic** (`~/Projects/ants`) — 3D beavers carrying pixel art, slots, mystery boxes, ice,
  gates.
- **Pot Luck** (`~/Projects/food-arrows`) — 2D sliding-arrow tiles into recipes, side bowl.

## Hard constraints for the design

1. Puzzles must be **discrete and exactly solvable by a computer** (integer quantities, finite
   choices) so we can verify solvability, compute the optimum, and **measure difficulty**.
2. It must not collapse into "fill the bar to the max" arithmetic. The interesting part must be
   *decisions with consequences*: which cargo, where to put it, how much fuel, where to bunker,
   which route, in what order — interacting rules that create traps and "aha" moments.
3. Readable on a phone screen in portrait. Tap/drag interactions, undo always available.
4. Implementable in TypeScript + three.js + Vite by one strong engineer in a long working session
   (hours, not weeks) — but ambitious. Procedural/code-built 3D models (no external 3D assets),
   Web Audio synth sounds.
5. Audience: seafarers will appreciate authentic touches (Plimsoll marks, draft, bunker
   terminology, stowage, port rotation…), but it must be approachable for anyone.
