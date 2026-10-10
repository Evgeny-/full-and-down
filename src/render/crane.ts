import * as THREE from 'three';
import { PAL } from './palette';
import { canvas, toTexture } from './paint';

const BOOM = 3.4;
/** How far the hook sits above the centre of the parcel it lifts: the grab's jaws just bite into the heap. */
export const GRAB_HANG = 0.66;

/**
 * The ship's own deck crane (a geared feeder): pedestal, slewing cab, a luffing boom and a hook on a
 * wire. It doesn't plan anything: it follows a target point (the box being lifted) so every lift
 * reads as the crane's work. Coordinates are in the ship body's local space.
 * With `grab` the hook carries a clamshell grab (a bulker's crane) instead of the container spreader.
 */
export class Crane {
  readonly group = new THREE.Group();
  private slew = new THREE.Group();
  private boom = new THREE.Group();
  private wire: THREE.Mesh;
  private hook: THREE.Group;
  private pivot = new THREE.Vector3();
  /** current and wanted azimuth / radius of the boom tip */
  private az = Math.PI * 0.75;
  private radius = 1.9;
  private wantAz = Math.PI * 0.75;
  private wantRadius = 1.9;
  private hookY = 0;
  private wantHookY = 0;
  private parkAz: number;
  private parkRadius: number;
  private parkHookY: number;
  readonly grab: boolean;

  constructor(base: THREE.Vector3, parkAz = 0, grab = false) {
    this.grab = grab;
    this.group.position.copy(base);
    const yellow = new THREE.MeshStandardMaterial({ color: PAL.funnel, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.6 });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.75, 14), yellow);
    pedestal.position.y = 0.375;
    pedestal.castShadow = true;
    this.group.add(pedestal);
    this.slew.position.y = 0.75;
    this.group.add(this.slew);
    // the cab with a window strip
    const [c, g] = canvas(64, 32);
    g.fillStyle = PAL.funnel;
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#2b3a4f';
    g.fillRect(6, 8, 52, 12);
    const cabMat = new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.45 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.36), [yellow, yellow, yellow, yellow, cabMat, yellow]);
    cab.position.set(-0.08, 0.17, 0);
    cab.castShadow = true;
    this.slew.add(cab);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.3), dark);
    counter.position.set(-0.32, 0.13, 0);
    this.slew.add(counter);
    // boom: a tapered lattice-looking box pivoting at its heel
    this.boom.position.set(0.1, 0.12, 0);
    this.slew.add(this.boom);
    const [bc, bg] = canvas(256, 32);
    bg.fillStyle = PAL.funnel;
    bg.fillRect(0, 0, 256, 32);
    bg.strokeStyle = 'rgba(80,60,0,0.45)';
    bg.lineWidth = 3;
    for (let x = 0; x < 256; x += 22) {
      bg.beginPath();
      bg.moveTo(x, 2);
      bg.lineTo(x + 11, 30);
      bg.lineTo(x + 22, 2);
      bg.stroke();
    }
    const boomMat = new THREE.MeshStandardMaterial({ map: toTexture(bc), roughness: 0.45 });
    const boomGeo = new THREE.BoxGeometry(BOOM, 0.13, 0.15);
    boomGeo.translate(BOOM / 2, 0, 0);
    // taper toward the tip
    const p = boomGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = p.getX(i) / BOOM;
      p.setY(i, p.getY(i) * (1 - 0.45 * k));
      p.setZ(i, p.getZ(i) * (1 - 0.35 * k));
    }
    boomGeo.computeVertexNormals();
    const boomMesh = new THREE.Mesh(boomGeo, boomMat);
    boomMesh.castShadow = true;
    this.boom.add(boomMesh);
    const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), dark);
    sheave.rotation.x = Math.PI / 2;
    sheave.position.x = BOOM;
    this.boom.add(sheave);
    // the wire and the hook block hang straight down from the tip (world-vertical)
    this.wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 5), new THREE.MeshStandardMaterial({ color: '#22252b' }));
    this.group.add(this.wire);
    this.hook = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: PAL.flagRed }));
    block.castShadow = true;
    this.hook.add(block);
    if (grab) {
      this.hook.add(clamshell(dark));
    } else {
      // a spreader bar
      const spreader = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.12), dark);
      spreader.position.y = -0.1;
      this.hook.add(spreader);
    }
    this.group.add(this.hook);
    this.pivot.set(0, 0.87, 0);
    this.parkAz = this.az = this.wantAz = parkAz;
    this.parkRadius = this.radius = this.wantRadius = 1.25;
    this.parkHookY = this.hookY = this.wantHookY = 2.6;
  }

  /**
   * Aim the hook at a point (local to the crane's parent). `hang` = how far the hook is above it;
   * the default suits what hangs below: a container under the spreader, a parcel (its centre) under the grab.
   */
  follow(target: THREE.Vector3, hang = this.grab ? GRAB_HANG : 0.32): void {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    this.wantAz = Math.atan2(-dz, dx);
    this.wantRadius = Math.min(BOOM * 0.96, Math.max(0.5, Math.hypot(dx, dz)));
    this.wantHookY = target.y - this.group.position.y + hang;
  }

  park(): void {
    this.wantAz = this.parkAz;
    this.wantRadius = this.parkRadius;
    this.wantHookY = this.parkHookY;
  }

  /** Snap (no easing) — used while a box is actually hanging, so the wire never lags the load. */
  update(dt: number, snap = false): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    let d = this.wantAz - this.az;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.az += d * k;
    this.radius += (this.wantRadius - this.radius) * k;
    this.hookY += (this.wantHookY - this.hookY) * k;
    this.slew.rotation.y = this.az;
    const elev = Math.acos(Math.min(1, Math.max(0, (this.radius - 0.1) / BOOM)));
    this.boom.rotation.z = elev;
    // tip in crane-local space
    const tipR = 0.1 + Math.cos(elev) * BOOM;
    const tipY = this.pivot.y + Math.sin(elev) * BOOM;
    const tx = Math.cos(this.az) * tipR;
    const tz = -Math.sin(this.az) * tipR;
    const hookY = Math.min(this.hookY, tipY - 0.2);
    this.hook.position.set(tx, hookY, tz);
    const len = tipY - hookY;
    this.wire.position.set(tx, hookY + len / 2, tz);
    this.wire.scale.y = Math.max(0.01, len);
  }
}

