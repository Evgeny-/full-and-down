import * as THREE from 'three';
import { addHarbourLights, createRenderer, LOW_END, type HarbourLights } from './stage';
import { Tweens, arc, ease, squash } from './anim';
import { Water } from './water';
import { ShipModel, LIGHT_Y, MARK_Y, BOX_H, BOX_W, SLOT } from './ship';
import { Quay, Backdrop, QUAY_Y } from './harbour';
import { AdaptiveRenderScale } from './AdaptiveRenderScale';
import { FxView } from './FxView';
import { makeBox } from './boxes';
import { portColor } from './portStyle';
import { canvas, toTexture, FONT_NUM, FONT_TEXT } from './paint';
import { drawFlag, type FlagId } from './flags';
import { ClothFlag, dressLine } from './flagMeshes';
import { PAL } from './palette';
import { audio } from '../audio/audio';
import type { BoxId, Level } from '../core/types';

/** Camera elevation (radians): broadside, low enough that the box faces get the pixels. */
const PITCH = (27 * Math.PI) / 180;

export interface Insets {
  top: number;
  bottom: number;
}

/** Screen anchors the DOM layer needs (CSS px). */
export interface Anchors {
  /** the waterline amidships */
  waterY: number;
  /** top of the deck stacks' highest tier */
  stackTopY: number;
  /** under the hull (bottom of the visible ship) */
  hullBottomY: number;
  /** the quay row: centre y of the boxes' faces, and the bottom of the faces */
  quayY: number;
  quayBottomY: number;
  /** left/right screen x of the ship's cargo block */
  cargoLeft: number;
  cargoRight: number;
  unitPx: number;
}

export type Pick = { kind: 'box'; box: BoxId } | { kind: 'bay'; bay: number } | null;

type BoxPlace = { at: 'ship'; bay: number; tier: number } | { at: 'quay'; slot: number } | { at: 'gone' };

class Spring {
  x = 0;
  v = 0;
  target = 0;
  constructor(public k = 38, public c = 4.2) {}
  step(dt: number): void {
    const a = -this.k * (this.x - this.target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
}

/**
 * Owns the three.js renderer and everything visual in a level: the harbour, the ship, the boxes,
 * the crane. The plan model is the truth; the view animates toward it.
 */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  readonly tweens = new Tweens();
  readonly water = new Water();
  readonly fx = new FxView();
  ship!: ShipModel;
  level!: Level;
  insets: Insets = { top: 200, bottom: 230 };
  /** where the waterline sits within the free area (0 top … 1 bottom) */
  waterFrac = 0.62;
  clock = 0;
  unitPx = 40;
  private lights: HarbourLights;
  private width = 1;
  private height = 1;
  private levelGroup = new THREE.Group();
  /** the quay and the far shore: they slide away while the ship sails */
  private world = new THREE.Group();
  private quay!: Quay;
  private backdrop!: Backdrop;
  private sign!: THREE.Mesh;
  private draft = new Spring();
  private roll = new Spring(16, 1.6);
  private renderScale: AdaptiveRenderScale;
  private boxes = new Map<BoxId, THREE.Mesh>();
  private places = new Map<BoxId, BoxPlace>();
  private bayHits: THREE.Mesh[] = [];
  private ghosts: THREE.Mesh[] = [];
  private held: BoxId | null = null;
  private quayZ = 2.6;
  private quaySpacing = 1.3;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private look = new THREE.Vector3();
  private crane = { busy: 0, target: null as THREE.Vector3 | null };
  private scroll = 0;
  private speed = 0;
  private smokeT = 0;
  private night = false;
  private barge: THREE.Group | null = null;
  private bunkering = 0;
  private buoys: THREE.Group[] = [];
  private cloth: ClothFlag[] = [];
  private bluePeter: ClothFlag | null = null;
  private peterUp = false;
  private dress: THREE.Group | null = null;

  constructor(container: HTMLElement) {
    this.renderer = createRenderer(container);
    this.renderer.domElement.classList.add('gl');
    this.renderScale = new AdaptiveRenderScale(this.renderer.getPixelRatio());
    this.lights = addHarbourLights(this.renderer, this.scene);
    this.scene.background = new THREE.Color(PAL.skyTop);
    this.scene.add(this.water.mesh, this.levelGroup, this.fx.group);
    this.levelGroup.add(this.world);
  }

  // ───────────────────────────── building ─────────────────────────────

  load(level: Level): void {
    this.level = level;
    this.levelGroup.clear();
    this.world = new THREE.Group();
    this.levelGroup.add(this.world);
    this.boxes.clear();
    this.places.clear();
    this.tweens.clear();
    this.held = null;
    this.ship = new ShipModel(level.ship.bays, level.ship.tiers, level.ship.name.toUpperCase(), level.mechanics.includes('reefer') ? (level.ship.plugs ?? []) : []);
    this.levelGroup.add(this.ship.group);
    const width = Math.max(40, this.ship.length * 4);
    this.quayWidth = width;
    this.quay = new Quay(width);
    this.world.add(this.quay.group);
    this.backdrop = new Backdrop(width);
    this.world.add(this.backdrop.group);
    this.sign = this.makeSign();
    this.world.add(this.sign);
    this.buildBarge();
    this.buildBuoys();
    // Blue Peter waits at the foot of the yard halyard
    this.cloth = [];
    this.dress = null;
    this.peterUp = false;
    this.bluePeter = new ClothFlag('P', 0.34, 0.24);
    this.bluePeter.mesh.position.copy(this.ship.yard).setY(this.ship.deckY + 1.2);
    this.bluePeter.mesh.visible = false;
    this.ship.body.add(this.bluePeter.mesh);
    this.cloth.push(this.bluePeter);
    // bay hit volumes (invisible, taller than the stacks, for thumbs)
    this.bayHits = [];
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    for (let i = 0; i < level.ship.bays; i++) {
      const h = level.ship.tiers * BOX_H + 1.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(SLOT, h, 2.2), hitMat);
      m.position.set(this.ship.bayX(i), this.ship.deckY + h / 2 - 0.4, 0);
      m.userData.bay = i;
      this.ship.body.add(m);
      this.bayHits.push(m);
    }
    for (const b of level.boxes) {
      const mesh = makeBox({ color: portColor(b.to), weight: b.weight, flag: level.ports[b.to].flag as FlagId, kind: b.reefer && level.mechanics.includes('reefer') ? 'reefer' : undefined, seal: b.contract });
      mesh.userData.box = b.id;
      mesh.visible = false;
      this.world.add(mesh);
      this.boxes.set(b.id, mesh);
      this.places.set(b.id, { at: 'gone' });
    }
    this.draft.x = this.draft.target = LIGHT_Y;
    this.water.uniforms.uSpeed.value = 0;
    this.scroll = 0;
    this.speed = 0;
    this.world.position.x = 0;
    this.layout();
  }

