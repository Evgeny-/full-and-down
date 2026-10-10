import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { PortKit, SHORE_Z, noise2, smooth, type Col, type TerrainPalette, type TerrainShape } from './kit';
import { pick, scatter, type HouseStyle, type TreeKind } from './town';
import { church, campanile, mosque, turbineRow, windmill, waterTower, stack, factory } from './props';
import type { MoleOpts } from './harbour';

/**
 * Regional looks. A region is a house style, ground colours and shape, trees, and a few set pieces;
 * a port picks one (and may add a landmark on top).
 */

/** The world beyond Europe: each is defined by its own module in ./landmarks. */
export type WorldRegionId = 'baltic' | 'blacksea' | 'gulf' | 'austral' | 'southasia' | 'seasia' | 'eastasia' | 'japan' | 'latam' | 'caribbean' | 'pacnw';

export type RegionId = 'nl' | 'de' | 'scan' | 'uk' | 'fr' | 'med' | 'isle' | 'afN' | 'afW' | 'arctic' | 'na' | 'generic' | WorldRegionId;

export interface TreeSpec {
  kinds: TreeKind[];
  count: number;
  where: 'plain' | 'hills' | 'all';
  size?: [number, number];
  maxY?: number;
  grove?: number;
}

export interface Region {
  id: RegionId;
  houses: HouseStyle;
  palette: TerrainPalette;
  shape: TerrainShape;
  shore: PortKit['shore'];
  rows: number;
  rowStep?: number;
  gaps?: number;
  rowRise?: number;
  trees: TreeSpec[];
  armour?: MoleOpts['armour'];
  moleTone?: Col;
  /** indices into LH_STYLES that suit this coast */
  lights?: number[];
  /** patchwork field colours (polders, terraces) */
  fields?: Col[];
  /** boats moored along the far quay */
  boats?: { kinds: Array<'fishing' | 'sail' | 'luzzu'>; n: number; colors: Col[] };
  /** set pieces (windmills, church spire, turbines…) */
  extras?: (k: PortKit, rng: Rng) => void;
}

const SLATE = ['#5b6470', '#4a525d', '#656d78'];
const TERRA = ['#b8553d', '#c4673f', '#a64b36', '#c97b4a'];

const nl: HouseStyle = {
  walls: ['#b5543a', '#a8503a', '#c4673f', '#9c4a35', '#d9a066', '#e4d6bd', '#bf5f47'],
  roofs: [...SLATE, '#b8553d'],
  trim: '#f3efe4',
  win: '#2c3a4a',
  floors: [2, 4],
  floorH: 0.19,
  w: [0.3, 0.46],
  d: [0.38, 0.52],
  roofKinds: [['step', 3], ['front', 4], ['gable', 2], ['hip', 0.5]],
  pitch: 0.95,
  chimney: 0.3,
  gap: [0, 0.03],
  door: '#4a5a6a',
  runs: false,
};

const de: HouseStyle = {
  ...nl,
  walls: ['#8f4636', '#a05540', '#b8664a', '#9a4a38', '#c98a5c', '#d6c9b0'],
  roofs: ['#4f7a66', '#444a52', '#4f7a66', '#5b3f3a'],
  roofKinds: [['front', 4], ['gable', 3], ['step', 2], ['hip', 1]],
  w: [0.32, 0.52],
};

const scan: HouseStyle = {
  walls: ['#b8433a', '#d6a14a', '#f1ece0', '#c9a35b', '#7f9bb0', '#e3c27a', '#a8453b', '#f1ece0'],
  roofs: ['#3b3f46', '#4a4038', '#5a3f38'],
  trim: '#f6f3ea',
  win: '#2f3d4d',
  floors: [1, 3],
  floorH: 0.2,
  w: [0.36, 0.56],
  d: [0.34, 0.48],
  roofKinds: [['gable', 5], ['front', 3]],
  pitch: 0.7,
  chimney: 0.35,
  gap: [0.02, 0.16],
  door: '#e8e1d0',
};

