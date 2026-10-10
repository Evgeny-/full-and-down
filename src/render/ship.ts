import * as THREE from 'three';
import { buildHull, type HullGeometry } from './hull';
import { canvas, toTexture, FONT_NUM, grime, hexA } from './paint';
import { PAL } from './palette';
import { Rng } from '../core/rng';
import { Crane } from './crane';

/** One container slot along the ship (world units). */
export const SLOT = 1.0;
export const BOX_LEN = 0.92;
export const BOX_H = 0.56;
export const BOX_W = 0.62;

const AFT = 2.0; // superstructure + margin, stern to first bay
const FWD = 2.45; // crane + forecastle, last bay to stem
const DEPTH = 1.2;
const BEAM = 1.55;

/** Hull heights (from the keel) of the light waterline and the summer load line. */
export const LIGHT_Y = 0.24;
export const MARK_Y = 0.74;

const waterUniforms = { uWaterY: { value: 0 }, uTime: { value: 0 } };

/**
 * The feeder ship: hull painted as the gauge (red antifouling up to the mark = spare deadweight),
 * a deck with cell guides for `stacks` bays of `tiers` boxes, superstructure aft, forecastle.
 * Group origin: keel at y = 0, amidships of the cargo block at x = 0.
 */
export class ShipModel {
  readonly group = new THREE.Group();
  /** rolls and pitches around the waterline; boxes ride inside it */
  readonly body = new THREE.Group();
  readonly cargo = new THREE.Group();
  readonly length: number;
  readonly hull: HullGeometry;
  readonly stacks: number;
  readonly tiers: number;
  /** x of the stem tip and of the transom */
  readonly bowX: number;
  readonly sternX: number;
  readonly deckY: number;
  readonly manifold = new THREE.Vector3();
  readonly crane: Crane;
  private hullMat: THREE.MeshStandardMaterial;

  constructor(stacks: number, tiers: number, name = 'FULL & DOWN') {
    this.stacks = stacks;
    this.tiers = tiers;
    const cargoLen = stacks * SLOT;
    this.length = AFT + cargoLen + FWD;
    // the cargo block is centred on x = 0
    const midX = (AFT - FWD) / 2;
    this.sternX = -cargoLen / 2 - AFT;
    this.bowX = cargoLen / 2 + FWD;
    this.deckY = DEPTH;
    this.group.add(this.body);
    this.body.add(this.cargo);

    this.hull = buildHull({
      length: this.length,
      beam: BEAM,
      depth: DEPTH,
      bowLen: 2.1,
      sternLen: 1.3,
      sheerBow: 0.32,
      rake: 0.55,
      bilge: 0.26,
    });
    const hullGroup = new THREE.Group();
    hullGroup.position.x = midX;
    this.body.add(hullGroup);

    this.hullMat = new THREE.MeshStandardMaterial({ map: paintHull(this.length, DEPTH + 0.32, name), roughness: 0.55, metalness: 0.05 });
    addWaterline(this.hullMat);
    const side = new THREE.Mesh(this.hull.side, this.hullMat);
    side.castShadow = true;
    side.receiveShadow = true;
    hullGroup.add(side);
    const deckMat = new THREE.MeshStandardMaterial({ color: PAL.deck, roughness: 0.8 });
    const deck = new THREE.Mesh(this.hull.deck, deckMat);
    deck.receiveShadow = true;
    hullGroup.add(deck);

    this.buildBulwark(hullGroup);
    this.buildCellGuides(cargoLen);
    this.buildSuperstructure();
    this.buildForecastle();
    this.crane = new Crane(new THREE.Vector3(cargoLen / 2 + 0.55, this.deckY, 0));
    this.body.add(this.crane.group);
  }

  /** Local x of the centre of bay i. */
  bayX(i: number): number {
    return -((this.stacks - 1) * SLOT) / 2 + i * SLOT;
  }

