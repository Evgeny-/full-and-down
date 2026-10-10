// Real national flags for ports, drawn with plain canvas paths (no image files, no dependencies).
// Each flag is laid out in its own proportions and stretched to the box it is given, like the
// signal flags in ./flags.ts. Emblems are simplified so they still read at 24×16.

export type Nation =
  | 'NL' | 'GB' | 'DE' | 'DK' | 'NO' | 'SE' | 'FI' | 'BE' | 'FR' | 'ES' | 'PT' | 'IT' | 'GR' | 'MT' | 'GI'
  | 'MA' | 'SN' | 'GH' | 'NG' | 'CI' | 'IS' | 'IE' | 'CA' | 'US' | 'PL' | 'EE' | 'LV' | 'LT' | 'RU' | 'UA'
  | 'TR' | 'EG' | 'AE' | 'IN' | 'SG' | 'CN' | 'JP' | 'KR' | 'BR' | 'AR' | 'LR' | 'PA' | 'MH' | 'CV' | 'PH'
  | 'GM' | 'SL' | 'TG' | 'BJ' | 'RO' | 'TW' | 'SI' | 'HR' | 'BG' | 'GE' | 'CY' | 'IL' | 'TN' | 'DZ' | 'LY'
  | 'MR' | 'GN' | 'GW' | 'CM' | 'GA' | 'CG' | 'AO' | 'FO' | 'GL' | 'BS' | 'UY'
  // the world beyond Europe
  | 'SA' | 'DJ' | 'OM' | 'ZA' | 'AU' | 'LK' | 'MY' | 'TH' | 'VN' | 'HK' | 'PE' | 'EC' | 'CR' | 'CO' | 'JM' | 'GT' | 'MX';

const NAMES: Record<Nation, string> = {
  NL: 'Netherlands', GB: 'United Kingdom', DE: 'Germany', DK: 'Denmark', NO: 'Norway', SE: 'Sweden', FI: 'Finland',
  BE: 'Belgium', FR: 'France', ES: 'Spain', PT: 'Portugal', IT: 'Italy', GR: 'Greece', MT: 'Malta', GI: 'Gibraltar',
  MA: 'Morocco', SN: 'Senegal', GH: 'Ghana', NG: 'Nigeria', CI: "Côte d'Ivoire", IS: 'Iceland', IE: 'Ireland',
  CA: 'Canada', US: 'United States', PL: 'Poland', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', RU: 'Russia',
  UA: 'Ukraine', TR: 'Türkiye', EG: 'Egypt', AE: 'United Arab Emirates', IN: 'India', SG: 'Singapore', CN: 'China',
  JP: 'Japan', KR: 'South Korea', BR: 'Brazil', AR: 'Argentina', LR: 'Liberia', PA: 'Panama', MH: 'Marshall Islands',
  CV: 'Cape Verde', PH: 'Philippines', GM: 'The Gambia', SL: 'Sierra Leone', TG: 'Togo', BJ: 'Benin', RO: 'Romania',
  TW: 'Taiwan', SI: 'Slovenia', HR: 'Croatia', BG: 'Bulgaria', GE: 'Georgia', CY: 'Cyprus', IL: 'Israel',
  TN: 'Tunisia', DZ: 'Algeria', LY: 'Libya', MR: 'Mauritania', GN: 'Guinea', GW: 'Guinea-Bissau', CM: 'Cameroon',
  GA: 'Gabon', CG: 'Congo', AO: 'Angola', FO: 'Faroe Islands', GL: 'Greenland', BS: 'Bahamas', UY: 'Uruguay',
  SA: 'Saudi Arabia', DJ: 'Djibouti', OM: 'Oman', ZA: 'South Africa', AU: 'Australia', LK: 'Sri Lanka', MY: 'Malaysia',
  TH: 'Thailand', VN: 'Vietnam', HK: 'Hong Kong', PE: 'Peru', EC: 'Ecuador', CR: 'Costa Rica', CO: 'Colombia',
  JM: 'Jamaica', GT: 'Guatemala', MX: 'Mexico',
};

/** Every nation code, in a stable order. */
export const NATIONS = Object.keys(NAMES) as readonly Nation[];

/** A readable country name, e.g. 'Netherlands'. */
export function nationName(n: Nation): string {
  return NAMES[n];
}

// ------------------------------------------------------------------ drawing kit

type G = CanvasRenderingContext2D;
type Draw = (g: G, w: number, h: number) => void;

const TAU = Math.PI * 2;
const W = '#ffffff';
const K = '#000000';

function rect(g: G, c: string, x: number, y: number, w: number, h: number): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function poly(g: G, c: string, pts: readonly number[]): void {
  g.fillStyle = c;
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

function disc(g: G, c: string, x: number, y: number, r: number): void {
  g.fillStyle = c;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** An n-pointed star; `rot` is the direction of the first point (default: up), `k` the inner/outer radius. */
function star(g: G, c: string, x: number, y: number, r: number, rot = -Math.PI / 2, n = 5, k = 0.382): void {
  g.fillStyle = c;
  g.beginPath();
  for (let i = 0; i < 2 * n; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r * k : r;
    g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  g.closePath();
  g.fill();
}

/** Disc (x, y, r) minus disc (ix, iy, ir). */
function crescent(g: G, c: string, x: number, y: number, r: number, ix: number, iy: number, ir: number): void {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.clip();
  g.beginPath();
  g.rect(x - r, y - r, 2 * r, 2 * r);
  g.moveTo(ix + ir, iy);
  g.arc(ix, iy, ir, 0, TAU);
  g.fillStyle = c;
  g.fill('evenodd');
  g.restore();
}

/** A sun: face of radius r0 with n triangular rays reaching r1. */
function sun(g: G, c: string, x: number, y: number, r0: number, r1: number, n: number, edge?: string): void {
  star(g, c, x, y, r1, -Math.PI / 2, n, (r0 * 1.05) / r1);
  disc(g, c, x, y, r0);
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = r0 * 0.14;
    g.beginPath();
    g.arc(x, y, r0, 0, TAU);
    g.stroke();
  }
}

function shieldPath(g: G, x: number, y: number, w: number, h: number): void {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h * 0.55);
  g.quadraticCurveTo(x + w, y + h, x + w / 2, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h * 0.55);
  g.closePath();
}

function shield(g: G, c: string, x: number, y: number, w: number, h: number): void {
  shieldPath(g, x, y, w, h);
  g.fillStyle = c;
  g.fill();
}

/** Weighted stripes top→bottom (or hoist→fly); each is painted to the far edge so no hairline seams show. */
function stripes(g: G, w: number, h: number, cols: readonly string[], wts: readonly number[], vertical: boolean): void {
  const tot = wts.reduce((a, b) => a + b, 0);
  let at = 0;
  cols.forEach((c, i) => {
    if (vertical) rect(g, c, (w * at) / tot, 0, w - (w * at) / tot, h);
    else rect(g, c, 0, (h * at) / tot, w, h - (h * at) / tot);
    at += wts[i] ?? 1;
  });
}

const hz = (cols: string[], wts: number[] = cols.map(() => 1)): Draw => (g, w, h) => stripes(g, w, h, cols, wts, false);
const vt = (cols: string[], wts: number[] = cols.map(() => 1)): Draw => (g, w, h) => stripes(g, w, h, cols, wts, true);
const seq = (...ds: Draw[]): Draw => (g, w, h) => ds.forEach((d) => d(g, w, h));

/** Alternating horizontal stripes, starting with `a` at the top. */
function bars(g: G, w: number, h: number, n: number, a: string, b: string): void {
  rect(g, b, 0, 0, w, h);
  for (let i = 0; i < n; i += 2) rect(g, a, 0, (h * i) / n, w, h / n);
}

/** Nordic cross: centre of the upright at `cx` of the width; layers are [colour, arm width as a share of height], outer first. */
const nordic = (bg: string, cx: number, layers: [string, number][]): Draw => (g, w, h) => {
  rect(g, bg, 0, 0, w, h);
  for (const [c, t] of layers) {
    rect(g, c, w * cx - (t * h) / 2, 0, t * h, h);
    rect(g, c, 0, h / 2 - (t * h) / 2, w, t * h);
  }
};

/** Union Flag on a 60×30 grid: saltires 6 wide, the red 2 wide and counterchanged, St George 10 / 6 wide. */
function unionJack(g: G, w: number, h: number): void {
  const u = h / 30;
  const cx = w / 2;
  const cy = h / 2;
  const red = '#C8102E';
  rect(g, '#012169', 0, 0, w, h);
  g.strokeStyle = W;
  g.lineWidth = 6 * u;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(w, h);
  g.moveTo(w, 0);
  g.lineTo(0, h);
  g.stroke();
  const len = Math.hypot(cx, cy);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const dx = (sx * cx) / len; // unit vector from the centre to this corner
    const dy = (sy * cy) / len;
    // the red lies on the anticlockwise side of each half-diagonal (broad white uppermost at the hoist)
    const ox = dy * u;
    const oy = -dx * u;
    g.save();
    g.beginPath();
    g.rect(sx < 0 ? 0 : cx, sy < 0 ? 0 : cy, cx, cy);
    g.clip();
    g.strokeStyle = red;
    g.lineWidth = 2 * u;
    g.beginPath();
    g.moveTo(cx + ox, cy + oy);
    g.lineTo(cx + ox + dx * len * 1.2, cy + oy + dy * len * 1.2);
    g.stroke();
    g.restore();
  }
  rect(g, W, cx - 5 * u, 0, 10 * u, h);
  rect(g, W, 0, cy - 5 * u, w, 10 * u);
  rect(g, red, cx - 3 * u, 0, 6 * u, h);
  rect(g, red, 0, cy - 3 * u, w, 6 * u);
}

