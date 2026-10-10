import { Part, PortKit, type Col, type V3 } from './kit';

/** Shallow masonry/timber reveals. The glass keeps its original plane and night-light material. */
export function windowOpening(
  k: PortKit,
  panePart: Part,
  face: 'front' | 'right',
  centre: V3,
  w: number,
  h: number,
  pane: Col,
  trim: Col,
  sill = true,
): void {
  const [x, y, z] = centre;
  const edge = Math.min(0.012, w * 0.14, h * 0.08);
  const iw = w / 2;
  const ow = iw + edge;
  const depth = 0.009;
  const point = (u: number, v: number, d: number): V3 => face === 'front'
    ? [x + u, y + v, z + d]
    : [x + d, y + v, z - u];
  const rim = (a: V3, b: V3, c: V3, d: V3) => k.solid.quad(a, b, c, d, trim);
  // Four sloped strips keep the opening dark inside a projecting frame, using only eight triangles.
  rim(point(-ow, -edge, depth), point(ow, -edge, depth), point(iw, 0, 0), point(-iw, 0, 0));
  rim(point(-iw, h, 0), point(iw, h, 0), point(ow, h + edge, depth), point(-ow, h + edge, depth));
  rim(point(-ow, -edge, depth), point(-iw, 0, 0), point(-iw, h, 0), point(-ow, h + edge, depth));
  rim(point(iw, 0, 0), point(ow, -edge, depth), point(ow, h + edge, depth), point(iw, h, 0));
  panePart.quad(point(-iw, 0, 0), point(iw, 0, 0), point(iw, h, 0), point(-iw, h, 0), pane);
  if (!sill) return;
  if (face === 'front') k.solid.boxV(x, y - edge - 0.006, z + 0.011, w + edge * 3, 0.012, 0.026, trim);
  else k.solid.boxV(x + 0.011, y - edge - 0.006, z, 0.026, 0.012, w + edge * 3, trim);
}
