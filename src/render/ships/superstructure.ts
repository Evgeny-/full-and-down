import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, toTexture } from '../paint';
import { PAL } from '../palette';

export interface SuperstructureContext {
  /** Ship-local coordinates, with the bow toward +x and the keel at y = 0. */
  body: THREE.Group;
  sternX: number;
  deckY: number;
  beam: number;
  tiers: number;
  kind: 'feeder' | 'bulker';
}

export interface SuperstructureAttachments {
  funnelTop: THREE.Vector3;
  /** Outer end of the bridge yard, where Blue Peter is hoisted. */
  yard: THREE.Vector3;
  manifold: THREE.Vector3;
}

type Finish = 'white' | 'deck' | 'steel' | 'glass' | 'glint' | 'mast' | 'rescue' | 'portLight' | 'starboardLight';
type Point = readonly [number, number];

/** Aft accommodation and its fittings, kept independent of the cargo deck and port models. */
export function buildSuperstructure(ctx: SuperstructureContext): SuperstructureAttachments {
  const { body, sternX, deckY, beam, tiers, kind } = ctx;
  const x0 = sternX + 0.32;
  const length = 1.25;
  const levels = Math.max(3, (kind === 'bulker' ? 1 : tiers) + 1);
  const floorHeight = 0.36;
  const halfWidth = beam / 2 - 0.12;
  const roofY = deckY + levels * floorHeight;
  const bridgeFloor = roofY - floorHeight;
  const parts: Record<Finish, THREE.BufferGeometry[]> = {
    white: [], deck: [], steel: [], glass: [], glint: [], mast: [], rescue: [], portLight: [], starboardLight: [],
  };

  const box = (finish: Finish, x: number, y: number, z: number, w: number, h: number, d: number): void => {
    parts[finish].push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  };
  const cylinder = (finish: Finish, x: number, y: number, z: number, radius: number, h: number, segments = 6): void => {
    parts[finish].push(new THREE.CylinderGeometry(radius, radius, h, segments).translate(x, y, z));
  };
  const rail = (finish: Finish, from: THREE.Vector3, to: THREE.Vector3, radius = 0.013): void => {
    const direction = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 5);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    parts[finish].push(geometry);
  };

  // Each deck steps inward, leaving a visible lip rather than a stack of identical slabs.
  for (let floor = 0; floor < levels - 1; floor++) {
    const w = length - floor * 0.08;
    const hw = halfWidth - floor * 0.035;
    const cx = x0 + length / 2 + floor * 0.012;
    const bottom = deckY + floor * floorHeight;
    box('white', cx, bottom + floorHeight / 2, 0, w, floorHeight, hw * 2);
    box('white', cx, bottom + floorHeight - 0.008, 0, w + 0.06, 0.032, hw * 2 + 0.065);
    box('deck', cx, bottom + floorHeight + 0.009, 0, w + 0.045, 0.012, hw * 2 + 0.05);
    for (const side of [-1, 1]) {
      for (let pane = 0; pane < 4; pane++) {
        const px = cx - w * 0.31 + pane * w * 0.205;
        box('glass', px, bottom + 0.185, side * (hw + 0.005), 0.105, 0.112, 0.014);
        box('glint', px - 0.027, bottom + 0.198, side * (hw + 0.013), 0.024, 0.067, 0.005);
      }
    }
    // Forward-facing accommodation windows also read from the bow-quarter camera.
    for (const z of [-hw * 0.55, 0, hw * 0.55]) {
      box('glass', cx + w / 2 + 0.005, bottom + 0.185, z, 0.014, 0.108, 0.12);
    }
  }

  // A chamfered wheelhouse has a continuous glazed band on every face.
  const bridgeAft = x0 + 0.43;
  const bridgeFront = x0 + length + 0.02;
  const bridgeHalf = halfWidth - 0.07;
  const corner = 0.12;
  const outline: Point[] = [
    [bridgeAft, -bridgeHalf], [bridgeFront - corner, -bridgeHalf],
    [bridgeFront, -bridgeHalf + corner], [bridgeFront, bridgeHalf - corner],
    [bridgeFront - corner, bridgeHalf], [bridgeAft, bridgeHalf],
  ];
  parts.white.push(prism(outline, bridgeFloor + 0.02, roofY));
  const roofOutline = outline.map(([x, z]): Point => [
    x + (x < (bridgeAft + bridgeFront) / 2 ? -0.035 : 0.035),
    z + Math.sign(z) * 0.035,
  ]);
  parts.white.push(prism(roofOutline, roofY, roofY + 0.045));
  for (let face = 0; face < outline.length; face++) {
    const a = outline[face];
    const b = outline[(face + 1) % outline.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const span = Math.hypot(dx, dz);
    const outwardX = dz / span;
    const outwardZ = -dx / span;
    const panes = Math.max(1, Math.round(span / 0.22));
    const paneWidth = span / panes;
    for (let pane = 0; pane < panes; pane++) {
      const along = (pane + 0.5) / panes;
      const cx = a[0] + dx * along;
      const cz = a[1] + dz * along;
      const geometry = new THREE.BoxGeometry(paneWidth - 0.026, 0.14, 0.014);
      geometry.rotateY(-Math.atan2(dz, dx));
      geometry.translate(cx + outwardX * 0.006, bridgeFloor + 0.22, cz + outwardZ * 0.006);
      parts.glass.push(geometry);
      const highlight = new THREE.BoxGeometry((paneWidth - 0.026) * 0.65, 0.021, 0.005);
      highlight.rotateY(-Math.atan2(dz, dx));
      highlight.translate(cx + outwardX * 0.015, bridgeFloor + 0.259, cz + outwardZ * 0.015);
      parts.glint.push(highlight);
    }
  }

  // Open bridge wings sit at the wheelhouse floor, with white guards and navigation lights.
  const wingX = x0 + length - 0.25;
  const wingHalf = beam / 2 + 0.09;
  const wingDeckY = bridgeFloor + 0.02;
  box('white', wingX, wingDeckY, 0, 0.45, 0.055, wingHalf * 2);
  box('deck', wingX, wingDeckY + 0.032, 0, 0.41, 0.009, wingHalf * 2 - 0.035);
  for (const side of [-1, 1]) {
    const edge = side * wingHalf;
    const inner = side * (bridgeHalf + 0.02);
    const guardY = wingDeckY + 0.18;
    rail('white', new THREE.Vector3(wingX - 0.21, guardY, edge), new THREE.Vector3(wingX + 0.21, guardY, edge));
    for (const end of [-1, 1]) {
      const px = wingX + end * 0.21;
      rail('white', new THREE.Vector3(px, guardY, inner), new THREE.Vector3(px, guardY, edge));
      cylinder('white', px, wingDeckY + 0.106, edge, 0.011, 0.148, 5);
    }
    box('steel', wingX + 0.14, wingDeckY + 0.099, edge, 0.09, 0.06, 0.055);
    box(side > 0 ? 'starboardLight' : 'portLight', wingX + 0.151, wingDeckY + 0.105, edge + side * 0.029, 0.055, 0.032, 0.012);
  }

  // Small access doors, deck vents and the funnel's raised casing break up the white surfaces.
  for (const side of [-1, 1]) {
    box('steel', x0 + 0.18, deckY + 0.142, side * (halfWidth + 0.007), 0.112, 0.235, 0.016);
    box('white', x0 + 0.18, deckY + 0.146, side * (halfWidth + 0.017), 0.092, 0.211, 0.008);
    box('glass', x0 + 0.18, deckY + 0.206, side * (halfWidth + 0.024), 0.046, 0.047, 0.005);
    cylinder('white', x0 + 0.65, roofY + 0.076, side * 0.34, 0.057, 0.063);
    cylinder('steel', x0 + 0.65, roofY + 0.111, side * 0.34, 0.073, 0.019);
  }
  box('white', x0 + 0.28, bridgeFloor + floorHeight / 2, 0, 0.49, floorHeight, 0.44);
  for (const z of [-0.224, 0.224]) {
    for (let slot = 0; slot < 3; slot++) box('steel', x0 + 0.28, bridgeFloor + 0.105 + slot * 0.046, z, 0.29, 0.014, 0.01);
  }

  // Compact enclosed rescue boats sit aft, clear of the cargo bay and crane.
  const boatY = deckY + 0.53;
  const boatX = x0 + 0.30;
  for (const side of [-1, 1]) {
    const boatZ = side * (beam / 2 - 0.016);
    const boatPlan: Point[] = [
      [boatX - 0.29, boatZ - 0.045], [boatX - 0.21, boatZ - 0.10],
      [boatX + 0.17, boatZ - 0.10], [boatX + 0.29, boatZ - 0.045],
      [boatX + 0.29, boatZ + 0.045], [boatX + 0.17, boatZ + 0.10],
      [boatX - 0.21, boatZ + 0.10], [boatX - 0.29, boatZ + 0.045],
    ];
    parts.rescue.push(prism(boatPlan, boatY - 0.065, boatY + 0.029));
    const canopy = new THREE.SphereGeometry(1, 8, 5);
    canopy.scale(0.22, 0.105, 0.089);
    canopy.translate(boatX - 0.008, boatY + 0.021, boatZ);
    parts.rescue.push(canopy);
    box('glass', boatX + 0.17, boatY + 0.067, boatZ, 0.012, 0.047, 0.108);
    box('white', boatX + 0.024, boatY + 0.098, boatZ, 0.082, 0.012, 0.075);
    for (const end of [-1, 1]) {
      const px = boatX + end * 0.23;
      const baseZ = side * (halfWidth - 0.025);
      const tipZ = boatZ + side * 0.018;
      rail('white', new THREE.Vector3(px, deckY + 0.32, baseZ), new THREE.Vector3(px, boatY + 0.18, baseZ), 0.019);
      rail('white', new THREE.Vector3(px, boatY + 0.18, baseZ), new THREE.Vector3(px, boatY + 0.18, tipZ), 0.019);
      rail('steel', new THREE.Vector3(px, boatY + 0.175, tipZ), new THREE.Vector3(px, boatY + 0.022, tipZ), 0.008);
    }
  }

  // Keep the established hoist and radar coordinates so GameView's animation remains local.
  const mastX = x0 + length - 0.35;
  parts.mast.push(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 6).translate(mastX, roofY + 0.4, 0));
  box('mast', mastX, roofY + 0.62, 0, 0.04, 0.03, 0.7);
  cylinder('steel', mastX, roofY + 0.427, 0, 0.035, 0.07);
  const radar = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.03, 0.06),
    new THREE.MeshStandardMaterial({ color: '#30343c', roughness: 0.6 }),
  );
  radar.position.set(mastX, roofY + 0.47, 0);
  radar.name = 'radar';
  body.add(radar);

  // OAL's royal blue funnel and its broad white house-mark band retain the original planar UVs.
  const funnelX = x0 + 0.32;
  const funnelShape = new THREE.Shape();
  funnelShape.moveTo(-0.22, 0);
  funnelShape.lineTo(0.2, 0);
  funnelShape.lineTo(0.16, 0.62);
  funnelShape.quadraticCurveTo(0.14, 0.68, 0.08, 0.68);
  funnelShape.lineTo(-0.28, 0.68);
  funnelShape.lineTo(-0.22, 0);
  const funnelGeometry = new THREE.ExtrudeGeometry(funnelShape, {
    depth: 0.36, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2,
  });
  funnelGeometry.translate(0, 0, -0.18);
  const positions = funnelGeometry.attributes.position;
  const uv = funnelGeometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) uv.setXY(i, (positions.getX(i) + 0.31) / 0.52, positions.getY(i) / 0.7);
  const funnel = new THREE.Mesh(funnelGeometry, new THREE.MeshStandardMaterial({ map: funnelTexture(), roughness: 0.45 }));
  funnel.position.set(funnelX, roofY, 0);
  funnel.castShadow = true;
  funnel.receiveShadow = true;
  funnel.name = 'oal-funnel';
  body.add(funnel);
  box('steel', funnelX - 0.1, roofY + 0.685, 0, 0.35, 0.023, 0.36);
  for (const z of [-0.095, 0.095]) cylinder('steel', funnelX - 0.04, roofY + 0.703, z, 0.051, 0.018, 8);

  const materials: Record<Finish, THREE.MeshStandardMaterial> = {
    white: new THREE.MeshStandardMaterial({ color: PAL.superstructure, roughness: 0.58 }),
    deck: new THREE.MeshStandardMaterial({ color: PAL.deck, roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: '#39444a', roughness: 0.66, metalness: 0.08 }),
    glass: new THREE.MeshStandardMaterial({ color: '#2b4156', roughness: 0.3, metalness: 0.12 }),
    glint: new THREE.MeshStandardMaterial({ color: '#739baa', roughness: 0.4 }),
    mast: new THREE.MeshStandardMaterial({ color: PAL.mast, roughness: 0.5 }),
    rescue: new THREE.MeshStandardMaterial({ color: '#b95643', roughness: 0.64 }),
    portLight: new THREE.MeshStandardMaterial({ color: PAL.flagRed, emissive: PAL.flagRed, emissiveIntensity: 0.25 }),
    starboardLight: new THREE.MeshStandardMaterial({ color: '#287b59', emissive: '#287b59', emissiveIntensity: 0.25 }),
  };
  for (const finish of Object.keys(parts) as Finish[]) {
    if (!parts[finish].length) {
      materials[finish].dispose();
      continue;
    }
    // The shaped prisms are non-indexed; normalize the primitives before batching each finish.
    const sources = parts[finish].map((geometry) => {
      if (!geometry.index) return geometry;
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      return nonIndexed;
    });
    const geometry = mergeGeometries(sources, false);
    for (const source of sources) source.dispose();
    if (!geometry) {
      materials[finish].dispose();
      continue;
    }
    const mesh = new THREE.Mesh(geometry, materials[finish]);
    mesh.name = `accommodation-${finish}`;
    mesh.castShadow = finish !== 'glint' && finish !== 'portLight' && finish !== 'starboardLight';
    mesh.receiveShadow = true;
    body.add(mesh);
  }

  return {
    funnelTop: new THREE.Vector3(x0 + 0.28, roofY + 0.7, 0),
    yard: new THREE.Vector3(mastX, roofY + 0.62, 0.3),
    manifold: new THREE.Vector3(x0 + length + 0.25, deckY + 0.1, -0.3),
  };
}