/** Right half of the Canadian maple leaf (stem → top point), centred, in a 4800-unit square. */
const LEAF = [
  90, 2030, 45, 1167, 156, 1069, 1015, 1220, 899, 900, 919, 827, 1860, 65, 1648, -34, 1614, -113, 1800, -685, 1258, -570,
  1185, -608, 1080, -855, 657, -401, 546, -458, 750, -1510, 423, -1321, 332, -1348, 0, -2000,
];

function mapleLeaf(g: G, c: string, x: number, y: number, side: number): void {
  const s = side / 4800;
  g.fillStyle = c;
  g.beginPath();
  for (let i = 0; i < LEAF.length; i += 2) g.lineTo(x + LEAF[i] * s, y + LEAF[i + 1] * s);
  for (let i = LEAF.length - 4; i >= 0; i -= 2) g.lineTo(x - LEAF[i] * s, y + LEAF[i + 1] * s);
  g.closePath();
  g.fill();
}

/** Korean trigram centred on the diagonal toward (sx, sy); code from the centre outwards, '-' solid, ':' broken. */
function trigram(g: G, w: number, h: number, sx: number, sy: number, code: string): void {
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(Math.atan2(sy * h, sx * w));
  const len = h / 4;
  const t = h / 24;
  for (let i = 0; i < 3; i++) {
    const x = h / 4 + h / 8 + i * (t + h / 48);
    if (code[i] === '-') rect(g, K, x, -len / 2, t, len);
    else {
      rect(g, K, x, -len / 2, t, len * 0.45);
      rect(g, K, x, len * 0.05, t, len * 0.45);
    }
  }
  g.restore();
}

function greekCross(g: G, c: string, x: number, y: number, s: number, t: number): void {
  rect(g, c, x - s / 2, y - t / 2, s, t);
  rect(g, c, x - t / 2, y - s / 2, t, s);
}

// ------------------------------------------------------------------ the flags

