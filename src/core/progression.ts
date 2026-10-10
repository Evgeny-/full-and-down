/**
 * The campaign: 8 sea areas × 9 levels, each area a double sawtooth (docs/design.md):
 *
 *   x.1 B2 intro · x.2 B3 · x.3 B4 · x.4 B5 spike · x.5 B1 "Full & Down" · x.6 B2 twist · x.7 B3 · x.8 B4 · x.9 B6 boss
 *
 * Every new rule arrives on a gentle level (an area's x.1 or x.6; World 1 is denser: its rules are
 * the core concepts). A row lists the mechanics *present*: the core ones (fuel weighs, bands, a
 * second call, pickups, stacks) follow the voyage's shape, and at most three advanced rules ride
 * along, so each one can be load-bearing (ablation, docs/design-process/13 §5).
 */
import type { Level, Mechanic } from './types';
import { PORT_FLAGS } from './ports';

export type BandId = 'T0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
export type LevelFormat = 'spot' | 'contract' | 'exact';

export interface Area {
  name: string;
  blurb: string;
  /** the code-flag letters this area's ports fly (its signal palette) */
  flags: string[];
  /** scene tints: sea, sky, land */
  colors: { sea: string; sky: string; land: string };
}

export const AREAS: Area[] = [
  { name: 'North Sea', blurb: 'Short-sea coasters out of Rotterdam. Fuel weighs, and one tonne over the stripe doubles the burn.', flags: ['R', 'F', 'E', 'K', 'A', 'O', 'G', 'D'], colors: { sea: '#2d6f8a', sky: '#c9dde6', land: '#7d8b74' } },
  { name: 'The Coast', blurb: 'Channel ports, tide and timetable. The valve is yours now, and not every berth has a bunker barge.', flags: ['H', 'A', 'L', 'Z', 'S', 'C', 'D', 'W'], colors: { sea: '#2f7f95', sky: '#d4e6ec', land: '#8c9a7c' } },
  { name: 'Up the Rivers', blurb: 'Rouen, Duisburg, Bremen: shallow bars at the river mouths. Deliver first, bunker after the bar.', flags: ['R', 'D', 'H', 'E', 'N', 'O', 'C', 'M'], colors: { sea: '#4b7a6e', sky: '#dfe8e1', land: '#6f8a5c' } },
  { name: 'Bunker Calls', blurb: 'Down the African coast, where every pump has its own price and the barges sell in lots.', flags: ['G', 'L', 'D', 'T', 'A', 'C', 'S', 'F'], colors: { sea: '#1f78a4', sky: '#f3e7cf', land: '#c9a46a' } },
  { name: 'Liner Loop', blurb: 'A Mediterranean feeder rotation. Heavy boxes go low, and the rotation decides what stands on what.', flags: ['A', 'E', 'G', 'R', 'M', 'C', 'S', 'T'], colors: { sea: '#1c6fa8', sky: '#e8eef4', land: '#c7b48c' } },
  { name: 'Reefer Run', blurb: 'Fruit and fish out of Morocco and Madeira. Reefers need a plug and burn their own fuel; the charter boxes must sail.', flags: ['E', 'A', 'C', 'F', 'T', 'H', 'S', 'L'], colors: { sea: '#2588a8', sky: '#f1eadc', land: '#b9945e' } },
  { name: 'Winter Passage', blurb: 'Halifax to Tromsø. The winter load line sits mid-ocean, and a low bridge wants her down to her marks.', flags: ['H', 'J', 'R', 'T', 'G', 'N', 'O', 'K'], colors: { sea: '#2b5d78', sky: '#d9e3ea', land: '#9aa7ad' } },
  { name: 'Grand Voyage', blurb: 'Every rule you have learned, on the longest rotations. Load her to the marks. Not a tonne more.', flags: ['R', 'H', 'A', 'G', 'S', 'E', 'X', 'C'], colors: { sea: '#1d5f8f', sky: '#e4e9ee', land: '#8e8a7a' } },
];

