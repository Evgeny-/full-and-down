import * as THREE from 'three';
import { Rng } from '../core/rng';

export type Ctx = CanvasRenderingContext2D;

export const FONT_NUM = "'Oswald Variable', Oswald, 'Arial Narrow', sans-serif";
export const FONT_TEXT = "'Sofia Sans Variable', 'Sofia Sans', system-ui, sans-serif";

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function toTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color('#ffffff'), k);
  return '#' + c.getHexString();
}

/** Fine speckle and streak grime so painted steel never looks like flat plastic. */
export function grime(g: Ctx, rng: Rng, x: number, y: number, w: number, h: number, n: number, color: string, alpha: number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let i = 0; i < n; i++) {
    g.fillStyle = hexA(color, alpha * rng.range(0.3, 1));
    const px = x + rng.next() * w;
    const py = y + rng.next() * h;
    g.beginPath();
    g.arc(px, py, rng.range(0.5, 2.2), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export async function loadFonts(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`700 40px ${FONT_NUM}`),
    document.fonts.load(`600 40px ${FONT_NUM}`),
    document.fonts.load(`800 20px ${FONT_TEXT}`),
    document.fonts.load(`600 20px ${FONT_TEXT}`),
  ]).catch(() => undefined);
}
