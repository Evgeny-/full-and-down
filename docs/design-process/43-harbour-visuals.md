# Harbour visual pass

The harbour keeps the existing low-poly forms and regional silhouettes. Detailed
town buildings now have shallow window reveals, projecting sills, doorsteps,
plinths and eave trim. The shared facade helper batches these details into the
existing town meshes. Distant buildings keep their simpler faces.

The water uses slow swells and interrupted, thin crests. Small highlights follow
the crests; the foam around the hull uses world-space distance so the bow and
stern do not develop broad white patches. Wake and landing-ripple controls keep
their existing API. The water still uses one plane, one draw call and no textures.

Ålesund, Rotterdam and Hamburg were checked for finite geometry. The extra town
detail leaves draw calls unchanged: the measured Rotterdam scene increased from
26,046 to 41,270 triangles, and Ålesund from 25,895 to 30,271. Desktop comparisons
and a 390 px Rotterdam view were inspected. Water was checked during the day,
at night and on a coarse-pointer mobile renderer, including wake and ripples.

Ship models live in separate builders under `src/render/ships/`. Compatibility
checks cover cargo slots, crane attachment transforms and game picking across
24 ship configurations. Real mobile playthroughs of the first feeder and bulker
voyages both earned three stars.

Startup notices retain their subtitle and illustration. A short viewport scrolls
the dialog body with native touch gestures while keeping the heading and actions
visible. Notices, Settings, nested confirmation and reports were checked at
320 × 568, 390 × 844 and 844 × 390, including swipe and keyboard scrolling.

Mission HUD alternatives are a separate review step. The current production HUD
remains available until the user chooses a direction for cargo and fuel controls.