export interface LadderRow {
  n: number;
  /** 0-based sea area; `local` 1–9 inside it */
  area: number;
  local: number;
  band: BandId;
  title: string;
  /** what the level teaches or tests (for the docs and the logbook) */
  lesson: string;
  mechanics: Mechanic[];
  intro?: Mechanic;
  /** a twist that is not a Mechanic id (three bands, three high…) */
  twist?: string;
  bays: number;
  tiers: number;
  ports: number;
  /** offers per port (each port that offers any) */
  offers: [number, number];
  /** boxes on the quays in total */
  boxes: [number, number];
  /** burn bands: 1–3 */
  bands: number;
  capacity: [number, number];
  /** bunkers are planned by the Chief (World 1) */
  auto: boolean;
  format: LevelFormat;
  /** authored by hand (src/core/authored.ts) */
  authored?: boolean;
  /** the burn bands must decide which boxes sail, not just the bunker bill (playtest 30) */
  fuelMatters?: boolean;
}

/** Mechanics that every voyage of the right shape has (the advanced ones ride on top). */
export const CORE: Mechanic[] = ['weight', 'bands', 'calls', 'pickup', 'tiers'];

/** The level that introduces each mechanic. */
export const INTRO_AT: Record<Mechanic, number> = {
  weight: 1,
  bands: 2,
  calls: 3,
  pickup: 6,
  noPump: 10,
  tiers: 15,
  bar: 19,
  prices: 28,
  lot: 33,
  heavy: 37,
  reefer: 42,
  contract: 46,
  zone: 55,
  bridge: 60,
};

const BOXES: Record<BandId, [number, number]> = { T0: [3, 5], B1: [4, 6], B2: [5, 7], B3: [6, 8], B4: [7, 9], B5: [8, 10], B6: [9, 12] };
const POSITION_BANDS: BandId[] = ['B2', 'B3', 'B4', 'B5', 'B1', 'B2', 'B3', 'B4', 'B6'];

interface RowSpec {
  title: string;
  lesson: string;
  /** advanced mechanics (core ones are derived) */
  adv?: Mechanic[];
  intro?: Mechanic;
  twist?: string;
  ports?: number;
  bays?: number;
  tiers?: number;
  bands?: number;
  pickup?: boolean;
  boxes?: [number, number];
  format?: LevelFormat;
  band?: BandId;
  authored?: boolean;
  fuelMatters?: boolean;
}

const CAP: [number, number][] = [
  [9, 16],
  [10, 18],
  [12, 22],
  [14, 24],
  [14, 26],
  [16, 28],
  [16, 30],
  [18, 30],
];

/** Hold sizes per area: [bays, tiers] for normal levels. */
const HOLD: [number, number][] = [
  [4, 1],
  [4, 1],
  [3, 2],
  [3, 2],
  [3, 2],
  [3, 2],
  [3, 2],
  [4, 2],
];

