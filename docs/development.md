# Full & Down: development notes

## How it works

- **Rules** ([`src/core/rules.ts`](../src/core/rules.ts)). A level is a voyage: ports in rotation
  order and a leg between each pair. The player's *plan* is one call per port (except the last):
  which boxes to load and on which stack, and how many tonnes of bunkers to buy. `simulate()` sails
  a plan on paper and returns a `Projection`:
  - every call's bays after discharge;
  - every leg's weight, band, burn and fuel in and out;
  - freight, bunkers and profit;
  - the problems, in the voice of whoever would stop her (Chief, Mate, Pilot, Harbour Master,
    Office).

  Illegal loads bounce back to their quay. Everything else reads this projection: the game, the
  solver tests, the hint and the generator.
- **The exact solver** ([`src/core/solver.ts`](../src/core/solver.ts)) uses a decomposition. A
  *manifest* (which boxes sail) fixes the weight on every leg, so:
  - the cheapest bunker plan for it is a small DP over (port, fuel on arrival);
  - stowage is a feasibility search (tiers, never-bury, heavy-below-light, reefer plugs).

  It walks manifests by their upper bound (freight − bunkers) and checks stowage lazily. Tests
  compare it with brute force over every plan on 150 random tiny levels
  (`tests/decomposition.test.ts`).
- **Simulated players, metrics and the generator** (`src/core/players.ts`, `metrics.ts`,
  `generator.ts`, `targets.ts`, `progression.ts`). See [difficulty.md](difficulty.md):
  - greedy loaders;
  - strong and careful editors;
  - a random tinkerer;
  - exchange depth, decoys and ablation;
  - a hill climb toward each ladder row's band.
- **The plan model** ([`src/game/Plan.ts`](../src/game/Plan.ts)): port tabs, undo, NEED, the
  automatic valve of the first world, and the reason SAIL is refused.
- **The view** ([`src/render`](../src/render)) is three.js with an orthographic camera at 27°:
  - `ShipModel`: a lofted hull painted as the gauge (red antifouling up to the summer mark),
    superstructure, two deck cranes and cell guides;
  - `GameView`: places the boxes for the selected port call, crane lifts, ghosts on legal stacks,
    the voyage (the harbour slides away, buoys drift past, the hull rises a tick per tonne burned)
    and the discharge;
  - `Water`: one shader plane;
  - `FxView`: puffs, sparkles, flag confetti.

  The plan is the truth; the view animates toward it.
- **UI** ([`src/ui`](../src/ui)), in the "Signal Hoist" identity (enamel plates, code flags, Oswald
  numerals):
  - the HUD: freight rule with stars, route strip, deadweight bar, bunker valve, the voice line,
    the dock;
  - the pilot chart (map);
  - dialogs (Notice to Mariners, the arrival report).
- **Sound** ([`src/audio`](../src/audio)) is synthesised: harbour foley, ambience, engine, and one
  theme per sea area. See [audio.md](audio.md).

```
src/core/     rules, solver, players, metrics, generator, campaign ladder (pure TS)
src/game/     the plan model (tabs, undo, NEED, auto valve)
src/render/   three.js scene: hull, ship, cranes, boxes, water, harbour, effects, view
src/ui/       HUD, map, dialogs (DOM + CSS)
src/app/      app flow, saves, notices and coaching, sea areas
src/audio/    Web Audio synthesis
scripts/      level builder and audit, app icons, screenshot and play-through helpers
```

## Debug flags

- `?level=12` opens a level.
- `?nointro` skips the Notice to Mariners.
- `?map` opens the chart.
- `?progress=20` fakes progress.
- `?reset` clears the save.
- `?debug` exposes `window.game` and gives free pilots, with *Auto-solve* in the pause menu.

## Scripts

```bash
npm run dev                               # http://localhost:5200
npm test                                  # rules, solver vs brute force, levels
bun scripts/build-levels.ts               # the campaign → src/data/levels.json (JOBS=8, LEVELS=1-20)
bun scripts/audit-levels.ts               # replays and re-solves every level → docs/difficulty.md
bun scripts/build-app-icons.ts            # app icons from public/icon.svg
node scripts/shot.mjs <url> <png> [w,h] [ms] [dpr]   # headless screenshot on the GPU
node scripts/play.mjs <level> [outdir] [w,h]         # plays the optimal plan with real taps, screenshots each step
```

Pushing to `main` deploys to evgeny.io/games/full-and-down/ (`.github/workflows/deploy.yml`).