  /** Local position of the centre of the box at bay i, tier j (0 = bottom). */
  slotPos(i: number, j: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.bayX(i), this.deckY + 0.06 + BOX_H / 2 + j * BOX_H, 0);
  }

  setWater(y: number, t: number): void {
    waterUniforms.uWaterY.value = y;
    waterUniforms.uTime.value = t;
  }

  private buildBulwark(hullGroup: THREE.Group): void {
    // a thin rail along the deck edge, from the forecastle to the stern
    const mat = new THREE.MeshStandardMaterial({ color: PAL.white, roughness: 0.6 });
    const L = this.length;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = -L / 2 + 0.05 + (L - 0.12) * (i / 40);
      pts.push(new THREE.Vector3(x, this.hull.deckAt(x) + 0.09, this.hull.halfBeamAt(x) - 0.02));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.018, 5), mat);
    hullGroup.add(rail);
    const back = rail.clone();
    back.scale.z = -1;
    hullGroup.add(back);
    // stanchions
    const st = new THREE.CylinderGeometry(0.012, 0.012, 0.09, 4);
    const stMesh = new THREE.InstancedMesh(st, mat, 64);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 32 && n < 64; i++) {
      const x = -L / 2 + 0.2 + (L - 0.5) * (i / 31);
      for (const s of [1, -1]) {
        m.makeTranslation(x, this.hull.deckAt(x) + 0.045, s * (this.hull.halfBeamAt(x) - 0.02));
        stMesh.setMatrixAt(n++, m);
      }
    }
    stMesh.count = n;
    hullGroup.add(stMesh);
  }

  private buildCellGuides(cargoLen: number): void {
    // hatch covers under the stacks, and lashing bridges between bays sized to the stack height
    const hatchMat = new THREE.MeshStandardMaterial({ color: PAL.hatch, roughness: 0.6 });
    const ribMat = new THREE.MeshStandardMaterial({ color: '#35505f', roughness: 0.6 });
    for (let i = 0; i < this.stacks; i++) {
      const hatch = new THREE.Mesh(new THREE.BoxGeometry(SLOT - 0.06, 0.07, BEAM - 0.36), hatchMat);
      hatch.position.set(this.bayX(i), this.deckY + 0.035, 0);
      hatch.castShadow = true;
      hatch.receiveShadow = true;
      this.body.add(hatch);
      for (let k = 0; k < 3; k++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, BEAM - 0.4), ribMat);
        rib.position.set(this.bayX(i) - 0.3 + k * 0.3, this.deckY + 0.075, 0);
        this.body.add(rib);
      }
    }
    const bridgeMat = new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.55 });
    const h = this.tiers * BOX_H * 0.62;
    for (let i = 0; i <= this.stacks; i++) {
      const x = -cargoLen / 2 + i * SLOT;
      for (const z of [-(BEAM / 2 - 0.2), BEAM / 2 - 0.2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), bridgeMat);
        post.position.set(x, this.deckY + h / 2, z);
        post.castShadow = true;
        this.body.add(post);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, BEAM - 0.4), bridgeMat);
      bar.position.set(x, this.deckY + h, 0);
      this.body.add(bar);
    }
  }

  private buildSuperstructure(): void {
    const white = new THREE.MeshStandardMaterial({ color: PAL.superstructure, roughness: 0.5 });
    const windows = windowTexture();
    const winMat = new THREE.MeshStandardMaterial({ map: windows, roughness: 0.35 });
    const x0 = this.sternX + 0.32;
    const w = 1.25;
    const levels = Math.max(3, this.tiers + 1);
    const lh = 0.36;
    const hb = BEAM / 2 - 0.12;
    for (let k = 0; k < levels; k++) {
      const inset = k === levels - 1 ? 0.06 : 0.02 * k;
      const geo = new THREE.BoxGeometry(w - inset * 2, lh, (hb - inset) * 2);
      const mats = [white, white, white, white, winMat, white];
      const m = new THREE.Mesh(geo, mats);
      m.position.set(x0 + w / 2, this.deckY + lh / 2 + k * lh, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
    }
    // bridge wings
    const top = this.deckY + levels * lh;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, BEAM + 0.18), white);
    wing.position.set(x0 + w - 0.25, top - lh + 0.02, 0);
    wing.castShadow = true;
    this.body.add(wing);
    // the bridge roof and mast
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.05, hb * 2 + 0.06), white);
    roof.position.set(x0 + w / 2, top + 0.025, 0);
    this.body.add(roof);
    const mastMat = new THREE.MeshStandardMaterial({ color: PAL.funnel, roughness: 0.5 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 6), mastMat);
    mast.position.set(x0 + w - 0.35, top + 0.4, 0);
    this.body.add(mast);
    const yard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.7), mastMat);
    yard.position.set(x0 + w - 0.35, top + 0.62, 0);
    this.body.add(yard);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: '#30343c' }));
    radar.position.set(x0 + w - 0.35, top + 0.47, 0);
    radar.name = 'radar';
    this.body.add(radar);
    // funnel: yellow with a blue band and a black top
    const funnel = new THREE.Group();
    const fShape = new THREE.Shape();
    fShape.moveTo(-0.22, 0);
    fShape.lineTo(0.2, 0);
    fShape.lineTo(0.16, 0.62);
    fShape.quadraticCurveTo(0.14, 0.68, 0.08, 0.68);
    fShape.lineTo(-0.28, 0.68);
    fShape.lineTo(-0.22, 0);
    const fGeo = new THREE.ExtrudeGeometry(fShape, { depth: 0.36, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    fGeo.translate(0, 0, -0.18);
    const fMat = new THREE.MeshStandardMaterial({ map: funnelTexture(), roughness: 0.45 });
    // planar UV by height so the bands stay horizontal
    const p = fGeo.attributes.position;
    const uv = fGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5, p.getY(i) / 0.7);
    const f = new THREE.Mesh(fGeo, fMat);
    f.castShadow = true;
    funnel.add(f);
    funnel.position.set(x0 + 0.32, top, 0);
    this.body.add(funnel);
    this.funnelTop.set(x0 + 0.28, top + 0.7, 0);
    this.manifold.set(x0 + w + 0.25, this.deckY + 0.1, -0.3);
  }

  readonly funnelTop = new THREE.Vector3();

  private buildForecastle(): void {
    const mat = new THREE.MeshStandardMaterial({ color: PAL.deck, roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: PAL.white, roughness: 0.6 });
    const x = this.bowX - 0.75;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 6), new THREE.MeshStandardMaterial({ color: PAL.funnel }));
    mast.position.set(x, this.hull.deckAt(x + 0.2) + 0.35, 0);
    mast.castShadow = true;
    this.body.add(mast);
    // windlass
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10), mat);
    winch.rotation.x = Math.PI / 2;
    winch.position.set(x + 0.35, this.hull.deckAt(x + 0.35) + 0.08, 0);
    this.body.add(winch);
    // breakwater plate in front of the first bay
    const bw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, BEAM - 0.3), white);
    bw.position.set(this.bayX(this.stacks - 1) + SLOT / 2 + 1.05, this.deckY + 0.15, 0);
    bw.castShadow = true;
    this.body.add(bw);
  }
}

