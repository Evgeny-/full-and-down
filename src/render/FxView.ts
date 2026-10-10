import * as THREE from 'three';
import { canvas } from './paint';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: THREE.Color;
  rot: number;
  spin: number;
  gravity: number;
  drag: number;
  kind: number; // 0 soft puff, 1 sparkle, 2 confetti quad
  alpha: number;
}

const MAX = 900;

function softTexture(): THREE.Texture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function sparkleTexture(): THREE.Texture {
  const [c, g] = canvas(64, 64);
  g.translate(32, 32);
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    g.moveTo(0, -30);
    g.quadraticCurveTo(3, -3, 30, 0);
    g.quadraticCurveTo(3, 3, 0, 30);
    g.quadraticCurveTo(-3, 3, -30, 0);
    g.quadraticCurveTo(-3, -3, 0, -30);
    g.fill();
    g.rotate(Math.PI / 4);
    g.scale(0.55, 0.55);
  }
  return new THREE.CanvasTexture(c);
}

/** Camera-facing particles: soft puffs (smoke, spray, dust), sparkles and flag confetti. */
export class FxView {
  readonly group = new THREE.Group();
  private parts: Particle[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly camQ = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly tmpQ = new THREE.Quaternion();

  constructor() {
    const mk0 = (tex: THREE.Texture | null, blending: THREE.Blending) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex }, uHasMap: { value: tex ? 1 : 0 } },
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vUv = uv;
            vColor = instanceColor;
            vAlpha = aAlpha;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uHasMap;
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float a = uHasMap > 0.5 ? texture2D(uMap, vUv).a : 1.0;
            gl_FragColor = vec4(vColor, a * vAlpha);
            if (gl_FragColor.a < 0.01) discard;
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending,
        side: THREE.DoubleSide,
      });
      const quad = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.InstancedMesh(quad, mat, MAX);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      const alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
      quad.setAttribute('aAlpha', alpha);
      mesh.userData.alpha = alpha;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.group.add(mesh);
      return mesh;
    };
    const mk = mk0;
    this.meshes = [mk(softTexture(), THREE.NormalBlending), mk(sparkleTexture(), THREE.AdditiveBlending), mk(null, THREE.NormalBlending)];
  }

  private add(p: Partial<Particle> & { x: number; y: number; z: number }): void {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push({
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      max: 1,
      size: 0.2,
      grow: 0,
      color: new THREE.Color('#ffffff'),
      rot: Math.random() * Math.PI * 2,
      spin: 0,
      gravity: 0,
      drag: 0,
      kind: 0,
      alpha: 1,
      ...p,
    });
  }

  /** A soft puff (smoke, dust, spray). */
  puff(at: THREE.Vector3, opts: { n?: number; color?: string; size?: number; speed?: number; rise?: number; life?: number; spread?: number; alpha?: number } = {}): void {
    const n = opts.n ?? 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 0.6) * (0.5 + Math.random() * 0.5);
      const sp2 = opts.spread ?? 0.1;
      this.add({
        x: at.x + (Math.random() - 0.5) * sp2,
        y: at.y + (Math.random() - 0.5) * sp2,
        z: at.z + (Math.random() - 0.5) * sp2,
        vx: Math.cos(a) * sp,
        vy: (opts.rise ?? 0.3) * (0.6 + Math.random() * 0.6),
        vz: Math.sin(a) * sp,
        max: (opts.life ?? 0.7) * (0.7 + Math.random() * 0.6),
        size: (opts.size ?? 0.22) * (0.7 + Math.random() * 0.6),
        grow: 1.4,
        color: new THREE.Color(opts.color ?? '#ffffff'),
        drag: 2.2,
        kind: 0,
        alpha: opts.alpha ?? 0.9,
      });
    }
  }

  /** A funnel smoke ring drifting up and downwind. */
  smoke(at: THREE.Vector3, dark = 0): void {
    const c = new THREE.Color('#f4f4f2').lerp(new THREE.Color('#3a3a3c'), dark);
    this.add({ x: at.x, y: at.y, z: at.z, vx: -0.35 - Math.random() * 0.2, vy: 0.55, vz: -0.1, max: 2.4, size: 0.18, grow: 1.8, color: c, drag: 0.4, kind: 0, alpha: 0.75 });
  }

  sparkle(at: THREE.Vector3, n = 10, color = '#fff6c8', spread = 0.5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.add({
        x: at.x + Math.cos(a) * r,
        y: at.y + (Math.random() - 0.3) * spread,
        z: at.z + Math.sin(a) * r * 0.5,
        vy: 0.2 + Math.random() * 0.4,
        max: 0.5 + Math.random() * 0.5,
        size: 0.12 + Math.random() * 0.14,
        grow: -0.6,
        color: new THREE.Color(color),
        spin: (Math.random() - 0.5) * 6,
        kind: 1,
      });
    }
  }

  /** Signal-flag confetti in the code-flag colours. */
  confetti(at: THREE.Vector3, n = 60, spread = 3): void {
    const colors = ['#d62f2b', '#f5c518', '#1e4fa3', '#f8f7f2', '#15181e'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 2.5 + Math.random() * 3;
      this.add({
        x: at.x + (Math.random() - 0.5) * spread,
        y: at.y,
        z: at.z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * sp * 0.5 * (Math.random() - 0.5) * 2,
        vy: 3 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 1.2,
        max: 2.6 + Math.random(),
        size: 0.1 + Math.random() * 0.08,
        color: new THREE.Color(colors[i % colors.length]),
        spin: (Math.random() - 0.5) * 10,
        gravity: 4.5,
        drag: 1.1,
        kind: 2,
      });
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.camQ);
    const counts = [0, 0, 0];
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      keep.push(p);
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.vy = p.vy * d - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const k = p.life / p.max;
      const mesh = this.meshes[p.kind];
      const i = counts[p.kind]++;
      const size = p.size * (1 + p.grow * k);
      this.tmpQ.setFromAxisAngle(this.zAxis, p.rot);
      this.q.copy(this.camQ).multiply(this.tmpQ);
      const fade = p.kind === 2 ? Math.min(1, (1 - k) * 4) : Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k);
      if (p.kind === 2) this.s.set(size, size * (0.5 + 0.5 * Math.abs(Math.cos(p.rot * 1.3))), 1);
      else this.s.set(size, size, 1);
      this.v.set(p.x, p.y, p.z);
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
      // fade by darkening toward transparent: instance colour carries alpha via premultiplied trick
      mesh.setColorAt(i, p.color);
      (mesh.userData.alpha as THREE.InstancedBufferAttribute).setX(i, fade * p.alpha);
    }
    this.parts = keep;
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      (mesh.userData.alpha as THREE.InstancedBufferAttribute).needsUpdate = true;
    });
  }
}
