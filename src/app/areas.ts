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
  { name: 'The Coast', blurb: 'Dry ports and two-high stacks.', sea: '#cde6ea', land: '#e9dec2' },
  { name: 'Up the Rivers', blurb: 'Harbour bars: arrive light enough to cross.', sea: '#d3e5df', land: '#dfe0c0' },
  { name: 'Bunker Calls', blurb: 'Cheap fuel here, dear fuel there.', sea: '#cbe3f0', land: '#efdcb8' },
  { name: 'Liner Loop', blurb: 'Heavy below light, in every stack.', sea: '#c6e0f2', land: '#f0d9b5' },
  { name: 'Reefer Run', blurb: 'Fruit and fish on the plugs.', sea: '#c4e2ec', land: '#eedbb8' },
  { name: 'Winter Passage', blurb: 'Lower marks past the zone line, and low bridges.', sea: '#d7e3ec', land: '#e8e7e2' },
  { name: 'Grand Voyage', blurb: 'Everything you have learned, end to end.', sea: '#c9dcee', land: '#e6d9bf' },
];

export function areaOf(level: Level): Area {
  return AREAS[Math.max(0, Math.min(AREAS.length - 1, (level.chapter || Math.ceil(level.n / 9)) - 1))];
}