/** The hull side: antifouling red up to the summer mark, navy topsides, draft numerals, the Plimsoll disc. */
function paintHull(length: number, height: number, name: string): THREE.CanvasTexture {
  const W = 2048;
  const H = Math.round((W / length) * height);
  const [c, g] = canvas(W, H);
  const rng = new Rng(7);
  const yOf = (hy: number) => H - (hy / height) * H; // hull height → canvas y
  const xOf = (u: number) => u * W; // 0..1 along the length (stern → bow)
  const markY = yOf(MARK_Y);
  // topsides
  g.fillStyle = PAL.hullNavy;
  g.fillRect(0, 0, W, markY);
  // a white sheer line just under the deck edge
  g.fillStyle = PAL.white;
  g.fillRect(0, yOf(DEPTH) + 2, W, 5);
  // red antifouling up to the mark: "hide the red" = load to the marks
  g.fillStyle = PAL.antifouling;
  g.fillRect(0, markY, W, H - markY);
  // boot-top: a thin black band right at the mark
  g.fillStyle = PAL.bootTop;
  g.fillRect(0, markY - 3, W, 6);
  // plating seams
  const px = W / length;
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1.5;
  for (let x = 0.6 * px; x < W; x += 0.8 * px) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (const hy of [0.42, 0.98]) {
    g.beginPath();
    g.moveTo(0, yOf(hy));
    g.lineTo(W, yOf(hy));
    g.stroke();
  }
  grime(g, rng, 0, 0, W, markY, 900, '#000000', 0.08);
  grime(g, rng, 0, markY, W, H - markY, 700, '#3a0d05', 0.12);
  // tonne ticks: short white dashes in the red band between light line and mark, at the bow and stern
  const tick = (u: number) => {
    g.fillStyle = hexA(PAL.white, 0.85);
    const steps = 5;
    for (let k = 0; k <= steps; k++) {
      const hy = LIGHT_Y + ((MARK_Y - LIGHT_Y) * k) / steps;
      const y = yOf(hy);
      g.fillRect(xOf(u) - 10, y - 1.5, k === steps ? 26 : 16, 3);
    }
  };
  // draft numerals at bow and stern
  g.font = `600 ${Math.round(0.16 * px)}px ${FONT_NUM}`;
  g.textBaseline = 'middle';
  g.fillStyle = PAL.white;
  const draftMarks = (u: number) => {
    for (let k = 0; k <= 4; k++) {
      const hy = 0.3 + k * 0.2;
      if (hy > DEPTH - 0.1) break;
      const label = k === 4 ? '10M' : String(2 + k * 2);
      g.fillText(label, xOf(u), yOf(hy));
    }
  };
  draftMarks(0.035);
  draftMarks(0.93);
  tick(0.075);
  tick(0.905);
  // the Plimsoll mark amidships: disc, bar through the centre at the summer line, the LR letters,
  // and the load-line ladder (TF F T S W) to the forward side
  const cx = xOf(0.56);
  const cy = markY;
  const R = 0.2 * px;
  g.strokeStyle = PAL.white;
  g.fillStyle = PAL.white;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  g.fillRect(cx - R * 1.35, cy - 3, R * 2.7, 6);
  g.fillRect(cx - R * 1.35, yOf(DEPTH) + 10, R * 2.7, 6); // deck line above
  g.font = `700 ${Math.round(R * 0.62)}px ${FONT_NUM}`;
  g.textAlign = 'center';
  g.fillText('L', cx - R * 0.95, cy - R * 0.62);
  g.fillText('R', cx + R * 0.95, cy - R * 0.62);
  const lx = cx + R * 2.0;
  g.fillRect(lx, cy - R * 1.1, 5, R * 2.0);
  const ladder: [string, number][] = [['TF', -0.9], ['F', -0.55], ['T', -0.3], ['S', 0], ['W', 0.3]];
  g.font = `600 ${Math.round(R * 0.42)}px ${FONT_NUM}`;
  g.textAlign = 'left';
  for (const [lab, k] of ladder) {
    const y = cy + k * R;
    g.fillRect(lx, y - 2.5, R * 0.7, 5);
    g.fillText(lab, lx + R * 0.78, y);
  }
  // ship's name at the bow, port of registry at the stern
  g.textAlign = 'center';
  g.font = `700 ${Math.round(0.2 * px)}px ${FONT_NUM}`;
  g.fillStyle = PAL.white;
  g.fillText(name, xOf(0.82), yOf(DEPTH - 0.2));
  g.font = `600 ${Math.round(0.12 * px)}px ${FONT_NUM}`;
  g.fillText('ROTTERDAM', xOf(0.11), yOf(DEPTH - 0.2));
  return toTexture(c);
}

function windowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = PAL.superstructure;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#2b3a4f';
  for (let i = 0; i < 7; i++) {
    g.fillRect(14 + i * 34, 20, 22, 22);
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 7; i++) g.fillRect(16 + i * 34, 22, 7, 18);
  return toTexture(c);
}

function funnelTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(16, 128);
  g.fillStyle = PAL.funnel;
  g.fillRect(0, 0, 16, 128);
  g.fillStyle = PAL.funnelBand;
  g.fillRect(0, 128 - 0.62 * 128, 16, 22);
  g.fillStyle = PAL.black;
  g.fillRect(0, 0, 16, 16);
  return toTexture(c);
}

/** A foam line where the water meets the hull, and a darker wet band just above it. */
function addWaterline(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterY = waterUniforms.uWaterY;
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nuniform float uWaterY;\nuniform float uTime;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float wave = sin(vWorldPos.x * 5.0 + uTime * 1.6) * 0.012 + sin(vWorldPos.x * 11.0 - uTime * 2.3) * 0.006;
        float d = vWorldPos.y - (uWaterY + wave);
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.07, d));
        float foam = 1.0 - smoothstep(0.0, 0.028, abs(d - 0.012));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.98, 0.99), foam * 0.9);`,
      );
  };
}
