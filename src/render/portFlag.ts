import { drawFlag, flagSvg, type FlagId } from './flags';
import { drawNation, nationImg, nationOfPort } from './nations';
import type { Port } from '../core/types';

/** A port's flag: its country's national flag, or its code flag when the country is unknown. */
export function drawPortFlag(g: CanvasRenderingContext2D, port: Port, x: number, y: number, w: number, h: number): void {
  const n = nationOfPort(port.name);
  if (n) drawNation(g, n, x, y, w, h);
  else drawFlag(g, port.flag as FlagId, x, y, w, h);
}

export function portFlagImg(port: Port, w = 24, h = 16): string {
  const n = nationOfPort(port.name);
  return n ? nationImg(n, w, h) : flagSvg(port.flag as FlagId, w, h);
}
