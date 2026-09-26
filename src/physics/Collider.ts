import { Quaternion, Vector3 } from 'three';

export type ShapeKind = 'box' | 'cylinder';

export interface ColliderProps {
  /** Blocks the player/enemies. Non-solid colliders are triggers only. */
  solid?: boolean;
  /** Surfaces facing up can be stood on (still limited by slope). */
  walkable?: boolean;
  /** Wall cling / wall jump permitted on this surface. */
  climbable?: boolean;
  /** Contact damage (hazard). 0 = safe. */
  hazard?: number;
  /** Blocks the third-person camera. */
  camera?: boolean;
  /** Down-slashing onto this surface bounces the player (e.g. thorn lotus). */
  pogo?: boolean;
  /** Is a valid position to return to after a hazard respawn. */
  safe?: boolean;
  /** Blocks enemy movement only (invisible leash walls). */
  enemyOnly?: boolean;
  tag?: string;
}

let NEXT_ID = 1;

const _v = new Vector3();
const _l = new Vector3();

export interface Contact {
  normal: Vector3; // world-space normal pointing out of the collider
  depth: number; // penetration depth (positive)
  point: Vector3;
}

/**
 * Convex collision primitive. Boxes are oriented (arbitrary rotation; ramps are
 * rotated boxes). Cylinders are always vertical.
 */
export class Collider {
  readonly id = NEXT_ID++;
  kind: ShapeKind;
  readonly center = new Vector3();
  readonly half = new Vector3(0.5, 0.5, 0.5);
  readonly quat = new Quaternion();
  readonly invQuat = new Quaternion();
  axisAligned = true;
  radius = 0.5;
  halfHeight = 0.5;
  readonly velocity = new Vector3();
  readonly aabbMin = new Vector3();
  readonly aabbMax = new Vector3();
  enabled = true;
  dynamic = false;
  solid: boolean;
  walkable: boolean;
  climbable: boolean;
  hazard: number;
  camera: boolean;
  pogo: boolean;
  safe: boolean;
  enemyOnly: boolean;
  tag: string;
  /** Arbitrary owner (moving platform, breakable wall, ...). */
  owner: unknown = null;
  /** Spatial hash bookkeeping */
  queryStamp = 0;

  constructor(kind: ShapeKind, props: ColliderProps = {}) {
    this.kind = kind;
    this.solid = props.solid ?? true;
    this.walkable = props.walkable ?? true;
    this.climbable = props.climbable ?? false;
    this.hazard = props.hazard ?? 0;
    this.camera = props.camera ?? true;
    this.pogo = props.pogo ?? false;
    this.safe = props.safe ?? (this.hazard === 0);
    this.enemyOnly = props.enemyOnly ?? false;
    this.tag = props.tag ?? '';
  }

  static box(center: Vector3, half: Vector3, quat?: Quaternion, props?: ColliderProps): Collider {
    const c = new Collider('box', props);
    c.center.copy(center);
    c.half.copy(half);
    if (quat) c.setRotation(quat);
    c.updateAABB();
    return c;
  }

  static cylinder(center: Vector3, radius: number, halfHeight: number, props?: ColliderProps): Collider {
    const c = new Collider('cylinder', props);
    c.center.copy(center);
    c.radius = radius;
    c.halfHeight = halfHeight;
    c.updateAABB();
    return c;
  }

  setRotation(q: Quaternion): void {
    this.quat.copy(q).normalize();
    this.invQuat.copy(this.quat).invert();
    this.axisAligned =
      Math.abs(this.quat.x) < 1e-6 && Math.abs(this.quat.y) < 1e-6 && Math.abs(this.quat.z) < 1e-6;
  }

  /** True when the box has no pitch/roll (only yaw) – its top face is flat. */
  get upright(): boolean {
    if (this.kind === 'cylinder') return true;
    return Math.abs(this.quat.x) < 1e-5 && Math.abs(this.quat.z) < 1e-5;
  }

  /** Height of the top face (valid for upright shapes). */
  get top(): number {
    return this.center.y + (this.kind === 'box' ? this.half.y : this.halfHeight);
  }

