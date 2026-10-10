import * as THREE from 'three';
import { canvas, toTexture, FONT_NUM, grime, hexA } from '../paint';
import { PAL } from '../palette';
import { Rng } from '../../core/rng';

export interface HullPaintSpec {
  length: number;
  height: number;
  name: string;
  registry: string;
  deckY: number;
  lightY: number;
  markY: number;
}

export interface HullWaterUniforms {
  uWaterY: { value: number };
  uTime: { value: number };
}

/** The hull side: antifouling red up to the summer mark, navy topsides, draft numerals, the Plimsoll disc. */
export function paintHull({ length, height, name, registry, deckY, lightY, markY: summerY }: HullPaintSpec): THREE.CanvasTexture {
  const W = 2048;
  const H = Math.round((W / length) * height);
  const [c, g] = canvas(W, H);
  const rng = new Rng(7);
  const yOf = (hy: number) => H - (hy / height) * H; // hull height → canvas y
  const xOf = (u: number) => u * W; // 0..1 along the length (stern → bow)
  const markY = yOf(summerY);
  // topsides
  g.fillStyle = PAL.hullNavy;
  g.fillRect(0, 0, W, markY);
  // a white sheer line just under the deck edge
  g.fillStyle = PAL.white;
  g.fillRect(0, yOf(deckY) + 2, W, 5);
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
      const hy = lightY + ((summerY - lightY) * k) / steps;
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
      if (hy > deckY - 0.1) break;
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
  g.fillRect(cx - R * 1.35, yOf(deckY) + 10, R * 2.7, 6); // deck line above
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
  let size = Math.round(0.2 * px);
  g.font = `700 ${size}px ${FONT_NUM}`;
  const room = W * 0.2;
  while (g.measureText(name).width > room && size > 10) {
    size -= 2;
    g.font = `700 ${size}px ${FONT_NUM}`;
  }
  g.fillStyle = PAL.white;
  g.fillText(name, xOf(0.8), yOf(deckY - 0.2));
  g.font = `600 ${Math.round(0.12 * px)}px ${FONT_NUM}`;
  g.fillText(registry, xOf(0.11), yOf(deckY - 0.2));
  return toTexture(c);
}

/** A foam line where the water meets the hull, and a darker wet band just above it. */
export function addWaterline(mat: THREE.MeshStandardMaterial, waterUniforms: HullWaterUniforms): void {
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
