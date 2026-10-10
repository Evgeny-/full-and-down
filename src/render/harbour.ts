import * as THREE from 'three';
import { canvas, toTexture, grime } from './paint';
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