  updateAABB(): void {
    if (this.kind === 'cylinder') {
      this.aabbMin.set(this.center.x - this.radius, this.center.y - this.halfHeight, this.center.z - this.radius);
      this.aabbMax.set(this.center.x + this.radius, this.center.y + this.halfHeight, this.center.z + this.radius);
      return;
    }
    if (this.axisAligned) {
      this.aabbMin.copy(this.center).sub(this.half);
      this.aabbMax.copy(this.center).add(this.half);
      return;
    }
    // Extent of rotated box = sum of |axis_i| * half_i
    const e = new Vector3();
    const ax = new Vector3(1, 0, 0).applyQuaternion(this.quat);
    const ay = new Vector3(0, 1, 0).applyQuaternion(this.quat);
    const az = new Vector3(0, 0, 1).applyQuaternion(this.quat);
    e.x = Math.abs(ax.x) * this.half.x + Math.abs(ay.x) * this.half.y + Math.abs(az.x) * this.half.z;
    e.y = Math.abs(ax.y) * this.half.x + Math.abs(ay.y) * this.half.y + Math.abs(az.y) * this.half.z;
    e.z = Math.abs(ax.z) * this.half.x + Math.abs(ay.z) * this.half.y + Math.abs(az.z) * this.half.z;
    this.aabbMin.copy(this.center).sub(e);
    this.aabbMax.copy(this.center).add(e);
  }

  /** Closest point on the shape to `p` (for points inside, returns p). */
  closestPoint(p: Vector3, out: Vector3): Vector3 {
    if (this.kind === 'cylinder') {
      const dx = p.x - this.center.x;
      const dz = p.z - this.center.z;
      const dy = Math.max(-this.halfHeight, Math.min(this.halfHeight, p.y - this.center.y));
      const h = Math.hypot(dx, dz);
      const s = h > this.radius ? this.radius / h : 1;
      return out.set(this.center.x + dx * s, this.center.y + dy, this.center.z + dz * s);
    }
    _l.copy(p).sub(this.center);
    if (!this.axisAligned) _l.applyQuaternion(this.invQuat);
    _l.set(
      Math.max(-this.half.x, Math.min(this.half.x, _l.x)),
      Math.max(-this.half.y, Math.min(this.half.y, _l.y)),
      Math.max(-this.half.z, Math.min(this.half.z, _l.z)),
    );
    if (!this.axisAligned) _l.applyQuaternion(this.quat);
    return out.copy(_l).add(this.center);
  }

  /**
   * Sphere overlap test. Writes contact (normal points from collider to sphere).
   * Returns false when not overlapping.
   */
  sphereContact(p: Vector3, r: number, out: Contact): boolean {
    if (this.kind === 'cylinder') return this.sphereContactCylinder(p, r, out);
    _l.copy(p).sub(this.center);
    if (!this.axisAligned) _l.applyQuaternion(this.invQuat);
    const hx = this.half.x, hy = this.half.y, hz = this.half.z;
    const ax = Math.abs(_l.x), ay = Math.abs(_l.y), az = Math.abs(_l.z);
    if (ax <= hx && ay <= hy && az <= hz) {
      // Centre inside: push out through the nearest face.
      const dx = hx - ax, dy = hy - ay, dz = hz - az;
      if (dy <= dx && dy <= dz) {
        out.normal.set(0, Math.sign(_l.y) || 1, 0);
        out.depth = dy + r;
      } else if (dx <= dz) {
        out.normal.set(Math.sign(_l.x) || 1, 0, 0);
        out.depth = dx + r;
      } else {
        out.normal.set(0, 0, Math.sign(_l.z) || 1);
        out.depth = dz + r;
      }
      if (!this.axisAligned) out.normal.applyQuaternion(this.quat);
      out.point.copy(p);
      return true;
    }
    const cx = Math.max(-hx, Math.min(hx, _l.x));
    const cy = Math.max(-hy, Math.min(hy, _l.y));
    const cz = Math.max(-hz, Math.min(hz, _l.z));
    const ddx = _l.x - cx, ddy = _l.y - cy, ddz = _l.z - cz;
    const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    out.normal.set(ddx / d, ddy / d, ddz / d);
    out.depth = r - d;
    out.point.set(cx, cy, cz);
    if (!this.axisAligned) {
      out.normal.applyQuaternion(this.quat);
      out.point.applyQuaternion(this.quat);
    }
    out.point.add(this.center);
    return true;
  }

