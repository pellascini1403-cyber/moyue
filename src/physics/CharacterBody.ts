import { Vector3 } from 'three';
import { Collider, Contact } from './Collider';
import { ColliderFilter, PhysicsWorld } from './PhysicsWorld';

const _c: Contact = { normal: new Vector3(), depth: 0, point: new Vector3() };
const _center = new Vector3();
const _list: Collider[] = [];
const _save = new Vector3();
const _saveVel = new Vector3();

/**
 * Kinematic character: a vertical capsule approximated by three stacked
 * spheres, resolved against oriented boxes and cylinders. Ground contacts are
 * resolved vertically so walkable slopes never make the character drift.
 */
export class CharacterBody {
  readonly position = new Vector3(); // feet
  readonly velocity = new Vector3();
  radius: number;
  height: number;
  maxSlopeCos = Math.cos((52 * Math.PI) / 180);
  stepHeight = 0.36;
  snapDistance = 0.38;
  filter?: ColliderFilter;

  grounded = false;
  wasGrounded = false;
  readonly groundNormal = new Vector3(0, 1, 0);
  groundCollider: Collider | null = null;
  touchingWall = false;
  readonly wallNormal = new Vector3();
  wallCollider: Collider | null = null;
  hitCeiling = false;
  hazard: Collider | null = null;
  /** Fastest horizontal speed into a wall removed during the last move (impacts). */
  wallHitSpeed = 0;
  /** Standing on top of a non-walkable surface (roofs): the controller slides us off. */
  slideFrom: Collider | null = null;
  readonly lastSafe = new Vector3();
  hasSafe = false;
  /** Displacement applied this step from a moving platform. */
  readonly carried = new Vector3();

  private offsets: number[];

  constructor(radius = 0.3, height = 1.0) {
    this.radius = radius;
    this.height = height;
    this.offsets = [radius, height * 0.5, height - radius];
  }

  setShape(radius: number, height: number): void {
    this.radius = radius;
    this.height = height;
    this.offsets = [radius, height * 0.5, height - radius];
  }

  teleport(p: Vector3): void {
    this.position.copy(p);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.wasGrounded = false;
    this.groundCollider = null;
  }

  /**
   * Integrate velocity and resolve collisions.
   * @param snap keep the body glued to the ground when walking down slopes/steps
   */
  move(world: PhysicsWorld, dt: number, snap: boolean): void {
    this.wasGrounded = this.grounded;
    this.carried.set(0, 0, 0);
    // Moving platform carry.
    if (this.grounded && this.groundCollider && this.groundCollider.dynamic) {
      this.carried.copy(this.groundCollider.velocity).multiplyScalar(dt);
      this.position.add(this.carried);
    }
    const prevGroundCollider = this.groundCollider;
    this.grounded = false;
    this.touchingWall = false;
    this.hitCeiling = false;
    this.hazard = null;
    this.slideFrom = null;
    this.wallHitSpeed = 0;
    this.groundCollider = null;

    const dx = this.velocity.x * dt, dy = this.velocity.y * dt, dz = this.velocity.z * dt;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(1, Math.ceil(dist / (this.radius * 0.5)));
    for (let i = 0; i < steps; i++) {
      this.position.x += dx / steps;
      this.position.y += dy / steps;
      this.position.z += dz / steps;
      this.resolve(world);
    }

    if (!this.grounded && snap && this.wasGrounded) {
      // Try to stay attached to the ground (downhill, down stairs, platform edges).
      _save.copy(this.position);
      _saveVel.copy(this.velocity);
      const wallBefore = this.touchingWall;
      this.position.y -= this.snapDistance;
      this.resolve(world);
      if (!this.grounded) {
        this.position.copy(_save);
        this.velocity.copy(_saveVel);
        this.touchingWall = wallBefore;
      }
    }

    if (!this.grounded && this.velocity.y <= 0.01) {
      // Light probe so standing still on an edge doesn't flicker airborne.
      this.probeGround(world);
    }

    if (this.grounded && this.groundCollider && this.groundCollider !== prevGroundCollider) {
      // landed on a new collider – nothing extra yet
    }
    this.updateSafe();
  }

  private probeGround(world: PhysicsWorld): void {
    _center.set(this.position.x, this.position.y + this.radius - 0.06, this.position.z);
    world.querySphere(_center, this.radius, _list, this.filter);
    for (const c of _list) {
      if (!c.solid || !c.walkable) continue;
      if (c.sphereContact(_center, this.radius, _c) && _c.normal.y >= this.maxSlopeCos) {
        this.grounded = true;
        this.groundCollider = c;
        this.groundNormal.copy(_c.normal);
        if (c.hazard > 0) this.hazard = c;
        return;
      }
    }
  }

