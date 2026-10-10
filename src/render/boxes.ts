import * as THREE from 'three';
import { canvas, toTexture, FONT_NUM, hexA, shade, roundRect } from './paint';
import { PAL } from './palette';
import { BOX_H, BOX_LEN, BOX_W } from './ship';
import { drawFlag, type FlagId } from './flags';

export interface BoxLook {
  color: string;
  weight: number;
  flag: FlagId;
  kind?: 'box' | 'reefer' | 'dg' | 'heavy';
  /** contract cargo: a red seal */
  seal?: boolean;
}

const cache = new Map<string, THREE.Material[]>();
let boxGeo: THREE.BufferGeometry | null = null;

function geometry(): THREE.BufferGeometry {
  if (!boxGeo) {
    // a slightly bevelled box reads as steel, not plastic
    const g = new THREE.BoxGeometry(BOX_LEN, BOX_H, BOX_W, 1, 1, 1);
    boxGeo = g;
  }
  return boxGeo;
}

/** The long side facing the camera: corrugated in the box colour, a big weight numeral, the port flag. */
function paintSide(look: BoxLook): THREE.CanvasTexture {
  const W = 256;
  const H = Math.round((W * BOX_H) / BOX_LEN);
  const [c, g] = canvas(W, H);
  const base = look.kind === 'reefer' ? '#eef2f3' : look.color;
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // corrugation
  for (let x = 6; x < W - 6; x += 9) {
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x, 6, 3, H - 12);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x + 4, 6, 3, H - 12);
  }
  // frame rails
  g.fillStyle = shade(base, -0.28);
  g.fillRect(0, 0, W, 7);
  g.fillRect(0, H - 7, W, 7);
  g.fillRect(0, 0, 8, H);
  g.fillRect(W - 8, 0, 8, H);
  if (look.kind === 'reefer') {
    // the reefer stripe in the port colour and the machinery grille
    g.fillStyle = look.color;
    g.fillRect(8, H - 26, W - 16, 14);
    g.fillStyle = '#9aa6ad';
    roundRect(g, W - 64, 14, 48, H - 46, 4);
    g.fill();
    g.fillStyle = '#6f7b83';
    for (let y = 20; y < H - 36; y += 7) g.fillRect(W - 58, y, 36, 3);
  }
  // the weight: a plate with a big numeral and tonne pips
  const ink = look.kind === 'reefer' ? PAL.black : PAL.white;
  g.fillStyle = hexA(look.kind === 'reefer' ? '#ffffff' : '#000000', 0.18);
  roundRect(g, 18, 12, 98, H - 24, 8);
  g.fill();
  g.fillStyle = ink;
  g.font = `700 ${Math.round(H * 0.7)}px ${FONT_NUM}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(look.weight), 52, H / 2 + 3);
  g.font = `600 ${Math.round(H * 0.3)}px ${FONT_NUM}`;
  g.fillText('t', 94, H / 2 + 12);
  // port flag sticker
  const fw = 58;
  const fh = 40;
  const fx = look.kind === 'reefer' ? W - 132 : W - 78;
  const fy = 14;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(fx + 2, fy + 3, fw, fh);
  drawFlag(g, look.flag, fx, fy, fw, fh);
  if (look.seal) {
    // a contract seal: a red wax disc with a white tick
    const cx = look.kind === 'reefer' ? W - 160 : W - 104;
    const cy = H - 28;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.arc(cx + 2, cy + 3, 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b3201c';
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r = k % 2 ? 15 : 18;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - 7, cy);
    g.lineTo(cx - 2, cy + 6);
    g.lineTo(cx + 8, cy - 6);
    g.stroke();
  }
  if (look.kind === 'dg') {
    // a dangerous-goods diamond
    g.save();
    g.translate(W - 50, H - 30);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#ffffff';
    g.fillRect(-14, -14, 28, 28);
    g.fillStyle = PAL.flagRed;
    g.fillRect(-11, -11, 22, 22);
    g.restore();
  }
  return toTexture(c);
}

function paintTop(look: BoxLook): THREE.CanvasTexture {
  const [c, g] = canvas(128, 96);
  const base = look.kind === 'reefer' ? '#e4eaec' : look.color;
  g.fillStyle = shade(base, 0.08);
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = 'rgba(0,0,0,0.10)';
  for (let x = 8; x < 120; x += 12) g.fillRect(x, 6, 4, 84);
  g.fillStyle = shade(base, -0.25);
  g.fillRect(0, 0, 128, 5);
  g.fillRect(0, 91, 128, 5);
  g.fillRect(0, 0, 5, 96);
  g.fillRect(123, 0, 5, 96);
  // corner castings
  g.fillStyle = '#2a2d33';
  for (const [x, y] of [[0, 0], [116, 0], [0, 84], [116, 84]]) g.fillRect(x, y, 12, 12);
  return toTexture(c);
}

function paintEnd(look: BoxLook): THREE.CanvasTexture {
  const [c, g] = canvas(96, 96);
  const base = look.kind === 'reefer' ? '#e4eaec' : look.color;
  g.fillStyle = shade(base, -0.08);
  g.fillRect(0, 0, 96, 96);
  // door locking bars
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (const x of [22, 40, 56, 74]) g.fillRect(x, 6, 4, 84);
  g.fillStyle = shade(base, -0.3);
  g.fillRect(0, 0, 96, 6);
  g.fillRect(0, 90, 96, 6);
  return toTexture(c);
}

export function boxMaterials(look: BoxLook): THREE.Material[] {
  const key = `${look.color}|${look.weight}|${look.flag}|${look.kind ?? 'box'}|${look.seal ? 1 : 0}`;
  let mats = cache.get(key);
  if (!mats) {
    const side = new THREE.MeshStandardMaterial({ map: paintSide(look), roughness: 0.62, metalness: 0.05 });
    const top = new THREE.MeshStandardMaterial({ map: paintTop(look), roughness: 0.65 });
    const end = new THREE.MeshStandardMaterial({ map: paintEnd(look), roughness: 0.65 });
    const dark = new THREE.MeshStandardMaterial({ color: shade(look.color, -0.4), roughness: 0.8 });
    mats = [end, end, top, dark, side, side];
    cache.set(key, mats);
  }
  return mats;
}

export function makeBox(look: BoxLook): THREE.Mesh {
  const m = new THREE.Mesh(geometry(), boxMaterials(look));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
