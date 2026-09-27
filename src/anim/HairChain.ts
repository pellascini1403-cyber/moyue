import { Matrix4, Vector3 } from 'three';

export interface ChainCollider {
  /** Centre in the anchor's local space. */
  center: Vector3;
  radius: number;
}

const _t = new Vector3();
const _c = new Vector3();

/**
 * Long hair as a world-space verlet chain that remembers its styled shape:
 * every particle is pulled toward its rest position (given in head space),
 * strongly near the root and weakly toward the tip. Standing still, the hair
 * keeps its sculpted sweep; running, dashing and turning, inertia streams it
 * behind the character.
 */
export class HairChain {
  readonly n: number;
  readonly pos: Vector3[];
  private prev: Vector3[];
  private target: Vector3[];
  private segLen: number[] = [];
  /** Height of the ground under the character (world), or -Infinity. */
  groundY = -Infinity;
  gravity = -6.5;
  /** Per-60Hz-frame velocity retention at the root and at the tip. */
  dampRoot = 0.8;
  dampTip = 0.965;

  constructor(readonly rest: Vector3[], readonly stiffness: number[], readonly colliders: ChainCollider[] = [], readonly particleRadius = 0.05) {
    this.n = rest.length;
    this.pos = rest.map((p) => p.clone());
    this.prev = rest.map((p) => p.clone());
    this.target = rest.map((p) => p.clone());
    for (let i = 1; i < this.n; i++) this.segLen.push(rest[i].distanceTo(rest[i - 1]));
  }

  reset(anchor: Matrix4): void {
    for (let i = 0; i < this.n; i++) {
      this.pos[i].copy(this.rest[i]).applyMatrix4(anchor);
      this.prev[i].copy(this.pos[i]);
    }
  }

  /** Advance by dt. `wind` is an extra acceleration (m/s²), e.g. air drag. */
  update(dt: number, anchor: Matrix4, wind?: Vector3): void {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 20);
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    const f60 = h * 60;
    // scale of the anchor (squash & stretch) applies to segment lengths too
    const scale = Math.cbrt(Math.abs(anchor.determinant())) || 1;
    for (let i = 0; i < this.n; i++) this.target[i].copy(this.rest[i]).applyMatrix4(anchor);
    for (let s = 0; s < steps; s++) {
      for (let i = 1; i < this.n; i++) {
        const p = this.pos[i], q = this.prev[i];
        const u = i / (this.n - 1);
        const keep = Math.pow(this.dampRoot + (this.dampTip - this.dampRoot) * Math.sqrt(u), f60);
        const vx = (p.x - q.x) * keep, vy = (p.y - q.y) * keep, vz = (p.z - q.z) * keep;
        q.copy(p);
        p.x += vx + (wind?.x ?? 0) * h * h;
        p.y += vy + (this.gravity + (wind?.y ?? 0)) * h * h;
        p.z += vz + (wind?.z ?? 0) * h * h;
        // pull toward the styled shape (frame-rate independent)
        const k = 1 - Math.pow(1 - this.stiffness[i], f60);
        p.lerp(this.target[i], k);
      }
      for (let it = 0; it < 4; it++) {
        this.pos[0].copy(this.target[0]);
        for (let i = 1; i < this.n; i++) {
          const a = this.pos[i - 1], b = this.pos[i];
          _t.subVectors(b, a);
          const d = _t.length() || 1e-6;
          const want = this.segLen[i - 1] * scale;
          const diff = (d - want) / d;
          if (i === 1) b.addScaledVector(_t, -diff);
          else {
            a.addScaledVector(_t, diff * 0.3);
            b.addScaledVector(_t, -diff * 0.7);
          }
        }
        for (let i = 1; i < this.n; i++) this.collide(this.pos[i], anchor, scale);
      }
    }
  }

  private collide(p: Vector3, anchor: Matrix4, scale: number): void {
    for (const c of this.colliders) {
      _c.copy(c.center).applyMatrix4(anchor);
      const r = c.radius * scale + this.particleRadius;
      _t.subVectors(p, _c);
      const d = _t.length();
      if (d < r && d > 1e-6) p.copy(_c).addScaledVector(_t, r / d);
    }
    const floor = this.groundY + this.particleRadius * 0.5;
    if (p.y < floor) p.y = floor;
  }

  /** Total length of the chain as simulated (for tests). */
  length(): number {
    let l = 0;
    for (let i = 1; i < this.n; i++) l += this.pos[i].distanceTo(this.pos[i - 1]);
    return l;
  }
}
