import { Quaternion, Vector3, Euler } from 'three';
import { Collider, ColliderProps } from '../src/physics/Collider';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { PlayerController, PlayerFrameInput, emptyInput } from '../src/player/PlayerController';

export const DT = 1 / 60;

export function box(world: PhysicsWorld, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number,
  props?: ColliderProps, rot?: { x?: number; y?: number; z?: number }): Collider {
  const q = rot ? new Quaternion().setFromEuler(new Euler(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0)) : undefined;
  return world.add(Collider.box(new Vector3(cx, cy, cz), new Vector3(hx, hy, hz), q, props));
}

/** Flat floor whose top is at y = 0. */
export function floorWorld(size = 100): PhysicsWorld {
  const w = new PhysicsWorld();
  box(w, 0, -0.5, 0, size, 0.5, size);
  return w;
}

export function settle(pc: PlayerController, world: PhysicsWorld, frames = 30): void {
  for (let i = 0; i < frames; i++) pc.update(DT, emptyInput(), world);
}

export function run(pc: PlayerController, world: PhysicsWorld, frames: number,
  fn: (frame: number) => Partial<PlayerFrameInput>, onFrame?: (f: number) => void): void {
  for (let i = 0; i < frames; i++) {
    const inp = { ...emptyInput(), ...fn(i) };
    pc.update(DT, inp, world);
    onFrame?.(i);
  }
}
