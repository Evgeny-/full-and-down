import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Phones/tablets get a lighter render path (pixel ratio, shadow map size). */
export const LOW_END =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4);

/** The renderer settings every scene in the game uses. */
export function createRenderer(container: HTMLElement, opts: { alpha?: boolean } = {}): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: !!opts.alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_END ? 1.6 : 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(r.domElement);
  return r;
}

export interface HarbourLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

/**
 * A crisp harbour morning: cool sky fill, a sun from the upper left and slightly behind the camera
 * (hull faces stay lit, shadows fall away from the viewer), a faint room environment for paint sheen.
 */
export function addHarbourLights(renderer: THREE.WebGLRenderer, scene: THREE.Scene): HarbourLights {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();
  const hemi = new THREE.HemisphereLight('#ddf1ff', '#6e8c99', 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6e6', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW_END ? 1024 : 2048, LOW_END ? 1024 : 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  sun.position.set(-7, 16, 9);
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  cam.left = -12;
  cam.right = 12;
  cam.top = 12;
  cam.bottom = -12;
  cam.near = 1;
  cam.far = 60;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

/** Camera elevation in play (radians above the horizon): broadside, looking down on the decks. */
export const PLAY_PITCH = (36 * Math.PI) / 180;
