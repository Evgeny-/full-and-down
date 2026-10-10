# HUD polish: exact changes

Same layout and components as today, made legible. The reference is `polished.html`, which renders every
value below. The comparison images are `compare.png` (level 12) and `compare-L2.png`.

**Height.** The strip stays 94 px. The cargo plate goes from about 120 px to 119 px. The dock is unchanged.

**Fonts.** `--num` is Oswald and `--font` is Sofia Sans, as today.

## Rules everywhere

- **Text size.** No HUD text below 12 px. The two exceptions are 11 px caps captions in the title row.
- **One shortfall figure.** It is `missingFuel(m)`: the tonnes BUY adds.
  - It appears on BUY, and on SAIL as "buy n t first". Nowhere else.
  - The strip marks the short port with the word SHORT, without a number.
  - The load bar's hatched cells are the same n.
- **Fuel aboard appears once**, in the fuel row. It is dropped from the strip and from the load line.
- **Units stay lowercase** (`t`, `/t`) even inside uppercase buttons: wrap them in `<span class="u">` with `text-transform:none`.

## Band colours (`Hud.ts`, `BAND_COLORS`, day only)

Change `['#8fb3d9', '#4a6fa5', '#1f2e4d']` to `['#4f7fb8', '#34558c', '#1f2e4d']`. These are darkened so that white 12 px text reads on the active zone. Two-band levels still use the 1st and 3rd. `BAND_NIGHT` is unchanged.

## Title row and profit rule (`game.css`)

- `.title .tt small`: from 9.5 px to `font: 700 11px/1 var(--font); letter-spacing: .12em`.
- `.rule .money .cap`: from 8.5 px to `11px`, with `letter-spacing: .12em`.

## Route strip

`Hud.ts` (`renderStrip`):

- **Drop the yellow `.youare` tab** ("⚓ KIEL"). The navy `.port.here` box marks the current port.
- **Drop the here port's fuel chip** (`.arr.have`, "5 t"). Render `<span class="arr"></span>` there.
- **Pump text:**
  - a pump: `${glyph('fuel',12)}$${price}/t`, adding "/t";
  - no pump: `no fuel`, without strikethrough;
  - the last port: `final`. All lowercase.
- **Arrival at ports in reach** (`i > m.port && i <= until`):
  - The first port whose `arrivalFuel < reserve` gets `<span class="arr bad">SHORT</span>`, with no number.
  - Ports after it in reach get an empty `.arr`.
  - Other ports keep `<span class="arr ok num">${glyph('fuel',11)}${left} t</span>`.
- **Active legs:** after `.burn`, add `<span class="bn">${bandName(lv, leg.band)}</span>`. Hide it in `.strip.dense`.

`game.css`:

```css
.strip { padding: 7px; }                                    /* was 12px 6px 5px (room for .youare) */
.strip .port { grid-template-rows: 16px 20px 13px 16px; gap: 3px; min-width: 52px; padding: 3px 4px; }
.strip .code { font: 600 16px/1 var(--num); }               /* was 14 */
.strip .code.chip { padding: 2px 6px 1px; }
.strip .pump { font: 700 12px/1 var(--font); letter-spacing: 0; }   /* was 10.5 */
.strip .pump.none { color: var(--red); opacity: 1; text-decoration: none; text-transform: none; font-size: 12px; }
.strip .pump.fin { color: var(--ink-2); opacity: 1; text-transform: none; font-size: 12px; }
.strip .arr { height: auto; padding: 0; font: 600 15px/1 var(--num); }
.strip .arr.ok { background: none; color: var(--fuel-2); }          /* no chip: nothing looks like "aboard" now */
.strip .arr.bad { padding: 3px 6px 2px; border-radius: 3px; background: var(--red); color: #fff;
                  font: 800 12px/1 var(--font); letter-spacing: .08em; }
.strip .leg { gap: 4px; padding: 6px 2px 0; }
.strip .leg .ltop { font: 700 12px/1 var(--font); letter-spacing: 0; text-transform: none; color: var(--ink-2); } /* was 8.5 caps */
.strip .leg .arrow, .strip .leg.active .arrow { height: 5px; margin: 2px 0 1px; }
.strip .leg .arrow::after { border-left-width: 8px; border-top-width: 6px; border-bottom-width: 6px; }
.strip .leg .burn { font: 600 15px/1 var(--num); }                  /* was 12 */
.strip .leg .bn { font: 800 12px/1 var(--font); letter-spacing: .04em; color: var(--band); }
.strip.dense .leg .bn { display: none; }
```

Delete the `.strip .port .youare` rules and the `.strip .arr.have` rule.

## Load bar (`renderLoad`)

Replace the `.lrow` line ("CARGO 3 T + FUEL 5 T 8/17 t … needs 1 t more fuel") with a 2×2 grid. The cargo/fuel equation and the "needs n t more fuel" hint are dropped: the cells show the split, and BUY carries n.

