import type { Mechanic } from '../core/types';

/**
 * The Notice to Mariners (geography) or Company Circular (company rules) shown once, on the gentle
 * level that introduces each rule.
 */
export interface Notice {
  kind: 'NOTICE TO MARINERS' | 'COMPANY CIRCULAR';
  title: string;
  lines: string[];
  art: string;
}

const svg = (w: number, h: number, body: string) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;

/** a little hull with a waterline and boxes, for the cards */
const hull = (y: number, boxes: number, fuel: number) => {
  const b = Array.from({ length: boxes }, (_, i) => `<rect x="${34 + i * 26}" y="${y - 22}" width="24" height="18" rx="2" fill="${['#2c5da8', '#2f8a72', '#7b3f6e', '#b5482f'][i % 4]}"/>`).join('');
  const f = Array.from({ length: fuel }, (_, i) => `<rect x="${150 + (i % 3) * 9}" y="${y + 6 + Math.floor(i / 3) * 9}" width="7" height="7" rx="1" fill="#ee8b1e"/>`).join('');
  return `<path d="M18 ${y - 4}h170l-14 30H30z" fill="#1f2e4d"/><path d="M24 ${y + 14}h158l-8 12H30z" fill="#b8432f"/>${b}${f}`;
};

export const NOTICES: Partial<Record<Mechanic, Notice>> = {
  weight: {
    kind: 'COMPANY CIRCULAR',
    title: 'Fuel weighs too',
    lines: [
      'Cargo and bunkers share her <b>deadweight</b>. At the summer mark she is full.',
      'Every tonne of fuel is a tonne of cargo left on the quay.',
      'Arrive with the <b>reserve</b> (MIN ROB) still aboard. Not a tonne more.',
    ],
    art: svg(210, 90, `<rect x="0" y="52" width="210" height="38" fill="#2d8daf"/>${hull(48, 4, 3)}<path d="M10 52h190" stroke="#eaf9fb" stroke-width="2"/>`),
  },
  bands: {
    kind: 'COMPANY CIRCULAR',
    title: 'A deep ship burns more',
    lines: [
      'Past the stripe she is <b>LADEN</b> and burns double for the whole leg.',
      'The fuel for it weighs too. One box too many can cost two.',
      'Inside a band the next tonne is free: fill it, or stay under the stripe.',
    ],
    art: svg(210, 80, `<rect x="10" y="20" width="60" height="16" fill="#8fb3d9"/><rect x="70" y="20" width="70" height="16" fill="#4a6fa5"/><rect x="140" y="20" width="60" height="16" fill="#1f2e4d"/><text x="40" y="58" font-family="Oswald" font-size="14" text-anchor="middle" fill="#1f2e4d">×1</text><text x="105" y="58" font-family="Oswald" font-size="14" text-anchor="middle" fill="#1f2e4d">×2</text><text x="170" y="58" font-family="Oswald" font-size="14" text-anchor="middle" fill="#1f2e4d">×3</text>`),
  },
  calls: {
    kind: 'NOTICE TO MARINERS',
    title: 'Two calls',
    lines: [
      'Boxes come off at their port: colour, flag and code say where.',
      'Lighter after each call: later legs burn less.',
      'Tap a port on the strip to plan her call there.',
    ],
    art: svg(210, 60, `<circle cx="20" cy="30" r="9" fill="#1f2e4d"/><path d="M32 30h60" stroke="#4a6fa5" stroke-width="5"/><circle cx="105" cy="30" r="9" fill="#2c5da8"/><path d="M117 30h60" stroke="#8fb3d9" stroke-width="5"/><circle cx="190" cy="30" r="9" fill="#2f8a72"/>`),
  },
  pickup: {
    kind: 'NOTICE TO MARINERS',
    title: 'Cargo along the way',
    lines: ['Some ports offer boxes of their own.', 'Leave room for them when you sail from the first port: free deadweight now is freight later.'],
    art: '',
  },
  noPump: {
    kind: 'NOTICE TO MARINERS',
    title: 'No bunkers ahead',
    lines: [
      'The valve is yours now: <b>− +</b> to order bunkers, <b>NEED</b> for just enough to the next port.',
      'Ports with a crossed-out pump sell no fuel. What you need beyond them sails from here, and it weighs on every leg.',
    ],
    art: '',
  },
  tiers: {
    kind: 'COMPANY CIRCULAR',
    title: 'Stack two high',
    lines: [
      'Boxes stack on each other now.',
      '<b>Never bury</b>: nothing may stand on a box that comes off earlier.',
      'Plan the stacks for the whole rotation, pickups included.',
    ],
    art: '',
  },
  bar: {
    kind: 'NOTICE TO MARINERS',
    title: 'Harbour bar',
    lines: [
      'A yellow <b>≤ t</b> sign: the pilot takes her over the bar only that light, arriving and leaving.',
      'Burn down to it, discharge first, or bunker after the bar.',
    ],
    art: '',
  },
  prices: {
    kind: 'COMPANY CIRCULAR',
    title: 'Price spreads',
    lines: ['Bunkers cost more in some ports.', 'Cheap fuel is heavy on every leg until it burns. Dear fuel bought later is light.'],
    art: '',
  },
  lot: {
    kind: 'NOTICE TO MARINERS',
    title: 'Barge lots',
    lines: ['Here the barge only delivers in <b>lots</b> (×3 means 3, 6, 9 t).', 'Four or seven? Plan the other ports around it.'],
    art: '',
  },
  heavy: {
    kind: 'COMPANY CIRCULAR',
    title: 'Heavy below light',
    lines: ['A box may not stand on a <b>lighter</b> box.', 'Rotation order and weight order now share every stack.'],
    art: '',
  },
  reefer: {
    kind: 'COMPANY CIRCULAR',
    title: 'Reefers',
    lines: ['White boxes are refrigerated: they need a <b>plugged</b> stack (marked ❄).', 'Each reefer aboard burns <b>+1 t</b> per leg for its power.'],
    art: '',
  },
  contract: {
    kind: 'COMPANY CIRCULAR',
    title: 'Contract cargo',
    lines: ['Boxes with a <b>seal</b> are under contract and must sail.', 'Everything else is a top-off.'],
    art: '',
  },
  zone: {
    kind: 'NOTICE TO MARINERS',
    title: 'Winter zone',
    lines: [
      'Partway along a leg she crosses into a winter zone, where her mark is lower: <b>W ≤ t</b>.',
      'She may leave deeper, if she burns down to the winter mark by the line.',
    ],
    art: '',
  },
  bridge: {
    kind: 'NOTICE TO MARINERS',
    title: 'Low bridge',
    lines: ['A bridge on this leg: she must sit <b>deep enough</b> to pass under it (⌒ ≥ t at departure).', 'Too light is a problem too. Cargo is better ballast than fuel.'],
    art: '',
  },
};

/** One-line coaching for the first levels (advance on the named event). */
export interface CoachStep {
  text: string;
  until: 'pick' | 'place' | 'unload' | 'tab' | 'sail' | 'over' | 'tap';
}

export const COACH: Record<number, CoachStep[]> = {
  1: [
    { text: 'Tap a box on the quay to pick it up.', until: 'pick' },
    { text: 'Now tap the ship to load it.', until: 'place' },
    { text: 'Load what pays. The red showing is room aboard.', until: 'over' },
    { text: 'No room for fuel. Fuel weighs too. Tap a box aboard to land it.', until: 'unload' },
    { text: 'The Chief orders just enough fuel. When the Office is happy, sail.', until: 'sail' },
  ],
  2: [{ text: 'Past the stripe she burns double. Watch the leg on the strip.', until: 'tap' }],
  3: [{ text: 'Two calls. Tap a port on the strip to plan her there.', until: 'tab' }],
};
