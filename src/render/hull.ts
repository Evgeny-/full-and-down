import * as THREE from 'three';

/**
 * A lofted ship hull built from stations. x runs stern → bow, y up from the keel, z across.
 * Chunky, stylised proportions (length : depth ≈ 6 : 1) so the side reads as a gauge.
 */
export interface HullSpec {
  length: number;
  beam: number;
  /** keel to main deck amidships */
  depth: number;
  /** length of the tapering entrance at the bow */
  bowLen: number;
  /** length of the run at the stern */
  sternLen: number;
  /** how far the deck rises toward the stem */
  sheerBow: number;
  /** how far aft the forefoot sits from the deck-level stem */
  rake: number;
  bilge: number;
}

export interface HullGeometry {
  side: THREE.BufferGeometry;
  deck: THREE.BufferGeometry;
  /** deck height (y) at x */
  deckAt(x: number): number;
  /** half-breadth of the deck edge at x */
  halfBeamAt(x: number): number;
}

const SECTION_BOTTOM = 3;
const SECTION_BILGE = 6;
const SECTION_SIDE = 10;

export function buildHull(spec: HullSpec, stations = 56): HullGeometry {
  const { length: L, beam: B, depth: D, bowLen, sternLen, sheerBow, rake, bilge: r } = spec;
  const hb = B / 2;
  const xBow0 = L / 2 - bowLen;
  const xStern0 = -L / 2 + sternLen;
  const deckAt = (x: number) => {
    const t = Math.max(0, (x - (L / 2 - bowLen * 1.6)) / (bowLen * 1.6));
    return D + sheerBow * t * t;
  };
  const topAt = (x: number) => deckAt(x);
  /** x of the stem at height y (raked, curving forefoot) */
  const stemX = (y: number) => {
    const top = D + sheerBow;
    const k = Math.min(1, Math.max(0, 1 - y / top));
    return L / 2 - rake * Math.pow(k, 1.7);
  };
  const keelAt = (x: number) => {
    if (x >= xStern0) return 0;
    const t = (xStern0 - x) / sternLen;
    return 0.42 * D * t * t;
  };
  const planAt = (x: number, y: number, top: number) => {
    let f = 1;
    if (x > xBow0) {
      const sx = stemX(y);
      const u = (x - xBow0) / Math.max(1e-4, sx - xBow0);
      f = u >= 1 ? 0 : Math.pow(1 - Math.pow(u, 2.1), 0.62);
    }
    if (x < xStern0) {
      const t = (xStern0 - x) / sternLen;
      const low = 1 - Math.min(1, y / top);
      f *= 1 - (0.08 + 0.3 * low * low) * t * t;
    }
    return f;
  };

  // midship half-section as (y, z) with y measured from keel 0 to deck `top`
  const section = (top: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i < SECTION_BOTTOM; i++) pts.push([0, ((hb - r) * i) / SECTION_BOTTOM]);
    for (let i = 0; i <= SECTION_BILGE; i++) {
      const a = -Math.PI / 2 + (Math.PI / 2) * (i / SECTION_BILGE);
      pts.push([r + Math.sin(a) * r, hb - r + Math.cos(a) * r]);
    }
    for (let i = 1; i <= SECTION_SIDE; i++) {
      // denser near the waterline band (lower half of the side)
      const k = i / SECTION_SIDE;
      const kk = k < 0.6 ? k * 0.85 : 0.51 + (k - 0.6) * (0.49 / 0.4);
      pts.push([r + (top - r) * kk, hb]);
    }
    return pts;
  };

  const M = SECTION_BOTTOM + SECTION_BILGE + 1 + SECTION_SIDE; // points per half-section
  const xs: number[] = [];
  for (let i = 0; i <= stations; i++) {
    // denser stations at the ends where the shape changes
    const t = i / stations;
    const s = t < 0.5 ? 0.5 * Math.pow(2 * t, 0.8) : 1 - 0.5 * Math.pow(2 * (1 - t), 0.8);
    xs.push(-L / 2 + L * s);
  }
  const maxTop = D + sheerBow;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // two halves: side = +1 (toward the camera, +z) and -1
  for (const sideSign of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= stations; i++) {
      const x = xs[i];
      const top = topAt(x);
      const keel = keelAt(x);
      const pts = section(top);
      for (let j = 0; j < M; j++) {
        const [y0, z0] = pts[j];
        const y = keel + (y0 * (top - keel)) / top;
        const z = z0 * planAt(x, y, top) * sideSign;
        pos.push(x, y, z);
        uv.push((x + L / 2) / L, y / maxTop);
      }
    }
    for (let i = 0; i < stations; i++) {
      for (let j = 0; j < M - 1; j++) {
        const a = base + i * M + j;
        const b = base + (i + 1) * M + j;
        if (sideSign > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  // transom (stern face): fan between the two halves at station 0
  {
    const half = (stations + 1) * M;
    const top = topAt(xs[0]);
    const keel = keelAt(xs[0]);
    const c = pos.length / 3;
    pos.push(xs[0], (top + keel) / 2, 0);
    uv.push(0, (top + keel) / 2 / maxTop);
    for (let j = 0; j < M - 1; j++) {
      idx.push(c, j + 1, j);
      idx.push(c, half + j, half + j + 1);
    }
    // close top edge between the halves
    idx.push(c, M - 1, half + M - 1);
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  side.setIndex(idx);
  side.computeVertexNormals();

  // the deck: a strip between the two deck edges
  const dpos: number[] = [];
  const duv: number[] = [];
  const didx: number[] = [];
  for (let i = 0; i <= stations; i++) {
    const x = xs[i];
    const top = topAt(x);
    const w = hb * planAt(x, top, top);
    dpos.push(x, top, w, x, top, -w);
    duv.push((x + L / 2) / L, 1, (x + L / 2) / L, 0);
    if (i < stations) {
      const a = i * 2;
      didx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3));
  deck.setAttribute('uv', new THREE.Float32BufferAttribute(duv, 2));
  deck.setIndex(didx);
  deck.computeVertexNormals();

  return {
    side,
    deck,
    deckAt: topAt,
    halfBeamAt: (x: number) => hb * planAt(x, topAt(x), topAt(x)),
  };
}
