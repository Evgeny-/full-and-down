# 31 — Visual QA pass (phones, landscape, tablet, desktop, night)

Tester: visual QA. Runs used headless Chrome on the Mac GPU (Metal ANGLE) through puppeteer-core, with real taps and the `?debug` helpers. No source was edited.

**Coverage**
- **Devices:** 390×844 @3, 375×667 @2 (compact), 360×780 @3, 844×390 @3 (landscape), 820×1180 @2, 1440×900 @1, and night mode (`prefers-color-scheme: dark` with Night = auto) at 390×844 and 375×667.
- **Screens:** first launch (`?reset`: area card, notice, coach), levels 1, 6, 10, 15, 19, 28, 33, 37, 42, 46, 55, 60 and 72, each fresh and after `autoSolve()`. Also a held box, full plays with voyage frames and the arrival report (L1, L10, L19, L46, L72), the pause menu, Settings, and the chart (`?map&progress=40`).
- **Screenshots:** everything is in `.shots/vqa/`. Zoomed evidence crops are in `.shots/vqa/crops/`. Play-throughs are in `.shots/vqa/play-<device>-L<n>/`.

> **Build note.** The landscape HUD layout (`#ui.landscape`, right-hand column, `insets.right = 376`) landed at 13:13, while this pass was running. Every finding below was re-checked on the build after 13:13. The earlier landscape shots (`land-first-*.png`) show the old, unusable layout and are superseded by `land-first2-*.png`. UI files changed again at 13:29–13:30. A final re-check (`.shots/vqa/v2-*.png`) confirmed items 1, 2, 3, 4, 5 and 8 still reproduce on that build.

Priority key:
- **P1:** broken or unusable.
- **P2:** a clearly visible bug.
- **P3:** polish.

---

## P1

### 1. Landscape: dialog buttons fall off-screen (arrival report, first notice)
- **Device:** 844×390 landscape. Any phone under ~520 px tall is likely affected too.
- **Screens:** arrival report after any voyage, and the first-launch notice "Fuel weighs too".
- **What's wrong:** the report dialog is 529 px tall in a 358 px box. `IMPROVE` and `NEXT VOYAGE` sit at y = 481–527 in a 390 px viewport, so the main action after every level is invisible. You only find it by scrolling inside the dialog, and nothing hints that you can. The notice has the same problem: 439 px in 358 px, with `NOTED` below the fold. That is the very first tap of the game.
- **Screenshots:**
  - `.shots/vqa/play-land-L01/09-report.png`
  - `.shots/vqa/land-report-r.png`
  - `.shots/vqa/land-first2-b-notice.png`
- **Fix:**
  - Make `.dialog` a flex column with a scrolling body and pinned actions: `.dialog { display:flex; flex-direction:column } .dialog > .body { overflow:auto; min-height:0 } .dialog .actions { position:sticky; bottom:0; background:var(--enamel); padding-top:10px; box-shadow:0 -10px 12px -6px var(--enamel) }`.
  - Under `@media (max-height: 480px)`:
    - Lay the report out in two columns: `.report-dlg { width:min(720px,100%) }`, with stamps and ledger on the left and remarks and logbook on the right.
    - Shrink the stamps to 64 px.
    - Hide `.notice-art`, or float it left at 40 % width.

---

## P2

### 2. Freight tags are clipped by the bunker plate; on SE the destination code disappears
- **Devices:**
  - Every portrait size: 7 px of overlap at 390/360/820/1440.
  - 375×667 (compact): 10.5 px of overlap. That hides the whole `RTM` / `ANR` / `DKR` row.
- **Screens:** every level in planning mode.
- **What's wrong:** the tag box ends at y = 608.5 while `.bunker` starts at y = 602 (360×780 L46). On SE it is 527.5 against 517. The tag's port-code badge, which is the destination, sits under the plate. Box colour and flag still hint at the port, but on 5-port levels that hint is weak.
- **Screenshots:**
  - `.shots/vqa/crops/se-tags-under-bunker.png`
  - `.shots/vqa/crops/ip-tags-under-bunker.png`
  - `.shots/vqa/se-L72-plan.png`