  private makeSign(): THREE.Mesh {
    const [c] = canvas(512, 128);
    const tex = toTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    m.castShadow = true;
    return m;
  }

  /** Paint the enamel port sign on the quay. */
  setPortSign(port: number): void {
    const p = this.level.ports[port];
    const mat = this.sign.material as THREE.MeshStandardMaterial;
    const tex = mat.map as THREE.CanvasTexture;
    const c = tex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = PAL.hullNavy;
    g.beginPath();
    g.roundRect(4, 4, 504, 120, 14);
    g.fill();
    g.strokeStyle = '#f8f7f2';
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(12, 12, 488, 104, 9);
    g.stroke();
    drawFlag(g, p.flag as FlagId, 30, 34, 78, 56);
    g.fillStyle = '#f8f7f2';
    g.font = `700 64px ${FONT_NUM}`;
    g.textBaseline = 'middle';
    g.fillText(p.name.toUpperCase(), 126, 66);
    g.fillStyle = 'rgba(248,247,242,0.6)';
    g.font = `700 26px ${FONT_TEXT}`;
    g.textAlign = 'right';
    g.fillText(p.code, 488, 100);
    g.textAlign = 'left';
    tex.needsUpdate = true;
  }

  private buildBarge(): void {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.7 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.9), dark);
    hull.position.y = 0.1;
    g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 0.82), new THREE.MeshStandardMaterial({ color: '#8a3b2c' }));
    deck.position.y = 0.33;
    g.add(deck);
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 0.6), new THREE.MeshStandardMaterial({ color: PAL.superstructure }));
    house.position.set(-0.75, 0.55, 0);
    g.add(house);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshStandardMaterial({ color: PAL.flagRed, side: THREE.DoubleSide }));
    flag.position.set(-0.6, 1.08, 0);
    g.add(flag);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5), new THREE.MeshStandardMaterial({ color: '#d7d2c6' }));
    mast.position.set(-0.78, 1.0, 0);
    g.add(mast);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 12), new THREE.MeshStandardMaterial({ color: '#d7d2c6' }));
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0.35, 0.48, 0);
    g.add(tank);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    g.position.set(this.ship.sternX + 1.6, 0, -1.55);
    g.visible = false;
    this.levelGroup.add(g);
    this.barge = g;
  }

  /** Channel buoys that drift past while she sails (red cans to port, green cones to starboard). */
  private buildBuoys(): void {
    this.buoys = [];
    const mk = (color: string, cone: boolean) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.36, 12), mat);
      body.position.y = 0.12;
      g.add(body);
      const top = cone ? new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 12), mat) : new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 12), mat);
      top.position.y = cone ? 0.42 : 0.38;
      g.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 12), new THREE.MeshStandardMaterial({ color: '#f8f7f2' }));
      band.position.y = 0.02;
      g.add(band);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      g.visible = false;
      this.levelGroup.add(g);
      return g;
    };
    for (let i = 0; i < 6; i++) {
      const far = i % 2 === 0;
      const b = mk(far ? '#d62f2b' : '#2f8a5a', !far);
      b.userData.z = far ? -2.6 : 2.4;
      b.userData.offset = i * 6.5;
      this.buoys.push(b);
    }
  }

  /** Show the bunker barge and its hose (amount > 0) at this call. */
  setBunker(amount: number, pulse = false): void {
    if (!this.barge) return;
    const on = amount > 0;
    if (on && !this.barge.visible) {
      this.barge.visible = true;
      this.barge.position.x = this.ship.sternX - 3;
      this.tweens.add(0.6, (k) => (this.barge!.position.x = this.ship.sternX - 3 + k * 4.6), { ease: ease.outCubic, tag: this.barge });
    } else if (!on && this.barge.visible) {
      this.barge.visible = false;
    }
    if (pulse && on) {
      this.bunkering = 0.5;
      audio.play('glug');
    }
  }

  // ───────────────────────────── layout ─────────────────────────────

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.layout();
  }

  /** Ship across the width, waterline in the free area, the quay row below with room for the bar. */
  layout(): Anchors | null {
    if (!this.ship) return null;
    const w = this.width;
    const h = this.height;
    const portrait = h > w * 1.15;
    const freeH = Math.max(200, h - this.insets.top - this.insets.bottom);
    // portrait: let the bow and stern run a little off the edges so the boxes get the pixels
    // the ship fills a phone-width column; wider screens see more harbour around it
    const col = Math.min(w, 640);
    const span = portrait ? Math.max(8.4, this.ship.length - 0.5) : this.ship.length + 1.2;
    let unit = col / span;
    // keep her (and the quay below) inside the free height
    unit = Math.min(unit, freeH / 5.2 + 8);
    this.unitPx = unit;
    const viewW = w / unit;
    const viewH = h / this.unitPx;
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    const s = Math.sin(PITCH);
    const c = Math.cos(PITCH);
    const up = new THREE.Vector3(0, c, -s);
    const dir = new THREE.Vector3(0, -s, -c);
    const sideZ = 0.78;
    // work up from the bottom: the quay row's faces end `insets.bottom` above the screen bottom,
    // the deadweight bar sits between the quay row and the waterline
    const u = this.unitPx;
    const faceH = BOX_H * c * u;
    const topFace = BOX_W * s * u;
    const barPx = 70;
    let waterPx = h - this.insets.bottom - faceH - topFace - barPx;
    // never let the ship's mast run under the top block
    const shipAbove = (this.ship.deckY + this.level.ship.tiers * BOX_H + 0.9) * c * u;
    waterPx = Math.max(waterPx, this.insets.top + shipAbove * 0.8);
    const waterPoint = new THREE.Vector3(0, 0, sideZ);
    this.look.copy(waterPoint).addScaledVector(up, (waterPx - h / 2) / u);
    this.camera.position.copy(this.look).addScaledVector(dir, -40);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    this.camera.updateProjectionMatrix();
    // the quay row: its box tops sit `gap` px under the waterline
    const gap = barPx + topFace;
    const boxTopY = QUAY_Y + BOX_H;
    const zFront = (gap / u + sideZ * s + boxTopY * c) / s;
    this.quayZ = zFront - BOX_W / 2;
    const quayEdge = sideZ + (QUAY_Y * c) / s + 0.28;
    this.quay.group.position.z = quayEdge - 1.6; // Quay is built with its edge at z = 1.6
    this.water.uniforms.uQuayZ.value = quayEdge;
    this.quaySpacing = Math.min(1.4, (viewW - 0.8) / 5);
    this.sign.visible = !portrait;
    this.sign.position.set(-viewW / 2 + 1.45, QUAY_Y + 0.05, this.quayZ + 1.35);
    this.sign.rotation.x = -Math.PI / 2 + 0.25;
    const sun = this.lights.sun;
    sun.target.position.copy(this.look);
    sun.position.copy(this.look).add(new THREE.Vector3(-7, 16, 9));
    // re-place quay boxes at the new row
    for (const [id, p] of this.places) if (p.at === 'quay' && id !== this.held) this.boxes.get(id)!.position.copy(this.quayPos(p.slot));
    return this.anchors();
  }

  anchors(): Anchors {
    const s = this.toScreen(new THREE.Vector3(0, 0, 0.78)).y;
    const tiers = this.level.ship.tiers;
    const top = this.toScreen(new THREE.Vector3(0, this.ship.deckY + tiers * BOX_H - this.draft.target, 0)).y;
    const hullB = this.toScreen(new THREE.Vector3(0, -0.15, 0.78)).y;
    const q = this.toScreen(this.quayPos(0)).y;
    const qb = this.toScreen(new THREE.Vector3(0, QUAY_Y, this.quayZ + BOX_W / 2)).y;
    const cargoLen = this.level.ship.bays * SLOT;
    const l = this.toScreen(new THREE.Vector3(-cargoLen / 2, 0, 0.78)).x;
    const r = this.toScreen(new THREE.Vector3(cargoLen / 2, 0, 0.78)).x;
    return { waterY: s, stackTopY: top, hullBottomY: hullB, quayY: q, quayBottomY: qb, cargoLeft: l, cargoRight: r, unitPx: this.unitPx };
  }

  quayPos(slot: number, out = new THREE.Vector3()): THREE.Vector3 {
    const n = Math.max(1, this.quaySlots);
    const x = (slot - (n - 1) / 2) * this.quaySpacing;
    return out.set(x, QUAY_Y + BOX_H / 2 + 0.01, this.quayZ);
  }

  private quaySlots = 1;
  private quayWidth = 40;

  toScreen(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const v = this.tmp.copy(p).project(this.camera);
    return out.set(((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height);
  }

  /** Screen position of a box (its face centre). */
  boxScreen(id: BoxId): THREE.Vector2 | null {
    const m = this.boxes.get(id);
    if (!m || !m.visible) return null;
    const wp = m.getWorldPosition(new THREE.Vector3());
    wp.z += BOX_W / 2;
    return this.toScreen(wp);
  }

  /** Screen point in the middle of bay `i`'s stack (for tests). */
  bayScreen(i: number): THREE.Vector2 {
    return this.toScreen(this.ship.body.localToWorld(new THREE.Vector3(this.ship.bayX(i), this.ship.deckY + BOX_H, 0.3)));
  }

  // ───────────────────────────── state → scene ─────────────────────────────

  /**
   * Place every box for the call at `port`. `mode`: 'instant' snaps, 'tab' re-dresses quickly,
   * 'edit' animates only what changed with the crane.
   */
  sync(
    port: number,
    bays: BoxId[][],
    quay: BoxId[],
    mode: 'instant' | 'tab' | 'edit',
  ): void {
    const lv = this.level;
    const offers = lv.boxes.filter((b) => b.from === port).map((b) => b.id);
    this.quaySlots = offers.length;
    const want = new Map<BoxId, BoxPlace>();
    for (const b of lv.boxes) want.set(b.id, { at: 'gone' });
    bays.forEach((bay, i) => bay.forEach((id, t) => want.set(id, { at: 'ship', bay: i, tier: t })));
    for (const id of quay) want.set(id, { at: 'quay', slot: offers.indexOf(id) });
    if (mode !== 'edit') this.setPortSign(port);
    let craneDelay = 0;
    for (const [id, next] of want) {
      const prev = this.places.get(id)!;
      const mesh = this.boxes.get(id)!;
      const same = JSON.stringify(prev) === JSON.stringify(next);
      this.places.set(id, next);
      if (same && mode !== 'instant') continue;
      this.tweens.cancel(mesh);
      if (mode === 'instant' || (mode === 'tab' && (prev.at === 'gone' || next.at === 'gone'))) {
        this.snap(mesh, next);
        if (mode === 'tab' && next.at !== 'gone') this.popIn(mesh);
        continue;
      }
      if (mode === 'tab') {
        this.snap(mesh, next);
        continue;
      }
      // edit: crane lifts between quay and ship (or between stacks)
      this.lift(mesh, next, craneDelay);
      craneDelay += 0.12;
    }
  }

  private snap(mesh: THREE.Mesh, place: BoxPlace): void {
    mesh.scale.set(1, 1, 1);
    if (place.at === 'gone') {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    if (place.at === 'ship') {
      this.ship.cargo.attach(mesh);
      this.ship.slotPos(place.bay, place.tier, mesh.position);
      mesh.quaternion.identity();
    } else {
      this.world.attach(mesh);
      this.quayPos(place.slot, mesh.position);
      mesh.quaternion.identity();
    }
  }

  private popIn(mesh: THREE.Mesh): void {
    mesh.scale.setScalar(0.01);
    this.tweens.add(0.28, (k) => mesh.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack, tag: mesh });
  }

  /** The crane swings a box to its new place: up, across, down, a twist-lock clunk. */
  private lift(mesh: THREE.Mesh, place: BoxPlace, delay = 0, dur = 0.62): void {
    if (place.at === 'gone') {
      this.tweens.add(0.2, (k) => mesh.scale.setScalar(1 - k), { delay, tag: mesh, done: () => (mesh.visible = false) });
      return;
    }
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    const from = mesh.getWorldPosition(new THREE.Vector3());
    this.scene.attach(mesh);
    mesh.position.copy(from);
    const toLocal = new THREE.Vector3();
    const toWorld = () => {
      if (place.at === 'ship') return this.ship.cargo.localToWorld(this.ship.slotPos(place.bay, place.tier, toLocal.clone()));
      return this.world.localToWorld(this.quayPos(place.slot, toLocal.clone()));
    };
    const clear = this.ship.deckY + this.level.ship.tiers * BOX_H + 0.55 - this.draft.x;
    const p = new THREE.Vector3();
    this.crane.busy++;
    audio.play('pick');
    this.tweens.add(
      dur,
      (k) => {
        const to = toWorld();
        const h = Math.max(0.4, clear - Math.min(from.y, to.y));
        arc(from, to, h, k, p);
        mesh.position.copy(p);
        mesh.rotation.z = Math.sin(k * Math.PI) * 0.05;
        this.crane.target = p;
      },
      {
        delay,
        ease: ease.inOutCubic,
        tag: mesh,
        start: () => audio.play('crane', { pitch: Math.random() }),
        done: () => {
          this.crane.busy--;
          if (!this.crane.busy) this.crane.target = null;
          mesh.rotation.z = 0;
          if (place.at === 'ship') this.ship.cargo.attach(mesh);
          else this.world.attach(mesh);
          this.snap(mesh, place);
          const w = this.level.boxes[mesh.userData.box as BoxId].weight;
          audio.play('drop', { pitch: Math.min(4, w - 1) });
          this.clunk(mesh);
          const wp = mesh.getWorldPosition(new THREE.Vector3());
          this.fx.puff(wp.clone().add(new THREE.Vector3(0, -BOX_H / 2, BOX_W / 2)), { n: 5, color: '#e9e4da', size: 0.14, speed: 0.6, rise: 0.15, life: 0.5 });
          if (place.at === 'ship') this.roll.v += (Math.random() - 0.5) * 0.03;
        },
      },
    );
  }

  private clunk(mesh: THREE.Mesh): void {
    this.tweens.add(
      0.32,
      (k) => {
        const s = squash(k, 0.1);
        mesh.scale.set(s.xz, s.y, s.xz);
      },
      { ease: ease.linear, tag: mesh },
    );
  }

  /** A held box hangs on the crane hook above its quay slot; legal stacks show a ghost. */
  setHeld(box: BoxId | null, legal: number[] = [], bays: BoxId[][] = []): void {
    for (const g of this.ghosts) g.removeFromParent();
    this.ghosts = [];
    if (this.held !== null && this.held !== box) {
      const prev = this.boxes.get(this.held)!;
      const place = this.places.get(this.held)!;
      this.tweens.cancel(prev);
      if (place.at === 'quay') {
        const to = this.quayPos(place.slot);
        const from = prev.position.clone();
        this.tweens.add(0.2, (k) => prev.position.lerpVectors(from, to, k), { tag: prev, ease: ease.outQuad });
      }
    }
    this.held = box;
    if (box === null) {
      this.crane.target = null;
      return;
    }
    const mesh = this.boxes.get(box)!;
    const place = this.places.get(box)!;
    if (place.at === 'quay') {
      const base = this.quayPos(place.slot);
      this.tweens.cancel(mesh);
      const from = mesh.position.clone();
      const to = base.clone().add(new THREE.Vector3(0, 0.55, 0));
      this.tweens.add(0.22, (k) => mesh.position.lerpVectors(from, to, k), { tag: mesh, ease: ease.outBack });
    }
    // ghosts on legal stacks
    const b = this.level.boxes[box];
    for (const bay of legal) {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(0.94, BOX_H, BOX_W),
        new THREE.MeshBasicMaterial({ color: portColor(b.to), transparent: true, opacity: 0.38, depthWrite: false }),
      );
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g.geometry), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
      g.add(edges);
      this.ship.slotPos(bay, bays[bay]?.length ?? 0, g.position);
      g.userData.ghost = true;
      this.ship.cargo.add(g);
      this.ghosts.push(g);
    }
  }

  /** A refused drop: the held box shakes "no". */
  wiggle(box: BoxId): void {
    const mesh = this.boxes.get(box);
    if (!mesh) return;
    const x0 = mesh.position.x;
    this.tweens.add(0.36, (k) => (mesh.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.08 * (1 - k)), { ease: ease.linear });
  }

  /** Departure weight as a share of deadweight: the hull settles on a spring. */
  setLoad(fraction: number, kick = true): void {
    const t = LIGHT_Y + (MARK_Y - LIGHT_Y) * fraction;
    if (Math.abs(t - this.draft.target) < 1e-6) return;
    this.draft.target = t;
    if (kick) this.draft.v += t > this.draft.x ? -0.12 : 0.12;
  }

  onMarkGlint(): void {
    const p = this.ship.body.localToWorld(new THREE.Vector3(0.6, MARK_Y, 0.8));
    this.fx.sparkle(p, 14, '#fff3b0', 1.4);
  }

  // ───────────────────────────── input ─────────────────────────────

  pick(clientX: number, clientY: number): Pick {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const boxMeshes = [...this.boxes.entries()].filter(([id, m]) => m.visible && this.places.get(id)?.at !== 'gone').map(([, m]) => m);
    const hits = this.raycaster.intersectObjects(boxMeshes, false);
    if (hits.length) {
      const id = hits[0].object.userData.box as BoxId;
      const place = this.places.get(id);
      if (place?.at === 'quay') return { kind: 'box', box: id };
      if (place?.at === 'ship') {
        // a box aboard: the game decides whether it can be landed
        return { kind: 'box', box: id };
      }
    }
    const bh = this.raycaster.intersectObjects(this.bayHits, false);
    if (bh.length) return { kind: 'bay', bay: bh[0].object.userData.bay as number };
    // forgiving: a tap near a quay box picks it
    let best: BoxId | null = null;
    let bestD = 34;
    for (const [id, p] of this.places) {
      if (p.at !== 'quay') continue;
      const s = this.boxScreen(id);
      if (!s) continue;
      const d = Math.hypot(s.x - (clientX - r.left), s.y - (clientY - r.top));
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best !== null) return { kind: 'box', box: best };
    return null;
  }

  /** The bay under a screen x (for drag-and-drop across the ship). */
  bayAtX(clientX: number): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.level.ship.bays; i++) {
      const s = this.toScreen(this.ship.body.localToWorld(new THREE.Vector3(this.ship.bayX(i), this.ship.deckY, 0)));
      const d = Math.abs(s.x - (clientX - r.left));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD < this.unitPx * 0.75 ? best : null;
  }

  /** Move a held box with the finger (drag). */
  dragHeld(clientX: number, clientY: number): void {
    if (this.held === null) return;
    const mesh = this.boxes.get(this.held)!;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    // intersect a vertical plane through the ship's side
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(this.quayZ * 0.5));
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hit)) {
      this.tweens.cancel(mesh);
      mesh.position.lerp(hit, 0.6);
      mesh.position.y = Math.max(mesh.position.y, QUAY_Y + BOX_H);
      this.crane.target = mesh.position;
    }
  }

  // ───────────────────────────── the voyage ─────────────────────────────

  /** Slide the harbour away (departure) or in (arrival). Resolves when done. */
  steam(phase: 'out' | 'in' | 'cruise', dur: number): Promise<void> {
    return new Promise((resolve) => {
      const w = this.width / this.unitPx;
      if (phase === 'out') {
        audio.play('horn');
        this.fx.puff(this.ship.body.localToWorld(this.ship.funnelTop.clone()), { n: 8, color: '#ffffff', size: 0.25, rise: 0.8, speed: 0.3, life: 1.2 });
        this.tweens.add(dur, (k) => {
          this.world.position.x = -k * k * (w + 12);
          this.speed = k;
        }, { ease: ease.linear, done: () => resolve() });
      } else if (phase === 'in') {
        this.world.position.x = w + 12;
        this.tweens.add(dur, (k) => {
          const e = ease.outCubic(k);
          this.world.position.x = (1 - e) * (w + 12);
          this.speed = 1 - e;
        }, { ease: ease.linear, done: () => {
          this.speed = 0;
          resolve();
        } });
      } else {
        this.world.position.x = -(w + 12);
        this.speed = 1;
        this.tweens.after(dur, () => resolve());
      }
    });
  }

  /** Lift a set of boxes off to the quay (discharge), one after another. */
  discharge(ids: BoxId[], onEach: (id: BoxId, at: THREE.Vector2) => void, gap = 0.32): number {
    ids.forEach((id, k) => {
      const mesh = this.boxes.get(id)!;
      // off the plan at once: a box on its way ashore can't be tapped
      this.places.set(id, { at: 'gone' });
      this.tweens.after(k * gap, () => {
        const from = mesh.getWorldPosition(new THREE.Vector3());
        this.scene.attach(mesh);
        mesh.position.copy(from);
        const to = new THREE.Vector3(-2.6 + (k % 5) * 1.05, QUAY_Y + BOX_H / 2 + Math.floor(k / 5) * BOX_H, this.quayZ + 1.9);
        const p = new THREE.Vector3();
        this.crane.busy++;
        audio.play('pick');
        this.tweens.add(0.55, (kk) => {
          arc(from, to, 1.0, kk, p);
          mesh.position.copy(p);
          this.crane.target = p;
        }, {
          ease: ease.inOutCubic,
          done: () => {
            this.crane.busy--;
            if (!this.crane.busy) this.crane.target = null;
            this.world.attach(mesh);
            audio.play('drop', { pitch: 2 });
            onEach(id, this.toScreen(mesh.getWorldPosition(new THREE.Vector3())));
            this.places.set(id, { at: 'gone' });
            // a yard truck takes it away: shrink after a beat
            this.tweens.add(0.3, (q) => mesh.scale.setScalar(Math.max(0.01, 1 - q)), { delay: 1.0, tag: mesh, done: () => (mesh.visible = false) });
          },
        });
      });
    });
    return ids.length * gap + 0.6;
  }

  /** Blue Peter: "about to proceed to sea", hoisted when the plan is clear to sail. */
  setBluePeter(on: boolean): void {
    const f = this.bluePeter;
    if (!f || on === this.peterUp) return;
    this.peterUp = on;
    const lowY = this.ship.deckY + 1.0;
    const highY = this.ship.yard.y - 0.14;
    f.mesh.visible = true;
    const from = f.mesh.position.y;
    this.tweens.cancel(f);
    this.tweens.add(on ? 0.7 : 0.35, (k) => (f.mesh.position.y = from + ((on ? highY : lowY) - from) * k), {
      ease: on ? ease.outBack : ease.inQuad,
      tag: f,
      done: () => (f.mesh.visible = on),
    });
  }

  /** Dress overall and fire flag confetti (three-star arrival). */
  celebrate(): void {
    const p = this.ship.body.localToWorld(new THREE.Vector3(0, this.ship.deckY + 2.5, 0.5));
    this.fx.confetti(p, 90, this.ship.length * 0.6);
    this.onMarkGlint();
    if (!this.dress) {
      const sh = this.ship;
      const { group, flags } = dressLine([
        new THREE.Vector3(sh.bowX - 0.15, sh.hull.deckAt(sh.bowX - 0.2) + 0.25, 0),
        sh.foremastTop.clone(),
        sh.yard.clone().setY(sh.yard.y + 0.15).setZ(0),
        new THREE.Vector3(sh.sternX + 0.15, sh.deckY + 0.6, 0),
      ], 22);
      this.ship.body.add(group);
      this.dress = group;
      flags.forEach((f, i) => {
        this.cloth.push(f);
        this.tweens.add(0.25, (k) => f.mesh.scale.setScalar(Math.max(0.001, k)), { delay: 0.3 + i * 0.05, ease: ease.outBack, start: () => i % 4 === 0 && audio.play('flag', { volume: 0.4 }) });
      });
    }
  }

  setNight(on: boolean): void {
    this.night = on;
    this.water.uniforms.uNight.value = on ? 0.6 : 0;
    this.scene.background = new THREE.Color(on ? '#16233a' : PAL.skyTop);
    // a navy harbour under sodium lamps, never a black slab
    this.renderer.toneMappingExposure = on ? 0.72 : 1.0;
    this.lights.sun.color.set(on ? '#ffcf8a' : '#fff6e6');
    this.lights.sun.intensity = on ? 1.3 : 2.5;
    this.lights.hemi.color.set(on ? '#6f8fc8' : '#ddf1ff');
    this.lights.hemi.groundColor.set(on ? '#1d2a44' : '#6e8c99');
    this.lights.hemi.intensity = on ? 0.9 : 1.05;
    this.scene.environmentIntensity = on ? 0.14 : 0.32;
  }

  // ───────────────────────────── frame ─────────────────────────────

  update(dt: number): void {
    this.clock += dt;
    this.tweens.update(dt);
    this.draft.step(dt);
    this.roll.step(dt);
    const t = this.clock;
    if (this.ship) {
      const bob = Math.sin(t * 1.1) * 0.01 + Math.sin(t * 0.63) * 0.007;
      this.ship.group.position.y = -this.draft.x + bob;
      this.ship.body.rotation.x = this.roll.x + Math.sin(t * 0.8) * (0.005 + this.speed * 0.01);
      this.ship.body.rotation.z = Math.sin(t * 0.55) * (0.003 + this.speed * 0.008);
      this.ship.setWater(0, t);
      const midX = (this.ship.bowX + this.ship.sternX) / 2;
      this.water.uniforms.uHull.value.set(midX, 0, this.ship.length / 2 + 0.05, 0.84);
      this.water.uniforms.uSpeed.value = this.speed;
      this.scroll += dt * this.speed * 4.5;
      this.water.uniforms.uScroll.value = this.scroll;
      const qw = this.quayWidth / 2;
      this.water.uniforms.uQuayX.value.set(this.world.position.x - qw, this.world.position.x + qw);
      const sea = Math.min(1, Math.abs(this.world.position.x) / (qw * 0.9));
      this.water.uniforms.uSea.value = sea;
      const span = 39;
      for (const b of this.buoys) {
        b.visible = sea > 0.25;
        if (!b.visible) continue;
        const x = (((b.userData.offset - this.scroll * 1.0) % span) + span) % span - span / 2;
        b.position.set(x, Math.sin(t * 1.7 + b.userData.offset) * 0.03 - 0.05, b.userData.z);
        b.rotation.z = Math.sin(t * 1.3 + b.userData.offset) * 0.08;
      }
      const radar = this.ship.body.getObjectByName('radar');
      if (radar) radar.rotation.y = t * 1.8;
      // the crane follows the box in the air, else parks
      // the nearer crane works the box in the air; the other parks
      const tgt = this.crane.target ? this.ship.body.worldToLocal(this.crane.target.clone()) : null;
      const which = tgt ? (tgt.x > 0 ? 1 : 0) : -1;
      this.ship.cranes.forEach((c, i) => {
        if (i === which && tgt) c.follow(tgt, BOX_H / 2 + 0.12);
        else c.park();
        c.update(dt, false);
      });
      // funnel smoke: a wisp at the berth, a stream at sea
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.speed > 0.1 ? 0.12 : 0.9;
        this.fx.smoke(this.ship.body.localToWorld(this.ship.funnelTop.clone()), this.speed > 0.1 ? 0.15 : 0);
      }
      if (this.speed > 0.2 && Math.random() < dt * 14) {
        // bow wave spray
        this.fx.puff(this.ship.body.localToWorld(new THREE.Vector3(this.ship.bowX - 0.3, 0.05, 0.75)), { n: 1, color: '#ffffff', size: 0.16, speed: 0.6, rise: 0.4, life: 0.6, alpha: 0.8 });
      }
      if (this.bunkering > 0) this.bunkering -= dt;
      for (const f of this.cloth) if (f.mesh.visible) f.update(t, 0.6 + this.speed * 0.8);
    }
    this.water.uniforms.uTime.value = t;
    this.fx.update(dt, this.camera);
    if (!this.night && LOW_END) void 0;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  sampleFrame(ms: number, now: number): void {
    const dpr = this.renderScale.sample(ms, now);
    if (dpr) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(this.width, this.height, false);
    }
  }

  /** Finish every running animation at once (tap to skip). */
  flush(): void {
    this.tweens.flush();
  }

  get busy(): boolean {
    return this.tweens.busy;
  }
}