/** Diagonal yellow / black hazard stripes. */
function hazardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#15181e';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = PAL.funnel;
  for (const o of [-64, 0, 64]) {
    g.beginPath();
    g.moveTo(o, 64);
    g.lineTo(o + 32, 64);
    g.lineTo(o + 96, 0);
    g.lineTo(o + 64, 0);
    g.closePath();
    g.fill();
  }
  return toTexture(c, true);
}

/** A rod between two points (hook-local). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 5), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/**
 * A clamshell grab hanging from the hook (origin = the hook block's centre): a head, two half-cylinder
 * jaws in hazard paint, hinged at the head and hanging a little open, with their cutting edges below.
 */
function clamshell(dark: THREE.Material): THREE.Group {
  const grab = new THREE.Group();
  const R = 0.115; // jaw radius
  const len = 0.3; // across (z)
  const hingeY = -0.175;
  const open = 0.2; // radians
  const tex = hazardTexture();
  tex.repeat.set(1.4, 1);
  const hazard = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
  const plateMat = new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.6, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#8d969e', roughness: 0.35, metalness: 0.6 });
  // the head: a block under the hook with a short link
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.2), dark);
  head.position.y = hingeY - 0.015;
  head.castShadow = true;
  grab.add(head);
  grab.add(rod(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, hingeY, 0), 0.014, dark));
  for (const side of [-1, 1]) {
    const jaw = new THREE.Group();
    // the shell: half a cylinder (angles 90..270 deg in the x-y plane, mirrored for the right jaw)
    const segs = 12;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI / 2 + (i / segs) * Math.PI;
      const x = -Math.cos(a) * R * side;
      const y = -R + Math.sin(a) * R;
      for (const z of [-len / 2, len / 2]) {
        pos.push(x, y, z);
        uv.push((i / segs) * Math.PI * R * 3.2, (z + len / 2) * 3.2);
      }
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const shell = new THREE.Mesh(g, hazard);
    shell.castShadow = true;
    jaw.add(shell);
    // the end plates (half discs) and the cutting edge
    for (const z of [-len / 2, len / 2]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 12, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), plateMat);
      cap.position.set(0, -R, z);
      jaw.add(cap);
    }
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, len + 0.012), edgeMat);
    edge.position.set(0, -2 * R, 0);
    jaw.add(edge);
    jaw.position.set(side * 0.012, hingeY, 0);
    jaw.rotation.z = side * open;
    grab.add(jaw);
    // a closing rope from the head to the jaw's shoulder
    grab.add(rod(new THREE.Vector3(side * 0.07, hingeY - 0.01, len * 0.38), new THREE.Vector3(side * 0.13, hingeY - 0.07, len * 0.46), 0.007, dark));
    grab.add(rod(new THREE.Vector3(side * 0.07, hingeY - 0.01, -len * 0.38), new THREE.Vector3(side * 0.13, hingeY - 0.07, -len * 0.46), 0.007, dark));
  }
  return grab;
}
