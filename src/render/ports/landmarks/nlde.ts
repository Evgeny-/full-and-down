import { PortKit, SHORE_Z, LAND_Y, lerp, smooth, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { RegionId } from '../regions';
import { tint } from '../town';
import { cableStayed, gothicTower, tower } from '../structures';
import { gantryCrane } from '../props';

/** Netherlands, Belgium and Germany: Rotterdam, Hamburg and friends. */

/** Carve a river mouth through the shore: water from the sea straight back inland. */
export function river(k: PortKit, cx: number, half: number, zBack = -34): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1 || z < zBack) return h;
    const d = Math.abs(x - cx);
    const bank = smooth(half + 0.9, half, d); // 1 in the channel, 0 outside
    const end = smooth(zBack, zBack + 6, z); // channel fades out far back
    return lerp(h, Math.min(h, -0.35), bank * end);
  });
}

const rotterdam: Landmark = {
  terrain(k) {
    river(k, k.vx(-15, -0.6), 3.1);
    k.shape.relief = 0.2;
  },
  build(k) {
    const cx = k.vx(-15, -0.6);
    const z = -14.6;
    // the Erasmus Bridge: a white leaning pylon with a fan of stays, a low approach span on piers
    const x0 = cx - 5.6;
    const x1 = cx + 4.6;
    const deck = 0.78;
    const land = LAND_Y;
    // approach ramps up from the banks
    for (const [xa, xb] of [[x0, x0 + 1.2], [x1 - 1.2, x1]] as Array<[number, number]>) {
      const up = xa === x0;
      k.solid.solid([[xa, -0.3, z - 0.13], [xb, -0.3, z - 0.13], [xb, up ? deck - 0.07 : land, z - 0.13], [xa, up ? land : deck - 0.07, z - 0.13], [xa, -0.3, z + 0.13], [xb, -0.3, z + 0.13], [xb, up ? deck - 0.07 : land, z + 0.13], [xa, up ? land : deck - 0.07, z + 0.13]].map((v) => v as V3), [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]], '#a8a49a');
    }
    cableStayed(k, x0 + 1.2, x1 - 1.2, z, [{ x: cx - 2.6, h: 5.0, side: 1, lean: -0.7 }], { deck, half: 0.15 });
    // the Euromast: a slim white shaft, a saucer-shaped crow's nest, a mast on top
    const ex = cx - 6.7;
    const ez = -17.2;
    const ey = k.ground(ex, ez) - 0.03;
    const p = k.solid;
    p.cyl(ex, ey, ez, 0.2, 0.12, 3.9, '#f1f0ea', { seg: 12 });
    p.lathe(ex, ey + 3.5, ez, [[0.0, 0], [0.4, 0.05], [0.46, 0.16], [0.4, 0.3], [0.18, 0.38], [0.0, 0.4]], '#e9ebe6', { seg: 14 });
    k.glass.cyl(ex, ey + 3.55, ez, 0.42, 0.42, 0.14, '#9fc4d4', { seg: 14 });
    p.cyl(ex, ey + 3.9, ez, 0.09, 0.04, 0.5, '#f1f0ea', { seg: 8 });
    p.cyl(ex, ey + 4.4, ez, 0.018, 0.01, 0.7, '#d62f2b', { seg: 5 });
    k.reserve(ex, ez, 0.4, 0.4);
    // cube houses: yellow cubes tipped on their corners, on hexagonal stems
    for (let i = 0; i < 3; i++) {
      const bz = -13.3 - (i % 2) * 0.55;
      const bx = k.landX(cx + 3.6 + i * 0.85, bz, 0.35, 0.35);
      const by = k.ground(bx, bz) - 0.02;
      p.cyl(bx, by, bz, 0.1, 0.1, 0.45, '#c9c5ba', { seg: 6 });
      p.box(bx, by + 0.52, bz, 0.5, 0.5, 0.5, '#e7c33d', { rx: 0.62, rz: 0.78, ao: 0 });
      k.reserve(bx, bz, 0.3, 0.3);
    }
    // De Rotterdam: three stacked glass slabs shifted against one another
    const tx = cx + 1.0;
    const tz = -17.6;
    tower(k, tx, tz, 0.6, 0.45, 2.1, '#cfd8dd', { glass: false, win: '#4f6f86', rows: 11, cols: 3 });
    tower(k, tx + 0.7, tz + 0.1, 0.6, 0.45, 2.6, '#c5cfd5', { win: '#4f6f86', rows: 13, cols: 3 });
    tower(k, tx + 1.4, tz + 0.2, 0.6, 0.45, 2.2, '#cfd8dd', { win: '#4f6f86', rows: 11, cols: 3 });
    // a couple of quayside cranes in the dock behind the bridge
    gantryCrane(k, cx + 6.8, SHORE_Z - 0.7, { color: '#c9402e', s: 0.9, y: LAND_Y });
  },
  mole: { light: undefined },
  flag: undefined,
};

