import { Euler, Object3D, Quaternion, Vector3 } from 'three';

export interface JointPose {
  x?: number;
  y?: number;
  z?: number;
}
export type Pose = Record<string, JointPose>;

const _e = new Euler();
const _q = new Quaternion();

/**
 * Procedural pose rig: named joints with rest orientations. Each frame a target
 * pose (euler offsets from rest) is computed and the current pose slerps toward
 * it — fast for attacks, softer for locomotion — giving smooth, responsive
 * transitions without authored animation clips.
 */
export class Rig {
  readonly joints = new Map<string, Object3D>();
  private rest = new Map<string, Quaternion>();
  private restPos = new Map<string, Vector3>();
  private posOffset = new Map<string, Vector3>();

  /** Register a joint. Its current position and rotation become its rest pose, so place it first. */
  add(name: string, j: Object3D): Object3D {
    j.name = name;
    this.joints.set(name, j);
    this.rest.set(name, j.quaternion.clone());
    this.restPos.set(name, j.position.clone());
    return j;
  }

  get(name: string): Object3D {
    const j = this.joints.get(name);
    if (!j) throw new Error(`joint ${name}`);
    return j;
  }

  /** Blend toward `pose` with rate `lambda` (1/s). Joints in `skip` are left alone (driven by IK). */
  apply(pose: Pose, lambda: number, dt: number, skip?: ReadonlySet<string>): void {
    const t = 1 - Math.exp(-lambda * dt);
    for (const [name, j] of this.joints) {
      if (skip?.has(name)) continue;
      const p = pose[name];
      const rest = this.rest.get(name)!;
      if (p) {
        _e.set(p.x ?? 0, p.y ?? 0, p.z ?? 0, 'YXZ');
        _q.setFromEuler(_e).premultiply(rest);
      } else _q.copy(rest);
      j.quaternion.slerp(_q, t);
    }
  }

  /** Offset a joint's position relative to rest (e.g. hip bob). */
  offset(name: string, x: number, y: number, z: number, lambda: number, dt: number): void {
    const j = this.joints.get(name);
    if (!j) return;
    let o = this.posOffset.get(name);
    if (!o) this.posOffset.set(name, (o = new Vector3()));
    const t = 1 - Math.exp(-lambda * dt);
    o.x += (x - o.x) * t;
    o.y += (y - o.y) * t;
    o.z += (z - o.z) * t;
    j.position.copy(this.restPos.get(name)!).add(o);
  }

  snap(pose: Pose): void {
    this.apply(pose, 1e6, 1);
  }
}

/** Utility: sample a keyed curve [(t, v)...] with smoothstep interpolation. */
export function curve(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}
