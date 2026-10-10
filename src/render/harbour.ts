import * as THREE from 'three';
import { canvas, toTexture, grime, shade } from './paint';
import { PAL } from './palette';
import { Rng } from '../core/rng';

export const QUAY_Z = 1.6; // the quay edge (water side), the ship lies at z = 0
export const QUAY_Y = 0.42; // apron height above the water

/** The quay in the foreground: speckled concrete, yellow coping, bollards, lane paint. */
export class Quay {
  readonly group = new THREE.Group();
  readonly bollards: THREE.Vector3[] = [];

  constructor(width: number) {
    const depth = 24;
    const rng = new Rng(11);
    const [c, g] = canvas(1024, 512);
    g.fillStyle = PAL.concrete;
    g.fillRect(0, 0, 1024, 512);
    grime(g, rng, 0, 0, 1024, 512, 4000, '#6b6459', 0.12);
    grime(g, rng, 0, 0, 1024, 512, 1500, '#ffffff', 0.18);
    // expansion joints
    g.strokeStyle = 'rgba(80,70,60,0.25)';
    g.lineWidth = 2;
    for (let x = 0; x < 1024; x += 128) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 512);
      g.stroke();
    }
    for (let y = 0; y < 512; y += 128) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1024, y);
      g.stroke();
    }
    const tex = toTexture(c, true);
    tex.repeat.set(width / 8, depth / 4);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(width, 1.4, depth), [
      new THREE.MeshStandardMaterial({ color: '#b8b2a6' }),
      new THREE.MeshStandardMaterial({ color: '#b8b2a6' }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: '#8c867b' }),
      new THREE.MeshStandardMaterial({ color: '#b8b2a6' }),
      new THREE.MeshStandardMaterial({ color: '#9a9488' }),
    ]);
    apron.position.set(0, QUAY_Y - 0.7, QUAY_Z + depth / 2);
    apron.receiveShadow = true;
    this.group.add(apron);
    // yellow coping along the edge
    const coping = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.2), new THREE.MeshStandardMaterial({ color: PAL.quayEdge, roughness: 0.6 }));
    coping.position.set(0, QUAY_Y + 0.035, QUAY_Z + 0.1);
    coping.receiveShadow = true;
    this.group.add(coping);
    // black-and-yellow hazard stripes painted on the coping face
    // bollards
    const bollardGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(0, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.08, 0.1), new THREE.Vector2(0.06, 0.13), new THREE.Vector2(0.1, 0.17), new THREE.Vector2(0.1, 0.2), new THREE.Vector2(0, 0.21)],
      12,
    );
    const bollardMat = new THREE.MeshStandardMaterial({ color: '#2d3138', roughness: 0.5, metalness: 0.3 });
    for (let x = -width / 2 + 1; x < width / 2; x += 2.6) {
      const b = new THREE.Mesh(bollardGeo, bollardMat);
      b.position.set(x, QUAY_Y + 0.07, QUAY_Z + 0.42);
      b.castShadow = true;
      this.group.add(b);
      this.bollards.push(b.position.clone().setY(QUAY_Y + 0.22));
    }
    // fenders: black rubber cylinders hanging on the quay wall (their tops peek over the edge)
    const fenderMat = new THREE.MeshStandardMaterial({ color: PAL.rubber, roughness: 0.9 });
    for (let x = -width / 2 + 2.2; x < width / 2; x += 2.6) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 12), fenderMat);
      f.rotation.z = Math.PI / 2;
      f.scale.set(1, 0.5, 1);
      f.position.set(x, QUAY_Y - 0.12, QUAY_Z - 0.1);
      this.group.add(f);
    }
  }
}

/**
 * Far side of the berth: open water, a breakwater with a lighthouse, the town on the hills. All low
 * contrast so the ship stays the hero.
 */
export class Backdrop {
  readonly group = new THREE.Group();

