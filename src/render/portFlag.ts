import { drawFlag, flagSvg, type FlagId } from './flags';
import { drawNation, nationImg, nationOfPort, NATIONS, type Nation } from './nations';
import type { Port } from '../core/types';

/** A port's nation: its UN/LOCODE country when the level gives one, else looked up by name. */
export function portNation(port: { name: string; country?: string }): Nation | null {
  if (port.country && (NATIONS as readonly string[]).includes(port.country)) return port.country as Nation;
  return nationOfPort(port.name);
}

/** A port's flag: its country's national flag, or its code flag when the country is unknown. */
export function drawPortFlag(g: CanvasRenderingContext2D, port: Port, x: number, y: number, w: number, h: number): void {
  const n = portNation(port);
  if (n) drawNation(g, n, x, y, w, h);
  else drawFlag(g, port.flag as FlagId, x, y, w, h);
}

export function portFlagImg(port: Port, w = 24, h = 16): string {
  const n = portNation(port);
  return n ? nationImg(n, w, h) : flagSvg(port.flag as FlagId, w, h);
}
