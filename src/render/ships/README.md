# Ship models

`../ship.ts` assembles the ship and keeps the public API consumed by the game.
Its constructor, cargo coordinates and animated attachment points are shared contracts.
Edit the relevant builder to change the static model:

| File | Owns |
| --- | --- |
| `superstructure.ts` | Accommodation, bridge, lifeboats, funnel, radar and aft mast |
| `cargoDeck.ts` | Container hatches, lashing guides, reefer sockets and bulk holds |
| `fittings.ts` | Deck rails, foremast, breakwater, anchors and mooring machinery |
| `hullPaint.ts` | Hull lettering, draft/load marks and animated waterline shader |

Hull lofting remains in `../hull.ts`, which the bunker barge also uses. Crane animation
remains in `../crane.ts`. These modules do not depend on the port scenery or UI.

Builders receive their dimensions from `ShipModel`; they must leave the cargo block
clear and keep `slotPos()` compatible with the cargo meshes. Attachment vectors are
absolute coordinates relative to `ship.body`. Hull sampling uses hull-local x, so
subtract `hullOffsetX` when placing equipment in body space.

Each ship owns its geometry, materials and waterline uniforms. Batch static details
by material and dispose the temporary geometries after merging. Keep the object
named `radar` separate so the game can rotate it.

## Preview

Run `npm run dev`, then open `/review/ships.html`. The viewer can show loaded or empty
feeders and bulkers from both quarters and the near side:

```
/review/ships.html?kind=feeder&bays=5&tiers=3&loaded=1&angle=bow
/review/ships.html?kind=bulker&bays=2&loaded=0&angle=stern
```

`window.shipReview` exposes the ship, scene, camera and renderer for browser checks.
