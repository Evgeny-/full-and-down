import * as THREE from 'three';
import { buildHull, type HullGeometry } from './hull';
import { PAL } from './palette';
import { Crane } from './crane';
import { paintHull, addWaterline } from './ships/hullPaint';
import { buildBulwark, buildDeckFittings } from './ships/fittings';
import { buildCargoDeck } from './ships/cargoDeck';
import { buildSuperstructure } from './ships/superstructure';

/** One container slot along the ship (world units). */
export const SLOT = 1.0;
export const BOX_LEN = 0.92;
export const BOX_H = 0.56;
export const BOX_W = 0.62;

/** Bulker: the hold's floor above the deck line (a parcel stands on it) and the hatch coaming's height. */
export const HOLD_FLOOR = 0.1;
export const COAMING_H = 0.22;

export type ShipKind = 'feeder' | 'bulker';

const AFT = 2.45; // superstructure + aft crane, stern to first bay
const FWD = 2.3; // fore crane + forecastle, last bay to stem
const DEPTH = 1.2;
const BEAM = 1.55;

/** Hull heights (from the keel) of the light waterline and the summer load line. */
export const LIGHT_Y = 0.24;
export const MARK_Y = 0.74;

/**
 * The feeder ship: hull painted as the gauge (red antifouling up to the mark = spare deadweight),
 * a deck with cell guides for `stacks` bays of `tiers` boxes, superstructure aft, forecastle.
 * `kind = 'bulker'` builds a bulk carrier instead: no cell guides, each bay is an open cargo hold
 * (coaming, folded hatch covers, a dark hold) for one parcel (see bulk.ts); `tiers` is then always 1,
 * and the cranes carry clamshell grabs.
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
  readonly kind: ShipKind;
  /** x of the stem tip and of the transom */
  readonly bowX: number;
  readonly sternX: number;
  readonly deckY: number;
  readonly manifold = new THREE.Vector3();
  readonly cranes: Crane[];
  readonly funnelTop = new THREE.Vector3();
  /** Mast attachment points in body coordinates, used by the animated signal flags. */
  readonly yard = new THREE.Vector3();
  readonly foremastTop = new THREE.Vector3();
  private readonly waterUniforms = { uWaterY: { value: 0 }, uTime: { value: 0 } };

  constructor(stacks: number, tiers: number, name = 'FULL & DOWN', plugs: number[] = [], registry = 'MONROVIA', kind: ShipKind = 'feeder') {
    this.kind = kind;
    this.stacks = stacks;
    this.tiers = kind === 'bulker' ? 1 : tiers;
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

    const hullMat = new THREE.MeshStandardMaterial({
      map: paintHull({ length: this.length, height: DEPTH + 0.32, name, registry, deckY: DEPTH, lightY: LIGHT_Y, markY: MARK_Y }),
      roughness: 0.55,
      metalness: 0.05,
    });
    addWaterline(hullMat, this.waterUniforms);
    const side = new THREE.Mesh(this.hull.side, hullMat);
    side.castShadow = true;
    side.receiveShadow = true;
    hullGroup.add(side);
    const deckMat = new THREE.MeshStandardMaterial({ color: PAL.deck, roughness: 0.8 });
    const deck = new THREE.Mesh(this.hull.deck, deckMat);
    deck.receiveShadow = true;
    hullGroup.add(deck);

    buildBulwark(hullGroup, this.hull, this.length);
    buildCargoDeck({
      body: this.body, stacks, tiers: this.tiers, kind, deckY: this.deckY, beam: BEAM,
      slot: SLOT, boxHeight: BOX_H, holdFloor: HOLD_FLOOR, coamingHeight: COAMING_H, plugs,
    });
    const fittings = buildSuperstructure({ body: this.body, sternX: this.sternX, deckY: this.deckY, beam: BEAM, tiers: this.tiers, kind });
    this.funnelTop.copy(fittings.funnelTop);
    this.yard.copy(fittings.yard);
    this.manifold.copy(fittings.manifold);
    this.foremastTop.copy(buildDeckFittings({
      body: this.body, hull: this.hull, hullOffsetX: midX, bowX: this.bowX, sternX: this.sternX,
      deckY: this.deckY, cargoLength: cargoLen, beam: BEAM,
    }));
    this.cranes = [
      new Crane(new THREE.Vector3(-cargoLen / 2 - 0.42, this.deckY, 0), Math.PI * 0.86, kind === 'bulker'),
      new Crane(new THREE.Vector3(cargoLen / 2 + 0.5, this.deckY, 0), Math.PI * 0.14, kind === 'bulker'),
    ];
    for (const c of this.cranes) this.body.add(c.group);
  }

  /** Local x of the centre of bay i. */
  bayX(i: number): number {
    return -((this.stacks - 1) * SLOT) / 2 + i * SLOT;
  }

  /**
   * Local position of the centre of the box at bay i, tier j (0 = bottom). On a bulker, `slotPos(i, 0)` is
   * where a parcel's centre sits in hold i: its bin stands on the hold floor, the heap rises above the coaming.
   */
  slotPos(i: number, j: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (this.kind === 'bulker') return out.set(this.bayX(i), this.deckY + HOLD_FLOOR + BOX_H / 2 + j * BOX_H, 0);
    return out.set(this.bayX(i), this.deckY + 0.06 + BOX_H / 2 + j * BOX_H, 0);
  }

  setWater(y: number, t: number): void {
    this.waterUniforms.uWaterY.value = y;
    this.waterUniforms.uTime.value = t;
  }
}
