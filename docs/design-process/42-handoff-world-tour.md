# Handoff: the world tour (uncommitted work in the tree)

Everything below is **uncommitted** in the working tree on `main`. The last deployed commit is
`fcdb7ae`. Pushing to `main` deploys. Codex's own rework (logo, chart map, ship models: `src/ui/logo*`,
`src/ui/map.css`, `src/ui/mapCoasts.ts`, `src/render/ships/`, `review/ships.*`, `src/app/save.ts`)
is in the same tree. Commit and deploy the two together once that rework is finished.

## Checks at handoff time (2026-10-10, with Codex's work in progress present)

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 399/399 pass. This includes "port scenes > knows every port of the game".
- `node scripts/qa-levels.mjs 1 72`: 72/72 ok. L58 failed once on timing and passed on retry.
- Not run: `scripts/play.mjs` real-tap playthroughs, and the README/og screenshots
  (`node scripts/readme-shots.mjs`, needs the dev server on :5200).

## What changed

**World campaign** (voyages 10–72 left Europe):
- `src/core/ports.ts`: `AREA_PORTS` for eight areas in route order, each port with a UN/LOCODE-style
  code and an ISO country. Also `AREA_SHIPS`, plus `BULKER_NAMES`, the 10 Unimor Supramaxes (Alberta
  to Astoria), one per bulker voyage.
- `src/core/naming.ts`: picks a run of real neighbouring ports for each generated puzzle by role:
  - a bar falls on a river port;
  - a dry call falls on a small port;
  - the cheapest pump falls on a bunker hub;
  - a low bridge falls on a leg under a famous bridge.

  A use count spreads each area's voyages along its whole route. The pass runs in
  `scripts/build-levels.ts` on save, or on its own with `bun scripts/name-levels.ts`. The puzzles
  are untouched.
- `src/core/progression.ts` and `src/app/areas.ts`: world area names and blurbs, and world titles.
  The titles now live in the ladder itself; the level test checks them against it.
- Port scenes for 81 new ports are in `src/render/ports/landmarks/{baltic,blacksea,gulf,asia,latam,pacific}.ts`.
  These modules add regions (blacksea, gulf, austral, southasia, seasia, eastasia, japan, pacnw,
  latam, caribbean) and 17 new national flags in `src/render/nations.ts`. Scenes take the port's
  country (`Port.country`).
- `src/app/pilotNotes.ts`: about 65 famous ports get a line from the pilot under the arrival banner,
  e.g. "Table Mountain has her tablecloth on." The facts were checked; keep any new ones accurate,
  because the players are seafarers.

**Other changes:**
- **Camera** (`src/render/GameView.ts` `layout()`): pitch went from 30° to 25° so spires and bridges
  clear the top HUD on a phone. In portrait, the ship is measured in screen space and fitted whole,
  stem to stern, and centred.
- **OAL livery:** the funnel is royal blue with a broad white band and "OAL" over a wave.
  - It's drawn by `funnelTexture()` in `src/render/ship.ts`. The palette has `funnel`, `funnelBand`
    and `funnelMark`.
  - Cranes and the mast use `PAL.crane` and `PAL.mast` (yellow). Keep these if the ship models move.
- `shipKind()` moved to `src/core/rules.ts`. `GameView` re-exports it.
- In the pause menu, "Chart" became "Main menu". The settings glyph is a toothed cog
  (`src/ui/glyphs.ts`).
- The boot splash funnel uses OAL colours.

## Known loose ends

- **`nationOfPort()` name table** (`src/render/nations.ts`): it doesn't list most non-European ports,
  so the review pages show them as "unknown". The game is unaffected, because it passes `country`.
- **Polish the agents flagged:**
  - Klaipėda has a large plain green area behind the town.
  - Hikawa Maru has one funnel, but the real ship has two.
  - Yokohama, Hakodate and Tomakomai have no torii.
  - Kushiro's fog reads like ice.
  - Asian ports were not checked at night.
- **Desktop:** on wide screens (e.g. 1440×900) the top HUD covers the ship's funnel and the far shore.
  This predates the camera change. One option is the landscape side-column layout for wide screens.
- **Small phones:** on an iPhone SE (375×667) the far shore is mostly hidden under the HUD.
- **Docs:** the README features list is updated for the world tour. Regenerate its screenshots and
  `public/og.jpg` after the logo and map rework lands.