  private resolve(world: PhysicsWorld): void {
    const r = this.radius;
    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;
      for (let s = 0; s < this.offsets.length; s++) {
        _center.set(this.position.x, this.position.y + this.offsets[s], this.position.z);
        world.querySphere(_center, r, _list, this.filter);
        for (const c of _list) {
          if (!c.solid) continue;
          // Re-evaluate centre (earlier contacts may have moved us).
          _center.set(this.position.x, this.position.y + this.offsets[s], this.position.z);
          if (!c.sphereContact(_center, r, _c)) continue;
          if (_c.depth < 1e-5) continue;
          if (c.hazard > 0) this.hazard = c;
          const n = _c.normal;
          if (s === 0 && n.y >= this.maxSlopeCos && c.walkable) {
            // Ground: resolve vertically (no drift on slopes).
            this.position.y += Math.min(_c.depth / n.y, r * 2);
            if (this.velocity.y < 0) this.velocity.y = 0;
            this.grounded = true;
            this.groundCollider = c;
            this.groundNormal.copy(n);
          } else if (s === 0 && n.y >= this.maxSlopeCos && !c.walkable) {
            // Top of a non-walkable surface: hold vertically, flag for sliding off.
            this.position.y += Math.min(_c.depth / n.y, r * 2);
            if (this.velocity.y < 0) this.velocity.y = 0;
            this.slideFrom = c;
          } else if (n.y <= -0.55) {
            // Ceiling
            this.position.addScaledVector(n, _c.depth);
            if (this.velocity.y > 0) this.velocity.y = 0;
            this.hitCeiling = true;
          } else {
            // Wall or steep slope. Attempt a step-up first.
            if (s === 0 && this.tryStepUp(world, c)) {
              pushed = true;
              continue;
            }
            if (n.y > 0.2) {
              // steep slope – slide along full normal
              this.position.addScaledVector(n, _c.depth);
              const vn = this.velocity.dot(n);
              if (vn < 0) this.velocity.addScaledVector(n, -vn);
            } else {
              const h = Math.hypot(n.x, n.z) || 1;
              const nx = n.x / h, nz = n.z / h;
              this.position.x += nx * _c.depth;
              this.position.z += nz * _c.depth;
              const vn = this.velocity.x * nx + this.velocity.z * nz;
              if (vn < 0) {
                if (-vn > this.wallHitSpeed) this.wallHitSpeed = -vn;
                this.velocity.x -= nx * vn;
                this.velocity.z -= nz * vn;
              }
              if (Math.abs(n.y) < 0.5 && s > 0) {
                this.touchingWall = true;
                this.wallNormal.set(nx, 0, nz);
                this.wallCollider = c;
              } else if (Math.abs(n.y) < 0.5 && !this.touchingWall) {
                this.touchingWall = true;
                this.wallNormal.set(nx, 0, nz);
                this.wallCollider = c;
              }
            }
          }
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }

  private tryStepUp(world: PhysicsWorld, c: Collider): boolean {
    if (!(this.grounded || this.wasGrounded)) return false;
    if (!c.walkable || !c.upright) return false;
    const rise = c.top - this.position.y;
    if (rise <= 0.001 || rise > this.stepHeight) return false;
    // Must be moving into it
    if (this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z < 0.01) return false;
    const oldY = this.position.y;
    this.position.y = c.top + 0.002;
    // Check the raised body is free.
    for (let s = 0; s < this.offsets.length; s++) {
      _center.set(this.position.x, this.position.y + this.offsets[s] + 0.01, this.position.z);
      if (world.overlapSphere(_center, this.radius * 0.95, this.filter)) {
        this.position.y = oldY;
        return false;
      }
    }
    // The bottom sphere must actually rest on the step top.
    if (!c.containsXZ(this.position, this.radius * 0.9)) {
      this.position.y = oldY;
      return false;
    }
    this.grounded = true;
    this.groundCollider = c;
    this.groundNormal.set(0, 1, 0);
    return true;
  }

  private updateSafe(): void {
    if (!this.grounded || !this.groundCollider) return;
    const c = this.groundCollider;
    if (!c.safe || c.dynamic || c.hazard > 0 || this.groundNormal.y < 0.9) return;
    // Require some distance from the edge so respawns are never on a lip.
    const margin = -Math.min(0.6, (c.kind === 'box' ? Math.min(c.half.x, c.half.z) : c.radius) * 0.5);
    if (!c.containsXZ(this.position, margin)) return;
    this.lastSafe.copy(this.position);
    this.hasSafe = true;
  }
}
