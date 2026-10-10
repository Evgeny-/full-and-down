import * as THREE from 'three';
import { canvas, toTexture } from '../paint';
import { drawFlag, type FlagId } from '../flags';
import { drawNation, type Nation } from '../nations';
import { hashString } from '../../core/rng';
import { PortKit } from './kit';

const texCache = new Map<string, THREE.Texture>();

function flagTexture(nation: Nation | null, portName: string): THREE.Texture {
  const key = nation ?? 'port:' + portName;
  let t = texCache.get(key);
  if (!t) {
    const [c, g] = canvas(240, 160);
    if (nation) drawNation(g, nation, 0, 0, 240, 160);
    else {
      // an unknown port flies a code flag, so there is always something to read
      const ids: FlagId[] = ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'];
      drawFlag(g, ids[hashString(portName) % ids.length], 0, 0, 240, 160);
    }
    t = toTexture(c);
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

export interface FlagpoleOpts {
  /** pole height above its foot */
  height?: number;
  /** flag width (3:2) */
  width?: number;
  /** turn of the flag's plane about y: faces the camera at 19° */
  facing?: number;
}

/**
 * A flagpole on y0 with the national flag at the head, waving gently (vertex wave in the group's
 * update hook). The flag is the only non-merged mesh in a scene besides the turbine rotors.
 */
export function addFlagpole(k: PortKit, nation: Nation | null, portName: string, x: number, y0: number, z: number, o: FlagpoleOpts = {}): void {
  const H = o.height ?? 2.5;
  const fw = o.width ?? 1.0;
  const fh = (fw * 2) / 3;
  const p = k.solid;
  // a small plinth, the pole, a gilded truck
  p.cyl(x, y0, z, 0.07, 0.06, 0.1, '#d9d4c7', { seg: 8 });
  p.cyl(x, y0 + 0.1, z, 0.026, 0.014, H - 0.1, '#eceae3', { seg: 7, ao: 0.05 });
  p.ball(x, y0 + H + 0.015, z, 0.032, '#e8b923');
  const geo = new THREE.PlaneGeometry(fw, fh, 14, 6);
  geo.translate(fw / 2, 0, 0);
  const base = Float32Array.from(geo.attributes.position.array as Float32Array);
  const tex = flagTexture(nation, portName);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.75, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.22 });
  mat.userData.own = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  const phase = (hashString(portName) % 100) / 10;
  mesh.position.set(x + 0.02, y0 + H - fh / 2 - 0.01, z);
  mesh.rotation.y = o.facing ?? (19 * Math.PI) / 180;
  k.extras.push(mesh);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const wave = (t: number) => {
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const u = bx / fw;
      const amp = 0.015 + 0.09 * u;
      pos.setZ(i, Math.sin(bx * 7.5 - (t + phase) * 4.2 + by * 2.2) * amp * fw + Math.sin(bx * 3.1 - (t + phase) * 2.1) * 0.03 * u * fw);
      pos.setY(i, by - 0.05 * fw * u * u + Math.sin(bx * 5 - (t + phase) * 3) * 0.012 * u * fw);
    }
    pos.needsUpdate = true;
  };
  wave(0);
  k.updaters.push(wave);
}
