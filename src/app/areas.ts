import type { Level } from '../core/types';

export interface Area {
  name: string;
  blurb: string;
  /** chart tint for the map */
  sea: string;
  land: string;
}

/** The eight sea areas of the campaign, nine voyages each. */
export const AREAS: Area[] = [
  { name: 'North Sea', blurb: 'Short hops, grey water, and fuel that weighs.', sea: '#cfe4ee', land: '#e6dcc4' },
  { name: 'The Baltic', blurb: 'Dry berths and two-high stacks, Kiel to Klaipėda.', sea: '#cde6ea', land: '#e9dec2' },
  { name: 'Black Sea', blurb: 'Odessa, the Danube, the Bosphorus. Arrive light enough for the bar.', sea: '#d3e5df', land: '#dfe0c0' },
  { name: 'Bunker Calls', blurb: 'Gibraltar to Fujairah: cheap fuel here, dear fuel there.', sea: '#cbe3f0', land: '#efdcb8' },
  { name: 'Straits & China Seas', blurb: 'The busiest lanes on earth. Heavy below light, in every stack.', sea: '#c6e0f2', land: '#f0d9b5' },
  { name: 'Banana Coast', blurb: 'Fruit on the plugs, charters to keep, and the Canal in between.', sea: '#c4e2ec', land: '#eedbb8' },
  { name: 'North Pacific', blurb: 'Winter marks past the zone line, and bridges overhead.', sea: '#d7e3ec', land: '#e8e7e2' },
  { name: 'Round the World', blurb: 'Everything you have learned, Rotterdam to Sydney.', sea: '#c9dcee', land: '#e6d9bf' },
];

export function areaOf(level: Level): Area {
  return AREAS[Math.max(0, Math.min(AREAS.length - 1, (level.chapter || Math.ceil(level.n / 9)) - 1))];
}