const uk: HouseStyle = {
  walls: ['#b86a4b', '#c4895a', '#a9593f', '#d2b48c', '#c47a58', '#dcc9a6'],
  roofs: ['#4a4f58', '#5a3f3a', '#58606a'],
  trim: '#eee8da',
  win: '#2b3644',
  floors: [2, 3],
  floorH: 0.19,
  w: [0.28, 0.42],
  d: [0.36, 0.5],
  roofKinds: [['gable', 7], ['front', 1], ['hip', 1]],
  pitch: 0.55,
  chimney: 0.85,
  gap: [0, 0.01],
  door: '#2f4f6a',
  runs: true,
};

const fr: HouseStyle = {
  walls: ['#eadfc6', '#dcd0b4', '#e8e0cf', '#c9bfa8', '#d7c9a4', '#efe9da'],
  roofs: ['#4b5563', '#546072', '#475160'],
  trim: '#f6f3ea',
  win: '#34455a',
  floors: [2, 4],
  floorH: 0.19,
  w: [0.34, 0.54],
  d: [0.38, 0.5],
  roofKinds: [['hip', 4], ['gable', 4], ['front', 2]],
  pitch: 0.6,
  chimney: 0.6,
  gap: [0, 0.05],
  door: '#4a6a8a',
  shutters: '#7f9bb0',
};

const med: HouseStyle = {
  walls: ['#f4f0e6', '#f1e7d0', '#efd9a6', '#e8c78a', '#e0b07a', '#f6f3ea', '#e9cdb4'],
  roofs: TERRA,
  trim: '#f6f3ea',
  win: '#4a5f6d',
  floors: [1, 3],
  floorH: 0.19,
  w: [0.34, 0.54],
  d: [0.32, 0.46],
  roofKinds: [['flat', 3], ['hip', 4], ['gable', 3]],
  pitch: 0.4,
  chimney: 0.1,
  gap: [0.0, 0.06],
  door: '#5a6f60',
};

const isle: HouseStyle = {
  ...med,
  walls: ['#f6f3ea', '#f1e1c1', '#e9b9a0', '#e8d08a', '#f4efe4', '#b9d4cc', '#e6a68a'],
  roofs: [...TERRA, '#a64b36'],
  floors: [1, 3],
  roofKinds: [['hip', 4], ['flat', 3], ['gable', 3]],
};

const afN: HouseStyle = {
  walls: ['#f3ecdc', '#eadbbd', '#e6cf9d', '#d8b98a', '#f6f2e8', '#c98d62', '#9fc2d4'],
  roofs: ['#e4d6b4'],
  trim: '#e8dcc0',
  win: '#3a4a58',
  floors: [1, 3],
  floorH: 0.18,
  w: [0.34, 0.56],
  d: [0.34, 0.48],
  roofKinds: [['flat', 1]],
  pitch: 0.3,
  chimney: 0,
  gap: [0, 0.05],
  door: '#496b8a',
  winW: 0.045,
  winH: 0.07,
};

const afW: HouseStyle = {
  walls: ['#e8c14a', '#d8744b', '#4e9fa0', '#e6dcc7', '#c9806a', '#7aa6c2', '#e4a24a', '#9fc272'],
  roofs: ['#9b4a38', '#8a8f94', '#b0603f', '#6c747a'],
  trim: '#f4efe4',
  win: '#3a4a58',
  floors: [1, 3],
  floorH: 0.19,
  w: [0.32, 0.52],
  d: [0.3, 0.44],
  roofKinds: [['mono', 3], ['gable', 3], ['flat', 2]],
  pitch: 0.35,
  chimney: 0,
  gap: [0.02, 0.12],
  door: '#4a3a2f',
};

const arctic: HouseStyle = {
  walls: ['#c9402e', '#e0b33a', '#3d7ab5', '#f1ece0', '#4a9a7a', '#d97a3a', '#8a4f9e', '#c9402e'],
  roofs: ['#3b3f46', '#a3392e', '#2f5f8a', '#6c747a', '#d6c8a0'],
  trim: '#f6f3ea',
  win: '#2f3d4d',
  floors: [1, 2],
  floorH: 0.2,
  w: [0.34, 0.5],
  d: [0.32, 0.44],
  roofKinds: [['gable', 5], ['front', 3]],
  pitch: 0.75,
  chimney: 0.4,
  gap: [0.03, 0.2],
  door: '#f6f3ea',
};