- **Fix:** in `App.onResize`, add about 12 px to `insets.bottom`: `66+50+62+34 → +46` for normal and `58+40+52+30 → +42` for compact. That lifts the quay row and tags clear of the plate. Even better, derive it from the plate: `insets.bottom = window.innerHeight - bunker.getBoundingClientRect().top + tagHeight(33) + 6`. Then the HUD and the 3D row can't drift apart again.

### 3. The held box hides behind the deadweight bar
- **Devices:** all of them (portrait, landscape, tablet, desktop, night).
- **Screens:** tap any quay box.
- **What's wrong:**
  - `GameView.setHeld` lifts the box by +0.55 world-y, about 22–25 px on a phone. That pushes the top half of the box (the stencilled weight) under `.dwt`, which sits in the 70 px `barPx` band right above the quay row. The thing you just picked up is the least visible thing on screen.
  - The box also floats with no crane hook or wire. The code comment says it "hangs on the crane hook", but the crane stays parked.
- **Screenshots:**
  - `.shots/vqa/crops/ip-held-under-dwt.png`
  - `.shots/vqa/play-se-L19/01-held.png`
  - `.shots/vqa/play-and-L72/01-held.png`
  - `.shots/vqa/land-L19-held.png`
  - `.shots/vqa/dark-ip-held.png`
- **Fix:** lift toward the camera instead of up: `to = base + (0, 0.18, 0.45)` with `mesh.scale.setScalar(1.06)`. On screen it then pops forward and slightly down, never into the bar. If the "up" read matters, raise `barPx` from 70 to about 96 so the hover has clearance. Option: point the nearer crane's hook at the held box (`crane.target`) so it doesn't float.

### 4. Chart: star ratings and padlocks are mis-rendered on every node
- **Devices:** all of them.
- **Screen:** `?map`.
- **What's wrong:**
  - The selector `.track svg { position:absolute; inset:0 }` (screens.css) also matches the star SVGs in `.node .ns`, the lock glyph in `.disc` and the ship glyph in `.you`.
  - All three stars render on the same pixel at the node's top-left (checked: three `<svg>` elements, identical rects, `position:absolute`). So a completed level shows one small star half on the rim, and 1★, 2★ and 3★ look the same.
  - Padlocks sit on the disc's top-left rim instead of in the centre.
- **Screenshots:**
  - `.shots/vqa/crops/ip-map-stars-locks.png`
  - `.shots/vqa/ip-map-map.png`
  - `.shots/vqa/se-map-map.png`
- **Fix:** scope the rule with `.track > svg { position:absolute; inset:0 }`, or give the route SVG a class (`.track svg.route`).

### 5. Night mode: key HUD signals vanish (dark on dark)
- **Devices:** 390×844 and 375×667, with Night = auto + OS dark, or Night = on.
- **What's wrong** (contrast ratios against the night enamel `#263552`):

| Element | Colour | Contrast | Result |
|---|---|---|---|
| Deadweight free cells (`--enamel-3`) | `#2e3e60` | 1.15:1 | Spare capacity is invisible, and that is the core reading of the game |
| ×2 band in the zone bar | `#1f2e4d` | 1.1:1 | Invisible |
| LADEN leg arrow in the strip | `#1f2e4d` | 1.1:1 | Invisible |
| Selected port tab (`.port.sel`, navy) | navy | ≈1.1:1 | You can't tell which port you're editing |
| Reefer count `❄1` / `.burn small` | `#1e4fa3` | 1.6:1 | Barely visible |
| ROB pill text | `#2f8a72` | 2.9:1 | Low |
| Fuel burn | `#c96d0e` | 3.3:1 | Low |
| Settings "Night OFF / AUTO / ON": selected `.navy` vs unselected enamel | | ≈1.1:1 | The current choice isn't visible |