const FLAGS: Record<Nation, Draw> = {
  NL: hz(['#AE1C28', W, '#21468B']),
  GB: unionJack,
  DE: hz([K, '#DD0000', '#FFCE00']),
  DK: nordic('#C8102E', 14 / 37, [[W, 4 / 28]]),
  NO: nordic('#BA0C2F', 8 / 22, [[W, 4 / 16], ['#00205B', 2 / 16]]),
  SE: nordic('#006AA7', 6 / 16, [['#FECC02', 2 / 10]]),
  FI: nordic(W, 6.5 / 18, [['#002F6C', 3 / 11]]),
  BE: vt([K, '#FDDA24', '#EF3340']),
  FR: vt(['#0055A4', W, '#EF4135']),
  ES: seq(hz(['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1]), (g, w, h) => {
    const x = w / 3;
    for (const s of [-1, 1]) {
      // Pillars of Hercules
      const px = x + s * 0.125 * h;
      rect(g, '#B9B9B9', px - 0.017 * h, 0.37 * h, 0.034 * h, 0.24 * h);
      rect(g, '#AD1519', px - 0.026 * h, 0.345 * h, 0.052 * h, 0.03 * h);
      rect(g, '#AD1519', px - 0.026 * h, 0.6 * h, 0.052 * h, 0.03 * h);
    }
    // crown
    rect(g, '#8C6A00', x - 0.07 * h, 0.335 * h, 0.14 * h, 0.03 * h);
    g.fillStyle = '#AD1519';
    g.beginPath();
    g.arc(x, 0.335 * h, 0.055 * h, Math.PI, TAU);
    g.fill();
    // quartered shield: Castile, León, Aragon, Navarre, with the Bourbon roundel
    const sx = x - 0.075 * h;
    const sy = 0.37 * h;
    const sw = 0.15 * h;
    const sh = 0.24 * h;
    g.save();
    shieldPath(g, sx, sy, sw, sh);
    g.clip();
    rect(g, '#AD1519', sx, sy, sw, sh);
    rect(g, '#EDEDED', sx + sw / 2, sy, sw / 2, sh * 0.45);
    rect(g, '#F1BF00', sx, sy + sh * 0.45, sw / 2, sh * 0.4);
    rect(g, '#AD1519', sx + sw * 0.12, sy + sh * 0.45, sw * 0.07, sh * 0.4);
    rect(g, '#AD1519', sx + sw * 0.31, sy + sh * 0.45, sw * 0.07, sh * 0.4);
    rect(g, '#EDEDED', sx, sy + sh * 0.85, sw, sh * 0.15);
    disc(g, '#005BBF', x, sy + sh * 0.45, sw * 0.13);
    g.restore();
  }),
  PT: (g, w, h) => {
    const x = w * 0.4;
    const y = h / 2;
    const r = h * 0.25;
    rect(g, '#DA291C', 0, 0, w, h);
    rect(g, '#046A38', 0, 0, x, h);
    // armillary sphere (simplified: ring, ecliptic and equator)
    g.strokeStyle = '#FFE900';
    g.lineWidth = h * 0.035;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
    g.lineWidth = h * 0.022;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.32, -0.45, 0, TAU);
    g.stroke();
    g.beginPath();
    g.ellipse(x, y, r, r * 0.32, 0.45, 0, TAU);
    g.stroke();
    // shield: red bordure, white field, five blue quinas
    shield(g, '#DA291C', x - 0.105 * h, y - 0.13 * h, 0.21 * h, 0.26 * h);
    shield(g, W, x - 0.075 * h, y - 0.1 * h, 0.15 * h, 0.2 * h);
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) {
      rect(g, '#003399', x + dx * 0.042 * h - 0.016 * h, y - 0.01 * h + dy * 0.05 * h - 0.02 * h, 0.032 * h, 0.04 * h);
    }
  },
  IT: vt(['#009246', W, '#CE2B37']),
  GR: (g, w, h) => {
    const s = h / 9;
    const B = '#0D5EAF';
    bars(g, w, h, 9, B, W);
    rect(g, B, 0, 0, 5 * s, 5 * s);
    rect(g, W, 2 * s, 0, s, 5 * s);
    rect(g, W, 0, 2 * s, 5 * s, s);
  },
  MT: seq(vt([W, '#CF142B']), (g, w, h) => {
    const c = 0.17 * h;
    const s = 0.2 * h;
    const t = 0.075 * h;
    rect(g, '#CF142B', c - s / 2 - 0.012 * h, c - t / 2 - 0.012 * h, s + 0.024 * h, t + 0.024 * h);
    rect(g, '#CF142B', c - t / 2 - 0.012 * h, c - s / 2 - 0.012 * h, t + 0.024 * h, s + 0.024 * h);
    greekCross(g, '#A7A9AC', c, c, s, t);
  }),
  GI: (g, w, h) => {
    const R = '#DA000C';
    const x = w / 2;
    rect(g, W, 0, 0, w, h);
    rect(g, R, 0, (h * 2) / 3, w, h / 3);
    // castle: wall, three crenellated towers, black gate and windows
    rect(g, R, x - 0.21 * h, 0.44 * h, 0.42 * h, 0.23 * h);
    const tower = (cx: number, top: number, tw: number) => {
      rect(g, R, cx - tw / 2, top, tw, 0.45 * h - top);
      for (let i = 0; i < 3; i++) rect(g, R, cx - tw / 2 + (i * tw * 2) / 5, top - 0.035 * h, tw / 5, 0.04 * h);
      rect(g, K, cx - 0.012 * h, top + 0.05 * h, 0.024 * h, 0.05 * h);
    };
    tower(x, 0.22 * h, 0.15 * h);
    tower(x - 0.16 * h, 0.31 * h, 0.1 * h);
    tower(x + 0.16 * h, 0.31 * h, 0.1 * h);
    for (let i = 0; i < 5; i++) rect(g, R, x - 0.21 * h + (i * 0.42 * h) / 4.5, 0.41 * h, 0.04 * h, 0.04 * h);
    g.fillStyle = K;
    g.beginPath();
    g.moveTo(x - 0.045 * h, 0.667 * h);
    g.lineTo(x - 0.045 * h, 0.56 * h);
    g.arc(x, 0.56 * h, 0.045 * h, Math.PI, TAU);
    g.lineTo(x + 0.045 * h, 0.667 * h);
    g.fill();
    // golden key hanging from the gate
    const Y = '#F8D80F';
    g.strokeStyle = Y;
    g.lineWidth = 0.022 * h;
    g.beginPath();
    g.arc(x, 0.72 * h, 0.03 * h, 0, TAU);
    g.stroke();
    rect(g, Y, x - 0.011 * h, 0.75 * h, 0.022 * h, 0.16 * h);
    rect(g, Y, x, 0.84 * h, 0.05 * h, 0.022 * h);
    rect(g, Y, x, 0.885 * h, 0.05 * h, 0.022 * h);
  },
  MA: (g, w, h) => {
    rect(g, '#C1272D', 0, 0, w, h);
    const r = 0.25 * h;
    g.strokeStyle = '#006233';
    g.lineWidth = 0.035 * h;
    g.lineJoin = 'miter';
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + ((i * 2) % 5) * (TAU / 5);
      g.lineTo(w / 2 + r * Math.cos(a), h / 2 + r * Math.sin(a));
    }
    g.closePath();
    g.stroke();
  },
  SN: seq(vt(['#00853F', '#FDEF42', '#E31B23']), (g, w, h) => star(g, '#00853F', w / 2, h / 2, 0.15 * h)),
  GH: seq(hz(['#CE1126', '#FCD116', '#006B3F']), (g, w, h) => star(g, K, w / 2, h / 2 + 0.01 * h, 0.17 * h)),
  NG: vt(['#008751', W, '#008751']),
  CI: vt(['#F77F00', W, '#009E60']),
  IS: nordic('#02529C', 9 / 25, [[W, 4 / 18], ['#DC1E35', 2 / 18]]),
  IE: vt(['#169B62', W, '#FF883E']),
  CA: (g, w, h) => {
    rect(g, '#D52B1E', 0, 0, w, h);
    rect(g, W, w / 4, 0, w / 2, h);
    mapleLeaf(g, '#D52B1E', w / 2, h / 2, Math.min(w / 2, h));
  },
  US: (g, w, h) => {
    const s = h / 13;
    const cw = w * 0.4;
    const ch = 7 * s;
    bars(g, w, h, 13, '#B22234', W);
    rect(g, '#3C3B6E', 0, 0, cw, ch);
    for (let r = 0; r < 9; r++) for (let c = r % 2; c < 11; c += 2) star(g, W, (cw * (c + 1)) / 12, (ch * (r + 1)) / 10, h * 0.031);
  },
  PL: hz([W, '#DC143C']),
  EE: hz(['#0072CE', K, W]),
  LV: hz(['#9E3039', W, '#9E3039'], [2, 1, 2]),
  LT: hz(['#FDB913', '#006A44', '#C1272D']),
  RU: hz([W, '#0039A6', '#D52B1E']),
  UA: hz(['#0057B7', '#FFD700']),
  TR: (g, w, h) => {
    rect(g, '#E30A17', 0, 0, w, h);
    crescent(g, W, 0.5 * h, h / 2, 0.25 * h, 0.5625 * h, h / 2, 0.2 * h);
    star(g, W, 0.821 * h, h / 2, 0.125 * h, Math.PI);
  },
  EG: seq(hz(['#CE1126', W, K]), (g, w, h) => {
    // eagle of Saladin, reduced to head, drooping wings, chest shield, tail and scroll
    const x = w / 2;
    const y = h / 2;
    const Y = '#C09300';
    for (const s of [-1, 1]) {
      poly(g, Y, [x + s * 0.025 * h, y - 0.075 * h, x + s * 0.1 * h, y - 0.07 * h, x + s * 0.13 * h, y - 0.03 * h, x + s * 0.1 * h, y + 0.1 * h, x + s * 0.025 * h, y + 0.05 * h]);
    }
    poly(g, Y, [x - 0.03 * h, y + 0.04 * h, x + 0.03 * h, y + 0.04 * h, x + 0.05 * h, y + 0.105 * h, x - 0.05 * h, y + 0.105 * h]);
    rect(g, Y, x - 0.018 * h, y - 0.11 * h, 0.036 * h, 0.05 * h);
    disc(g, Y, x, y - 0.115 * h, 0.026 * h);
    poly(g, Y, [x - 0.02 * h, y - 0.125 * h, x - 0.05 * h, y - 0.11 * h, x - 0.02 * h, y - 0.1 * h]);
    shield(g, W, x - 0.03 * h, y - 0.06 * h, 0.06 * h, 0.1 * h);
    shield(g, Y, x - 0.022 * h, y - 0.052 * h, 0.044 * h, 0.084 * h);
    rect(g, Y, x - 0.09 * h, y + 0.115 * h, 0.18 * h, 0.03 * h);
  }),
  AE: seq(hz(['#00732F', W, K]), (g, w, h) => rect(g, '#FF0000', 0, 0, w / 4, h)),
  IN: seq(hz(['#FF9933', W, '#138808']), (g, w, h) => {
    const N = '#000080';
    const x = w / 2;
    const y = h / 2;
    const r = h / 8;
    g.strokeStyle = N;
    g.lineWidth = r * 0.12;
    g.beginPath();
    g.arc(x, y, r * 0.94, 0, TAU);
    g.stroke();
    g.lineWidth = r * 0.05;
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i * TAU) / 24;
      g.moveTo(x, y);
      g.lineTo(x + r * 0.9 * Math.cos(a), y + r * 0.9 * Math.sin(a));
    }
    g.stroke();
    disc(g, N, x, y, r * 0.2);
  }),
  SG: seq(hz(['#EF3340', W]), (g, w, h) => {
    const y = 0.25 * h;
    crescent(g, W, 0.3 * h, y, 0.17 * h, 0.375 * h, y, 0.16 * h);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      star(g, W, 0.43 * h + 0.075 * h * Math.cos(a), y + 0.075 * h * Math.sin(a), 0.03 * h);
    }
  }),
  CN: (g, w, h) => {
    const ux = w / 30;
    const uy = h / 20;
    const Y = '#FFFF00';
    rect(g, '#EE1C25', 0, 0, w, h);
    star(g, Y, 5 * ux, 5 * uy, 3 * uy);
    for (const [x, y] of [[10, 2], [12, 4], [12, 7], [10, 9]]) star(g, Y, x * ux, y * uy, uy, Math.atan2((5 - y) * uy, (5 - x) * ux));
  },
  JP: (g, w, h) => {
    rect(g, W, 0, 0, w, h);
    disc(g, '#BC002D', w / 2, h / 2, 0.3 * h);
  },
  KR: (g, w, h) => {
    const r = h / 4;
    const red = '#CD2E3A';
    const blue = '#0047A0';
    rect(g, W, 0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.atan2(h, w));
    disc(g, blue, 0, 0, r);
    g.fillStyle = red;
    g.beginPath();
    g.arc(0, 0, r, Math.PI, TAU);
    g.fill();
    disc(g, red, -r / 2, 0, r / 2);
    disc(g, blue, r / 2, 0, r / 2);
    g.restore();
    trigram(g, w, h, -1, -1, '---');
    trigram(g, w, h, 1, -1, ':-:');
    trigram(g, w, h, -1, 1, '-:-');
    trigram(g, w, h, 1, 1, ':::');
  },
  BR: (g, w, h) => {
    const M = h / 14;
    const x = w / 2;
    const y = h / 2;
    const r = 3.5 * M;
    rect(g, '#009C3B', 0, 0, w, h);
    poly(g, '#FEDF00', [(w * 1.7) / 20, y, x, 1.7 * M, w - (w * 1.7) / 20, y, x, h - 1.7 * M]);
    disc(g, '#002776', x, y, r);
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.clip();
    g.strokeStyle = W;
    g.lineWidth = 0.5 * M;
    g.beginPath();
    g.arc(x - 2 * M, h, 8.25 * M, 0, TAU);
    g.stroke();
    for (const [dx, dy] of [[0.05, 0.55], [0.3, 0.35], [-0.35, 0.4], [0.5, 0.62], [-0.1, 0.8], [0.25, 0.72], [-0.55, 0.15], [0.6, -0.35]]) {
      disc(g, W, x + dx * r, y + dy * r, 0.22 * M);
    }
    g.restore();
  },
  AR: seq(hz(['#74ACDF', W, '#74ACDF']), (g, w, h) => sun(g, '#F6B40E', w / 2, h / 2, 0.065 * h, 0.145 * h, 16, '#85340A')),
  LR: (g, w, h) => {
    const c = (5 * h) / 11;
    bars(g, w, h, 11, '#BF0A30', W);
    rect(g, '#002868', 0, 0, c, c);
    star(g, W, c / 2, c / 2, c * 0.32);
  },
  PA: (g, w, h) => {
    rect(g, W, 0, 0, w, h);
    rect(g, '#D21034', w / 2, 0, w / 2, h / 2);
    rect(g, '#005293', 0, h / 2, w / 2, h / 2);
    star(g, '#005293', w / 4, h / 4, 0.11 * h);
    star(g, '#D21034', (3 * w) / 4, (3 * h) / 4, 0.11 * h);
  },
  MH: (g, w, h) => {
    rect(g, '#003893', 0, 0, w, h);
    poly(g, '#DD7500', [0, h, w, 0, w, 0.18 * h]);
    poly(g, W, [0, h, w, 0.18 * h, w, 0.37 * h]);
    // 24-rayed star, four rays long
    const x = 0.2 * w;
    const y = 0.31 * h;
    g.fillStyle = W;
    g.beginPath();
    for (let i = 0; i < 48; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 24;
      const r = i % 2 ? 0.07 * h : i % 12 === 0 ? 0.25 * h : 0.16 * h;
      g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.fill();
  },
  CV: seq(hz(['#003893', W, '#CF2027', W, '#003893'], [6, 1, 1, 1, 3]), (g, w, h) => {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 10;
      star(g, '#F7D116', 0.375 * w + 0.27 * h * Math.cos(a), 0.625 * h + 0.27 * h * Math.sin(a), 0.045 * h);
    }
  }),
  PH: (g, w, h) => {
    const ax = 0.433 * w;
    const Y = '#FCD116';
    hz(['#0038A8', '#CE1126'])(g, w, h);
    poly(g, W, [0, 0, ax, h / 2, 0, h]);
    sun(g, Y, ax / 3, h / 2, 0.065 * h, 0.16 * h, 8);
    star(g, Y, 0.15 * ax, 0.11 * h, 0.04 * h);
    star(g, Y, 0.15 * ax, 0.89 * h, 0.04 * h);
    star(g, Y, 0.82 * ax, h / 2, 0.04 * h);
  },

  GM: hz(['#CE1126', W, '#0C1C8C', W, '#3A7728'], [6, 1, 4, 1, 6]),
  SL: hz(['#1EB53A', W, '#0072C6']),
  TG: (g, w, h) => {
    const c = 0.6 * h;
    hz(['#006A4E', '#FFCE00', '#006A4E', '#FFCE00', '#006A4E'])(g, w, h);
    rect(g, '#D21034', 0, 0, c, c);
    star(g, W, c / 2, c / 2, c * 0.33);
  },
  BJ: (g, w, h) => {
    rect(g, '#E8112D', 0, 0, w, h);
    rect(g, '#FCD116', 0, 0, w, h / 2);
    rect(g, '#008751', 0, 0, w * 0.4, h);
  },
  RO: vt(['#002B7F', '#FCD116', '#CE1126']),
  TW: (g, w, h) => {
    const x = w / 4;
    const y = h / 4;
    const r = 0.19 * h;
    rect(g, '#FE0000', 0, 0, w, h);
    rect(g, '#000095', 0, 0, w / 2, h / 2);
    star(g, W, x, y, r, -Math.PI / 2, 12, 0.55);
    disc(g, '#000095', x, y, r * 0.55);
    disc(g, W, x, y, r * 0.47);
  },
  SI: seq(hz([W, '#005DA4', '#ED1C24']), (g, w, h) => {
    const sx = 0.27 * w - 0.1 * h;
    const sy = 0.17 * h;
    shield(g, '#ED1C24', sx, sy, 0.2 * h, 0.27 * h);
    shield(g, '#005DA4', sx + 0.018 * h, sy + 0.018 * h, 0.164 * h, 0.234 * h);
    g.save();
    shieldPath(g, sx + 0.018 * h, sy + 0.018 * h, 0.164 * h, 0.234 * h);
    g.clip();
    const b = sy + 0.19 * h;
    poly(g, W, [sx, b, sx + 0.06 * h, b - 0.07 * h, sx + 0.08 * h, b - 0.05 * h, sx + 0.1 * h, b - 0.11 * h, sx + 0.12 * h, b - 0.05 * h, sx + 0.14 * h, b - 0.07 * h, sx + 0.2 * h, b, sx + 0.2 * h, b + 0.1 * h, sx, b + 0.1 * h]);
    rect(g, '#005DA4', sx, b + 0.02 * h, 0.2 * h, 0.014 * h);
    rect(g, '#005DA4', sx, b + 0.05 * h, 0.2 * h, 0.014 * h);
    for (const [dx, dy] of [[0.07, 0.05], [0.13, 0.05], [0.1, 0.085]]) star(g, '#FFDD00', sx + dx * h, sy + dy * h, 0.018 * h);
    g.restore();
  }),
  HR: seq(hz(['#FF0000', W, '#171796']), (g, w, h) => {
    const s = 0.25 * h;
    const sx = w / 2 - s / 2;
    const sy = 0.31 * h;
    const q = s / 5;
    // crown of five small shields
    for (let i = 0; i < 5; i++) shield(g, i % 2 ? '#171796' : '#0093DD', sx + i * q + q * 0.05, sy - q * 1.15 - (i === 2 ? q * 0.15 : 0), q * 0.9, q * 1.1);
    g.save();
    shieldPath(g, sx, sy, s, s * 1.2);
    g.clip();
    rect(g, W, sx, sy, s, s * 1.2);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) if ((i + j) % 2 === 0) rect(g, '#FF0000', sx + i * q, sy + j * q, q, q);
    g.restore();
    g.strokeStyle = '#FF0000';
    g.lineWidth = 0.012 * h;
    shieldPath(g, sx, sy, s, s * 1.2);
    g.stroke();
  }),
  BG: hz([W, '#00966E', '#D62612']),
  GE: (g, w, h) => {
    const R = '#FF0000';
    rect(g, W, 0, 0, w, h);
    rect(g, R, w / 2 - 0.1 * h, 0, 0.2 * h, h);
    rect(g, R, 0, 0.4 * h, w, 0.2 * h);
    const qx = (w / 2 - 0.1 * h) / 2;
    for (const x of [qx, w - qx]) for (const y of [0.2 * h, 0.8 * h]) greekCross(g, R, x, y, 0.2 * h, 0.06 * h);
  },
  CY: (g, w, h) => {
    rect(g, W, 0, 0, w, h);
    const x = w / 2;
    const y = 0.42 * h;
    const island = [-0.28, 0.02, -0.23, -0.07, -0.13, -0.06, 0, -0.09, 0.12, -0.1, 0.2, -0.14, 0.31, -0.21, 0.27, -0.14, 0.17, -0.06, 0.15, 0.02, 0.08, 0.05, 0, 0.08, -0.08, 0.1, -0.1, 0.14, -0.15, 0.1, -0.22, 0.09, -0.27, 0.05];
    poly(g, '#D57800', island.map((v, i) => (i % 2 ? y + v * h : x + v * h)));
    // olive branches
    const G2 = '#4E5B31';
    g.strokeStyle = G2;
    g.lineWidth = 0.018 * h;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + s * 0.22 * h, 0.62 * h);
      g.quadraticCurveTo(x + s * 0.12 * h, 0.76 * h, x + s * 0.01 * h, 0.76 * h);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        const t = 0.15 + i * 0.22;
        const lx = (1 - t) * (1 - t) * (x + s * 0.22 * h) + 2 * (1 - t) * t * (x + s * 0.12 * h) + t * t * (x + s * 0.01 * h);
        const ly = (1 - t) * (1 - t) * 0.62 * h + 2 * (1 - t) * t * 0.76 * h + t * t * 0.76 * h;
        for (const o of [-1, 1]) {
          g.fillStyle = G2;
          g.beginPath();
          g.ellipse(lx + o * 0.012 * h, ly + o * 0.02 * h, 0.028 * h, 0.012 * h, s * 0.6 + o * 0.5, 0, TAU);
          g.fill();
        }
      }
    }
  },
  IL: (g, w, h) => {
    const B = '#0038B8';
    rect(g, W, 0, 0, w, h);
    rect(g, B, 0, 0.1 * h, w, 0.15 * h);
    rect(g, B, 0, 0.75 * h, w, 0.15 * h);
    g.strokeStyle = B;
    g.lineWidth = 0.035 * h;
    for (const rot of [-Math.PI / 2, Math.PI / 2]) {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = rot + (i * TAU) / 3;
        g.lineTo(w / 2 + 0.17 * h * Math.cos(a), h / 2 + 0.17 * h * Math.sin(a));
      }
      g.closePath();
      g.stroke();
    }
  },
  TN: (g, w, h) => {
    const R = '#E70013';
    const x = w / 2;
    const y = h / 2;
    rect(g, R, 0, 0, w, h);
    disc(g, W, x, y, 0.25 * h);
    crescent(g, R, x - 0.02 * h, y, 0.19 * h, x + 0.03 * h, y, 0.15 * h);
    star(g, R, x + 0.045 * h, y, 0.1 * h, Math.PI);
  },
  DZ: seq(vt(['#006233', W]), (g, w, h) => {
    const x = w / 2;
    const y = h / 2;
    crescent(g, '#D21034', x, y, 0.25 * h, x + 0.0625 * h, y, 0.2 * h);
    star(g, '#D21034', x + 0.1 * h, y, 0.12 * h, Math.PI);
  }),
  LY: seq(hz(['#E70013', K, '#239E46'], [1, 2, 1]), (g, w, h) => {
    const x = w / 2;
    const y = h / 2;
    crescent(g, W, x - 0.02 * h, y, 0.12 * h, x + 0.01 * h, y, 0.097 * h);
    star(g, W, x + 0.075 * h, y, 0.06 * h, Math.PI);
  }),
  MR: (g, w, h) => {
    const Y = '#FFD700';
    const x = w / 2;
    rect(g, '#D01C1F', 0, 0, w, h);
    rect(g, '#00A95C', 0, 0.15 * h, w, 0.7 * h);
    crescent(g, Y, x, 0.48 * h, 0.23 * h, x, 0.4 * h, 0.21 * h);
    star(g, Y, x, 0.4 * h, 0.1 * h);
  },
  GN: vt(['#CE1126', '#FCD116', '#009460']),
  GW: (g, w, h) => {
    rect(g, '#009E49', 0, 0, w, h);
    rect(g, '#FCD116', 0, 0, w, h / 2);
    rect(g, '#CE1126', 0, 0, w / 3, h);
    star(g, K, w / 6, h / 2, 0.14 * h);
  },
  CM: seq(vt(['#007A5E', '#CE1126', '#FCD116']), (g, w, h) => star(g, '#FCD116', w / 2, h / 2, 0.14 * h)),
  GA: hz(['#009E60', '#FCD116', '#3A75C4']),
  CG: (g, w, h) => {
    rect(g, '#FBDE4A', 0, 0, w, h);
    poly(g, '#009543', [0, 0, (2 * w) / 3, 0, 0, h]);
    poly(g, '#DC241F', [w, 0, w, h, w / 3, h]);
  },
  AO: seq(hz(['#CC092F', K]), (g, w, h) => {
    const Y = '#FFCB00';
    const x = w / 2;
    const y = h / 2;
    const r = 0.2 * h;
    g.strokeStyle = Y;
    g.lineWidth = 0.055 * h;
    g.beginPath();
    g.arc(x, y, r, -0.3 * Math.PI, 0.9 * Math.PI);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = -0.25 * Math.PI + (i * 1.1 * Math.PI) / 7;
      g.save();
      g.translate(x + (r + 0.035 * h) * Math.cos(a), y + (r + 0.035 * h) * Math.sin(a));
      g.rotate(a);
      rect(g, Y, -0.02 * h, -0.02 * h, 0.04 * h, 0.04 * h);
      g.restore();
    }
    // machete
    poly(g, Y, [x - 0.2 * h, y + 0.16 * h, x + 0.13 * h, y - 0.17 * h, x + 0.2 * h, y - 0.19 * h, x + 0.16 * h, y - 0.12 * h, x - 0.17 * h, y + 0.19 * h]);
    star(g, Y, x - 0.06 * h, y - 0.07 * h, 0.075 * h);
  }),
  FO: nordic(W, 8 / 22, [['#005EB8', 4 / 16], ['#EF303E', 2 / 16]]),
  GL: (g, w, h) => {
    const R = '#C8102E';
    const x = (7 / 18) * w;
    const r = h / 3;
    rect(g, W, 0, 0, w, h);
    rect(g, R, 0, h / 2, w, h / 2);
    g.fillStyle = R;
    g.beginPath();
    g.arc(x, h / 2, r, Math.PI, TAU);
    g.fill();
    g.fillStyle = W;
    g.beginPath();
    g.arc(x, h / 2, r, 0, Math.PI);
    g.fill();
  },
  BS: seq(hz(['#00778B', '#FFC72C', '#00778B']), (g, w, h) => poly(g, K, [0, 0, 0.4 * w, h / 2, 0, h])),
  UY: (g, w, h) => {
    const c = (5 * h) / 9;
    bars(g, w, h, 9, W, '#0038A8');
    rect(g, W, 0, 0, c, c);
    sun(g, '#FCD116', c / 2, c / 2, 0.085 * h, 0.2 * h, 16, '#7B3F00');
  },
  // ── the world beyond Europe ──
  SA: seq(hz(['#006C35']), (g, w, h) => {
    // the creed in white script: a wavy run of strokes with a few uprights, above the sword (blade toward the hoist)
    g.strokeStyle = W;
    g.lineWidth = 0.05 * h;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= 18; i++) g.lineTo(w * (0.16 + (0.68 * i) / 18), h * (0.34 + (i % 2 ? -0.05 : 0.04) * (i % 4 < 2 ? 1 : 0.55)));
    g.stroke();
    g.lineCap = 'butt';
    for (const f of [0.22, 0.36, 0.52, 0.68, 0.8]) rect(g, W, w * f, h * 0.17, 0.028 * h, h * 0.15);
    poly(g, W, [w * 0.15, h * 0.665, w * 0.79, h * 0.615, w * 0.79, h * 0.7]);
    rect(g, W, w * 0.79, h * 0.57, 0.02 * w, h * 0.2);
    rect(g, W, w * 0.81, h * 0.64, w * 0.09, h * 0.05);
    disc(g, W, w * 0.9, h * 0.665, 0.035 * h);
  }), // Saudi Arabia
  DJ: seq(hz(['#6AB2E7', '#12AD2B']), (g, w, h) => {
    poly(g, W, [0, 0, 0.5 * w, h / 2, 0, h]);
    star(g, '#D7141A', 0.165 * w, h / 2, 0.12 * h);
  }), // Djibouti
  OM: seq(hz([W, '#DB161B', '#008000']), (g, w, h) => {
    rect(g, '#DB161B', 0, 0, w * 0.27, h);
    // the emblem, simplified: crossed swords over a curved khanjar, white at the top of the band
    const cx = w * 0.135;
    const cy = h * 0.19;
    g.strokeStyle = W;
    g.lineCap = 'round';
    g.lineWidth = 0.034 * h;
    g.beginPath();
    g.moveTo(cx - 0.085 * w, cy - 0.11 * h);
    g.lineTo(cx + 0.085 * w, cy + 0.1 * h);
    g.moveTo(cx + 0.085 * w, cy - 0.11 * h);
    g.lineTo(cx - 0.085 * w, cy + 0.1 * h);
    g.stroke();
    g.lineWidth = 0.045 * h;
    g.beginPath();
    g.arc(cx, cy - 0.035 * h, 0.07 * w, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.lineCap = 'butt';
  }), // Oman
  ZA: (g, w, h) => {
    // red over blue, a green Y with white edges, and a black triangle edged with yellow at the hoist
    hz(['#E03C31', '#001489'])(g, w, h);
    const j = 0.4 * w;
    const th = Math.atan2(h / 2, j);
    const ex = Math.cos(th) * 0.3 * w;
    const arms = (c: string, t: number): void => {
      g.strokeStyle = c;
      g.lineWidth = t;
      g.lineJoin = 'miter';
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(-ex, -ex * Math.tan(th));
      g.lineTo(j, h / 2);
      g.lineTo(w + 2, h / 2);
      g.moveTo(-ex, h + ex * Math.tan(th));
      g.lineTo(j, h / 2);
      g.stroke();
    };
    arms(W, 0.3 * h);
    arms('#007749', 0.17 * h);
    const tri = (c: string, off: number): void => {
      const xa = j * (1 - (2 * off) / h);
      poly(g, c, [0, off, xa, h / 2, 0, h - off]);
    };
    const o1 = (0.15 * h) / Math.cos(th);
    tri('#FFB81C', o1);
    tri(K, o1 + (0.05 * h) / Math.cos(th));
  }, // South Africa
  AU: seq(
    (g, w, h) => rect(g, '#00008B', 0, 0, w, h),
    (g, w, h) => unionJack(g, w / 2, h / 2),
    (g, w, h) => {
      // the Commonwealth Star under the canton, the Southern Cross on the fly
      star(g, W, 0.25 * w, 0.75 * h, 0.17 * h, -Math.PI / 2, 7, 0.45);
      for (const [x, y, r] of [[0.75, 0.14, 0.085], [0.62, 0.43, 0.085], [0.88, 0.36, 0.085], [0.75, 0.84, 0.095]] as const) star(g, W, x * w, y * h, r * h, -Math.PI / 2, 7, 0.45);
      star(g, W, 0.835 * w, 0.62 * h, 0.05 * h);
    },
  ), // Australia
  // Sri Lanka: the gold lion with a sword on a maroon field edged in gold; green and orange stripes at the hoist
  LK: (g, w, h) => {
    const Y = '#FFBE29';
    const M = '#8D153A';
    const b = 0.05 * h;
    const sw = 0.07 * w;
    rect(g, Y, 0, 0, w, h);
    rect(g, M, b, b, w - 2 * b, h - 2 * b);
    rect(g, '#00534E', b, b, sw, h - 2 * b);
    rect(g, '#EB7400', b + sw, b, sw, h - 2 * b);
    const px = b + 2 * sw + 0.55 * b;
    rect(g, Y, b + 2 * sw, b, 0.55 * b, h - 2 * b);
    rect(g, M, px, b, w - b - px, h - 2 * b);
    const s = 0.84 * (h - 2 * b);
    const cx = (px + w - b) / 2;
    const X = (u: number) => cx + (u - 0.5) * s * 1.05;
    const V = (v: number) => h / 2 + (v - 0.5) * s;
    const P = (...q: number[]) => poly(g, Y, q.map((n, i) => (i % 2 ? V(n) : X(n))));
    g.lineCap = 'round';
    g.strokeStyle = Y;
    g.fillStyle = Y;
    // the sword, raised in the right fore paw
    rect(g, Y, X(0.1), V(0.0), 0.06 * s, 0.5 * s);
    rect(g, Y, X(0.03), V(0.4), 0.2 * s, 0.05 * s);
    // a rampant lion: torso slanting down to the haunches, two hind legs, a tail ending in a tuft
    P(0.36, 0.4, 0.54, 0.34, 0.76, 0.5, 0.74, 0.74, 0.5, 0.7, 0.4, 0.56);
    P(0.66, 0.62, 0.82, 0.66, 0.88, 0.97, 0.72, 0.97);
    P(0.46, 0.66, 0.6, 0.72, 0.58, 0.97, 0.42, 0.97);
    g.lineWidth = 0.06 * s;
    g.beginPath();
    g.moveTo(X(0.74), V(0.56));
    g.quadraticCurveTo(X(1.04), V(0.58), X(0.94), V(0.2));
    g.stroke();
    disc(g, Y, X(0.94), V(0.16), 0.065 * s);
    // mane, head with a snout, and the fore legs
    disc(g, Y, X(0.4), V(0.28), 0.17 * s);
    disc(g, Y, X(0.4), V(0.46), 0.1 * s);
    P(0.32, 0.22, 0.18, 0.3, 0.2, 0.4, 0.32, 0.38);
    g.lineWidth = 0.08 * s;
    g.beginPath();
    g.moveTo(X(0.42), V(0.46));
    g.lineTo(X(0.15), V(0.42));
    g.moveTo(X(0.44), V(0.56));
    g.lineTo(X(0.3), V(0.8));
    g.stroke();
    // four bo leaves in the corners of the panel
    for (const [u, v] of [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]) disc(g, Y, X(u) + (u ? 0.02 : -0.02) * s, V(v) + (v ? 0.02 : -0.02) * s, 0.045 * s);
  },
  // Malaysia: fourteen red and white stripes, a blue canton with a yellow crescent and a fourteen-point star
  MY: seq(hz(Array.from({ length: 14 }, (_, i) => (i % 2 ? W : '#CC0001'))), (g, w, h) => {
    const ch = (8 / 14) * h;
    rect(g, '#010066', 0, 0, w / 2, ch);
    const y = ch / 2;
    crescent(g, '#FFCC00', 0.2 * h, y, 0.19 * h, 0.2 * h + 0.055 * h, y, 0.15 * h);
    star(g, '#FFCC00', 0.52 * h, y, 0.17 * h, -Math.PI / 2, 14, 0.5);
  }),
  // Thailand: red, white, a double-width blue, white, red
  TH: hz(['#A51931', W, '#2D2A4A', W, '#A51931'], [1, 1, 2, 1, 1]),
  // Vietnam: a gold star on red
  VN: seq(hz(['#DA251D']), (g, w, h) => star(g, '#FFFF00', w / 2, h / 2 + 0.015 * h, 0.31 * h)),
  // Hong Kong: a white bauhinia of five petals, each with a small red star, on red
  HK: seq(hz(['#DE2910']), (g, w, h) => {
    const R = 0.3 * h;
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5;
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(a);
      g.fillStyle = W;
      g.beginPath();
      g.ellipse(0.04 * R, -0.58 * R, 0.36 * R, 0.5 * R, 0.0, 0, TAU);
      g.fill();
      star(g, '#DE2910', 0.04 * R, -0.58 * R, 0.17 * R);
      g.restore();
    }
    disc(g, '#DE2910', w / 2, h / 2, 0.07 * R);
  }),
  // Peru: red, white, red upright; the arms are a shield in three fields inside a green wreath
  PE: seq(vt(['#D91023', W, '#D91023']), (g, w, h) => {
    const x = w / 2;
    const y = h / 2;
    g.strokeStyle = '#3B8A3E';
    g.lineWidth = 0.055 * h;
    g.beginPath();
    g.arc(x, y - 0.01 * h, 0.21 * h, -0.45, Math.PI + 0.45);
    g.stroke();
    shield(g, '#8A6A3A', x - 0.15 * h, y - 0.19 * h, 0.3 * h, 0.36 * h);
    shield(g, '#D91023', x - 0.13 * h, y - 0.17 * h, 0.26 * h, 0.32 * h);
    rect(g, '#8CC5EA', x - 0.13 * h, y - 0.17 * h, 0.13 * h, 0.15 * h);
    rect(g, '#F1ECD8', x, y - 0.17 * h, 0.13 * h, 0.15 * h);
    poly(g, '#2F8F3A', [x + 0.065 * h, y - 0.155 * h, x + 0.11 * h, y - 0.04 * h, x + 0.02 * h, y - 0.04 * h]);
    disc(g, '#E8B923', x, y + 0.08 * h, 0.04 * h);
  }),
  // Ecuador: yellow (double), blue, red; the arms are an oval with the snow peak and a condor on top
  EC: seq(hz(['#FFDD00', '#034EA2', '#ED1C24'], [2, 1, 1]), (g, w, h) => {
    const x = w / 2;
    const y = h * 0.52;
    const r = 0.17 * h;
    // condor, wings spread
    poly(g, '#4A3A2A', [x - 0.3 * h, y - 0.27 * h, x - 0.08 * h, y - 0.3 * h, x, y - 0.2 * h, x + 0.08 * h, y - 0.3 * h, x + 0.3 * h, y - 0.27 * h, x + 0.12 * h, y - 0.15 * h, x - 0.12 * h, y - 0.15 * h]);
    disc(g, '#C9A227', x, y, r + 0.025 * h);
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.clip();
    rect(g, '#8CC5EA', x - r, y - r, 2 * r, 2 * r);
    rect(g, '#3F9B4A', x - r, y + 0.03 * h, 2 * r, r);
    poly(g, W, [x - 0.1 * h, y + 0.04 * h, x + 0.01 * h, y - 0.12 * h, x + 0.12 * h, y + 0.04 * h]);
    rect(g, '#2C6EB5', x - r, y + 0.1 * h, 2 * r, 0.04 * h);
    g.restore();
    disc(g, '#FFDD00', x + 0.07 * h, y - 0.09 * h, 0.03 * h);
  }),
  CR: hz(['#002B7F', W, '#CE1126', W, '#002B7F'], [1, 1, 2, 1, 1]),
  CO: hz(['#FCD116', '#003893', '#CE1126'], [2, 1, 1]),
  // Jamaica: a gold saltire; green above and below, black at the hoist and the fly
  JM: (g, w, h) => {
    rect(g, '#009B3A', 0, 0, w, h);
    poly(g, K, [0, 0, w / 2, h / 2, 0, h]);
    poly(g, K, [w, 0, w / 2, h / 2, w, h]);
    g.strokeStyle = '#FED100';
    g.lineWidth = 0.2 * h;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, h);
    g.moveTo(w, 0);
    g.lineTo(0, h);
    g.stroke();
  },
  // Guatemala: light blue, white, light blue upright; the arms are a laurel wreath round crossed rifles and a bird
  GT: seq(vt(['#4997D0', W, '#4997D0']), (g, w, h) => {
    const x = w / 2;
    const y = h / 2;
    g.strokeStyle = '#3B8A3E';
    g.lineWidth = 0.06 * h;
    g.beginPath();
    g.arc(x, y, 0.2 * h, 0, TAU);
    g.stroke();
    g.strokeStyle = '#6B5A3A';
    g.lineWidth = 0.035 * h;
    g.beginPath();
    g.moveTo(x - 0.15 * h, y - 0.15 * h);
    g.lineTo(x + 0.15 * h, y + 0.15 * h);
    g.moveTo(x + 0.15 * h, y - 0.15 * h);
    g.lineTo(x - 0.15 * h, y + 0.15 * h);
    g.stroke();
    // the quetzal
    disc(g, '#2FA84F', x, y - 0.02 * h, 0.08 * h);
    poly(g, '#C8302A', [x - 0.04 * h, y + 0.03 * h, x + 0.04 * h, y + 0.03 * h, x, y + 0.12 * h]);
  }),
  // Mexico: green, white, red upright; the arms are an eagle on a nopal cactus above a green wreath
  MX: seq(vt(['#006847', W, '#CE1126']), (g, w, h) => {
    const x = w / 2;
    const y = h / 2;
    g.strokeStyle = '#3B8A3E';
    g.lineWidth = 0.05 * h;
    g.beginPath();
    g.arc(x, y - 0.02 * h, 0.2 * h, 0.35, Math.PI - 0.35);
    g.stroke();
    // wings, body and head of the eagle, facing the hoist
    poly(g, '#7A4A22', [x - 0.02 * h, y - 0.06 * h, x + 0.14 * h, y - 0.2 * h, x + 0.2 * h, y - 0.1 * h, x + 0.1 * h, y + 0.02 * h]);
    poly(g, '#7A4A22', [x - 0.02 * h, y - 0.06 * h, x - 0.1 * h, y - 0.18 * h, x - 0.04 * h, y + 0.04 * h]);
    disc(g, '#8A5A2C', x + 0.04 * h, y - 0.01 * h, 0.1 * h);
    disc(g, '#8A5A2C', x - 0.06 * h, y - 0.12 * h, 0.05 * h);
    poly(g, '#E8B923', [x - 0.1 * h, y - 0.13 * h, x - 0.17 * h, y - 0.1 * h, x - 0.1 * h, y - 0.09 * h]);
    // the nopal and the water
    rect(g, '#3F8F3F', x - 0.1 * h, y + 0.07 * h, 0.22 * h, 0.06 * h);
    rect(g, '#3E8FD0', x - 0.14 * h, y + 0.13 * h, 0.3 * h, 0.03 * h);
  }),
};

