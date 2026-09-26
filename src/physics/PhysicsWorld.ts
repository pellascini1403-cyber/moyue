import { Vector3 } from 'three';
import { Collider, Contact } from './Collider';

const CELL = 6;
const MAX_CELLS_PER_COLLIDER = 400;

export interface RayHit {
  collider: Collider;
  distance: number;
  point: Vector3;
  normal: Vector3;
}

export type ColliderFilter = (c: Collider) => boolean;

function key(ix: number, iy: number, iz: number): number {
  // Pack into a safe integer. Supports roughly ±1000 cells per axis.
  return ((ix + 1024) * 2048 + (iy + 1024)) * 2048 + (iz + 1024);
}

/**
 * Static colliders live in a uniform spatial hash; dynamic colliders (moving
 * platforms, gates, breakables) are kept in a flat list and always tested.
 */
export class PhysicsWorld {
  private grid = new Map<number, Collider[]>();
  private large: Collider[] = [];
  readonly dynamic: Collider[] = [];
  readonly all: Collider[] = [];
  private stamp = 1;

  add(c: Collider): Collider {
    this.all.push(c);
    if (c.dynamic) {
      this.dynamic.push(c);
      return c;
    }
    c.updateAABB();
    const x0 = Math.floor(c.aabbMin.x / CELL), x1 = Math.floor(c.aabbMax.x / CELL);
    const y0 = Math.floor(c.aabbMin.y / CELL), y1 = Math.floor(c.aabbMax.y / CELL);
    const z0 = Math.floor(c.aabbMin.z / CELL), z1 = Math.floor(c.aabbMax.z / CELL);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (count > MAX_CELLS_PER_COLLIDER) {
      this.large.push(c);
      return c;
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = key(x, y, z);
          let cell = this.grid.get(k);
          if (!cell) this.grid.set(k, (cell = []));
          cell.push(c);
        }
    return c;
  }

  addDynamic(c: Collider): Collider {
    c.dynamic = true;
    return this.add(c);
  }

  remove(c: Collider): void {
    const rm = (arr: Collider[]) => {
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    };
    rm(this.all);
    if (c.dynamic) rm(this.dynamic);
    else {
      rm(this.large);
      for (const cell of this.grid.values()) rm(cell);
    }
  }

  clear(): void {
    this.grid.clear();
    this.large.length = 0;
    this.dynamic.length = 0;
    this.all.length = 0;
  }

  /** Collect colliders whose AABB overlaps the query box. */
  queryAABB(min: Vector3, max: Vector3, out: Collider[], filter?: ColliderFilter): Collider[] {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = Math.floor(min.x / CELL), x1 = Math.floor(max.x / CELL);
    const y0 = Math.floor(min.y / CELL), y1 = Math.floor(max.y / CELL);
    const z0 = Math.floor(min.z / CELL), z1 = Math.floor(max.z / CELL);
    const test = (c: Collider) => {
      if (c.queryStamp === s || !c.enabled) return;
      c.queryStamp = s;
      if (c.aabbMax.x < min.x || c.aabbMin.x > max.x) return;
      if (c.aabbMax.y < min.y || c.aabbMin.y > max.y) return;
      if (c.aabbMax.z < min.z || c.aabbMin.z > max.z) return;
      if (filter && !filter(c)) return;
      out.push(c);
    };
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const cell = this.grid.get(key(x, y, z));
          if (cell) for (const c of cell) test(c);
        }
    for (const c of this.large) test(c);
    for (const c of this.dynamic) test(c);
    return out;
  }

  private _qmin = new Vector3();
  private _qmax = new Vector3();
  private _list: Collider[] = [];

  querySphere(center: Vector3, r: number, out: Collider[], filter?: ColliderFilter): Collider[] {
    this._qmin.set(center.x - r, center.y - r, center.z - r);
    this._qmax.set(center.x + r, center.y + r, center.z + r);
    return this.queryAABB(this._qmin, this._qmax, out, filter);
  }

  private _contact: Contact = { normal: new Vector3(), depth: 0, point: new Vector3() };

  /** Returns true if a sphere overlaps any solid collider. */
  overlapSphere(center: Vector3, r: number, filter?: ColliderFilter): boolean {
    const list = this.querySphere(center, r, this._list, filter);
    for (const c of list) {
      if (!c.solid) continue;
      if (c.sphereContact(center, r, this._contact)) return true;
    }
    return false;
  }

  private _hitNormal = new Vector3();

  raycast(origin: Vector3, dir: Vector3, maxDist: number, filter?: ColliderFilter, out?: RayHit): RayHit | null {
    const ex = dir.x * maxDist, ey = dir.y * maxDist, ez = dir.z * maxDist;
    this._qmin.set(Math.min(origin.x, origin.x + ex), Math.min(origin.y, origin.y + ey), Math.min(origin.z, origin.z + ez));
    this._qmax.set(Math.max(origin.x, origin.x + ex), Math.max(origin.y, origin.y + ey), Math.max(origin.z, origin.z + ez));
    const list = this.queryAABB(this._qmin, this._qmax, this._list, filter);
    let best = -1;
    let bestC: Collider | null = null;
    for (const c of list) {
      if (!c.solid) continue;
      const t = c.raycast(origin, dir, maxDist);
      if (t >= 0 && (best < 0 || t < best)) {
        best = t;
        bestC = c;
      }
    }
    if (!bestC) return null;
    const hit = out ?? { collider: bestC, distance: 0, point: new Vector3(), normal: new Vector3() };
    hit.collider = bestC;
    hit.distance = best;
    hit.point.copy(dir).multiplyScalar(best).add(origin);
    bestC.normalAt(hit.point, this._hitNormal);
    hit.normal.copy(this._hitNormal);
    return hit;
  }

  /**
   * Conservative sphere cast: marches a sphere along the ray. Returns the
   * furthest safe distance (== maxDist when unobstructed).
   */
  sphereCast(origin: Vector3, dir: Vector3, r: number, maxDist: number, filter?: ColliderFilter): number {
    const step = Math.max(0.05, r * 0.5);
    const p = new Vector3();
    let safe = 0;
    for (let t = 0; t <= maxDist + 1e-6; t += step) {
      p.copy(dir).multiplyScalar(Math.min(t, maxDist)).add(origin);
      if (this.overlapSphere(p, r, filter)) return safe;
      safe = Math.min(t, maxDist);
    }
    return maxDist;
  }

  hasLineOfSight(a: Vector3, b: Vector3, filter?: ColliderFilter): boolean {
    const d = new Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    return this.raycast(a, d, len - 0.05, filter) === null;
  }
}

export const cameraFilter: ColliderFilter = (c) => c.camera && !c.enemyOnly;
export const playerFilter: ColliderFilter = (c) => !c.enemyOnly;
