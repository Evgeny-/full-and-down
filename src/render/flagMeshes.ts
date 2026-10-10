import * as THREE from 'three';
import { canvas, toTexture } from './paint';
import { drawFlag, type FlagId } from './flags';

const texCache = new Map<string, THREE.Texture>();

function flagTexture(id: FlagId): THREE.Texture {
  let t = texCache.get(id);
  if (!t) {
    const [c, g] = canvas(96, 64);
    drawFlag(g, id, 0, 0, 96, 64);
    t = toTexture(c);
    texCache.set(id, t);
  }
  return t;
}

/** A small cloth flag that waves in the breeze (vertex wave on the CPU: a handful of vertices). */
export class ClothFlag {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;
  private phase = Math.random() * 10;

  constructor(id: FlagId, w = 0.32, h = 0.22) {
    const geo = new THREE.PlaneGeometry(w, h, 6, 2);
    geo.translate(w / 2, 0, 0); // hoist (left edge) at the origin
    this.base = Float32Array.from(geo.attributes.position.array as Float32Array);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexture(id), side: THREE.DoubleSide, roughness: 0.8 }));
    this.mesh.castShadow = true;
  }

  update(t: number, strength = 1): void {
    const p = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const w = this.base;
    for (let i = 0; i < p.count; i++) {
      const x = w[i * 3];
      p.setZ(i, Math.sin(x * 14 - (t + this.phase) * 7) * 0.035 * x * 3 * strength);
    }
    p.needsUpdate = true;
  }
}

const DRESS: FlagId[] = ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'];

/** Dressing overall: a line of code flags from the bow, over the masthead, to the stern. */
export function dressLine(points: THREE.Vector3[], n = 18): { group: THREE.Group; flags: ClothFlag[] } {
  const group = new THREE.Group();
  const flags: ClothFlag[] = [];
  const pts: THREE.Vector3[] = [];
  points.forEach((p, i) => {
    if (i) pts.push(points[i - 1].clone().lerp(p, 0.5).add(new THREE.Vector3(0, -0.22, 0)));
    pts.push(p);
  });
  const curve = new THREE.CatmullRomCurve3(pts);
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.006, 4), new THREE.MeshBasicMaterial({ color: '#2a2d33' }));
  group.add(line);
  for (let i = 0; i < n; i++) {
    const f = new ClothFlag(DRESS[i % DRESS.length], 0.2, 0.14);
    const p = curve.getPoint((i + 0.5) / n);
    f.mesh.position.copy(p).add(new THREE.Vector3(0, -0.08, 0));
    f.mesh.rotation.z = -Math.PI / 2;
    f.mesh.scale.setScalar(0.001);
    group.add(f.mesh);
    flags.push(f);
  }
  return { group, flags };
}
