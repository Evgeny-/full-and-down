import type { Ctx } from './paint';

/** International Code of Signals letter flags, drawn true to pattern (colour-blind safe by shape). */
export type FlagId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

const R = '#d62f2b';
const Y = '#f5c518';
const B = '#1e4fa3';
const W = '#f8f7f2';
const K = '#15181e';

function rect(g: Ctx, c: string, x: number, y: number, w: number, h: number): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function poly(g: Ctx, c: string, pts: number[]): void {
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

/** Draw flag `id` into the rectangle (swallowtails A and B are cut). */
export function drawFlag(g: Ctx, id: FlagId, x: number, y: number, w: number, h: number): void {
  g.save();
  g.translate(x, y);
  const hw = w / 2;
  const hh = h / 2;
  switch (id) {
    case 'A':
      poly(g, W, [0, 0, hw, 0, hw, h, 0, h]);
      poly(g, B, [hw, 0, w, 0, w * 0.72, hh, w, h, hw, h]);
      break;
    case 'B':
      poly(g, R, [0, 0, w, 0, w * 0.72, hh, w, h, 0, h]);
      break;
    case 'C':
      for (let i = 0; i < 5; i++) rect(g, [B, W, R, W, B][i], 0, (h * i) / 5, w, h / 5 + 0.5);
      break;
    case 'D':
      rect(g, Y, 0, 0, w, h);
      rect(g, B, 0, h / 4, w, h / 2);
      break;
    case 'E':
      rect(g, B, 0, 0, w, hh);
      rect(g, R, 0, hh, w, hh);
      break;
    case 'F':
      rect(g, W, 0, 0, w, h);
      poly(g, R, [hw, 0, w, hh, hw, h, 0, hh]);
      break;
    case 'G':
      for (let i = 0; i < 6; i++) rect(g, i % 2 ? B : Y, (w * i) / 6, 0, w / 6 + 0.5, h);
      break;
    case 'H':
      rect(g, W, 0, 0, hw, h);
      rect(g, R, hw, 0, hw, h);
      break;
    case 'I':
      rect(g, Y, 0, 0, w, h);
      g.fillStyle = K;
      g.beginPath();
      g.arc(hw, hh, h * 0.3, 0, Math.PI * 2);
      g.fill();
      break;
    case 'J':
      rect(g, B, 0, 0, w, h);
      rect(g, W, 0, h / 3, w, h / 3);
      break;
    case 'K':
      rect(g, Y, 0, 0, hw, h);
      rect(g, B, hw, 0, hw, h);
      break;
    case 'L':
      rect(g, Y, 0, 0, hw, hh);
      rect(g, K, hw, 0, hw, hh);
      rect(g, K, 0, hh, hw, hh);
      rect(g, Y, hw, hh, hw, hh);
      break;
    case 'M':
      rect(g, B, 0, 0, w, h);
      g.strokeStyle = W;
      g.lineWidth = h * 0.22;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, h);
      g.moveTo(w, 0);
      g.lineTo(0, h);
      g.stroke();
      break;
    case 'N':
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) rect(g, (i + j) % 2 ? W : B, (w * i) / 4, (h * j) / 4, w / 4 + 0.5, h / 4 + 0.5);
      break;
    case 'O':
      poly(g, R, [0, 0, w, 0, w, h]);
      poly(g, Y, [0, 0, w, h, 0, h]);
      break;
    case 'P':
      rect(g, B, 0, 0, w, h);
      rect(g, W, w / 3, h / 3, w / 3, h / 3);
      break;
    case 'Q':
      rect(g, Y, 0, 0, w, h);
      break;
    case 'R':
      rect(g, R, 0, 0, w, h);
      rect(g, Y, hw - h * 0.1, 0, h * 0.2, h);
      rect(g, Y, 0, hh - h * 0.1, w, h * 0.2);
      break;
    case 'S':
      rect(g, W, 0, 0, w, h);
      rect(g, B, w / 3, h / 3, w / 3, h / 3);
      break;
    case 'T':
      rect(g, R, 0, 0, w / 3, h);
      rect(g, W, w / 3, 0, w / 3, h);
      rect(g, B, (2 * w) / 3, 0, w / 3 + 0.5, h);
      break;
    case 'U':
      rect(g, R, 0, 0, hw, hh);
      rect(g, W, hw, 0, hw, hh);
      rect(g, W, 0, hh, hw, hh);
      rect(g, R, hw, hh, hw, hh);
      break;
    case 'V':
      rect(g, W, 0, 0, w, h);
      g.strokeStyle = R;
      g.lineWidth = h * 0.22;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, h);
      g.moveTo(w, 0);
      g.lineTo(0, h);
      g.stroke();
      break;
    case 'W':
      rect(g, B, 0, 0, w, h);
      rect(g, W, w / 6, h / 6, (w * 2) / 3, (h * 2) / 3);
      rect(g, R, w / 3, h / 3, w / 3, h / 3);
      break;
    case 'X':
      rect(g, W, 0, 0, w, h);
      rect(g, B, hw - h * 0.11, 0, h * 0.22, h);
      rect(g, B, 0, hh - h * 0.11, w, h * 0.22);
      break;
    case 'Y':
      rect(g, Y, 0, 0, w, h);
      g.save();
      g.beginPath();
      g.rect(0, 0, w, h);
      g.clip();
      g.strokeStyle = R;
      g.lineWidth = w / 10;
      for (let i = -5; i < 10; i++) {
        g.beginPath();
        g.moveTo((i * w) / 5, 0);
        g.lineTo((i * w) / 5 + h, h);
        g.stroke();
      }
      g.restore();
      break;
    case 'Z':
      poly(g, Y, [0, 0, w, 0, hw, hh]);
      poly(g, B, [w, 0, w, h, hw, hh]);
      poly(g, R, [0, h, w, h, hw, hh]);
      poly(g, K, [0, 0, hw, hh, 0, h]);
      break;
  }
  g.restore();
  g.save();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.5;
  if (id !== 'A' && id !== 'B') g.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  g.restore();
}

/** An SVG string of the flag (for DOM UI). */
export function flagSvg(id: FlagId, w = 30, h = 20): string {
  const c = document.createElement('canvas');
  c.width = w * 3;
  c.height = h * 3;
  drawFlag(c.getContext('2d')!, id, 0, 0, w * 3, h * 3);
  return `<img class="flag" src="${c.toDataURL()}" width="${w}" height="${h}" alt="">`;
}
