# Full & Down: art direction ("Signal Hoist")

A bright working harbour on a clear morning, and a UI built from the International Code of Signals.
It is deliberately unlike the owner's other games:
- *cool* where Mise en Place is warm;
- steel and enamel instead of menu paper;
- a condensed industrial sans instead of a serif;
- flags instead of candy pills.

The full reasoning, and the directions that were rejected, are in
[design-process/12-art-direction.md](design-process/12-art-direction.md).

## The scene

- **Camera.** Orthographic, broadside, 27° above the horizon, so the box faces that carry the
  numbers get the pixels. The ship fills a phone-width column. Wider screens see more harbour,
  and landscape phones put the HUD in a column on the right.
- **The hull is the emotion.**
  - It is lofted from stations in code ([`hull.ts`](../src/render/hull.ts)).
  - Its paint is the gauge: red antifouling up to the summer mark, navy topsides, the Plimsoll disc
    with the TF/F/T/S/W ladder, and draft numerals at bow and stern. Red showing means room aboard.
  - She settles on a damped spring as weight goes on and rides up a tick per tonne burned at sea.
  - A foam line runs where the water meets the hull.
- **Two deck cranes** (a geared feeder) follow the box in the air, so every lift reads as the
  crane's work.
- **Containers.**
  - Coloured by port of discharge, as on a printed bay plan.
  - A big stencilled weight on the face, the destination's code flag as a sticker.
  - Reefers are white with a machinery grille; contract boxes carry a red wax seal.
- **Water.** One shader plane: depth bands, swell, glints, foam at the quay and around the hull,
  a wake at sea, landing ripples.
- **Flags.**
  - Blue Peter (P) runs up the yard when the plan is clear to sail.
  - A three-star arrival dresses the ship overall, bow to masthead to stern.

## The UI

| Token | Use |
|---|---|
| Navy `#1f2e4d` | plates, the selected port, headers |
| Signal white `#f8f7f2` | enamel |
| Flag red `#d62f2b` / yellow `#f5c518` / blue `#1e4fa3` | danger / highlight / SAIL |
| Fuel amber `#ee8b1e` | fuel only, nowhere else |
| Port colours | cobalt, teal, plum, brick, slate. Never ochre (it would read as fuel) |
| Oswald | every number and title (draft-mark numerals) |
| Sofia Sans | text |

- **Buttons and plates.** Enamel plates with a darker rim and rivets. Buttons are code flags:
  SAIL is Blue Peter, and the hint is G ("I require a pilot").
- **The route strip** is the bunker plan:
  - port tabs show their flag, code and pump price, or "no fuel";
  - each leg shows its days, band and burn as amber cells;
  - ROB on arrival sits under every port;
  - a shortfall turns to hazard tape.
- **The deadweight bar** is one cell per tonne: cargo in port colours, fuel in amber, the reserve
  darker, with the LIGHT / LADEN / DEEP zones beneath.
- **Voices.** Every refusal speaks as the person who would stop you: Chief Engineer, Mate, Pilot,
  Harbour Master, Office.
- **Paperwork.**
  - Rules arrive as a *Notice to Mariners* (geography) or a *Company Circular*.
  - The result is an *Arrival Report* signed off FWE, with three rubber stamps and a logbook line
    naming the trap.
- **The map** is a pilot chart: eight sea areas, ports on a dashed magenta track, and a compass
  rose.
- **Night** is a navy harbour under sodium lamps.
