import * as THREE from 'three';
import { addHarbourLights, createRenderer, PLAY_PITCH, type HarbourLights } from './stage';
import { Tweens } from './anim';
import { Water } from './water';
import { ShipModel, LIGHT_Y, MARK_Y } from './ship';
import { Quay, Backdrop, Barge, QUAY_Z } from './harbour';
import { AdaptiveRenderScale } from './AdaptiveRenderScale';

export interface Insets {
  top: number;
  bottom: number;
}

/** A damped spring for the ship's draft: overshoots, bobs twice and settles. */
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
 * The harbour scene for one level: water, the ship at the berth, the quay, the far shore. Owns the
 * renderer and the camera; game code drives it through small methods and tweens.
 */
export class HarbourView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  readonly tweens = new Tweens();
  readonly water = new Water();
  ship!: ShipModel;
  quay!: Quay;
  backdrop!: Backdrop;
  barge!: Barge;
  insets: Insets = { top: 150, bottom: 120 };
  clock = 0;
  private lights: HarbourLights;
  private width = 1;
  private height = 1;
  private levelGroup = new THREE.Group();
  private draft = new Spring();
  private roll = new Spring(22, 2.2);
  private renderScale: AdaptiveRenderScale;
  /** world units per CSS pixel */
  unitPx = 40;

  constructor(container: HTMLElement) {
    this.renderer = createRenderer(container);
    this.renderer.domElement.classList.add('gl');
    this.renderScale = new AdaptiveRenderScale(this.renderer.getPixelRatio());
    this.lights = addHarbourLights(this.renderer, this.scene);
    this.scene.background = new THREE.Color('#bfe3f5');
    this.scene.add(this.water.mesh, this.levelGroup);
  }

  build(stacks: number, tiers: number): void {
    this.levelGroup.clear();
    this.ship = new ShipModel(stacks, tiers);
    this.levelGroup.add(this.ship.group);
    const width = Math.max(30, this.ship.length * 3);
    this.quay = new Quay(width);
    this.levelGroup.add(this.quay.group);
    this.backdrop = new Backdrop(width);
    this.levelGroup.add(this.backdrop.group);
    this.barge = new Barge();
    this.barge.group.position.set(this.ship.sternX + 2.6, 0, -1.75);
    this.levelGroup.add(this.barge.group);
    this.water.uniforms.uQuayZ.value = QUAY_Z;
    this.draft.x = this.draft.target = LIGHT_Y;
    this.layout();
  }

  /** 0 = light ship, 1 = down to the summer mark (may exceed 1: overloaded). */
  setLoad(fraction: number, kick = true): void {
    this.draft.target = LIGHT_Y + (MARK_Y - LIGHT_Y) * fraction;
    if (kick) this.draft.v -= 0.25;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.layout();
  }

  /** Fit the ship across the width; waterline at a fixed fraction of the free area. */
  layout(): void {
    if (!this.ship) return;
    const w = this.width;
    const h = this.height;
    const portrait = h > w * 1.1;
    const shipSpan = this.ship.length + (portrait ? 0.5 : 2.2);
    const freeH = h - this.insets.top - this.insets.bottom;
    // world units across the screen width
    let viewW = shipSpan;
    // in landscape keep enough vertical room for ship + quay (≈ 9 screen units)
    if (!portrait) viewW = Math.max(shipSpan, (9 * w) / freeH);
    this.unitPx = w / viewW;
    const viewH = h / this.unitPx;
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    const dir = new THREE.Vector3(0, -Math.sin(PLAY_PITCH), -Math.cos(PLAY_PITCH));
    // where the waterline amidships should sit on screen (px from top)
    const waterPx = this.insets.top + freeH * (portrait ? 0.44 : 0.46);
    const target = new THREE.Vector3(0, 0, 0);
    const up = new THREE.Vector3(0, Math.cos(PLAY_PITCH), -Math.sin(PLAY_PITCH));
    // shift the look-at point so that `target` lands at waterPx
    const offsetPx = waterPx - h / 2; // positive = below centre
    const look = target.clone().addScaledVector(up, offsetPx / this.unitPx);
    this.camera.position.copy(look).addScaledVector(dir, -40);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    this.camera.updateProjectionMatrix();
    const sun = this.lights.sun;
    sun.target.position.copy(look);
    sun.position.copy(look).add(new THREE.Vector3(-7, 16, 9));
  }

  /** Screen position (CSS px) of a world point. */
  toScreen(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const v = p.clone().project(this.camera);
    return out.set(((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height);
  }

  update(dt: number): void {
    this.clock += dt;
    this.tweens.update(dt);
    this.draft.step(dt);
    this.roll.step(dt);
    if (this.ship) {
      const t = this.clock;
      const bob = Math.sin(t * 1.1) * 0.012 + Math.sin(t * 0.63) * 0.008;
      this.ship.group.position.y = -this.draft.x + bob;
      this.ship.body.rotation.x = this.roll.x + Math.sin(t * 0.8) * 0.006;
      this.ship.body.rotation.z = Math.sin(t * 0.55) * 0.004;
      this.ship.setWater(0, t);
      this.water.uniforms.uHull.value.set(this.ship.group.position.x + (this.ship.bowX + this.ship.sternX) / 2, 0, this.ship.length / 2 + 0.05, 0.82);
      const radar = this.ship.body.getObjectByName('radar');
      if (radar) radar.rotation.y = t * 1.8;
    }
    this.water.update(this.clock);
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
}