- **Default setting:** the default is `night: 'off'`, so an OS dark-mode user still gets the day theme. Decide whether `auto` should be the default.
- **Screenshots:**
  - `.shots/vqa/crops/dark-dwt-free-cells.png`
  - `.shots/vqa/crops/dark-strip-contrast.png`
  - `.shots/vqa/crops/dark-settings-segmented.png`
  - `.shots/vqa/dark-ip-plan.png`
  - `.shots/vqa/dark-ip-solved.png`
- **Fix:**
  - `html.night .dwt .cells i.free { background:#3d5078; box-shadow:inset 0 0 0 1px rgba(255,255,255,.14) }`
  - Night band colours `['#8fb3d9','#6d8fc4','#c9d6ea']` in `bandColor()`
  - `html.night .strip .port.sel { background:#3b5687; box-shadow:inset 0 0 0 2px #8fb3d9 }`
  - `html.night .strip .leg .burn small { color:#8fb3d9 }`
  - `html.night .strip .rob { color:#7fe0c0 }`
  - `html.night .strip .leg .burn { color:#f3a54a }`
  - `html.night .settings .seg .btn.navy { background:var(--yellow); color:var(--black) }`

### 6. Port name board is sunk halfway into the quay (desktop)
- **Device:** 1440×900, and any non-portrait view where `sign.visible = !portrait`.
- **Screens:** every port call ("FELIXSTOWE", "HAMBURG", "REYKJAVIK"…).
- **What's wrong:** the 2.4×0.6 plane is centred at `QUAY_Y + 0.05` and tilted `-π/2 + 0.25`, so its lower half is below the apron. The enamel board is cut in half and its port code is unreadable.
- **Screenshots:**
  - `.shots/vqa/crops/desk-port-sign-sunk.png`
  - `.shots/vqa/desk-L72-solved.png`
  - `.shots/vqa/play-desk-L10/01-held.png`
- **Fix:** pivot the plane from its bottom edge with `makeSign(): geometry.translate(0, 0.3, 0)` and keep y = `QUAY_Y + 0.01`. Alternatively, raise y by `0.3·sin(0.25)+0.02 ≈ 0.1`. A short post or easel would make it read as a standing sign.

### 7. Channel buoys appear on the quay apron when leaving or arriving
- **Devices:** all of them. Seen at 390×844 and 360×780.
- **Screens:** the first second of a voyage, and arrival.
- **What's wrong:** the near-side green cones (`z = 2.4`) become visible once `sea > 0.25`, while the quay still covers that x range. A green buoy then sits on the concrete.
- **Screenshots:**
  - `.shots/vqa/crops/ip-buoy-on-quay.png` (from `play-ip-L01/03-voyage0.png`)
  - `.shots/vqa/play-and-L72/06-voyage0.png`
- **Fix:** in the buoy loop, `b.visible = sea > 0.25 && Math.abs(x - this.world.position.x) > this.quayWidth / 2 + 0.6`. Alternatively, place near buoys at `z < quayEdge - 0.5`.

### 8. 360 px: the bunker caption cuts off the price
- **Device:** 360×780.
- **Screens:** any manual-bunker port with a long name (Reykjavik, Duisburg, Casablanca).
- **What's wrong:** `BUNKERS · REYKJAVIK · $…`. The ellipsis removes the fuel price, which is the one number that matters on this plate.
- **Screenshots:**
  - `.shots/vqa/crops/and-bunker-ellipsis.png`
  - `.shots/vqa/and-L72-plan.png`
  - `.shots/vqa/play-and-L72/02-port0.png`
- **Fix:** put the price first (`$2/t · Reykjavik`), or drop the "Bunkers ·" prefix under 380 px (`@media (max-width:380px)`). Another option is to move the price into the `<b>` line next to the stepper.

