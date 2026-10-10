# Brief: port scenes for the world beyond Europe

*Full & Down* is a three.js puzzle game about loading a ship and buying fuel, voyage by voyage. It is
made for seafarers, so recognisable places matter. A chief officer should see the anchorage at
Fujairah full of tankers, or the Potemkin Stairs at Odessa, and smile.

The campaign now sails round the world. The sea areas and their ports, in route order, are in
`src/core/ports.ts` (`AREA_PORTS`), and each port carries its ISO country. You build the far-shore
scenes for one group of the new ports.

## How the scenes work

Read these first:
- `src/render/ports/index.ts`: what a scene is, the coordinates, and the update hook.
- `kit.ts`, `town.ts`, `props.ts`, `structures.ts`, `harbour.ts`, `regions.ts`: the builders and the
  regional looks.
- `landmark.ts`: the `Landmark` type.
- One finished module for conventions, such as `landmarks/nordic.ts` or `landmarks/iberia.ts`.

`buildPortScene(name, width, country)` builds the following:
- the breakwater with a lighthouse (or your landmark's own mole), the far shore and the hills;
- the town, in the region's house style;
- trees and set pieces;
- the port's landmark;
- the national flag on a pole. The flag comes from the port's country.

A module in `src/render/ports/landmarks/` exports three things:
- `REGIONS`: its regional looks. These replace the generic placeholders in `regions.ts` at load time.
- `LANDMARKS`: id → `Landmark`.
- `PORTS`: rows of `[portName, regionId, landmarkId?]`. Every port in your list must have a row.

## Rules

- **Nothing floats.** Everything stands on the ground (`k.ground(x, z)`), the mole, or the water.
  Bridges need piers that reach the ground or the water, and ships sit in the water.
- **Keep clear of the stage.** Nothing may come nearer the camera than the breakwater armour
  (z ≤ −6.3). The game's ship is at z = 0 and the quay at z > 1.5.
- **Stay within budget.**
  - Each scene should be about 15–32k triangles (the existing ones average 22k), and a scene should
    build in under 40 ms.
  - Build through the kit, which merges by material into a handful of meshes. Don't add your own
    materials unless you must.
- **Make it read on a phone.** On a phone the camera sees the far shore from about 30° above, and
  only the lowest 3–5 world units above the shoreline may show under the HUD. So the landmark's
  identity has to read low and wide: Table Mountain's flat top, the Bridge of the Americas' arch,
  rows of gantry cranes, Marina Bay Sands' three towers and the ship-shaped deck on top. A thin tall
  spire on its own won't do.
- **Look like the place.** Each port gets the region's houses, ground colours, trees and boats, with
  its own variety. Desert ports are sand and rock, not green fields. Tropical ports have palms.
  Japanese ports have tiled roofs and pines.
- **Flags.** If your group has nations whose flags are still placeholders in `src/render/nations.ts`
  (`XX: placeholder, // Country`), replace only your own lines with a real drawer. Use the helpers
  in that file (`hz`, `vt`, `seq`, `star`, `poly`, `rect`, `sun`, `nordic`). Simplify emblems so
  they still read at 24×16.

## Working alongside five other agents

Five other agents are building other modules at the same time.
- **Your files.** Edit only your own module file and your nations' placeholder lines in
  `nations.ts`. Use small, targeted edits, and re-read `nations.ts` right before editing it, because
  others change other lines.
- **Shared files.** Do not edit `kit.ts`, `town.ts`, `props.ts`, `structures.ts`, `harbour.ts`,
  `regions.ts`, `registry.ts`, `landmarks.ts`, `table.ts`, `index.ts`, the game, or the tests. If
  you need a shared helper changed, copy it into your module and change the copy.
- **No git** commands, and don't start or stop servers. A Vite dev server is already running at
  http://localhost:5200.

## Reviewing your work

Review page: http://localhost:5200/review/ports.html
- `?port=Odessa&cam=phone`: one port, from the phone camera. `cam=free` orbits; `cam=wide` is a
  wide view.
- `?grid=1&ports=Odessa,Varna,Batumi&cam=phone`: several ports side by side.
- `&night=1` for night; `?audit=1` for triangles, meshes and build times of every scene.

To screenshot, run `node scripts/shot.mjs "<url>" <out.png> [width,height] [waitMs] [dpr]`, which
uses headless Chrome. Then look at the PNG with the Read tool.
- Put screenshots in `.shots/<your-module>/`.
- Check every port from `cam=phone` at 390,844. Check low-angle close-ups of anything that could
  float.

## Before you finish

- `npx tsc --noEmit` must report no errors in your files. Errors in other agents' unfinished modules
  may show while they work, so ignore those.
- In `npx vitest run`, the "knows every port of the game" test passes only once every module is
  done, so just make sure none of your ports appear in its missing list.
- Report:
  - the ports you covered and each one's landmark;
  - the flags you drew;
  - the audit numbers for your scenes;
  - the screenshot paths;
  - anything you were unsure about.