```html
<div class="load">
  <span class="tot num">8<small>/17 t</small></span>   <div class="cells">…</div>
  <span class="sub">9 t spare</span>                   <div class="zones">…</div>
</div>
```

`.sub` takes one of these forms:
- `${C-used} t spare`;
- `class="sub bad"`: `${over} t over`;
- `class="sub mark"`: `on marks`;
- while a box is held: `.tot` shows `used/C` and `.sub` shows `+${pv.weight} t`, or `${over} t over` in red.

Zone label: the longest of these three that fits in its zone, measured after render, with 10 px of slack:
1. `${NAME} <i>${rate} t/day</i>`
2. `${rate} t/day`
3. `×${rate}`

The active zone (`sailBand`) is solid in its band colour; the others are tinted.

```css
.cargo { padding: 8px 10px 7px; }
.load { display: grid; grid-template-columns: 64px 1fr; grid-template-rows: 20px 18px; gap: 5px 10px;
        padding-bottom: 8px; border-bottom: 1px dashed var(--rule); }
.load .tot { align-self: end; font: 600 24px/.8 var(--num); color: var(--navy); }
.load .tot small { font-size: 14px; color: var(--ink-2); }
.load .sub { align-self: center; font: 700 12px/1 var(--font); color: var(--ink-2); }
.load .sub.bad { color: var(--red); }  .load .sub.mark { color: var(--ok); }
.load .cells { height: auto; gap: 2px; }                            /* row is 20px; was 16px, gap 1.5 */
.load .smark { top: -4px; bottom: -4px; width: 3px; margin-left: -1.5px; border-radius: 1px; }
.load .zones { height: auto; gap: 2px; border-radius: 0; overflow: visible; }
.load .zones span { min-width: 0; gap: 4px; border-radius: 3px; opacity: 1; text-shadow: none;
                    background: color-mix(in srgb, var(--z) 16%, transparent); color: var(--z);
                    font: 800 12px/1 var(--font); letter-spacing: .06em; }   /* was 8.5 px at 38% opacity */
.load .zones span i { font-style: normal; font-weight: 700; letter-spacing: .01em; }
.load .zones span.on { background: var(--z); color: #fff; }
.load .zones span + span { box-shadow: none; }
```

## Fuel row (`renderFuel`)

- **Caption:** `Fuel at <b>${p.name}</b> · $${p.price}/t`, plus ` · lots of ${lot}` when sold in lots. Sentence case, no caps.
- **Aboard:** `<b class="num aboard">${fuelOut}<small> t</small></b><span>aboard · +${bought} t $${cost}</span>`. Drop the leading fuel glyph.
- **BUY:** `<span>Buy ${more} <span class="u">t</span></span><small>$${cost}</small>`. The "Can't / reach it" and "✓ Enough" states are unchanged.

```css
.fuel { gap: 6px; padding-top: 8px; min-height: 52px; }
.fuel .fl { gap: 5px; }
.fuel .fl .caps { font: 700 12px/1 var(--font); letter-spacing: 0; text-transform: none; }  /* was 9 caps */
.fuel .fa b { font: 600 26px/.8 var(--num); }  .fuel .fa b small { font-size: 16px; }       /* was 19 */
.fuel .fa small, .fuel .fa > span { font: 600 13px/1 var(--font); }
.fuel .btn.token { width: 44px; min-width: 44px; min-height: 44px; }                       /* was 40 */
.fuel .buy { min-width: 96px; min-height: 44px; gap: 3px; }
.fuel .buy small { font: 700 12px/1 var(--font); }                                          /* was 10 */
.fuel .nf { font-size: 12px; }
```

## Dock and SAIL

- `.dock .sail .lbl small`: from 10.5 px to `12px`.
- **SAIL caption.** If `missingFuel(m) > 0` at a port with a pump, block SAIL and show `buy ${missing} t first`. That is the same n as BUY; it replaces "n t fuel short". The other reasons are unchanged.
- **Required companion change in `Plan.ts`.** It's outside `Hud.ts`, but without it the HUD and SAIL disagree.
  - Today `legRefusal()` only checks problems at the current port. With 5 t aboard at Kiel, SAIL is enabled although Copenhagen will be short and Lübeck sells nothing, so she gets stranded at Lübeck.
  - Make it also refuse on any `short` problem at ports from `m.port` up to (but not including) the next port that sells bunkers.

## Polished+ (optional, one notch bolder; same design)

- `.port.here`: add `inset 0 3px 0 var(--yellow)` to its shadow.
- `.arr.bad`: `background: var(--black); color: var(--yellow); box-shadow: inset 0 -3px 0 var(--yellow)` (hazard colours).
- `.leg .bn` as a pill: white text on `var(--band)`, `padding: 2px 4px 1px; border-radius: 3px; font-size: 11.5px`.
- `.load .tot` 27 px; `.fuel .fa b` 30 px.
- Active zone: add `box-shadow: 0 0 0 2px var(--navy)`, and a 6 px navy caret under the cells at `left: used/C`.
