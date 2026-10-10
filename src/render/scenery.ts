import * as THREE from 'three';
import { Backdrop } from './harbour';

/** Each port's own far shore. Falls back to the generic harbour backdrop. */
export function buildScenery(portName: string, width: number): THREE.Group {
  void portName;
  return new Backdrop(width).group;
}
