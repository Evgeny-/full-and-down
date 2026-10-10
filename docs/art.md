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

- **Camera.** A perspective three-quarter view from the bow quarter (19° toward the bow, 30° above
  the horizon, a fixed 30° field across the ship), so you see her side, her bow and every box's
  face, end and roof. The ship fills a phone-width column. Wider screens see more harbour, and
  landscape phones put the HUD in a column on the right.
- **The quay row** runs along the quay, parallel to her side, a little back from the edge. The
  layout measures the lowest box so the freight tags always clear the bottom panel.
- **Passages** are open sea: the harbour slides off the screen before the burn ticks, and the next
  port slides in from the other side.
- **The hull is the emotion.**
  - It is lofted from stations in code ([`hull.ts`](../src/render/hull.ts)).
  - Its paint is the gauge: red antifouling up to the summer mark, navy topsides, the Plimsoll disc
    with the TF/F/T/S/W ladder, and draft numerals at bow and stern. Red showing means room aboard.
  - She settles on a damped spring as weight goes on and rides up a tick per tonne burned at sea.
  - A foam line runs where the water meets the hull.
- **Two deck cranes** follow the box in the air, so every lift reads as the crane's work.
- **Two kinds of ship.** Stacking levels sail a container feeder. Some single-tier levels sail a
  small bulk carrier instead ([`bulk.ts`](../src/render/bulk.ts)): open holds, a clamshell grab,
  and parcels (a steel bin with a weight plate, heaped with grain, coal, ore, timber, steel coils…).
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
  SAIL is Blue Peter; the hint is a bulb.
- **The route** (top):
  - port tabs show the national flag, the code on a chip in the colour of the boxes bound there,
    and the pump price, or "no fuel";
  - the port she's at is navy, with its full name on a yellow tag;
  - the fuel this call must cover reads along the route, up to the next port that sells it:
    fuel aboard → burn per leg → fuel left on arrival (or "n t short" in red, the leg in hazard tape);
  - later legs show only their days.
- **This call** (bottom plate):
  - the load bar: one cell per tonne of deadweight, cargo in port colours, fuel in amber, the fuel
    still needed hatched, the summer mark in red, and the weight bands beneath with their burn a day;
  - the fuel row: fuel aboard, − / +, and one button that buys just enough (it turns green when
    she has it).
- **Voices.** Every refusal speaks as the person who would stop you: Chief Engineer, Mate, Pilot,
  Harbour Master, Office.
- **Paperwork.**
  - Rules arrive as a *Notice to Mariners* (geography) or a *Company Circular*.
  - The result is an *Arrival Report* signed off FWE, with three rubber stamps and a logbook line
    naming the trap.
- **The map** is a pilot chart: eight sea areas, ports on a dashed magenta track, and a compass
  rose.
- **Night** is a navy harbour under sodium lamps.
