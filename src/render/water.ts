import * as THREE from 'three';
import { PAL } from './palette';

const MAX_RIPPLES = 8;

/**
 * Harbour water: one plane, one shader. Depth bands from deep (far) to shallow (near the quay),
 * slow swell, broken wave strokes, a narrow hull fringe, and landing ripples.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(PAL.seaDeep) },
    uMid: { value: new THREE.Color(PAL.seaMid) },
    uShallow: { value: new THREE.Color(PAL.seaShallow) },
    uFoam: { value: new THREE.Color(PAL.foam) },
    uQuayZ: { value: 3.0 },
    uHull: { value: new THREE.Vector4(0, 0, 4, 0.8) }, // x, z, half-length, half-beam
    uHullOn: { value: 1 },
    uSpeed: { value: 0 },
    uNight: { value: 0 },
    uScroll: { value: 0 },
    uSea: { value: 0 },
    uQuayX: { value: new THREE.Vector2(-100, 100) },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
  };
  private rippleIdx = 0;

  constructor(size = 160) {
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uMid;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform float uQuayZ;
        uniform vec4 uHull;
        uniform float uHullOn;
        uniform float uSpeed;
        uniform float uNight;
        uniform float uScroll;
        uniform float uSea;
        uniform vec2 uQuayX;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        varying vec3 vPos;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }

        void main() {
          vec2 p = vPos.xz;
          vec2 q0 = p;
          p.x += uScroll;
          // depth: deep far away (negative z), shallow toward the quay (positive z)
          float d = mix(clamp((uQuayZ - p.y) / 9.0, 0.0, 1.0), 0.75 + 0.25 * clamp((10.0 - p.y) / 20.0, 0.0, 1.0), uSea);
          vec3 col = mix(uShallow, uMid, smoothstep(0.0, 0.35, d));
          col = mix(col, uDeep, smoothstep(0.35, 1.0, d));
          // Long, low swells keep the surface calm between the small wave strokes.
          float t = uTime;
          float swell = noise(p * vec2(0.32, 0.55) + vec2(t * 0.035, -t * 0.045));
          float flow = noise(p * vec2(1.3, 0.7) + vec2(t * 0.045, t * 0.02));
          col *= 0.97 + swell * 0.045;
          // Stretched, interrupted crests read as waves instead of bright round patches.
          float phase = p.y * 6.5 + p.x * 0.38 + flow * 3.0 - t * 0.45;
          float aa = max(fwidth(phase) * 0.65, 0.035);
          float crest = 1.0 - smoothstep(0.055, 0.055 + aa, abs(sin(phase)));
          float strokes = noise(p * vec2(2.6, 1.8) + vec2(t * 0.07, -t * 0.025));
          float broken = smoothstep(0.64, 0.82, strokes);
          col = mix(col, uFoam, crest * broken * 0.13);
          // A few crests catch the sun; their shape follows the same moving surface.
          float glint = crest * smoothstep(0.76, 0.91, strokes);
          col += vec3(1.0, 0.97, 0.9) * glint * 0.07 * (1.0 - uNight);
          // foam at the quay wall
          float q = smoothstep(0.35, 0.0, uQuayZ - q0.y + noise(vec2(q0.x * 2.0, t)) * 0.12) * step(uQuayX.x, q0.x) * step(q0.x, uQuayX.y);
          col = mix(col, uFoam, q * 0.75);
          // Measure the hull fringe in world units so the ends do not grow wide white pads.
          if (uHullOn > 0.5) {
            vec2 radius = vec2(uHull.z, uHull.w);
            vec2 local = q0 - uHull.xy;
            vec2 h = local / radius;
            float e = length(h);
            float hullDistance = e * (e - 1.0) / max(length(local / (radius * radius)), 0.001);
            float fringe = abs(hullDistance) - noise(p * vec2(3.5, 5.0) + t * 0.3) * 0.025;
            float edge = 1.0 - smoothstep(0.01, 0.045 + uSpeed * 0.06, fringe);
            col = mix(col, uFoam, edge * (0.24 + uSpeed * 0.38));
            // shadowed water close under the hull
            col *= mix(0.87, 1.0, smoothstep(-0.04, 0.24, hullDistance));
            // wake behind a moving ship
            if (uSpeed > 0.01) {
              float behind = (uHull.x - q0.x) / uHull.z;
              float spread = abs(q0.y - uHull.y) - (behind - 0.9) * 0.35 * uHull.w;
              float wake = smoothstep(0.25, 0.0, abs(spread)) * step(0.9, behind) * exp(-(behind - 0.9) * 0.45);
              col = mix(col, uFoam, wake * uSpeed * (0.5 + noise(p * 5.0 - vec2(t * 3.0, 0.0)) * 0.5));
            }
          }
          // ripples from landings and splashes
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = t - r.z;
            if (age < 0.0 || age > 1.6) continue;
            float rad = age * 1.4;
            float ring = 1.0 - smoothstep(0.0, 0.07, abs(length(q0 - r.xy) - rad));
            col = mix(col, uFoam, ring * r.w * (1.0 - age / 1.6) * 0.8);
          }
          col = mix(col, col * vec3(0.38, 0.45, 0.62), uNight);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -1;
  }

  ripple(x: number, z: number, strength = 1): void {
    const r = this.uniforms.uRipples.value[this.rippleIdx];
    r.set(x, z, this.uniforms.uTime.value, strength);
    this.rippleIdx = (this.rippleIdx + 1) % MAX_RIPPLES;
  }

  update(t: number): void {
    this.uniforms.uTime.value = t;
  }
}
