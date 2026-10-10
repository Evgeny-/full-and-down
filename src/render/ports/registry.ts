import type { RegionId } from './regions';
import type { Nation } from '../nations';

export interface PortEntry {
  region: RegionId;
  landmark?: string;
}

/** Lowercase ASCII, letters and digits only: 'Liège' → 'liege', "St John's" → 'stjohns'. */
export function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}

const e = (region: RegionId, landmark?: string): PortEntry => ({ region, landmark });

/** Every port of the game, by normalised name. Ports not listed fall back to their country's region. */
export const PORT_TABLE: Record<string, PortEntry> = {};

function add(names: string, entry: PortEntry): void {
  for (const n of names.split(',')) PORT_TABLE[norm(n)] = entry;
}

export function register(rows: Array<[string, RegionId, string?]>): void {
  for (const [n, r, l] of rows) add(n, e(r, l));
}

/** Default region of a country. */
export const NATION_REGION: Partial<Record<Nation, RegionId>> = {
  NL: 'nl', BE: 'nl', DE: 'de', DK: 'scan', NO: 'scan', SE: 'scan', FI: 'scan', EE: 'scan', LV: 'scan', LT: 'de', PL: 'de',
  GB: 'uk', IE: 'uk', FR: 'fr', ES: 'med', PT: 'med', IT: 'med', GR: 'med', MT: 'med', GI: 'med', SI: 'med', HR: 'med', CY: 'med', TR: 'med',
  MA: 'afN', DZ: 'afN', TN: 'afN', LY: 'afN', EG: 'afN', MR: 'afN', IL: 'afN',
  SN: 'afW', GM: 'afW', SL: 'afW', GN: 'afW', GW: 'afW', LR: 'afW', CI: 'afW', GH: 'afW', TG: 'afW', BJ: 'afW', NG: 'afW', CM: 'afW', GA: 'afW', CG: 'afW', AO: 'afW', CV: 'afW',
  IS: 'arctic', FO: 'arctic', GL: 'arctic', CA: 'na', US: 'na', RU: 'scan', UA: 'med',
};