### 9. 5-port levels on short phones: the ship is squeezed under the route strip
- **Devices:** 375×667, and also 360×780 and 390×844.
- **Screen:** L72, and any level with bar signs.
- **What's wrong:**
  - In some tabs a `≤11t` / `≤13t` bar sign pushes the ROB pill onto a third row, so the strip grows to 104 px at 390×844 (y = 112 → 216; the minimum is 96).
  - On SE the crane jibs run under the strip.
  - The bridge and funnel are half cut by the left edge, and the bow by the right edge.
  - The ROB pills no longer share a baseline (`ROB 2` beside a lower `ROB 1`).
- **Screenshots:**
  - `.shots/vqa/se-L72-plan.png`
  - `.shots/vqa/ip-L72-plan.png`
  - `.shots/vqa/and-L72-plan.png`
  - `.shots/vqa/crops/ip-strip-rob-misaligned.png`
- **Fix:** put the bar sign in the port tab's top-right corner, like the red dot, or inline with the code (`DKR ≤11`). Then give `.strip .port` fixed rows (`display:grid; grid-template-rows:16px 15px 12px 16px`) so ROB pills align and the strip height stays put. In `GameView.layout` portrait, let only the bow overflow: offset `look.x` toward the bow by `(span - col/unit)/2` so the superstructure stays in frame.

---

## P3

