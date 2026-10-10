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
    art: svg(210, 80, `<rect x="10" y="20" width="60" height="16" fill="#8fb3d9"/><rect x="70" y="20" width="70" height="16" fill="#4a6fa5"/><rect x="140" y="20" width="60" height="16" fill="#1f2e4d"/><text x="40" y="58" font-family="Oswald Variable, Oswald, sans-serif" font-size="14" text-anchor="middle" fill="#1f2e4d">×1</text><text x="105" y="58" font-family="Oswald Variable, Oswald, sans-serif" font-size="14" text-anchor="middle" fill="#1f2e4d">×2</text><text x="170" y="58" font-family="Oswald Variable, Oswald, sans-serif" font-size="14" text-anchor="middle" fill="#1f2e4d">×3</text>`),
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
    art: svg(210, 70, `<circle cx="20" cy="35" r="9" fill="#1f2e4d"/><path d="M32 35h60" stroke="#8fb3d9" stroke-width="5"/><circle cx="105" cy="35" r="9" fill="#2c5da8"/><rect x="92" y="4" width="26" height="16" rx="2" fill="#2f8a72"/><path d="M105 22v4" stroke="#2f8a72" stroke-width="3"/><path d="M117 35h60" stroke="#4a6fa5" stroke-width="5"/><circle cx="190" cy="35" r="9" fill="#2f8a72"/>`),
  },
  noPump: {
    kind: 'NOTICE TO MARINERS',
    title: 'No bunkers ahead',
    lines: [
      'The valve is yours now: <b>− +</b> to order bunkers, <b>NEED</b> for just enough to the next port.',
      'Ports with a crossed-out pump sell no fuel. What you need beyond them sails from here, and it weighs on every leg.',
    ],
    art: svg(210, 80, `<rect x="30" y="18" width="34" height="48" rx="5" fill="#ee8b1e"/><rect x="38" y="26" width="18" height="12" rx="2" fill="#fff6e6"/><path d="M64 30h8v24" stroke="#2a2d33" stroke-width="4" fill="none"/><rect x="120" y="18" width="34" height="48" rx="5" fill="#b9c2cc"/><rect x="128" y="26" width="18" height="12" rx="2" fill="#e6ebef"/><path d="M114 12l46 60" stroke="#d62f2b" stroke-width="6" stroke-linecap="round"/>`),
  },
  tiers: {
    kind: 'COMPANY CIRCULAR',
    title: 'Stack two high',
    lines: [
      'Boxes stack on each other now.',
      '<b>Never bury</b>: nothing may stand on a box that comes off earlier.',
      'Plan the stacks for the whole rotation, pickups included.',
    ],
    art: svg(210, 90, `<rect x="40" y="48" width="50" height="30" rx="2" fill="#2f8a72"/><rect x="40" y="16" width="50" height="30" rx="2" fill="#2c5da8"/><path d="M98 50l12 0" stroke="#0f7a5c" stroke-width="5" stroke-linecap="round"/><rect x="120" y="48" width="50" height="30" rx="2" fill="#2c5da8"/><rect x="120" y="16" width="50" height="30" rx="2" fill="#2f8a72"/><path d="M178 20l20 22M198 20l-20 22" stroke="#d62f2b" stroke-width="5" stroke-linecap="round"/><text x="65" y="88" font-family="Oswald Variable, Oswald, sans-serif" font-size="9" text-anchor="middle" fill="#1f2e4d">2ND PORT ON TOP</text>`),
  },
  bar: {
    kind: 'NOTICE TO MARINERS',
    title: 'Harbour bar',
    lines: [
      'A yellow <b>≤ t</b> sign: the pilot takes her over the bar only that light, arriving and leaving.',
      'Burn down to it, discharge first, or bunker after the bar.',
    ],
    art: svg(210, 90, `<rect x="0" y="40" width="210" height="50" fill="#2d8daf"/><path d="M0 72 Q60 56 105 64 T210 70 V90 H0Z" fill="#e8d7a8"/><rect x="150" y="6" width="44" height="34" rx="4" fill="#f5c518"/><text x="172" y="30" font-family="Oswald Variable, Oswald, sans-serif" font-size="17" text-anchor="middle" fill="#15181e">≤12t</text><path d="M172 40v14" stroke="#2a2d33" stroke-width="3"/><path d="M20 34h100l-10 18H30z" fill="#1f2e4d"/><path d="M26 46h88l-6 6H30z" fill="#b8432f"/>`),
  },
  prices: {
    kind: 'COMPANY CIRCULAR',
    title: 'Price spreads',
    lines: ['Bunkers cost more in some ports.', 'Cheap fuel is heavy on every leg until it burns. Dear fuel bought later is light.'],
    art: svg(210, 80, `<rect x="30" y="16" width="40" height="52" rx="5" fill="#ee8b1e"/><text x="50" y="50" font-family="Oswald Variable, Oswald, sans-serif" font-size="20" text-anchor="middle" fill="#fff">$1</text><rect x="140" y="16" width="40" height="52" rx="5" fill="#c96d0e"/><text x="160" y="50" font-family="Oswald Variable, Oswald, sans-serif" font-size="20" text-anchor="middle" fill="#fff">$3</text><path d="M80 42h50" stroke="#1f2e4d" stroke-width="3" stroke-dasharray="5 4"/>`),
  },
  lot: {
    kind: 'NOTICE TO MARINERS',
    title: 'Barge lots',
    lines: ['Here the barge only delivers in <b>lots</b> (×3 means 3, 6, 9 t).', 'Four or seven? Plan the other ports around it.'],
    art: svg(210, 80, `${[0, 1, 2].map((i) => `<rect x="${58 + i * 32}" y="22" width="26" height="38" rx="4" fill="#ee8b1e"/><rect x="${58 + i * 32}" y="30" width="26" height="4" fill="#c96d0e"/><rect x="${58 + i * 32}" y="48" width="26" height="4" fill="#c96d0e"/>`).join('')}<text x="105" y="76" font-family="Oswald Variable, Oswald, sans-serif" font-size="11" text-anchor="middle" fill="#1f2e4d">ONE LOT = 3 t</text>`),
  },
  heavy: {
    kind: 'COMPANY CIRCULAR',
    title: 'Heavy below light',
    lines: ['A box may not stand on a <b>lighter</b> box.', 'Rotation order and weight order now share every stack.'],
    art: svg(210, 90, `<rect x="40" y="48" width="50" height="30" rx="2" fill="#2c5da8"/><text x="65" y="69" font-family="Oswald Variable, Oswald, sans-serif" font-size="16" text-anchor="middle" fill="#fff">5t</text><rect x="40" y="16" width="50" height="30" rx="2" fill="#2f8a72"/><text x="65" y="37" font-family="Oswald Variable, Oswald, sans-serif" font-size="16" text-anchor="middle" fill="#fff">2t</text><rect x="120" y="48" width="50" height="30" rx="2" fill="#2f8a72"/><text x="145" y="69" font-family="Oswald Variable, Oswald, sans-serif" font-size="16" text-anchor="middle" fill="#fff">2t</text><rect x="120" y="16" width="50" height="30" rx="2" fill="#2c5da8"/><text x="145" y="37" font-family="Oswald Variable, Oswald, sans-serif" font-size="16" text-anchor="middle" fill="#fff">5t</text><path d="M178 20l20 22M198 20l-20 22" stroke="#d62f2b" stroke-width="5" stroke-linecap="round"/>`),
  },
  reefer: {
    kind: 'COMPANY CIRCULAR',
    title: 'Reefers',
    lines: ['White boxes are refrigerated: they need a <b>plugged</b> stack (marked ❄).', 'Each reefer aboard burns <b>+1 t</b> per leg for its power.'],
    art: svg(210, 80, `<rect x="40" y="20" width="80" height="44" rx="3" fill="#eef2f3" stroke="#9aa6ad" stroke-width="2"/><rect x="40" y="52" width="80" height="8" fill="#2c5da8"/><rect x="98" y="28" width="16" height="20" fill="#9aa6ad"/><path d="M120 40 C 140 40 140 60 160 60" stroke="#2a2d33" stroke-width="3" fill="none"/><rect x="158" y="50" width="24" height="24" rx="5" fill="#1e4fa3"/><path d="M170 54v16M162 58l16 8M178 58l-16 8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`),
  },
  contract: {
    kind: 'COMPANY CIRCULAR',
    title: 'Contract cargo',
    lines: ['Boxes with a <b>seal</b> are under contract and must sail.', 'Everything else is a top-off.'],
    art: svg(210, 80, `<rect x="50" y="18" width="100" height="50" rx="3" fill="#2f8a72"/><g transform="translate(140 58)">${Array.from({ length: 16 }, (_, k) => `${k ? 'L' : 'M'}${(Math.cos((k / 16) * Math.PI * 2) * (k % 2 ? 15 : 18)).toFixed(1)} ${(Math.sin((k / 16) * Math.PI * 2) * (k % 2 ? 15 : 18)).toFixed(1)}`).join(' ').replace(/^/, '<path d="').concat('Z" fill="#b3201c"/>')}<path d="M-7 0l5 6 10-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></g>`),
  },
  zone: {
    kind: 'NOTICE TO MARINERS',
    title: 'Winter zone',
    lines: [
      'Partway along a leg she crosses into a winter zone, where her mark is lower: <b>W ≤ t</b>. The <b>@d</b> says after how many days.',
      'She may leave deeper, if she burns down to the winter mark by the line: the fuel she burns before it counts.',
    ],
    art: svg(210, 80, `<rect x="0" y="10" width="105" height="60" fill="#cfe6f2"/><rect x="105" y="10" width="105" height="60" fill="#a9c9e6"/><path d="M105 6v68" stroke="#1e4fa3" stroke-width="3" stroke-dasharray="6 5"/><text x="52" y="30" font-family="Oswald Variable, Oswald, sans-serif" font-size="13" text-anchor="middle" fill="#1f2e4d">SUMMER</text><text x="158" y="30" font-family="Oswald Variable, Oswald, sans-serif" font-size="13" text-anchor="middle" fill="#1f2e4d">WINTER ≤ t</text><path d="M30 52h60" stroke="#1f2e4d" stroke-width="4"/><path d="M90 46l10 6-10 6z" fill="#1f2e4d"/>`),
  },
  bridge: {
    kind: 'NOTICE TO MARINERS',
    title: 'Low bridge',
    lines: ['A bridge on this leg: she must sit <b>deep enough</b> to pass under it (⌒ ≥ t at departure).', 'Too light is a problem too. Cargo is better ballast than fuel.'],
    art: svg(210, 90, `<rect x="0" y="66" width="210" height="24" fill="#2d8daf"/><path d="M10 66 Q105 -10 200 66" stroke="#6b7280" stroke-width="7" fill="none"/><path d="M60 50h90l-8 16H68z" fill="#1f2e4d"/><rect x="96" y="30" width="6" height="20" fill="#f5c518"/><path d="M99 22v-6" stroke="#d62f2b" stroke-width="3" stroke-linecap="round"/>`),
  },
};

/** One-line coaching for the first levels (advance on the named event). */
export interface CoachStep {
  text: string;
  until: 'pick' | 'place' | 'unload' | 'tab' | 'sail' | 'over' | 'tap';
}

export const COACH: Record<number, CoachStep[]> = {
  2: [{ text: 'Past the stripe on the deadweight bar she burns double. Watch the leg on the strip.', until: 'tap' }],
  3: [{ text: 'Two calls. Tap a port on the strip to plan her there.', until: 'tab' }],
};