  private sphereContactCylinder(p: Vector3, r: number, out: Contact): boolean {
    const dx = p.x - this.center.x;
    const dy = p.y - this.center.y;
    const dz = p.z - this.center.z;
    const h = Math.hypot(dx, dz);
    const R = this.radius, H = this.halfHeight;
    if (h <= R && Math.abs(dy) <= H) {
      const radial = R - h;
      const vert = H - Math.abs(dy);
      if (vert < radial) {
        out.normal.set(0, Math.sign(dy) || 1, 0);
        out.depth = vert + r;
      } else {
        if (h > 1e-6) out.normal.set(dx / h, 0, dz / h);
        else out.normal.set(1, 0, 0);
        out.depth = radial + r;
      }
      out.point.copy(p);
      return true;
    }
    const s = h > R ? R / h : 1;
    const cx = dx * s, cz = dz * s;
    const cy = Math.max(-H, Math.min(H, dy));
    const ddx = dx - cx, ddy = dy - cy, ddz = dz - cz;
    const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    out.normal.set(ddx / d, ddy / d, ddz / d);
    out.depth = r - d;
    out.point.set(this.center.x + cx, this.center.y + cy, this.center.z + cz);
    return true;
  }

  /** Ray intersection distance or -1. `dir` must be normalised. */
  raycast(origin: Vector3, dir: Vector3, maxDist: number): number {
    if (this.kind === 'cylinder') return this.raycastCylinder(origin, dir, maxDist);
    const o = _l.copy(origin).sub(this.center);
    const d = _v.copy(dir);
    if (!this.axisAligned) {
      o.applyQuaternion(this.invQuat);
      d.applyQuaternion(this.invQuat);
    }
    let tmin = -Infinity, tmax = Infinity;
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z], ha = [this.half.x, this.half.y, this.half.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(da[i]) < 1e-9) {
        if (oa[i] < -ha[i] || oa[i] > ha[i]) return -1;
      } else {
        let t1 = (-ha[i] - oa[i]) / da[i];
        let t2 = (ha[i] - oa[i]) / da[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    if (tmax < 0) return -1;
    const t = tmin >= 0 ? tmin : 0;
    return t <= maxDist ? t : -1;
  }

  private raycastCylinder(origin: Vector3, dir: Vector3, maxDist: number): number {
    const ox = origin.x - this.center.x, oy = origin.y - this.center.y, oz = origin.z - this.center.z;
    const R = this.radius, H = this.halfHeight;
    let best = Infinity;
    // Side
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a > 1e-9) {
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - R * R;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
          if (t >= 0 && t < best) {
            const y = oy + dir.y * t;
            if (y >= -H && y <= H) best = t;
          }
        }
      }
    }
    // Caps
    if (Math.abs(dir.y) > 1e-9) {
      for (const cy of [H, -H]) {
        const t = (cy - oy) / dir.y;
        if (t >= 0 && t < best) {
          const x = ox + dir.x * t, z = oz + dir.z * t;
          if (x * x + z * z <= R * R) best = t;
        }
      }
    }
    // Origin inside
    if (ox * ox + oz * oz <= R * R && Math.abs(oy) <= H) best = 0;
    return best <= maxDist ? best : -1;
  }

  /** Surface normal at a world point on/near the surface (used for ray hits). */
  normalAt(p: Vector3, out: Vector3): Vector3 {
    if (this.kind === 'cylinder') {
      const dy = p.y - this.center.y;
      if (Math.abs(Math.abs(dy) - this.halfHeight) < 0.02) return out.set(0, Math.sign(dy), 0);
      return out.set(p.x - this.center.x, 0, p.z - this.center.z).normalize();
    }
    _l.copy(p).sub(this.center);
    if (!this.axisAligned) _l.applyQuaternion(this.invQuat);
    const rx = Math.abs(_l.x) / this.half.x;
    const ry = Math.abs(_l.y) / this.half.y;
    const rz = Math.abs(_l.z) / this.half.z;
    if (ry >= rx && ry >= rz) out.set(0, Math.sign(_l.y), 0);
    else if (rx >= rz) out.set(Math.sign(_l.x), 0, 0);
    else out.set(0, 0, Math.sign(_l.z));
    if (!this.axisAligned) out.applyQuaternion(this.quat);
    return out;
  }

  /** Is the XZ projection of point p within the top face (with margin)? */
  containsXZ(p: Vector3, margin = 0): boolean {
    if (this.kind === 'cylinder') {
      return Math.hypot(p.x - this.center.x, p.z - this.center.z) <= this.radius + margin;
    }
    _l.copy(p).sub(this.center);
    if (!this.axisAligned) _l.applyQuaternion(this.invQuat);
    return Math.abs(_l.x) <= this.half.x + margin && Math.abs(_l.z) <= this.half.z + margin;
  }
}