/** Draw the national flag into the rectangle on a 2D canvas (true proportions are approximated to the given box). */
export function drawNation(g: CanvasRenderingContext2D, n: Nation, x: number, y: number, w: number, h: number): void {
  if (!(w > 0 && h > 0)) return;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x, y);
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  FLAGS[n](g, w, h);
  g.restore();
  g.save();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  const lw = Math.min(1.5, Math.max(1, h / 24));
  g.lineWidth = lw;
  g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  g.restore();
}

const imgCache = new Map<string, string>();

/** An <img> tag (data URL) of the flag for DOM UI, like flagSvg in ./flags.ts. */
export function nationImg(n: Nation, w = 30, h = 20): string {
  const key = `${n}:${w}x${h}`;
  let src = imgCache.get(key);
  if (!src) {
    const c = document.createElement('canvas');
    c.width = w * 3;
    c.height = h * 3;
    drawNation(c.getContext('2d')!, n, 0, 0, w * 3, h * 3);
    src = c.toDataURL();
    imgCache.set(key, src);
  }
  return `<img class="flag" src="${src}" width="${w}" height="${h}" alt="${NAMES[n].replace(/'/g, '&#39;')}">`;
}

// ------------------------------------------------------------------ ports

// Names are normalised the same way as the lookup, so accents and punctuation here are only for reading.
// Ambiguous names go to the seafaring one (Boston → US, Alexandria → EG, Tripoli → LY, Valencia → ES…).
const PORTS: Partial<Record<Nation, string>> = {
  NL: 'Rotterdam|Europoort|Maasvlakte|Amsterdam|IJmuiden|Velsen|Zaandam|Vlissingen|Flushing|Den Helder|Moerdijk|Dordrecht|Terneuzen|Eemshaven|Delfzijl|Harlingen|Scheveningen|Hoek van Holland|Hook of Holland|Groningen|Den Haag|The Hague',
  BE: 'Antwerp|Antwerpen|Anvers|Zeebrugge|Brugge|Bruges|Ghent|Gent|Gand|Ostend|Oostende|Ostende|Liège|Luik|Lüttich|Brussels|Bruxelles|Brussel|Nieuwpoort',
  GB: "Felixstowe|Southampton|London|London Gateway|Tilbury|Thamesport|Purfleet|Sheerness|Chatham|Medway|Dover|Folkestone|Ramsgate|Newhaven|Shoreham|Portsmouth|Poole|Weymouth|Plymouth|Falmouth|Fowey|Bristol|Avonmouth|Portbury|Cardiff|Newport|Barry|Swansea|Port Talbot|Milford Haven|Pembroke|Pembroke Dock|Fishguard|Holyhead|Mostyn|Liverpool|Birkenhead|Manchester|Garston|Heysham|Fleetwood|Barrow|Barrow-in-Furness|Workington|Glasgow|Greenock|Clydeport|Cairnryan|Stranraer|Oban|Ullapool|Stornoway|Scrabster|Kirkwall|Scapa Flow|Flotta|Lerwick|Sullom Voe|Aberdeen|Peterhead|Fraserburgh|Montrose|Dundee|Rosyth|Leith|Edinburgh|Grangemouth|Invergordon|Inverness|Berwick|Blyth|Tyne|Newcastle|Sunderland|Hartlepool|Teesport|Middlesbrough|Whitby|Hull|Kingston upon Hull|Goole|Immingham|Grimsby|King's Lynn|Great Yarmouth|Lowestoft|Ipswich|Harwich|Belfast|Larne|Londonderry|Derry|Warrenpoint|Coleraine",
  IE: 'Dublin|Dún Laoghaire|Cork|Ringaskiddy|Cobh|Shannon|Foynes|Shannon Foynes|Limerick|Waterford|Rosslare|Galway|Drogheda|Killybegs|Wexford|Greenore|Bantry',
  DE: 'Hamburg|Bremerhaven|Bremen|Wilhelmshaven|Cuxhaven|Brunsbüttel|Kiel|Lübeck|Luebeck|Travemünde|Travemuende|Rostock|Wismar|Stralsund|Sassnitz|Mukran|Puttgarden|Flensburg|Emden|Brake|Nordenham|Stade|Duisburg|Mannheim|Cologne|Köln|Koeln|Düsseldorf|Duesseldorf|Neuss|Ludwigshafen|Karlsruhe|Mainz|Dortmund|Kehl',
  DK: 'Esbjerg|Aarhus|Århus|Copenhagen|København|Koebenhavn|Skagen|Frederikshavn|Fredericia|Aalborg|Hirtshals|Odense|Kalundborg|Helsingør|Elsinore|Rødby|Gedser|Grenaa|Køge|Horsens|Vejle|Randers|Rønne|Kolding|Hanstholm',
  NO: 'Oslo|Bergen|Stavanger|Tromsø|Tromsoe|Hammerfest|Bodø|Bodoe|Narvik|Ålesund|Aalesund|Trondheim|Kristiansand|Kristiansund|Kirkenes|Haugesund|Mongstad|Kårstø|Larvik|Drammen|Moss|Fredrikstad|Porsgrunn|Brevik|Honningsvåg|Florø|Molde|Måløy|Mo i Rana|Harstad|Svolvær|Vardø|Longyearbyen|Sandnessjøen|Egersund|Arendal|Tananger|Ågotnes|Sture|Kollsnes|Bodo',
  SE: 'Gothenburg|Göteborg|Goeteborg|Stockholm|Malmö|Helsingborg|Trelleborg|Luleå|Gävle|Norrköping|Karlshamn|Karlskrona|Ystad|Sundsvall|Umeå|Visby|Oxelösund|Nynäshamn|Kalmar|Halmstad|Varberg|Uddevalla|Lysekil|Brofjorden|Södertälje|Västerås|Piteå|Skellefteå|Örnsköldsvik',
  FI: 'Helsinki|Helsingfors|Vuosaari|Kotka|Hamina|HaminaKotka|Hamina-Kotka|Turku|Åbo|Naantali|Oulu|Rauma|Pori|Vaasa|Hanko|Kokkola|Kemi|Tornio|Mariehamn|Porvoo|Sköldvik|Loviisa|Uusikaupunki|Inkoo|Kaskinen|Raahe',
  EE: 'Tallinn|Muuga|Paldiski|Pärnu|Sillamäe|Kunda',
  LV: 'Riga|Ventspils|Liepāja',
  LT: 'Klaipėda|Būtingė',
  PL: 'Gdańsk|Gdynia|Szczecin|Świnoujście|Police|Kołobrzeg|Elbląg|Ustka|Darłowo',
  RU: 'Saint Petersburg|Sankt-Peterburg|Petersburg|Leningrad|Kronstadt|Ust-Luga|Primorsk|Vyborg|Vysotsk|Kaliningrad|Baltiysk|Murmansk|Arkhangelsk|Archangel|Novorossiysk|Tuapse|Sochi|Taganrog|Rostov|Rostov-on-Don|Azov|Vladivostok|Nakhodka|Vostochny|Vanino|Astrakhan|Makhachkala|Petropavlovsk|Sabetta|Dudinka|Pevek',
  UA: 'Odesa|Odessa|Chornomorsk|Illichivsk|Ilyichevsk|Pivdennyi|Yuzhny|Mykolaiv|Nikolaev|Kherson|Izmail|Reni|Mariupol|Berdiansk|Berdyansk|Ust-Dunaisk',
  RO: 'Constanța|Constantza|Mangalia|Midia|Galați|Brăila|Tulcea|Sulina',
  BG: 'Varna|Burgas|Bourgas|Balchik|Ruse',
  GE: 'Batumi|Poti|Kulevi|Supsa',
  TR: 'Istanbul|Ambarlı|Haydarpaşa|Izmir|Aliağa|Mersin|Iskenderun|Izmit|Kocaeli|Gebze|Yarımca|Derince|Gemlik|Bandırma|Samsun|Trabzon|Antalya|Tekirdağ|Çanakkale|Zonguldak|Ereğli|Diliskelesi|Dörtyol|Ceyhan|Bodrum|Marmaris|Kuşadası|Çeşme|Dikili|Hopa|Rize|Giresun|Ordu|Sinop',
  GR: 'Piraeus|Peiraias|Pireas|Athens|Thessaloniki|Salonika|Salonica|Patras|Patra|Heraklion|Iraklion|Iraklio|Volos|Igoumenitsa|Elefsina|Eleusis|Lavrio|Rafina|Kavala|Alexandroupoli|Rhodes|Rodos|Corfu|Kerkyra|Chania|Souda|Syros|Mykonos|Santorini|Chios|Mytilene|Kalamata|Perama',
  CY: 'Limassol|Lemesos|Larnaca|Larnaka|Famagusta|Vasilikos|Paphos|Kyrenia',
  MT: 'Marsaxlokk|Valletta|Grand Harbour|Malta Freeport|Malta|Birżebbuġa|Mġarr|Ċirkewwa',
  IT: 'Genoa|Genova|La Spezia|Spezia|Livorno|Leghorn|Naples|Napoli|Gioia Tauro|Trieste|Venice|Venezia|Marghera|Porto Marghera|Ravenna|Ancona|Bari|Brindisi|Taranto|Salerno|Palermo|Catania|Messina|Cagliari|Civitavecchia|Savona|Vado|Vado Ligure|Augusta|Olbia|Monfalcone|Chioggia|Piombino|Porto Torres|Siracusa|Syracuse|Pozzallo|Milazzo|Crotone|Termoli|Pescara|Porto Empedocle|Trapani|Golfo Aranci|Oristano|Marina di Carrara|Carrara|Imperia|Sanremo|Gaeta|Ortona|Manfredonia|Barletta|Porto Nogaro|Portovesme|Sarroch|Arbatax|Reggio Calabria|Villa San Giovanni|Torre Annunziata|Castellammare',
  SI: 'Koper|Capodistria|Piran|Izola',
  HR: 'Rijeka|Fiume|Split|Ploče|Zadar|Pula|Šibenik|Dubrovnik|Omišalj|Bakar|Gruž',
  ES: 'Valencia|Barcelona|Algeciras|Bahía de Algeciras|Bilbao|Cádiz|Málaga|Las Palmas|Las Palmas de Gran Canaria|Santa Cruz|Santa Cruz de Tenerife|Tenerife|Ceuta|Melilla|Huelva|Seville|Sevilla|Cartagena|Escombreras|Tarragona|Castellón|Vigo|A Coruña|La Coruña|Corunna|Ferrol|Gijón|Avilés|Santander|Pasaia|Pasajes|Almería|Palma|Palma de Mallorca|Ibiza|Mahón|Maó|Alicante|Motril|Sagunto|Arrecife|Puerto del Rosario|Marín|Vilagarcía|La Línea|Tarifa|El Puerto de Santa María|Rota|Puerto Real|Gandía|Dénia|Burriana|San Sebastián|Donostia|Santurtzi|Santurce|Bermeo|Los Cristianos|San Sebastián de la Gomera|Puerto de la Estaca',
  PT: 'Lisbon|Lisboa|Leixões|Porto|Oporto|Sines|Funchal|Setúbal|Aveiro|Figueira da Foz|Ponta Delgada|Praia da Vitória|Horta|Viana do Castelo|Portimão|Faro|Caniçal|Porto Santo|Madeira|Azores|Angra do Heroísmo|Peniche|Nazaré|Matosinhos',
  FR: "Le Havre|Havre|Rouen|Nantes|Saint-Nazaire|Nantes Saint-Nazaire|Montoir|Montoir-de-Bretagne|Donges|Marseille|Marseilles|Fos|Fos-sur-Mer|Lavéra|Port-de-Bouc|Dunkirk|Dunkerque|Cherbourg|Brest|Bordeaux|Le Verdon|Bassens|Calais|Boulogne|Boulogne-sur-Mer|Dieppe|Fécamp|Caen|Ouistreham|Honfleur|Saint-Malo|Roscoff|Lorient|Concarneau|La Rochelle|La Pallice|Rochefort|Bayonne|Sète|Port-la-Nouvelle|Port-Vendres|Toulon|Nice|Cannes|Ajaccio|Bastia|Calvi|Strasbourg|Paris|Lyon|Gravelines|Saint-Pierre|Saint-Pierre-et-Miquelon|Les Sables-d'Olonne",
  GI: 'Gibraltar',
  MA: 'Tangier|Tanger|Tangiers|Tanger Med|Tanger-Med|Tangier Med|Casablanca|Agadir|Mohammedia|Nador|Safi|Jorf Lasfar|Kenitra|Larache|Essaouira|El Jadida|Al Hoceima',
  DZ: 'Algiers|Alger|Oran|Annaba|Béjaïa|Skikda|Arzew|Djen Djen|Mostaganem|Ghazaouet',
  TN: 'Tunis|Radès|La Goulette|Sfax|Bizerte|Sousse|Gabès|Zarzis|Skhira',
  LY: 'Tripoli|Benghazi|Misrata|Misurata|Tobruk|Ras Lanuf|Es Sider|Zawiya|Marsa el Brega|Brega|Khoms',
  EG: 'Port Said|East Port Said|Suez|Alexandria|El Dekheila|Dekheila|Damietta|Sokhna|Ain Sokhna|Safaga|Adabiya|Ismailia',
  IL: 'Haifa|Ashdod|Eilat|Hadera|Ashkelon',
  MR: 'Nouakchott|Nouadhibou',
  SN: 'Dakar|Ziguinchor|Kaolack',
  GM: 'Banjul',
  GW: 'Bissau',
  GN: 'Conakry|Kamsar|Benty',
  SL: 'Freetown|Pepel',
  LR: 'Monrovia|Buchanan|Greenville|Harper',
  CI: 'Abidjan|San Pedro|San-Pédro',
  GH: 'Tema|Takoradi|Sekondi|Sekondi-Takoradi|Accra',
  TG: 'Lomé|Kpémé',
  BJ: 'Cotonou|Porto-Novo',
  NG: 'Lagos|Apapa|Tin Can|Tin Can Island|Lekki|Onne|Port Harcourt|Warri|Calabar|Bonny|Escravos|Koko|Sapele|Forcados|Qua Iboe|Bonga',
  CM: 'Douala|Kribi|Limbe|Tiko',
  GA: 'Libreville|Owendo|Port-Gentil',
  CG: 'Pointe-Noire|Djeno',
  AO: 'Luanda|Lobito|Namibe|Soyo|Cabinda|Malongo',
  CV: 'Mindelo|Porto Grande|Praia|Palmeira|Sal Rei|São Vicente',
  IS: 'Reykjavík|Hafnarfjörður|Akureyri|Ísafjörður|Seyðisfjörður|Grundartangi|Straumsvík|Vestmannaeyjar|Reyðarfjörður|Húsavík|Keflavík|Njarðvík|Þorlákshöfn',
  FO: 'Tórshavn|Klaksvík|Runavík|Tvøroyri|Vágur',
  GL: 'Nuuk|Godthåb|Sisimiut|Ilulissat|Aasiaat|Qaqortoq|Paamiut|Maniitsoq|Narsaq|Upernavik|Tasiilaq',
  CA: "Halifax|St John's|Saint John|Montreal|Quebec|Quebec City|Sept-Îles|Port-Cartier|Baie-Comeau|Trois-Rivières|Sorel|Bécancour|Saguenay|Gaspé|Argentia|Corner Brook|Botwood|Come By Chance|Bay Bulls|Marystown|Point Tupper|Port Hawkesbury|Mulgrave|Sheet Harbour|Shelburne|Belledune|Charlottetown|Summerside|Churchill|Iqaluit|Vancouver|Prince Rupert|Kitimat|Nanaimo|Toronto|Thunder Bay",
  US: 'New York|New York New Jersey|Newark|Port Newark|Port Elizabeth Newark|Elizabeth|Staten Island|Brooklyn|Savannah|Boston|Baltimore|Norfolk|Hampton Roads|Newport News|Philadelphia|Camden|Wilmington|Charleston|Jacksonville|Miami|Port Everglades|Fort Lauderdale|Tampa|Mobile|New Orleans|Baton Rouge|Houston|Galveston|Corpus Christi|Beaumont|Port Arthur|Lake Charles|Brownsville|Los Angeles|Long Beach|Oakland|San Francisco|San Diego|Seattle|Tacoma|Portland|Everett|Anchorage|Dutch Harbor|Honolulu|Hilo|Duluth|Chicago|Detroit|Cleveland|Toledo|Buffalo|Port Canaveral|Canaveral|Key West|Gulfport|Pascagoula|Searsport|Providence|New Haven|New London|Eastport|Port Hueneme|Hueneme|Stockton|Valdez|Kodiak|Juneau|Paulsboro|Marcus Hook|Albany|Pearl Harbor',
  BS: 'Nassau|Freeport|Freeport Grand Bahama',
  PA: 'Panama|Panama City|Balboa|Colón|Cristóbal|Rodman|Coco Solo|Almirante|Chiriquí Grande|Puerto Armuelles',
  BR: 'Santos|Rio de Janeiro|Paranaguá|Itajaí|Navegantes|Itapoá|São Francisco do Sul|Rio Grande|Salvador|Suape|Recife|Pecém|Fortaleza|Vitória|Vila Velha|Tubarão|Itaguaí|Sepetiba|Angra dos Reis|Manaus|Belém|Vila do Conde|São Luís|Itaqui|Natal|Maceió|Ilhéus|Imbituba|Porto Alegre|Pelotas|Santarém|Macapá|São Sebastião|Aratu|Porto do Açu|Açu',
  AR: 'Buenos Aires|Rosario|Bahía Blanca|Zárate|Campana|Ushuaia|Mar del Plata|Puerto Madryn|Comodoro Rivadavia|Necochea|Quequén|Dock Sud|Río Gallegos',
  UY: 'Montevideo|Nueva Palmira|Fray Bentos|Colonia|Colonia del Sacramento',
  AE: 'Jebel Ali|Dubai|Port Rashid|Abu Dhabi|Khalifa|Khalifa Port|Mina Zayed|Fujairah|Khor Fakkan|Sharjah|Ras al Khaimah|Ruwais|Hamriyah|Mina Saqr|Ajman|Umm al Quwain|Jebel Dhanna',
  IN: 'Mumbai|Bombay|Nhava Sheva|JNPT|Jawaharlal Nehru|Mundra|Kandla|Deendayal|Pipavav|Hazira|Chennai|Madras|Ennore|Kamarajar|Kattupalli|Kolkata|Calcutta|Haldia|Kochi|Cochin|Vizhinjam|Visakhapatnam|Vizag|Paradip|Tuticorin|Thoothukudi|Mangalore|Mormugao|Goa|Krishnapatnam|Kakinada|Dahej|Sikka|Jamnagar|Port Blair|Dhamra|Gangavaram|Okha|Porbandar|Karwar|Kollam',
  SG: 'Singapore|Jurong|Pasir Panjang|Tanjong Pagar|Keppel|Tuas|Sembawang|Pulau Bukom',
  CN: 'Shanghai|Yangshan|Ningbo|Ningbo-Zhoushan|Zhoushan|Shenzhen|Yantian|Shekou|Chiwan|Qingdao|Tianjin|Xingang|Guangzhou|Nansha|Huangpu|Xiamen|Dalian|Hong Kong|Hongkong|Kwai Chung|Lianyungang|Yingkou|Rizhao|Fuzhou|Quanzhou|Shantou|Zhanjiang|Zhuhai|Qinzhou|Beihai|Fangcheng|Haikou|Yantai|Weihai|Dongguan|Taicang|Nantong|Zhangjiagang|Wuhan|Nanjing|Chongqing|Jiangyin|Tangshan|Caofeidian|Jingtang|Qinhuangdao|Huanghua|Jinzhou|Dandong|Wenzhou|Taizhou|Jiaxing|Zhapu',
  JP: 'Yokohama|Tokyo|Kobe|Osaka|Nagoya|Hakata|Fukuoka|Kitakyushu|Moji|Chiba|Kawasaki|Shimizu|Nagasaki|Hiroshima|Niigata|Sendai|Tomakomai|Hakodate|Muroran|Sakai|Kashima|Yokkaichi|Mizushima|Kure|Sasebo|Naha|Okinawa|Kagoshima|Akita|Toyama|Kanazawa|Shimonoseki|Tokuyama|Wakayama|Himeji|Hitachi|Hachinohe|Otaru|Kushiro',
  KR: 'Busan|Pusan|Incheon|Inchon|Ulsan|Gwangyang|Kwangyang|Pyeongtaek|Mokpo|Pohang|Gunsan|Kunsan|Yeosu|Masan|Daesan|Donghae|Okpo|Geoje|Jeju|Changwon|Jinhae',
  TW: 'Kaohsiung|Keelung|Kelung|Chilung|Taichung|Taipei|Hualien|Su-ao|Anping|Mailiao',
  PH: 'Manila|Batangas|Cebu|Subic|Subic Bay|Davao|Iloilo|Cagayan de Oro|General Santos|Zamboanga|Legazpi|Tacloban|Bacolod|Puerto Princesa|Mariveles',
  MH: 'Majuro|Ebeye|Kwajalein',
};

