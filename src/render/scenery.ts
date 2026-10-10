import * as THREE from 'three';
import { buildPortScene } from './ports';

/**
 * Each port's own far shore: breakwater with lighthouse, hills, a regional town, a landmark for well-known
 * ports and the national flag on a pole (see ./ports). `userData.update(t)` of the returned group waves the
 * flag and spins the wind-turbine rotors: GameView calls it every frame. Free it with `disposePortScene`.
 */
export function buildScenery(portName: string, width: number, country?: string): THREE.Group {
  return buildPortScene(portName, width, country);
}