const hamburg: Landmark = {
  terrain(k) {
    k.shape.relief = 0.3;
    k.shape.range = 1.0;
  },
  build(k) {
    const cx = k.vx(-15, -0.4);
    const z = -14.0;
    const p = k.solid;
    // the Elbphilharmonie: a brick warehouse base carrying a glass hall with a wave-shaped roof
    const gy = LAND_Y;
    const bw = 4.2;
    const bd = 1.4;
    const bh = 1.1;
    p.box(cx, gy - 0.1, z, bw, bh + 0.1, bd, '#8a4535');
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 22; c++) {
        const wx = cx - bw / 2 + 0.1 + c * (bw - 0.2) / 22;
        p.quad([wx, gy + 0.1 + r * 0.19, z + bd / 2 + 0.004], [wx + 0.1, gy + 0.1 + r * 0.19, z + bd / 2 + 0.004], [wx + 0.1, gy + 0.23 + r * 0.19, z + bd / 2 + 0.004], [wx, gy + 0.23 + r * 0.19, z + bd / 2 + 0.004], '#2e3844');
      }
    }
    p.box(cx, gy + bh, z, bw + 0.06, 0.05, bd + 0.06, '#b9b3a4');
    // the glass: a profile in XY extruded along z, wavy roof
    const top: [number, number][] = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -bw / 2 + t * bw;
      // two peaks: a tall wave to the left, a lower swell to the right, a trough between
      const y = 0.7 + 1.0 * Math.exp(-Math.pow((t - 0.2) / 0.16, 2)) + 0.5 * Math.exp(-Math.pow((t - 0.66) / 0.17, 2)) + 0.07 * Math.sin(t * 30);
      top.push([x, y]);
    }
    const prof: [number, number][] = [[-bw / 2, 0], [bw / 2, 0], ...top.reverse()];
    k.glass.extrude(prof, bd * 0.92, cx, gy + bh + 0.05, z, '#78b3c9', { ao: 0 });
    // mullions: pale vertical lines down the glass face and a pale roof edge
    for (let i = 1; i < 30; i++) {
      const t = i / 30;
      const x = cx - bw / 2 + t * bw;
      const y = 0.7 + 1.0 * Math.exp(-Math.pow((t - 0.2) / 0.16, 2)) + 0.5 * Math.exp(-Math.pow((t - 0.66) / 0.17, 2));
      p.box(x, gy + bh + 0.05, z + bd * 0.46 + 0.004, 0.012, y, 0.01, '#e8f1f4', { ao: 0 });
    }
    k.reserve(cx, z, bw / 2 + 0.2, bd / 2 + 0.2);
    // St Michael's, "the Michel": a baroque church with the green copper spire
    const mx = cx + 5.2;
    const mz = -15.6;
    const my = k.ground(mx, mz) - 0.03;
    p.box(mx, my - 0.1, mz, 0.9, 0.1 + 0.55, 0.6, '#d9cfb8');
    p.prism(mx, my + 0.55, mz, 0.62, 0.22, 0.92, '#4f7a66', { ry: Math.PI / 2 });
    gothicTower(k, mx + 0.0, mz + 0.4, { shaft: 2.0, spire: 1.9, w: 0.44, stone: '#d9cfb8', roof: '#58907a', y: my });
    // some container cranes and a stack on the left quay
    const rng = k.rng;
    for (let i = 0; i < 3; i++) gantryCrane(k, cx - 5.5 - i * 1.5, SHORE_Z - 0.5, { color: i % 2 ? '#2c5da8' : '#c9402e', s: 0.8 + rng.next() * 0.2 });
    void tint;
  },
};

export const LANDMARKS: Record<string, Landmark> = { rotterdam, hamburg };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Rotterdam', 'nl', 'rotterdam'],
  ['Hamburg', 'de', 'hamburg'],
];
