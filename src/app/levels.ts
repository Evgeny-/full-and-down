import type { Level } from '../core/types';
import { DEV_LEVELS } from './devLevels';

// the built campaign (scripts/build-levels.ts); falls back to a few dev levels while it doesn't exist
const built = import.meta.glob<{ default: Level[] }>('../data/levels.json', { eager: true });

export function campaign(): Level[] {
  if (new URLSearchParams(location.search).has('dev')) return DEV_LEVELS.map((l) => ({ ...l, auto: false }));
  const mod = Object.values(built)[0];
  const list = mod?.default ?? (mod as unknown as Level[] | undefined);
  // bunkering is the heart of the game: the player always orders fuel (NEED does the sum)
  if (Array.isArray(list) && list.length) return list.map((l) => ({ ...l, auto: false }));
  return DEV_LEVELS.map((l) => ({ ...l, auto: false }));
}