const FOLD: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h' };

/** Lowercase ASCII words: accents and punctuation dropped, 'St'/'Sankt' → 'saint', 'Ste' → 'sainte'. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[øæœßłđðþıħ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/['’ʼ`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\b(st|sankt)\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte');
}

let portIndex: Map<string, Nation> | null = null;

function index(): Map<string, Nation> {
  if (!portIndex) {
    portIndex = new Map();
    for (const [n, list] of Object.entries(PORTS) as [Nation, string][]) {
      for (const p of list.split('|')) {
        const k = norm(p);
        if (k && !portIndex.has(k)) portIndex.set(k, n);
      }
    }
  }
  return portIndex;
}

function lookup(idx: Map<string, Nation>, n: string): Nation | null {
  const bare = n
    .replace(/^(the|port of|port de|porto di|porto de|puerto de|haven van|hafen) /, '')
    .replace(/ (port|harbour|harbor|haven|hafen|havn|havnen|hamn|terminals?|container terminal|docks?|anchorage|roads)$/, '');
  for (const k of [n, bare]) {
    const hit = idx.get(k);
    if (hit) return hit;
  }
  // a known port followed by more words: 'Las Palmas de Gran Canaria', 'Rotterdam Maasvlakte', 'Hamburg (DE)'
  const words = bare.split(' ');
  for (let i = words.length - 1; i >= 1; i--) {
    const hit = idx.get(words.slice(0, i).join(' '));
    if (hit) return hit;
  }
  return null;
}

/** The country of a real port, by its name (case-insensitive, accents ignored), or null if unknown. */
export function nationOfPort(name: string): Nation | null {
  const idx = index();
  for (const part of [name, ...name.split(/[,/;()|]+/)]) {
    const n = norm(part);
    if (!n) continue;
    const hit = lookup(idx, n);
    if (hit) return hit;
  }
  return null;
}