  constructor(width: number) {
    const rng = new Rng(5);
    // breakwater: a long low concrete mole with tetrapods
    const mole = new THREE.Mesh(new THREE.BoxGeometry(width * 0.62, 0.38, 0.6), new THREE.MeshStandardMaterial({ color: '#b9b3a7', roughness: 0.9 }));
    mole.position.set(-width * 0.16, 0.12, -7.2);
    mole.receiveShadow = true;
    mole.castShadow = true;
    this.group.add(mole);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.95, flatShading: true });
    const rock = new THREE.IcosahedronGeometry(0.22, 0);
    const rocks = new THREE.InstancedMesh(rock, rockMat, 60);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 60; i++) {
      const x = -width * 0.16 - width * 0.31 + rng.next() * width * 0.62;
      q.setFromEuler(new THREE.Euler(rng.next() * 3, rng.next() * 3, rng.next() * 3));
      const s = rng.range(0.6, 1.2);
      m.compose(new THREE.Vector3(x, 0.02, -6.85 + rng.range(-0.05, 0.12)), q, new THREE.Vector3(s, s * 0.8, s));
      rocks.setMatrixAt(i, m);
    }
    this.group.add(rocks);
    // lighthouse at the end of the mole: red and white bands
    const lhX = -width * 0.16 + width * 0.31 - 0.45;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.75, 16), new THREE.MeshStandardMaterial({ color: '#b9b3a7', roughness: 0.9 }));
    plinth.position.set(lhX, 0.0, -7.2);
    plinth.castShadow = true;
    this.group.add(plinth);
    const [lc, lg] = canvas(16, 128);
    for (let i = 0; i < 8; i++) {
      lg.fillStyle = i % 2 ? '#f6f3ea' : PAL.flagRed;
      lg.fillRect(0, i * 16, 16, 16);
    }
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 14), new THREE.MeshStandardMaterial({ map: toTexture(lc), roughness: 0.6 }));
    tower.position.set(lhX, 1.0, -7.2);
    tower.castShadow = true;
    this.group.add(tower);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#fff6c8', emissive: '#ffd66b', emissiveIntensity: 0.6 }));
    lamp.position.set(lhX, 1.85, -7.2);
    this.group.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 12), new THREE.MeshStandardMaterial({ color: PAL.flagRed }));
    cap.position.set(lhX, 2.03, -7.2);
    this.group.add(cap);

    // the far shore: soft hills and a little town of gabled houses
    const hillMat = new THREE.MeshStandardMaterial({ color: '#9fb8a3', roughness: 1 });
    const hillShape = new THREE.Shape();
    hillShape.moveTo(-width, 0);
    for (let i = 0; i <= 24; i++) {
      const x = -width + (i / 24) * width * 2;
      const y = 1.2 + Math.sin(i * 0.9) * 0.45 + Math.sin(i * 0.37 + 1) * 0.7;
      hillShape.lineTo(x, y);
    }
    hillShape.lineTo(width, 0);
    const hills = new THREE.Mesh(new THREE.ExtrudeGeometry(hillShape, { depth: 2, bevelEnabled: false }), hillMat);
    hills.position.set(0, -0.2, -15);
    this.group.add(hills);
    const shore = new THREE.Mesh(new THREE.BoxGeometry(width * 2, 0.5, 3), new THREE.MeshStandardMaterial({ color: '#c9c1ad', roughness: 1 }));
    shore.position.set(0, 0.05, -12.5);
    this.group.add(shore);
    const houseColors = ['#e9dcc3', '#d98f6f', '#f1ece0', '#c7d3d8', '#e3b871', '#b55a45'];
    const houseGeo = new THREE.BoxGeometry(0.5, 0.45, 0.45);
    const roofGeo = new THREE.ConeGeometry(0.4, 0.28, 4);
    roofGeo.rotateY(Math.PI / 4);
    for (let i = 0; i < 26; i++) {
      const x = -width * 0.55 + rng.next() * width * 1.1;
      const z = -12.2 - rng.next() * 1.4;
      const s = rng.range(0.7, 1.3);
      const col = rng.pick(houseColors);
      const h = new THREE.Mesh(houseGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }));
      h.scale.set(s, s * rng.range(0.9, 1.6), s);
      h.position.set(x, 0.3 + (0.45 * h.scale.y) / 2, z);
      this.group.add(h);
      const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: shade('#9b4a3a', rng.range(-0.15, 0.15)), roughness: 0.9 }));
      roof.scale.set(s, s, s);
      roof.position.set(x, 0.3 + 0.45 * h.scale.y + 0.13 * s, z);
      this.group.add(roof);
    }
  }
}

/** The bunker barge that lies off the ship's far side, with a fat black hose to the manifold. */
export class Barge {
  readonly group = new THREE.Group();
  readonly hoseStart = new THREE.Vector3();

  constructor() {
    const hullMat = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.7 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 1.1), hullMat);
    hull.position.y = 0.12;
    hull.castShadow = true;
    this.group.add(hull);
    const red = new THREE.Mesh(new THREE.BoxGeometry(3.21, 0.12, 1.11), new THREE.MeshStandardMaterial({ color: PAL.antifouling }));
    red.position.y = -0.1;
    this.group.add(red);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.04, 1.0), new THREE.MeshStandardMaterial({ color: '#8a3b2c', roughness: 0.8 }));
    deck.position.y = 0.41;
    this.group.add(deck);
    const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.7), new THREE.MeshStandardMaterial({ color: PAL.superstructure }));
    wheel.position.set(-1.2, 0.7, 0);
    wheel.castShadow = true;
    this.group.add(wheel);
    // tank domes
    const tankMat = new THREE.MeshStandardMaterial({ color: '#d7d2c6', roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14), tankMat);
      t.position.set(-0.4 + i * 0.6, 0.48, 0);
      this.group.add(t);
    }
    // Bravo flag on a short mast: "taking in or discharging dangerous goods" — flown while bunkering
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), new THREE.MeshStandardMaterial({ color: '#d7d2c6' }));
    mast.position.set(-1.2, 1.3, 0);
    this.group.add(mast);
    this.hoseStart.set(0.9, 0.55, 0.3);
  }
}
