import { Rng } from '../../core/rng';
import { PortKit, MOLE_Z, clamp, lerp, type Col } from './kit';
import { pick, tint } from './town';

// ───────────────────────────── lighthouse ─────────────────────────────

export interface LighthouseOpts {
  /** tower height above its base */
  h?: number;
  r0?: number;
  r1?: number;
  /** stacked colour bands, bottom first: [colour, share] */
  bands?: Array<[Col, number]>;
  seg?: number;
  gallery?: Col;
  lantern?: Col;
  cap?: Col;
  /** a keeper's cottage at the foot */
  cottage?: boolean;
  /** tower is a square block (Genoa, Calais) */
  square?: boolean;
}

export const LH_STYLES: LighthouseOpts[] = [
  { bands: [['#d62f2b', 0.25], ['#f6f3ea', 0.25], ['#d62f2b', 0.25], ['#f6f3ea', 0.25]], cap: '#d62f2b', gallery: '#2d3138' },
  { bands: [['#f6f3ea', 1]], cap: '#d62f2b', gallery: '#d62f2b' },
  { bands: [['#f6f3ea', 0.7], ['#2d3138', 0.3]], cap: '#2d3138', gallery: '#2d3138', r0: 0.22, r1: 0.14 },
  { bands: [['#b8432f', 1]], cap: '#2d3138', gallery: '#f6f3ea' },
  { bands: [['#f6f3ea', 0.34], ['#c8302a', 0.33], ['#f6f3ea', 0.33]], cap: '#2d3138', gallery: '#2d3138', seg: 8 },
  { bands: [['#2f7a5c', 0.5], ['#f6f3ea', 0.5]], cap: '#2f7a5c', gallery: '#2d3138' },
];

/** A lighthouse standing on y0 (the concrete head under it is the caller's business). */
export function lighthouse(k: PortKit, x: number, y0: number, z: number, o: LighthouseOpts = {}): number {
  const p = k.solid;
  const h = o.h ?? 2.1;
  const r0 = o.r0 ?? 0.26;
  const r1 = o.r1 ?? 0.16;
  const bands = o.bands ?? LH_STYLES[0].bands!;
  const seg = o.seg ?? 16;
  let t0 = 0;
  const rAt = (t: number) => lerp(r0, r1, t);
  for (const [c, share] of bands) {
    const t1 = t0 + share;
    if (o.square) {
      const w0 = rAt(t0) * 1.7;
      const w1 = rAt(t1) * 1.7;
      p.box(x, y0 + h * t0, z, (w0 + w1) / 2, h * share, (w0 + w1) / 2, c);
    } else p.cyl(x, y0 + h * t0, z, rAt(t0) + 0.002, rAt(t1), h * share, c, { seg });
    t0 = t1;
  }
  const yt = y0 + h;
  // door and a few slit windows
  p.box(x, y0, z + r0 * (o.square ? 0.85 : 0.97), 0.07, 0.13, 0.03, '#5a3b2e', { ao: 0 });
  for (let i = 0; i < 3; i++) p.box(x + 0.0, y0 + h * (0.28 + i * 0.22), z + rAt(0.28 + i * 0.22) * (o.square ? 0.88 : 0.98), 0.035, 0.07, 0.02, '#2a3340', { ao: 0 });
  // gallery with a rail
  const gr = r1 + 0.09;
  p.cyl(x, yt, z, gr, gr, 0.035, o.gallery ?? '#2d3138', { seg });
  p.cyl(x, yt + 0.035, z, gr, gr, 0.07, o.gallery ?? '#2d3138', { seg: seg, ao: 0 });
  // lantern room: glass with a lamp inside, four mullions
  const lr = r1 * 0.72;
  k.glass.cyl(x, yt + 0.035, z, lr, lr, 0.22, '#bfe6f2', { seg: 12 });
  k.glow.ball(x, yt + 0.15, z, lr * 0.6, '#fff1b0');
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    p.box(x + Math.cos(a) * lr, yt + 0.035, z + Math.sin(a) * lr, 0.018, 0.22, 0.018, o.gallery ?? '#2d3138', { ao: 0 });
  }
  p.cyl(x, yt + 0.255, z, lr + 0.045, lr + 0.045, 0.025, o.cap ?? '#d62f2b', { seg: 12 });
  p.cone(x, yt + 0.28, z, lr + 0.04, 0.17, o.cap ?? '#d62f2b', { seg: 12 });
  p.ball(x, yt + 0.47, z, 0.025, '#2d3138');
  p.cyl(x, yt + 0.47, z, 0.005, 0.005, 0.1, '#2d3138', { seg: 4 });
  if (o.cottage) {
    p.box(x + 0.44, y0, z + 0.12, 0.36, 0.17, 0.26, '#f4f0e6');
    p.prism(x + 0.44, y0 + 0.17, z + 0.12, 0.4, 0.09, 0.28, '#b8432f');
  }
  return yt + 0.5;
}

// ───────────────────────────── breakwater ─────────────────────────────

/** A concrete armour block (cube, tumbled) in place of a tetrapod: chunky and cheap. */
function tetrapod(k: PortKit, x: number, y: number, z: number, s: number, rng: Rng, color: Col): void {
  const r = 0.17 * s;
  k.solid.box(x, y - r * 0.5, z, r * 1.5, r * 1.1, r * 1.5, color, { ry: rng.next() * 3, rx: rng.range(-0.4, 0.4), rz: rng.range(-0.4, 0.4), ao: 0.1 });
}