/** A flat-shaded vertical prism for the bridge's clipped corners and the rescue-boat hull. */
function prism(outline: readonly Point[], bottom: number, top: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = (p: Point, y: number): void => {
    positions.push(p[0], y, p[1]);
    uvs.push(0, 0);
  };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    vertex(a, bottom); vertex(a, top); vertex(b, top);
    vertex(a, bottom); vertex(b, top); vertex(b, bottom);
  }
  for (let i = 1; i < outline.length - 1; i++) {
    vertex(outline[0], top); vertex(outline[i + 1], top); vertex(outline[i], top);
    vertex(outline[0], bottom); vertex(outline[i], bottom); vertex(outline[i + 1], bottom);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** OAL's funnel: royal blue, a broad white band, and the letters OAL with a wave through them. */
function funnelTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, g] = canvas(size, size);
  g.fillStyle = PAL.funnel;
  g.fillRect(0, 0, size, size);
  const top = size * (1 - 0.62);
  const bottom = size * (1 - 0.3);
  g.fillStyle = PAL.funnelBand;
  g.fillRect(0, top, size, bottom - top);
  const mid = (top + bottom) / 2;
  g.fillStyle = PAL.funnelMark;
  g.font = `900 ${Math.round((bottom - top) * 0.62)}px Oswald Variable, Oswald, Arial Narrow, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('OAL', size * 0.5, mid - 4);
  g.strokeStyle = PAL.funnelMark;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  const y = mid + (bottom - top) * 0.3;
  g.moveTo(size * 0.22, y);
  g.bezierCurveTo(size * 0.36, y - 14, size * 0.46, y + 12, size * 0.56, y);
  g.bezierCurveTo(size * 0.64, y - 10, size * 0.72, y - 6, size * 0.78, y - 2);
  g.stroke();
  return toTexture(c);
}