// prettier-ignore
const SPECS: RowSpec[][] = [
  // 1 North Sea: auto bunkers, one price, a pump everywhere, single-tier coaster
  [
    { title: 'Fuel Weighs', lesson: 'Cargo and bunkers share her deadweight: all four boxes fill her marks and leave no room for fuel.', intro: 'weight', ports: 2, bands: 1, band: 'T0', boxes: [4, 4], authored: true },
    { title: 'The Stripe', lesson: 'One tonne over the stripe doubles the burn; the best-paying box stays ashore.', intro: 'bands', ports: 2, bands: 2, band: 'B2', authored: true },
    { title: 'Two Calls', lesson: 'Discharge midway: a lighter ship sails the second leg cheaper.', intro: 'calls', ports: 3, bands: 2, band: 'B2', authored: true },
    { title: 'Overload', lesson: 'Three bands: pick the band first, then fill it to its top.', twist: 'three bands', ports: 3, bands: 3 },
    { title: 'Full & Down', lesson: 'Exactly one load fills her to the marks and lands her on the reserve.', ports: 2, bands: 2, format: 'exact' },
    { title: 'Leave Room', lesson: 'Free deadweight at the first call is an investment in the pickup.', intro: 'pickup', ports: 3, bands: 2, pickup: true },
    { title: 'Coastwise', lesson: 'A box burns fuel on every leg it rides: the band you sail each leg in decides which boxes pay.', ports: 3, bands: 3, pickup: true, fuelMatters: true },
    { title: 'Round the Skaw', lesson: 'Two pickups compete for the same tonnes.', ports: 4, bands: 3, pickup: true },
    { title: 'The Feeder Charter', lesson: 'Every World 1 rule at once: bands on every leg, pickups, the marks.', ports: 4, bands: 3, pickup: true, boxes: [9, 10] },
  ],
  // 2 The Coast: the valve unlocks; dry ports; stacks two high from x.6
  [
    { title: 'Dry Port', lesson: 'No bunkers at the middle call: the second leg\'s fuel comes from home and weighs on the first.', adv: ['noPump'], intro: 'noPump', ports: 3, bands: 2 },
    { title: 'Carry It', lesson: 'How much to carry past a dry berth, and what it costs in cargo.', adv: ['noPump'], ports: 3, bands: 2, pickup: true },
    { title: 'Short Stem', lesson: 'The gas-station habit tips the first leg over a stripe.', adv: ['noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'Channel Gale', lesson: 'Two legs on one stem, and a pickup you need room for.', adv: ['noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'To the Tonne', lesson: 'One load meets the marks and the reserve together.', ports: 3, bands: 2, format: 'exact' },
    { title: 'Never Bury', lesson: 'Stacks two high: nothing may stand on a box that leaves earlier.', intro: 'tiers', ports: 4, bays: 2, tiers: 2, bands: 2, pickup: true, authored: true },
    { title: 'Last On, First Off', lesson: 'Where a box stands decides whether the pickup has a home.', adv: ['noPump'], ports: 3, bays: 3, tiers: 2, bands: 3, pickup: true },
    { title: 'Ushant', lesson: 'Stowage order and a dry berth on the same voyage.', adv: ['noPump'], ports: 4, bays: 3, tiers: 2, bands: 3, pickup: true },
    { title: 'The Channel Charter', lesson: 'A long rotation: dry berths, stacks and stripes.', adv: ['noPump'], ports: 5, bays: 3, tiers: 2, bands: 3, pickup: true, boxes: [9, 10] },
  ],
  // 3 Up the Rivers: harbour bars; three high from x.6
  [
    { title: 'Over the Bar', lesson: 'The bar is checked on arrival: deliver first, bunker after the bar.', adv: ['bar'], intro: 'bar', ports: 3, bands: 2, pickup: true },
    { title: 'Seine Pilot', lesson: 'A bar upriver and a dry berth below it.', adv: ['bar', 'noPump'], ports: 3, bands: 3, pickup: true },
    { title: 'Deliver First', lesson: 'Rotation order decides who lightens her for the bar.', adv: ['bar'], ports: 4, bands: 3, pickup: true },
    { title: 'Low Water', lesson: 'The bar wants her light, the stem wants her heavy.', adv: ['bar', 'noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'Down to Her Marks', lesson: 'One load: the marks, the reserve, every tonne used.', ports: 3, bands: 2, format: 'exact' },
    { title: 'Three High', lesson: 'Stacks three high: the bottom box sails longest.', twist: 'three high', ports: 4, bays: 2, tiers: 3, bands: 3, pickup: true },
    { title: 'Rhine Barge', lesson: 'A bar at the river mouth and a pump upstream.', adv: ['bar', 'noPump'], ports: 3, bands: 3, pickup: true },
    { title: 'Ebb Tide', lesson: 'Stacks three high under a harbour bar.', adv: ['bar'], ports: 4, bays: 3, tiers: 3, bands: 3, pickup: true },
    { title: 'The River Charter', lesson: 'Bars, dry berths and stacks on a five-port rotation.', adv: ['bar', 'noPump'], ports: 5, bands: 3, pickup: true, boxes: [10, 11] },
  ],
  // 4 Bunker Calls: price spreads; barge lots from x.6
  [
    { title: 'Price Board', lesson: 'Cheap bunkers here, dear there: carry the cheap fuel, but it weighs.', adv: ['prices'], intro: 'prices', ports: 3, bands: 2, pickup: true },
    { title: 'Cheap Here', lesson: 'Cheap fuel past a dry berth costs cargo on the first leg.', adv: ['prices', 'noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'Las Palmas Stem', lesson: 'A shallow bar at the cheap pump.', adv: ['prices', 'bar'], ports: 4, bands: 3, pickup: true },
    { title: 'Harmattan', lesson: 'Where to stem on a long dry stretch with three prices.', adv: ['prices', 'noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'On the Mark', lesson: 'Exactly one load fills her to the marks and lands her on the reserve.', ports: 3, bands: 2, format: 'exact' },
    { title: 'Barge Lots', lesson: 'Bunkers come in lots: four tonnes or seven?', adv: ['lot'], intro: 'lot', ports: 3, bands: 2, pickup: true },
    { title: 'Four or Seven', lesson: 'A lot at the cheap pump, tonnes at the dear one.', adv: ['lot', 'prices'], ports: 3, bands: 3, pickup: true },
    { title: 'Gulf of Guinea', lesson: 'Lots and a dry berth: round up, or carry it?', adv: ['lot', 'noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'The Bunker Charter', lesson: 'Prices, lots and a dry berth on the long run south.', adv: ['prices', 'lot', 'noPump'], ports: 5, bands: 3, pickup: true },
  ],
  // 5 Liner Loop: heavy below light; reefers from x.6
  [
    { title: 'Heavy Below', lesson: 'No box may stand on a lighter one: rotation order and weight order collide.', adv: ['heavy'], intro: 'heavy', ports: 3, bands: 2, pickup: true },
    { title: 'Bottom Weight', lesson: 'The heavy box wants the bottom, the price board wants you to stem here.', adv: ['heavy', 'prices'], ports: 3, bands: 3, pickup: true },
    { title: 'Transhipment', lesson: 'Heavy below light, and a berth with no barge.', adv: ['heavy', 'noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'Strait of Messina', lesson: 'Three rules bind at once: stack order, the bar and the price spread.', adv: ['heavy', 'prices', 'bar'], ports: 4, bands: 3, pickup: true, tiers: 3, bays: 3 },
    { title: 'Full and Square', lesson: 'One load: the marks to the tonne, the reserve at the last berth.', ports: 3, bands: 2, format: 'exact' },
    { title: 'Plugged In', lesson: 'Reefers need a plugged stack and burn a tonne per leg each.', adv: ['reefer'], intro: 'reefer', ports: 3, bands: 2, pickup: true },
    { title: 'Cold Chain', lesson: 'Where a reefer stands costs fuel, and fuel has a price.', adv: ['reefer', 'prices'], ports: 3, bands: 3, pickup: true },
    { title: 'Piraeus Loop', lesson: 'Reefers, stack order and heavy boxes in one hold.', adv: ['reefer', 'heavy'], ports: 4, bands: 3, pickup: true, tiers: 3, bays: 3 },
    { title: 'The Liner Charter', lesson: 'The whole loop: heavy, reefers and prices.', adv: ['heavy', 'reefer', 'prices'], ports: 5, bands: 3, pickup: true },
  ],
  // 6 Reefer Run: contract cargo; a cold charter twist at x.6
  [
    { title: 'Sealed', lesson: 'Contract boxes must sail; everything else is a top-off.', adv: ['contract'], intro: 'contract', ports: 3, bands: 2, pickup: true, format: 'contract' },
    { title: 'Madeira Fruit', lesson: 'Reefers and two prices on the island run.', adv: ['reefer', 'prices'], ports: 3, bands: 3, pickup: true },
    { title: 'Charter Party', lesson: 'Sealed reefers past a dry berth.', adv: ['reefer', 'contract', 'noPump'], ports: 4, bands: 3, pickup: true, format: 'contract' },
    { title: 'Agadir Night', lesson: 'Reefers, lots and price spreads: every tonne of bunkers has a cost.', adv: ['reefer', 'prices', 'lot'], ports: 4, bands: 3, pickup: true },
    { title: 'Fruit to the Marks', lesson: 'One load fills her to the marks and the reserve.', ports: 3, bands: 2, format: 'exact', tiers: 1, bays: 5 },
    { title: 'Cold Charter', lesson: 'The sealed boxes are reefers: plugs first, then the top-offs, and the reefers\' burn decides the band.', adv: ['reefer', 'contract'], twist: 'reefer charter', ports: 3, bands: 2, pickup: true, format: 'contract', fuelMatters: true },
    { title: 'Casablanca Bar', lesson: 'A charter over a harbour bar.', adv: ['contract', 'bar'], ports: 3, bands: 3, pickup: true, format: 'contract' },
    { title: 'Funchal Loop', lesson: 'Reefers below heavy boxes, two prices.', adv: ['reefer', 'heavy', 'prices'], ports: 4, bands: 3, pickup: true, tiers: 3, bays: 3 },
    { title: 'The Reefer Charter', lesson: 'Sealed reefers, price spreads and the marks.', adv: ['reefer', 'contract', 'prices'], ports: 5, bands: 3, pickup: true, format: 'contract' },
  ],
  // 7 Winter Passage: the winter zone line; the low bridge from x.6
  [
    { title: 'Winter Mark', lesson: 'A bar at sea: load past it, because she burns down to it.', adv: ['zone'], intro: 'zone', ports: 3, bands: 2, pickup: true },
    { title: 'The Zone Line', lesson: 'Cheap bunkers weigh across the winter line.', adv: ['zone', 'prices'], ports: 3, bands: 3, pickup: true },
    { title: 'Denmark Strait', lesson: 'A dry berth before the winter zone.', adv: ['zone', 'noPump'], ports: 4, bands: 3, pickup: true },
    { title: 'Ice Edge', lesson: 'Heavy boxes low, and the winter mark mid-ocean.', adv: ['zone', 'heavy'], ports: 4, bands: 3, pickup: true },
    { title: 'Plimsoll', lesson: 'Exactly one load: her marks, her reserve.', ports: 3, bands: 2, format: 'exact' },
    { title: 'Low Bridge', lesson: 'Air draft: too light won\'t pass under the bridge.', adv: ['bridge'], intro: 'bridge', ports: 3, bands: 2, pickup: true },
    { title: 'Air Draft', lesson: 'Sink for the bridge, rise for the winter line.', adv: ['bridge', 'zone'], ports: 3, bands: 3, pickup: true },
    { title: 'Tromsø Sound', lesson: 'The bridge wants weight, and the dear pump sells it.', adv: ['bridge', 'prices'], ports: 4, bands: 3, pickup: true },
    { title: 'The Winter Charter', lesson: 'Sealed boxes under a bridge and over the winter line.', adv: ['zone', 'bridge', 'contract'], ports: 5, bands: 3, pickup: true, format: 'contract' },
  ],
  // 8 Grand Voyage: remixes
  [
    { title: 'Outward Bound', lesson: 'Bars and prices on the first leg of the long voyage.', adv: ['bar', 'prices'], ports: 3, bands: 3, pickup: true },
    { title: 'Biscay', lesson: 'Heavy below light, lots, and a dry berth.', adv: ['heavy', 'noPump', 'lot'], ports: 3, bands: 3, pickup: true },
    { title: 'Cape Farewell', lesson: 'Reefers across the winter line.', adv: ['reefer', 'zone'], ports: 4, bands: 3, pickup: true },
    { title: 'The Narrows', lesson: 'Down for the bridge, up for the bar, and two prices to pay for it.', adv: ['bridge', 'bar', 'prices'], ports: 4, bands: 3, pickup: true },
    { title: 'Long Stem', lesson: 'No bunkers at the middle berth: one load and the fuel for both legs fill her to the marks, and she berths on the reserve.', adv: ['noPump'], ports: 3, bands: 3, format: 'exact' },
    { title: 'Long Charter', lesson: 'Sealed boxes, bunkers in lots.', adv: ['contract', 'lot'], ports: 3, bands: 3, pickup: true, format: 'contract' },
    { title: 'Mixed Hold', lesson: 'Heavy boxes, reefers and a dry berth in one hold.', adv: ['heavy', 'reefer', 'noPump'], ports: 4, bands: 3, pickup: true, tiers: 3, bays: 4 },
    { title: 'Westbound', lesson: 'A charter across the winter line with two prices.', adv: ['zone', 'prices', 'contract'], ports: 4, bands: 3, pickup: true, format: 'contract' },
    { title: 'Grand Voyage', lesson: 'Five ports, every pump its own price, bars and reefers: the whole trade.', adv: ['prices', 'noPump', 'bar', 'reefer'], ports: 5, bands: 3, pickup: true, boxes: [11, 12] },
  ],
];

function buildRow(area: number, local: number, s: RowSpec): LadderRow {
  const n = area * 9 + local;
  const band = s.band ?? POSITION_BANDS[local - 1];
  const ports = s.ports ?? 3;
  // the Full & Down breathers sail single-tier coasters: the marks and the reserve, nothing else
  const exact = s.format === 'exact';
  const tiers = s.tiers ?? (exact ? 1 : HOLD[area][1]);
  const bays = s.bays ?? (exact ? (n < INTRO_AT.prices ? 4 : 5) : HOLD[area][0]);
  const bands = s.bands ?? 2;
  const mechanics: Mechanic[] = ['weight'];
  if (bands >= 2) mechanics.push('bands');
  if (ports >= 3) mechanics.push('calls');
  if (s.pickup) mechanics.push('pickup');
  if (tiers >= 2) mechanics.push('tiers');
  for (const m of s.adv ?? []) mechanics.push(m);
  let boxes = s.boxes ?? BOXES[band];
  if (area <= 1 && band === 'B6') boxes = [Math.min(boxes[0], 9), Math.min(boxes[1], 10)];
  // without pickups every box is offered at the first call: at most 5 offers
  if (!s.pickup) boxes = [Math.min(boxes[0], 4), Math.min(boxes[1], 5)];
  return {
    n,
    area,
    local,
    band,
    title: s.title,
    lesson: s.lesson,
    mechanics,
    intro: s.intro,
    twist: s.twist,
    bays,
    tiers,
    ports,
    offers: [1, 5],
    boxes,
    bands,
    capacity: CAP[area],
    auto: n < INTRO_AT.noPump,
    format: s.format ?? 'spot',
    authored: s.authored,
    fuelMatters: s.fuelMatters,
  };
}

export const LADDER: LadderRow[] = SPECS.flatMap((area, a) => area.map((s, i) => buildRow(a, i + 1, s)));

export const CAMPAIGN_LEVELS = LADDER.length;

export function rowOf(n: number): LadderRow {
  const r = LADDER[n - 1];
  if (!r || r.n !== n) throw new Error(`no ladder row ${n}`);
  return r;
}

export const isBoss = (r: LadderRow) => r.band === 'B6';
export const isBreather = (r: LadderRow) => r.format === 'exact';
/** Lesson levels: thresholds may coincide (critic 20 §3). */
export const isLesson = (band: string) => band === 'T0' || band === 'B1' || band === 'B2';

/** The number palette (hard limits the UI depends on). */
export const PALETTE = {
  maxBays: (n: number) => (n < INTRO_AT.prices ? 4 : 5),
  maxTiers: (n: number) => (n < INTRO_AT.tiers ? 1 : 3),
  maxPorts: (r: LadderRow) => (isBoss(r) ? 5 : 4),
  maxOffers: 5,
  maxBoxes: (r: LadderRow) => (isBreather(r) ? 6 : isBoss(r) ? 12 : 10),
  weight: [1, 5] as const,
  freight: [1, 12] as const,
  days: [1, 3] as const,
  rates: [1, 2, 3],
  maxBands: (n: number) => (n < 4 ? 2 : 3),
  capacity: [8, 30] as const,
  maxTank: 14,
  price: [1, 3] as const,
  maxLot: 4,
  reserve: 1,
  minBandWidth: 2,
  minFirstBand: 3,
};

/** Every way a level breaks the palette or the ladder (empty = fine). */
export function checkPalette(level: Level): string[] {
  const out: string[] = [];
  const row = rowOf(level.n);
  const { ship, ports, legs, boxes } = level;
  const last = ports.length - 1;
  const has = (m: Mechanic) => level.mechanics.includes(m);
  const err = (s: string) => out.push(`L${level.n}: ${s}`);
  if (ship.bays < 1 || ship.bays > PALETTE.maxBays(level.n)) err(`bays ${ship.bays}`);
  if (ship.tiers < 1 || ship.tiers > PALETTE.maxTiers(level.n)) err(`tiers ${ship.tiers}`);
  if (ports.length < 2 || ports.length > PALETTE.maxPorts(row)) err(`ports ${ports.length}`);
  if (boxes.length > PALETTE.maxBoxes(row)) err(`${boxes.length} boxes`);
  if (boxes.some((b, i) => b.id !== i)) err('box ids must be 0..n-1');
  for (let i = 0; i < last; i++) if (boxes.filter((b) => b.from === i).length > PALETTE.maxOffers) err(`offers at port ${i}`);
  for (const b of boxes) {
    if (b.weight < PALETTE.weight[0] || b.weight > PALETTE.weight[1]) err(`box ${b.id} weight ${b.weight}`);
    if (b.freight < PALETTE.freight[0] || b.freight > PALETTE.freight[1]) err(`box ${b.id} freight ${b.freight}`);
    if (b.from < 0 || b.to <= b.from || b.to > last) err(`box ${b.id} route`);
    if (b.from > 0 && !has('pickup')) err('pickup before its intro');
    if (b.reefer && !has('reefer')) err('reefer box without the rule');
    if (b.contract && !has('contract')) err('contract box without the rule');
  }
  for (const l of legs) {
    if (l.days < PALETTE.days[0] || l.days > PALETTE.days[1]) err(`days ${l.days}`);
    if (l.zone && !has('zone')) err('zone without the rule');
    // the winter line lies at sea: after some days of the leg, never at its end (that is a bar)
    if (l.zone && (l.zone.at < 1 || l.zone.at >= l.days)) err(`zone line at day ${l.zone.at} of ${l.days}`);
    if (l.bridge && !has('bridge')) err('bridge without the rule');
  }
  if (legs.length !== last) err('legs');
  if (ship.bands.length < 1 || ship.bands.length > PALETTE.maxBands(level.n)) err(`${ship.bands.length} bands`);
  ship.bands.forEach((b, i) => {
    if (b.rate !== i + 1) err(`band rate ${b.rate}`);
    // every band spans at least 2 t, and the first one more than the reserve alone
    if (i && b.upTo < ship.bands[i - 1].upTo + PALETTE.minBandWidth) err('band edges');
    if (!i && ship.bands.length > 1 && b.upTo < PALETTE.minFirstBand) err('first band too narrow');
  });
  if (ship.bands[ship.bands.length - 1].upTo !== ship.capacity) err('last band must end at the capacity');
  if (ship.bands.length >= 2 && !has('bands')) err('bands without the rule');
  if (ship.capacity < PALETTE.capacity[0] || ship.capacity > PALETTE.capacity[1]) err(`capacity ${ship.capacity}`);
  if (ship.tank > PALETTE.maxTank || ship.tank < 1) err(`tank ${ship.tank}`);
  if (ship.tiers >= 2 && !has('tiers')) err('stacks without the rule');
  if ((ship.plugs?.length ?? 0) && !has('reefer')) err('plugs without reefers');
  for (const pl of ship.plugs ?? []) if (pl < 0 || pl >= ship.bays) err('plug bay');
  if (ports.length >= 3 && !has('calls')) err('calls without the rule');
  const prices = new Set<number>();
  ports.forEach((p, i) => {
    if (!/^[A-Z]{3}$/.test(p.code)) err(`port code ${p.code}`);
    if (!PORT_FLAGS.includes(p.flag)) err(`flag ${p.flag}`);
    if (i < last) {
      if (p.price === null) {
        if (i === 0) err('no pump at the first port');
        if (!has('noPump')) err('dry port without the rule');
      } else {
        if (p.price < PALETTE.price[0] || p.price > PALETTE.price[1]) err(`price ${p.price}`);
        prices.add(p.price);
      }
    }
    if (p.lot !== undefined && p.lot !== 1) {
      if (!has('lot')) err('lots without the rule');
      if (p.lot < 1 || p.lot > PALETTE.maxLot) err(`lot ${p.lot}`);
    }
    if (p.bar !== undefined && !has('bar')) err('bar without the rule');
  });
  if (prices.size > 1 && !has('prices')) err('two prices before the rule');
  if (new Set(ports.map((p) => p.flag)).size !== ports.length) err('flags must be distinct');
  if (level.reserve !== PALETTE.reserve) err(`reserve ${level.reserve}`);
  if (level.restowFee !== 0) err('restow fee');
  if (level.startFuel > ship.tank) err('start fuel');
  if (!!level.auto !== row.auto) err('auto flag');
  for (const m of level.mechanics) if (INTRO_AT[m] > level.n) err(`${m} before its intro (L${INTRO_AT[m]})`);
  if (level.intro && INTRO_AT[level.intro] !== level.n) err(`intro ${level.intro} at the wrong level`);
  return out;
}
