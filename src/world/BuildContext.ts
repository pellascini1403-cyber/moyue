import { BufferGeometry, Color, Euler, Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { Batcher, AddOptions } from '../art/geo/Batcher';
import { WorldMatKey } from '../art/materials';
import { Collider, ColliderProps } from '../physics/Collider';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Rng } from '../core/rng';
import { boxG, mat } from '../art/geo/basic';

export interface LightAnchor {
  pos: Vector3;
  color: Color;
  intensity: number;
  distance: number;
  flicker: number;
  phase: number;
}

export interface GlowSpec {
  pos: Vector3;
  color: Color;
  size: number;
  flicker: number;
}

export interface Animated {
  update(t: number, dt: number): void;
}

/** Everything a region build step produces. */
export class BuildContext {
  readonly batch = new Batcher();
  readonly colliders: Collider[] = [];
  readonly lights: LightAnchor[] = [];
  readonly glows: GlowSpec[] = [];
  readonly animated: Animated[] = [];
  readonly group = new Group();
  readonly rng: Rng;

  constructor(public physics: PhysicsWorld, seed: number, public regionId: string) {
    this.rng = new Rng(seed);
  }

  addCollider(c: Collider): Collider {
    this.colliders.push(c);
    this.physics.add(c);
    return c;
  }

  light(pos: Vector3, color: Color | number, intensity = 6, distance = 14, flicker = 0.08): void {
    this.lights.push({ pos: pos.clone(), color: new Color(color), intensity, distance, flicker, phase: this.rng.range(0, 100) });
  }

  glow(pos: Vector3, color: Color | number, size: number, flicker = 0.05): void {
    this.glows.push({ pos: pos.clone(), color: new Color(color), size, flicker });
  }

  object(o: Object3D): void {
    this.group.add(o);
  }

  place(x: number, y: number, z: number, rotY = 0): Placer {
    return new Placer(this, x, y, z, rotY);
  }
}

const _q = new Quaternion();
const _e = new Euler();

/** Local coordinate frame for composing structures (translation + yaw). */
export class Placer {
  readonly T: Matrix4;
  readonly rotY: number;
  readonly origin: Vector3;

  constructor(public ctx: BuildContext, x: number, y: number, z: number, rotY = 0) {
    this.T = new Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    this.rotY = rotY;
    this.origin = new Vector3(x, y, z);
  }

  sub(lx: number, ly: number, lz: number, rotY = 0): Placer {
    const p = this.p(lx, ly, lz);
    return new Placer(this.ctx, p.x, p.y, p.z, this.rotY + rotY);
  }

  m(lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
    return this.T.clone().multiply(mat(lx, ly, lz, rx, ry, rz, sx, sy, sz));
  }

  p(lx: number, ly: number, lz: number): Vector3 {
    return new Vector3(lx, ly, lz).applyMatrix4(this.T);
  }

  add(key: WorldMatKey, g: BufferGeometry, lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, opts?: AddOptions): void {
    this.ctx.batch.add(key, g, this.m(lx, ly, lz, rx, ry, rz, sx, sy, sz), opts);
  }

  /** Box centred at local (lx,ly,lz). Optionally also a collider. */
  box(key: WorldMatKey, lx: number, ly: number, lz: number, w: number, h: number, d: number,
    opts: AddOptions & { collide?: ColliderProps | boolean; ry?: number; rx?: number; rz?: number } = {}): Collider | null {
    const ry = opts.ry ?? 0, rx = opts.rx ?? 0, rz = opts.rz ?? 0;
    this.ctx.batch.add(key, boxG(), this.m(lx, ly, lz, rx, ry, rz, w, h, d), opts);
    if (opts.collide) {
      return this.collider(lx, ly, lz, w / 2, h / 2, d / 2, opts.collide === true ? {} : opts.collide, ry, rx, rz);
    }
    return null;
  }

  collider(lx: number, ly: number, lz: number, hx: number, hy: number, hz: number, props: ColliderProps = {},
    ry = 0, rx = 0, rz = 0): Collider {
    const c = this.p(lx, ly, lz);
    _e.set(rx, this.rotY + ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    const col = Collider.box(c, new Vector3(hx, hy, hz), _q, props);
    return this.ctx.addCollider(col);
  }

  cylCollider(lx: number, ly: number, lz: number, r: number, hh: number, props: ColliderProps = {}): Collider {
    const c = this.p(lx, ly, lz);
    return this.ctx.addCollider(Collider.cylinder(c, r, hh, props));
  }

  light(lx: number, ly: number, lz: number, color: Color | number, intensity?: number, distance?: number, flicker?: number): void {
    this.ctx.light(this.p(lx, ly, lz), color, intensity, distance, flicker);
  }

  glow(lx: number, ly: number, lz: number, color: Color | number, size: number, flicker?: number): void {
    this.ctx.glow(this.p(lx, ly, lz), color, size, flicker);
  }
}