const na: HouseStyle = {
  walls: ['#f2efe6', '#a9c4d6', '#d65a4a', '#e8c35a', '#8aa88a', '#c9a98a', '#f2efe6'],
  roofs: ['#4a4f58', '#6a4a3a', '#3f5a48', '#58606a'],
  trim: '#f6f3ea',
  win: '#2f3d4d',
  floors: [2, 3],
  floorH: 0.19,
  w: [0.34, 0.5],
  d: [0.34, 0.46],
  roofKinds: [['gable', 4], ['front', 4], ['hip', 1]],
  pitch: 0.6,
  chimney: 0.5,
  gap: [0.02, 0.12],
  door: '#3a4a5a',
};

const pal = (p: Partial<TerrainPalette>): TerrainPalette => ({ land: '#a9b97a', land2: '#9fb36f', hill: '#8fa879', rock: '#9a9488', sand: '#dccfa8', haze: '#cfe3ec', ...p });

const flatShape: TerrainShape = { relief: 0.25, range: 0.5, rise: 10, rough: 0.2, freq: 0.06 };

const BASE: Record<Exclude<RegionId, WorldRegionId>, Region> = {
  nl: {
    id: 'nl',
    boats: { kinds: ['sail', 'fishing'], n: 3, colors: ['#c8302a', '#2c5da8', '#f6f3ea'] },
    houses: nl,
    palette: pal({ land: '#9fbf6a', land2: '#b4c76f', hill: '#8fb06a', sand: '#e0d3a8' }),
    shape: flatShape,
    fields: ['#8fbd5e', '#b4cf6c', '#a0c463', '#c9d26e', '#7fb35a', '#e0c85a'],
    shore: 'dike',
    rows: 4,
    rowStep: 0.6,
    trees: [{ kinds: ['poplar', 'round'], count: 60, where: 'plain', size: [0.9, 1.4] }],
    armour: 'rocks',
    lights: [0, 4],
    extras: (k, rng) => {
      for (let i = 0; i < 2; i++) windmill(k, k.vx(-18) + rng.range(-8, 8), rng.range(-18.5, -17), rng.range(1.0, 1.3));
      church(k, k.vx(-14) + rng.range(-3, 3), -14.2, { wall: '#c4673f', roof: '#5b6470', spire: '#5b6470' });
      turbineRow(k, -k.width / 2 + 2, k.width / 2 - 2, -20, 7, 1.7);
    },
  },
  de: {
    id: 'de',
    boats: { kinds: ['sail', 'fishing'], n: 3, colors: ['#2c5da8', '#f6f3ea', '#c8302a'] },
    houses: de,
    palette: pal({ land: '#9cba68', land2: '#a9c06a', hill: '#8aac66' }),
    shape: { relief: 0.5, range: 1.2, rise: 6, rough: 0.3, freq: 0.07 },
    fields: ['#8fbd5e', '#b4cf6c', '#a0c463', '#c9d26e', '#7fb35a'],
    shore: 'quay',
    rows: 4,
    rowStep: 0.62,
    trees: [{ kinds: ['round', 'poplar', 'birch'], count: 60, where: 'all', size: [0.9, 1.4] }],
    armour: 'tetrapods',
    lights: [0, 1, 4],
    extras: (k, rng) => {
      church(k, k.vx(-14) + rng.range(-4, 4), -14.4, { wall: '#9a4a38', roof: '#4a525d', spire: '#4f7a66', h: 1.2 });
      turbineRow(k, -k.width / 2 + 2, k.width / 2 - 2, -19.5, 6, 1.7);
    },
  },
  scan: {
    id: 'scan',
    boats: { kinds: ['fishing', 'sail'], n: 4, colors: ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b'] },
    houses: scan,
    palette: pal({ land: '#8aa86a', land2: '#7e9c64', hill: '#5f8a5a', rock: '#8f9aa0', sand: '#cfc8b4' }),
    shape: { relief: 2.0, range: 5, rise: 3, rough: 0.6, freq: 0.1 },
    shore: 'rock',
    rows: 4,
    rowStep: 0.66,
    gaps: 0.1,
    rowRise: 0,
    trees: [
      { kinds: ['pine', 'pine', 'birch'], count: 170, where: 'hills', size: [0.9, 1.6], maxY: 5 },
      { kinds: ['pine', 'birch'], count: 30, where: 'plain' },
    ],
    armour: 'rocks',
    lights: [0, 1, 3],
    extras: (k, rng) => {
      church(k, k.vx(-14) + rng.range(-4, 4), -14.4, { wall: '#f1ece0', roof: '#3b3f46', spire: '#3b3f46', h: 1.0 });
    },
  },
  uk: {
    id: 'uk',
    boats: { kinds: ['fishing', 'sail'], n: 3, colors: ['#2c5da8', '#c8302a', '#3f8d6b'] },
    houses: uk,
    palette: pal({ land: '#95b66a', land2: '#a3bd6e', hill: '#7ea15f', sand: '#d8cca4' }),
    shape: { relief: 1.4, range: 2.8, rise: 4, rough: 0.35, freq: 0.08 },
    shore: 'quay',
    rows: 5,
    rowStep: 0.55,
    trees: [{ kinds: ['round', 'round', 'bush'], count: 80, where: 'all', size: [0.9, 1.5], maxY: 3 }],
    armour: 'mixed',
    lights: [0, 1, 2],
    extras: (k, rng) => {
      church(k, k.vx(-14) + rng.range(-4, 4), -14.6, { wall: '#c9bfa8', roof: '#5a6470', spire: '#6b7580', h: 1.25 });
      turbineRow(k, -k.width / 2 + 2, k.width / 2 - 2, -23, 5, 1.6);
    },
  },
  fr: {
    id: 'fr',
    boats: { kinds: ['sail', 'fishing'], n: 4, colors: ['#c8302a', '#2c5da8', '#f6f3ea', '#e9a31a'] },
    houses: fr,
    palette: pal({ land: '#a2b874', land2: '#b0bd78', hill: '#889f68', sand: '#e0d6b0' }),
    shape: { relief: 1.2, range: 3, rise: 4, rough: 0.35, freq: 0.08 },
    shore: 'quay',
    rows: 5,
    rowStep: 0.58,
    trees: [{ kinds: ['round', 'poplar', 'bush'], count: 70, where: 'all', size: [0.9, 1.4], maxY: 3 }],
    armour: 'tetrapods',
    lights: [0, 1, 4],
    extras: (k, rng) => {
      church(k, k.vx(-14) + rng.range(-4, 4), -14.6, { wall: '#e0d6bc', roof: '#475160', spire: '#475160', h: 1.2 });
    },
  },
  med: {
    id: 'med',
    boats: { kinds: ['sail', 'fishing'], n: 5, colors: ['#2c5da8', '#c8302a', '#f6f3ea', '#e9a31a'] },
    houses: med,
    palette: pal({ land: '#c4b27a', land2: '#b8b86f', hill: '#a99a63', rock: '#b5a58a', sand: '#e6d9b0', haze: '#d6e4ea' }),
    shape: { relief: 2.2, range: 5.5, rise: 3, rough: 0.55, freq: 0.1 },
    shore: 'quay',
    rows: 5,
    rowStep: 0.55,
    rowRise: 0.0,
    gaps: 0.06,
    trees: [
      { kinds: ['cypress', 'cypress', 'olive', 'round'], count: 90, where: 'all', size: [0.9, 1.5], maxY: 4 },
    ],
    armour: 'rocks',
    lights: [0, 1, 4],
    extras: (k, rng) => {
      campanile(k, k.vx(-14) + rng.range(-4, 4), -14.0, 1.4, { wall: '#e8d9b0', roof: '#b8553d' });
    },
  },
  isle: {
    id: 'isle',
    boats: { kinds: ['sail', 'fishing'], n: 5, colors: ['#2c5da8', '#c8302a', '#f6f3ea', '#3fa5b5'] },
    houses: isle,
    palette: pal({ land: '#b9a46c', land2: '#c0b070', hill: '#9a7f58', rock: '#8a6f55', sand: '#e6d9b0', haze: '#d6e4ea' }),
    shape: { relief: 3.0, range: 6.5, rise: 2.5, rough: 0.8, freq: 0.1 },
    shore: 'quay',
    rows: 5,
    rowStep: 0.55,
    gaps: 0.08,
    trees: [
      { kinds: ['palm', 'palm', 'bush', 'olive'], count: 50, where: 'plain', size: [0.9, 1.4] },
      { kinds: ['cypress', 'round'], count: 30, where: 'hills', maxY: 4 },
    ],
    armour: 'rocks',
    lights: [0, 1, 4],
    extras: (k, rng) => {
      campanile(k, k.vx(-14) + rng.range(-4, 4), -14.0, 1.3, { wall: '#efe3c8', roof: '#b8553d' });
    },
  },
  afN: {
    id: 'afN',
    boats: { kinds: ['fishing'], n: 5, colors: ['#2c8aa5', '#c8302a', '#e9a31a', '#3f8d6b'] },
    houses: afN,
    palette: pal({ land: '#d8c08c', land2: '#cdb27c', hill: '#c4a06c', rock: '#b08e66', sand: '#ead9ab', haze: '#e3e6df' }),
    shape: { relief: 1.8, range: 3.5, rise: 4, rough: 0.5, freq: 0.09 },
    shore: 'beach',
    rows: 5,
    rowStep: 0.55,
    gaps: 0.05,
    trees: [{ kinds: ['palm', 'palm', 'bush', 'olive'], count: 50, where: 'plain', size: [0.9, 1.4] }],
    armour: 'rocks',
    moleTone: '#c9c1ac',
    lights: [1, 2, 4],
    extras: (k, rng) => {
      mosque(k, k.vx(-14) + rng.range(-4, 4), -14.0, 0.9, { dome: '#3f8d86' });
    },
  },
  afW: {
    id: 'afW',
    boats: { kinds: ['fishing'], n: 6, colors: ['#e9a31a', '#c8302a', '#2c8aa5', '#3f8d6b', '#f6f3ea'] },
    houses: afW,
    palette: pal({ land: '#a59a5f', land2: '#98a560', hill: '#7f9d58', rock: '#a5694a', sand: '#e6d3a0', haze: '#d9e6e8' }),
    shape: { relief: 1.6, range: 3, rise: 4, rough: 0.4, freq: 0.09 },
    shore: 'beach',
    rows: 5,
    rowStep: 0.55,
    gaps: 0.1,
    trees: [
      { kinds: ['palm', 'palm', 'palm', 'bush'], count: 70, where: 'plain', size: [0.9, 1.5] },
      { kinds: ['baobab', 'round'], count: 18, where: 'all', maxY: 3 },
    ],
    armour: 'tetrapods',
    lights: [0, 1, 3],
    extras: (k) => {
      waterTower(k, k.vx(-15) + 2, -16.5, { s: 1 });
    },
  },
  arctic: {
    id: 'arctic',
    boats: { kinds: ['fishing'], n: 4, colors: ['#c8302a', '#2c5da8', '#e9a31a'] },
    houses: arctic,
    palette: pal({ land: '#8f9f78', land2: '#869a74', hill: '#7b8c76', rock: '#8c929a', sand: '#b9b8ac', snowLine: 3.4, snow: '#f2f6f8', haze: '#d4e4ee' }),
    shape: { relief: 2.2, range: 9, rise: 3, rough: 0.85, freq: 0.1 },
    shore: 'rock',
    rows: 4,
    rowStep: 0.62,
    gaps: 0.12,
    trees: [{ kinds: ['fir', 'fir', 'pine'], count: 40, where: 'plain', size: [0.8, 1.3], maxY: 2.2 }],
    armour: 'rocks',
    lights: [0, 1, 2],
    extras: (k, rng) => {
      church(k, k.vx(-14) + rng.range(-4, 4), -14.4, { wall: '#f6f3ea', roof: '#a3392e', spire: '#a3392e', h: 0.95 });
    },
  },
  na: {
    id: 'na',
    boats: { kinds: ['fishing', 'sail'], n: 4, colors: ['#c8302a', '#2c5da8', '#f6f3ea', '#3f8d6b'] },
    houses: na,
    palette: pal({ land: '#7fa06a', land2: '#8bab6e', hill: '#5b7f58', rock: '#8d9296', sand: '#cfc8b4' }),
    shape: { relief: 1.8, range: 4.5, rise: 3.5, rough: 0.5, freq: 0.09 },
    shore: 'rock',
    rows: 4,
    rowStep: 0.62,
    gaps: 0.1,
    trees: [{ kinds: ['pine', 'fir', 'birch'], count: 140, where: 'hills', size: [0.9, 1.5], maxY: 4.5 }, { kinds: ['round', 'birch'], count: 25, where: 'plain' }],
    armour: 'rocks',
    lights: [0, 1, 4],
    extras: (k, rng) => {
      waterTower(k, k.vx(-15) + rng.range(-5, 5), -16.2, { s: 1 });
      church(k, k.vx(-14) + rng.range(-8, -4), -14.4, { wall: '#f6f3ea', roof: '#3f5a48', spire: '#3f5a48', h: 1.05 });
    },
  },
  generic: {
    id: 'generic',
    houses: scan,
    palette: pal({}),
    shape: { relief: 1.6, range: 4, rise: 4, rough: 0.4, freq: 0.09 },
    shore: 'quay',
    rows: 4,
    trees: [{ kinds: ['round', 'pine', 'bush'], count: 70, where: 'all', size: [0.9, 1.4], maxY: 3.5 }],
    armour: 'mixed',
  },
};

export const REGIONS = BASE as Record<RegionId, Region>;

/** World regions start as the generic look; their modules in ./landmarks replace them (see landmarks.ts). */
for (const id of ['baltic', 'blacksea', 'gulf', 'austral', 'southasia', 'seasia', 'eastasia', 'japan', 'latam', 'caribbean', 'pacnw'] as WorldRegionId[]) {
  REGIONS[id] = { ...REGIONS.generic, id };
}

// ───────────────────────────── the unknown port: seeded variety ─────────────────────────────

const GENERIC_WALLS: Col[][] = [
  ['#e9dcc3', '#d98f6f', '#f1ece0', '#c7d3d8', '#e3b871', '#b55a45'],
  ['#d9b38c', '#c98a68', '#e8d8b8', '#b9c4a8', '#e0c070', '#a87a5c'],
  ['#e6e0d2', '#c5d3d6', '#e8c9a6', '#d7a68b', '#b8c9b0', '#f1e4c4'],
  ['#b5543a', '#c4673f', '#d9a066', '#e4d6bd', '#9c4a35', '#a8503a'],
];

/** A generic region whose house palette, roofs, hills and breakwater all come from the port name. */
export function genericRegion(rng: Rng): Region {
  const base = REGIONS.generic;
  const hs: HouseStyle = {
    ...scan,
    walls: pick(rng, GENERIC_WALLS),
    roofs: rng.chance(0.5) ? TERRA : rng.chance(0.5) ? SLATE : ['#7b4a3c', '#5a4a40', '#8a5a48'],
    roofKinds: pick<Array<[import('./town').RoofKind, number]>>(rng, [
      [['gable', 5], ['front', 2]],
      [['hip', 5], ['gable', 2]],
      [['front', 4], ['gable', 2], ['step', 1]],
      [['flat', 3], ['hip', 3], ['gable', 2]],
    ]),
    pitch: rng.range(0.45, 0.8),
    floors: [1, rng.int(2, 3)],
    gap: [0.0, rng.range(0.04, 0.16)],
    chimney: rng.range(0, 0.5),
  };
  const hilly = rng.range(0, 1);
  return {
    ...base,
    houses: hs,
    palette: pal({ land: pick(rng, ['#a9b97a', '#b3bd7a', '#9fb36f']), hill: pick(rng, ['#8fa879', '#9aab72', '#7f9f78']) }),
    shape: { relief: 0.8 + hilly * 1.8, range: 2 + hilly * 5, rise: rng.range(2.5, 5), rough: rng.range(0.25, 0.7), freq: rng.range(0.07, 0.12) },
    shore: pick(rng, ['quay', 'quay', 'beach', 'rock'] as const),
    rows: rng.int(3, 5),
    armour: pick(rng, ['rocks', 'tetrapods', 'mixed'] as const),
    extras: (k, r) => {
      const c = r.int(0, 3);
      if (c === 0) church(k, k.vx(-14) + r.range(-5, 5), -14.4, { h: 1.1 });
      else if (c === 1) campanile(k, k.vx(-14) + r.range(-5, 5), -14.2, 1.3);
      else if (c === 2) {
        turbineRow(k, -k.width / 2 + 2, k.width / 2 - 2, -19, 6, 1.7);
      } else {
        stack(k, k.vx(-15) + r.range(-6, 6), -16, 1.2);
        factory(k, k.vx(-15) + r.range(-6, 6) + 1, -16, 0.9, 0.5, 0.35);
      }
    },
  };
}

/** Paint the low ground as a patchwork of fields (long strips in the polder). */
export function paintFields(k: PortKit, cols: Col[], fx = 0.28, fz = 0.42): void {
  const cs = cols.map((c) => new THREE.Color(c));
  k.paint((x, y, z, slope, c) => {
    if (y > 1.3 || slope > 0.18 || SHORE_Z - z < 1.6) return;
    const n = noise2(Math.floor(x * fx) * 7.3 + 0.5, Math.floor(z * fz) * 5.1 + 0.5, 3);
    c.lerp(cs[Math.min(cs.length - 1, Math.floor(n * cs.length))], 0.62 * (1 - smooth(0.6, 1.3, y)));
  });
}

/** Trees for a region, in groves over the plain (the strip behind the town) or on the slopes. */
export function plant(k: PortKit, r: Region): void {
  for (const t of r.trees) {
    const mask = (x: number, z: number): number => {
      const y = k.ground(x, z);
      const wood = noise2(x * 0.18 + 3, z * 0.18, k.seed % 97);
      const m = t.where === 'hills' ? smooth(0.7, 2.0, y) : t.where === 'plain' ? (y < 1.5 ? 1 : 0.15) : 1;
      return m * smooth(0.35, 0.6, wood);
    };
    const near = k.vx(SHORE_Z - 8);
    const base = { size: t.size, maxY: t.maxY, minY: 0.3, mask, grove: t.grove ?? 7, z0: SHORE_Z - 20, z1: SHORE_Z - 1.4 };
    scatter(k, t.kinds, { ...base, count: Math.round(t.count * 0.45), x0: -k.width / 2 + 2, x1: k.width / 2 - 2 });
    scatter(k, t.kinds, { ...base, count: Math.round(t.count * 0.55), x0: near - 11, x1: near + 11 });
  }
}

// ───────────────────────────── per-port flavour ─────────────────────────────

function subset<T>(rng: Rng, a: readonly T[], n: number): T[] {
  const c = a.slice();
  rng.shuffle(c);
  return c.slice(0, Math.max(1, Math.min(n, c.length)));
}

/**
 * Two ports of one region should not be twins: from the port's seed, keep a subset of the wall and roof
 * colours, nudge hill height and spacing, change the number of rows, sometimes swap the quay for a beach
 * and the armour of the breakwater.
 */
export function flavor(r: Region, rng: Rng): Region {
  const hs: HouseStyle = {
    ...r.houses,
    walls: subset(rng, r.houses.walls, Math.min(r.houses.walls.length, rng.int(3, 5))),
    roofs: subset(rng, r.houses.roofs, rng.int(1, 3)),
    pitch: r.houses.pitch * rng.range(0.85, 1.15),
    gap: [r.houses.gap[0], r.houses.gap[1] * rng.range(0.7, 1.5)],
  };
  const sh = r.shape;
  const shape: TerrainShape = {
    relief: sh.relief * rng.range(0.7, 1.35),
    range: sh.range * rng.range(0.75, 1.3),
    rise: sh.rise + rng.range(-0.8, 1.2),
    rough: Math.min(1, Math.max(0, sh.rough + rng.range(-0.15, 0.2))),
    freq: sh.freq * rng.range(0.8, 1.25),
  };
  const pal = { ...r.palette };
  const tintLand = (c: Col): Col => {
    const t = new THREE.Color(c);
    const hsl = { h: 0, s: 0, l: 0 };
    t.getHSL(hsl);
    t.setHSL(hsl.h + rng.range(-0.015, 0.015), hsl.s * rng.range(0.9, 1.1), hsl.l * rng.range(0.96, 1.05));
    return '#' + t.getHexString();
  };
  pal.land = tintLand(pal.land);
  pal.land2 = tintLand(pal.land2);
  pal.hill = tintLand(pal.hill);
  const shores: Array<PortKit['shore']> = r.shore === 'quay' && rng.chance(0.3) ? ['beach'] : r.shore === 'beach' && rng.chance(0.3) ? ['quay'] : [r.shore];
  return {
    ...r,
    houses: hs,
    shape,
    palette: pal,
    shore: shores[0],
    rows: Math.max(2, r.rows + rng.int(-1, 1)),
    armour: rng.chance(0.35) ? pick(rng, ['rocks', 'tetrapods', 'mixed'] as const) : r.armour,
    gaps: (r.gaps ?? 0) + rng.range(0, 0.06),
  };
}