| # | Device / screen | What's wrong | Screenshot | Fix |
|---|---|---|---|---|
| 10 | All devices, holding a box | The deadweight hint reads `+4 T 4 T TO SPARE` (two numbers run together, no separator) | `.shots/vqa/crops/ip-held-under-dwt.png` | `+4 t → 4 t spare`, or `+4 t · leaves 4 t` (Hud.renderDwt `hint`) |
| 11 | All devices, freight rule | The legend is spread `space-between`, but the tick marks sit at their real values. When ★ = ★★ (L15 $29/$29, L19, L28, L33, L37, L42, L55, L60) two labels show the same value at left and centre, while both ticks overlap near the right | `.shots/vqa/crops/ip-rule-legend-vs-marks.png` | Position legend spans at their mark % (clamped to the edges), or merge equal thresholds into `★/★★ $29` |
| 12 | All phones, deadweight bar | Zone labels `×1 ×2 ×3` are 7.5 px white on `#8fb3d9` (2.2:1). The `S` mark label (9 px) collides with the hint row's right end. Other text at 8.5 px: leg labels, tag port codes | `.shots/vqa/crops/ip-dwt-zone-labels.png` | Zone bar 11 px tall with 9 px navy text on light bands. Move `S` below the bar or into right padding. Keep HUD text at 9.5 px or more |
| 13 | 360×780, L46 | A two-line voice message ("The contract box for Agadir must sail from Cádiz.") grows upward and touches the bunker plate (top 652.9 vs plate bottom 654) | `.shots/vqa/crops/and-voice-touches-bunker.png` | Clamp `.voice span` to one line with ellipsis (tap opens the full text), or place `.bunker` relative to the measured voice height |
| 14 | All devices, three-star arrival | Flag confetti spawns at `deckY+2.5`. On phones that is a band over the breakwater, well above the ship, and it mixes with the dress-ship line. It reads as debris on the mole | `.shots/vqa/crops/ip-confetti-over-breakwater.png`, `.shots/vqa/play-ip-L01/06-voyage3.png` | Spawn at the masthead or deck, burst upward, fewer black and white squares; or spawn in front of the hull (z + 1) |
| 15 | 844×390 landscape | The lighthouse and crane jib tips peek out between the right-hand HUD plates, cut off at the top | `.shots/vqa/crops/land-lighthouse-peek.png`, `.shots/vqa/play-land-L01/05-voyage2.png` | Keep harbour props left of `w - insets.right`, or give the column a backing (`.landscape .hud::after{right:0;width:376px;background:linear-gradient(90deg,transparent,rgba(23,96,127,.55))}`) |
| 16 | All portrait sizes | Quay bollards poke through the top edge of the deadweight plate (black blobs on its border) | `.shots/vqa/crops/ip-dwt-zone-labels.png`, `.shots/vqa/ip-first2-c-coach.png` | Move `.dwt` top 4–6 px lower, or skip bollards inside the plate's x-range |
| 17 | Phones | Between the strip and the water, far-shore houses show only as roofless coloured blocks; the roofs are under the strip, so they look like floating boxes | `.shots/vqa/ip-L06-plan.png` | In portrait, lower the town band or cull houses whose roofs fall under `insets.top` |
| 18 | 1440×900, 820×1180 | The ship is capped by the 640 px column, so it fills about a third of the desktop width over a large empty apron. On tablet the lighthouse is cut by the right edge | `.shots/vqa/desk-L72-solved.png`, `.shots/vqa/tab-L72-plan.png` | Raise the column cap to about 900 px when `w ≥ 1200`; keep props inside `viewW` |
| 19 | Phones, voyage | During the passage the bottom ~45 % of the screen is empty apron or open sea (the HUD has faded) | `.shots/vqa/play-and-L72/07-voyage1.png`, `.shots/vqa/play-ip-L01/04-voyage1.png` | Pan the camera down to centre the ship at sea, or show the "living chart" leg strip there |
| 20 | First launch, all phones | Area-card blurb leaves an orphan ("…fuel that / weighs.") and sits over the hull name and deadweight plate. In landscape it centres on the whole viewport, across the HUD column | `.shots/vqa/se-first2-a-area.png`, `.shots/vqa/land-first2-a-area.png` | `text-wrap: balance`; `.landscape .area-card { right: 376px }` |
| 21 | Chart, all devices | Scrolled content shows through the header (a ghost "THE BUNKER CHARTER 36" behind the logo). Locked level titles at 0.35 opacity are about 1.7:1. In night mode the light-grey locked discs are the brightest things on screen | `.shots/vqa/ip-map-map.png`, `.shots/vqa/dark-ip-map-map.png` | Header solid to 85 % before the fade; `.node.locked .nt { opacity:.55 }`; `html.night .node.locked .disc { background:#3a4a68 }` |
| 22 | Pause menu, 375×667 | The threshold line wraps and leaves `$30` alone on a line; `★ $27 · ★★ $27` reads like a bug | `.shots/vqa/se-menu-pause.png` | Render as three chips in one row, and merge equal thresholds |
| 23 | Settings, all devices | Native range sliders (off-style next to the enamel buttons). `RESET PROGRESS` wipes the save with one tap and no confirm | `.shots/vqa/ip-menu-settings.png` | Style the track and thumb with tokens; add a confirm dialog (red head, "Reset all 72 voyages?") |
| 24 | 375–390 wide, long hulls | The ship name `SNOW BUNTING` runs into the bow draft marks | `.shots/vqa/ip-L55-plan.png` | Cap the name's texture width, or shift it aft for long names |

---

## What looked right
- **Portrait HUD stack:** the stack (title, rule, strip, deadweight, tags, bunker, voice, dock) never overlapped at 390, 360, 375 (compact), 820 or 1440, apart from items 2 and 13.
- **Report sizes:** the arrival report fits at 375×667 (centred), 360×780 and 1440×900 (bottom-anchored). The stamps, ledger and logbook read well.
- **3D scene:** reefer boxes, contract seals, stacked boxes and the deck cranes have no z-fighting. Ghost previews on legal stacks are clear. Draft marks and the Plimsoll disc are crisp.
- **New landscape layout:** with the harbour on the left and the HUD column on the right, planning works. Boxes and tags are tappable; only the dialogs (item 1) and polish items 15 and 20 remain.
- **Console:** no errors in any run.