export interface MoleOpts {
  /** x of the head, where the lighthouse stands */
  endX: number;
  /** the mole runs from the head toward +x (1) or -x (-1) */
  dir: 1 | -1;
  armour?: 'rocks' | 'tetrapods' | 'mixed' | 'wall';
  tone?: Col;
  /** the light on the head; false for none */
  light?: LighthouseOpts | false;
  z?: number;
  y?: number;
  /** half-height of the head and its radius */
  headR?: number;
}

/**
 * The breakwater: a concrete mole from the head to beyond the edge of the scene, a round head, rock and
 * tetrapod armour down into the water, and a lighthouse standing on the head with a solid base.
 * Returns the y of the mole's walkway and the head position.
 */
export function breakwater(k: PortKit, o: MoleOpts): { top: number; headX: number; z: number } {
  const p = k.solid;
  const rng = new Rng(k.seed ^ 0xb7ea);
  const z = o.z ?? MOLE_Z;
  const top = o.y ?? 0.5;
  const tone = o.tone ?? '#b9b3a7';
  const far = k.width / 2 + 14;
  const x1 = o.dir > 0 ? far : -far;
  const len = Math.abs(x1 - o.endX);
  const cx = (o.endX + x1) / 2;
  const cxView = k.vx(z);
  // body: sunk well below the water so nothing hangs in the air
  p.box(cx, -0.9, z, len, 0.9 + top, 0.56, tone);
  // sea-wall parapet and a slightly lighter walkway
  p.box(cx, top, z - 0.22, len, 0.15, 0.1, tint(tone, -0.1), { ao: 0.1 });
  p.box(cx, top - 0.01, z + 0.04, len, 0.012, 0.36, tint(tone, 0.12), { ao: 0 });
  // expansion joints and the odd bollard / lamp post
  for (let x = o.endX + o.dir * 1.2; Math.abs(x - o.endX) < len - 0.5; x += o.dir * 1.2) {
    if (Math.abs(x - cxView) > 15) continue;
    p.box(x, top, z + 0.04, 0.012, 0.014, 0.36, '#8b867b', { ao: 0 });
  }
  const armour = o.armour ?? 'mixed';
  if (armour !== 'wall') {
    // an under-layer so the rock mound has no gaps, then big boulders (and tetrapods) on top
    p.box(cx, -0.9, z + 0.5, len, 1.05, 0.42, '#7d7a72');
    p.box(cx, -0.9, z - 0.5, len, 1.0, 0.44, '#7d7a72');
    const rockCols = ['#8a867c', '#797670', '#948f84', '#837f77'];
    const nearLo = cxView - 11;
    const nearHi = cxView + 11;
    for (const side of [1, -1]) {
      for (let x = o.endX; Math.abs(x - o.endX) < len; ) {
        const near = x > nearLo && x < nearHi;
        for (let row = 0; row < 2; row++) {
          const off = 0.4 + row * 0.27 + rng.range(-0.04, 0.05);
          const y = row ? -0.06 : 0.16;
          const zz = z + side * off;
          const useT = armour === 'tetrapods' || (armour === 'mixed' && side < 0 && row === 1);
          if (useT && near) tetrapod(k, x, y + 0.1, zz, rng.range(1.0, 1.3), rng, '#cfc9bb');
          else p.rock(x, y - 0.06, zz, side > 0 ? rng.range(0.15, 0.22) : rng.range(0.17, 0.27), pick(rng, rockCols), { sy: rng.range(0.7, 1), ry: rng.next() * 6, ao: 0.12 });
        }
        x += o.dir * (near ? rng.range(0.34, 0.46) : 0.9);
      }
    }
  } else {
    // a plain sea wall: stepped concrete face
    p.box(cx, -0.9, z + 0.33, len, 0.95, 0.12, tint(tone, -0.06));
  }
  // the head: a round concrete block, its flanks armoured
  const hr = o.headR ?? 0.8;
  p.cyl(o.endX, -0.9, z, hr, hr, 0.9 + top, tint(tone, 0.04), { seg: 20 });
  p.cyl(o.endX, top, z, hr, hr, 0.03, tint(tone, 0.12), { seg: 20, ao: 0 });
  p.cyl(o.endX, top + 0.03, z, hr * 0.62, hr * 0.62, 0.05, tint(tone, 0.02), { seg: 16 });
  if (armour !== 'wall') {
    // armour round the head; on the side facing the ship it stays tight (nothing is built nearer than z = -6.1)
    p.cyl(o.endX, -0.9, z, hr + 0.34, hr + 0.1, 1.0, '#8b877d', { seg: 20 });
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const near = Math.sin(a) > 0.1;
      for (let row = 0; row < 2; row++) {
        if (row && near) continue;
        const rr = hr + 0.1 + row * 0.24;
        const y = row ? -0.1 : 0.17;
        if (armour === 'tetrapods' && row) tetrapod(k, o.endX + Math.cos(a) * rr, y + 0.1, z + Math.sin(a) * rr, 1.1, rng, '#d9d4c7');
        else p.rock(o.endX + Math.cos(a) * rr, y - 0.05, z + Math.sin(a) * rr, near ? rng.range(0.12, 0.16) : rng.range(0.14, 0.22), pick(rng, ['#8f8a80', '#7f7b72', '#9a958a']), { sy: rng.range(0.7, 1), ry: rng.next() * 6, ao: 0.12 });
      }
    }
  }
  if (o.light !== false) lighthouse(k, o.endX, top + 0.08, z, o.light ?? pick(rng, LH_STYLES));
  return { top, headX: o.endX, z };
}

/** Clamp helper kept here for landmark code that places things on the mole. */
export const onMole = (x: number, lo: number, hi: number): number => clamp(x, lo, hi);
