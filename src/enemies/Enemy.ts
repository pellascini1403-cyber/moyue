import { Color, Group, Material, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { Entity } from '../entities/Entity';
import type { Game } from '../game/Game';
import { Damageable, HitInfo, HitResult, Hurtbox } from '../combat/Combat';
import { CharacterBody } from '../physics/CharacterBody';
import { EnemyKind } from '../world/Region';
import { approachAngle, yawFromVector } from '../core/math';
import { Env } from '../core/env';

const _v = new Vector3();
const _down = new Vector3(0, -1, 0);
const _violet = new Color(0.9, 0.4, 1.4);

export interface EnemyStats {
  health: number;
  radius: number;
  height: number;
  contactDamage: number;
  jade: number;
  gravity: number;
  flying: boolean;
  /** Distance at which the enemy notices the player. */
  sight: number;
  poise: number; // hits before stagger interrupt (0 = always)
  knockResist: number; // 0..1
}

/**
 * Shared enemy machinery: health, hit reactions (flash, knockback, stagger),
 * perception, leashing, ledge-safe ground movement, contact damage, death &
 * reset. Subclasses implement `think` (AI) and `animate` (visuals).
 */
export abstract class Enemy extends Entity implements Damageable {
  readonly damageableId: string;
  readonly body: CharacterBody;
  health: number;
  state = 'idle';
  stateT = 0;
  facing = 0;
  readonly home = new Vector3();
  homeYaw = 0;
  leash = 14;
  readonly knock = new Vector3();
  staggerT = 0;
  flash = 0;
  dead = false;
  deathT = 0;
  permanentDeath = false;
  aware = false;
  poiseLeft: number;
  readonly model: Group = new Group();
  protected flashMats: MeshStandardMaterial[] = [];
  protected hurt: Hurtbox[] = [];
  pogoable = true;
  givesMoonlight = true;
  /** Arena/wave bookkeeping */
  arenaId: string | null = null;
  spawnedByArena = false;
  inactive = false;
  /** Bosses wait, visible and still, until their arena begins. */
  dormant = false;
  startsDormant = false;

  constructor(game: Game, id: string, regionId: string, public kind: EnemyKind, public stats: EnemyStats, pos: Vector3, yaw = 0) {
    super(game, id, regionId, new Group());
    this.damageableId = id;
    this.health = stats.health;
    this.poiseLeft = stats.poise;
    this.body = new CharacterBody(stats.radius, stats.height);
    this.body.stepHeight = 0.3;
    this.home.copy(pos);
    this.homeYaw = yaw;
    this.facing = yaw;
    this.body.teleport(pos);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.root.add(this.model);
    if (!Env.headless) game.world.addToRegion(regionId, this.root);
    this.hurt.push({ center: new Vector3(), radius: stats.radius * 1.15 });
  }

  /** Collect materials for hit flashing (call after building the model). */
  protected registerMaterials(root: Object3D): void {
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || m.userData.isOutline) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[];
      for (const mat of mats) {
        if ((mat as MeshStandardMaterial).isMeshStandardMaterial && !this.flashMats.includes(mat as MeshStandardMaterial)) {
          const sm = mat as MeshStandardMaterial;
          sm.userData.baseEmissive = sm.emissive.clone();
          this.flashMats.push(sm);
        }
      }
    });
  }

  get player() {
    return this.game.player;
  }

  get alivePlayer(): boolean {
    return !this.player.dead;
  }

  canBeHit(): boolean {
    return this.alive && !this.dead && !this.inactive && !this.dormant;
  }

  hurtboxes(): Hurtbox[] {
    this.hurt[0].center.set(this.position.x, this.position.y + this.stats.height * 0.5, this.position.z);
    return this.hurt;
  }

  /** Override for shields etc. Return true if the hit is blocked. */
  protected blocks(_hit: HitInfo): boolean {
    return false;
  }

  takeHit(hit: HitInfo): HitResult {
    if (!this.canBeHit()) return 'ignored';
    this.aware = true;
    if (this.blocks(hit)) {
      this.onBlocked(hit);
      return 'blocked';
    }
    this.health -= hit.damage;
    this.flash = 1;
    const kr = 1 - this.stats.knockResist;
    if (hit.kind !== 'downSlash') {
      this.knock.set(hit.dir.x, 0, hit.dir.z).multiplyScalar(hit.knockback * kr);
      if (this.stats.flying) this.knock.y = hit.dir.y * hit.knockback * kr * 0.6;
    } else if (this.stats.flying) {
      this.knock.set(0, -hit.knockback * kr * 0.8, 0);
    }
    this.poiseLeft--;
    if (this.poiseLeft <= 0) {
      this.poiseLeft = this.stats.poise;
      this.staggerT = 0.22;
      this.onStagger();
    }
    if (this.health <= 0) {
      this.die(hit);
      return 'kill';
    }
    this.onHurt(hit);
    return 'hit';
  }

  protected onBlocked(_hit: HitInfo): void {}
  protected onHurt(_hit: HitInfo): void {}
  protected onStagger(): void {}

  die(hit: HitInfo | null): void {
    this.dead = true;
    this.deathT = 0;
    this.state = 'dead';
    this.flash = 1;
    const p = this.position.clone().add(new Vector3(0, this.stats.height * 0.5, 0));
    // the dark body scatters as ink, then the creature comes undone in colour (see render)
    this.game.fx.burst(p, { count: 14, color: 0x07080c, speed: 5, dir: hit?.dir ?? new Vector3(0, 1, 0), spread: 0.8, life: 0.6, size: 0.2, gravity: 7, additive: false });
    this.game.fx.defeat(p, 0.6 + this.stats.height * 0.5, hit?.dir);
    this.game.sfx('defeat', p);
    this.game.onEnemyKilled(this);
  }

  setState(s: string): void {
    if (this.state !== s) {
      this.state = s;
      this.stateT = 0;
    }
  }

  distToPlayer(): number {
    return this.position.distanceTo(this.player.position);
  }

  horizDistToPlayer(): number {
    const p = this.player.position;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  yawToPlayer(): number {
    const p = this.player.position;
    return yawFromVector(p.x - this.position.x, p.z - this.position.z);
  }

  canSeePlayer(range = this.stats.sight): boolean {
    if (!this.alivePlayer) return false;
    const d = this.distToPlayer();
    if (d > range) return false;
    _v.copy(this.position).y += this.stats.height * 0.7;
    const target = this.player.position.clone().add(new Vector3(0, 0.6, 0));
    return this.game.physics.hasLineOfSight(_v, target, (c) => c.camera && !c.enemyOnly && !c.dynamic);
  }

  turnToward(yaw: number, rate: number, dt: number): void {
    this.facing = approachAngle(this.facing, yaw, rate * dt);
  }

  /** Is there ground ahead (so walkers never march off ledges)? */
  groundAhead(dirX: number, dirZ: number, dist: number, maxDrop = 1.2): boolean {
    _v.set(this.position.x + dirX * dist, this.position.y + 0.5, this.position.z + dirZ * dist);
    const hit = this.game.physics.raycast(_v, _down, 0.5 + maxDrop);
    return !!hit && hit.normal.y > 0.5 && hit.collider.hazard === 0;
  }

  /** Walk with ledge safety and leash. Sets horizontal velocity. */
  walk(dirX: number, dirZ: number, speed: number, dt: number, accel = 30): void {
    const v = this.body.velocity;
    let tx = dirX * speed, tz = dirZ * speed;
    if (speed > 0.01 && !this.groundAhead(dirX, dirZ, this.stats.radius + 0.45)) {
      tx = 0;
      tz = 0;
    }
    // leash: don't wander far from home
    const hx = this.position.x - this.home.x, hz = this.position.z - this.home.z;
    if (Math.hypot(hx, hz) > this.leash && tx * hx + tz * hz > 0) {
      tx = 0;
      tz = 0;
    }
    const dx = tx - v.x, dz = tz - v.z;
    const l = Math.hypot(dx, dz);
    const m = accel * dt;
    if (l <= m) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / l) * m;
      v.z += (dz / l) * m;
    }
  }

  fixedUpdate(dt: number): void {
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > 0.7 && this.alive) {
        this.alive = false;
        this.root.visible = false;
      }
      return;
    }
    if (this.inactive) return;
    if (this.dormant) {
      this.body.velocity.set(0, Math.min(0, this.body.velocity.y), 0);
      this.integrate(dt);
      return;
    }
    this.staggerT = Math.max(0, this.staggerT - dt);
    if (this.staggerT <= 0) this.think(dt);
    else {
      const v = this.body.velocity;
      v.x *= Math.exp(-6 * dt);
      v.z *= Math.exp(-6 * dt);
    }
    this.integrate(dt);
    this.contactDamage();
  }

  protected integrate(dt: number): void {
    const v = this.body.velocity;
    // knockback decays quickly
    v.x += this.knock.x;
    v.z += this.knock.z;
    if (this.stats.flying) v.y += this.knock.y;
    this.knock.multiplyScalar(0);
    if (this.stats.flying) {
      this.body.move(this.game.physics, dt, false);
    } else {
      if (!this.body.grounded) v.y -= this.stats.gravity * dt;
      else if (v.y < 0) v.y = -1;
      v.y = Math.max(v.y, -25);
      this.body.move(this.game.physics, dt, true);
      if (this.position.y < this.game.killY - 5 || this.body.hazard?.tag === 'abyss') {
        // fell into the abyss: die quietly
        this.dead = true;
        this.alive = false;
        this.root.visible = false;
        this.game.onEnemyKilled(this);
      }
    }
    this.position.copy(this.body.position);
  }

  protected contactDamage(): void {
    if (this.stats.contactDamage <= 0 || !this.alivePlayer) return;
    const pp = this.player.position;
    const dy = pp.y + 0.5 - (this.position.y + this.stats.height * 0.5);
    const h = Math.hypot(pp.x - this.position.x, pp.z - this.position.z);
    if (h < this.stats.radius + 0.28 && Math.abs(dy) < this.stats.height * 0.5 + 0.45) {
      this.game.damagePlayer(this.stats.contactDamage, this.position);
    }
  }

  /** Enemy attack hit test against the player (sphere at `center`). */
  protected strikePlayer(center: Vector3, radius: number, damage: number): boolean {
    if (!this.alivePlayer) return false;
    const pp = this.player.position;
    _v.set(pp.x, pp.y + 0.5, pp.z);
    if (_v.distanceTo(center) < radius + 0.35) {
      return this.game.damagePlayer(damage, this.position);
    }
    return false;
  }

  protected abstract think(dt: number): void;
  protected abstract animate(dt: number, t: number): void;

  render(dt: number, alpha: number, t: number): void {
    if (!this.alive) return;
    this.root.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.model.rotation.y = this.facing;
    // hit flash
    for (const m of this.flashMats) {
      const base = m.userData.baseEmissive as Color;
      m.emissive.copy(base).lerp(new Color(1.6, 1.6, 1.6), this.flash);
    }
    if (this.dead) {
      // pop, then stretch upward and dissolve into violet light (≈ 0.45 s)
      const d = this.deathT;
      const pop = 1 + 0.12 * Math.sin(Math.min(1, d / 0.06) * Math.PI * 0.5);
      const u = Math.min(1, Math.max(0, (d - 0.06) / 0.38));
      const e = u * u * (3 - 2 * u);
      const xz = Math.max(0.001, pop * (1 - e));
      this.model.scale.set(xz, Math.max(0.001, pop * (1 - e) * (1 + 0.9 * e)), xz);
      this.model.position.y = e * 0.25 * this.stats.height;
      this.model.visible = u < 1;
      const k = Math.min(1, d / 0.12);
      for (const m of this.flashMats) m.emissive.lerp(_violet, k);
    }
    this.animate(dt, t);
  }

  reset(): void {
    if (this.permanentDeath && this.dead) return;
    if (this.spawnedByArena) {
      // arena enemies are re-created by their arena
      this.inactive = true;
      this.alive = false;
      this.root.visible = false;
      return;
    }
    this.dead = false;
    this.alive = true;
    this.inactive = false;
    this.root.visible = true;
    this.health = this.stats.health;
    this.state = 'idle';
    this.stateT = 0;
    this.aware = false;
    this.staggerT = 0;
    this.knock.set(0, 0, 0);
    this.body.teleport(this.home);
    this.position.copy(this.home);
    this.prevPosition.copy(this.home);
    this.facing = this.homeYaw;
    this.model.scale.setScalar(1);
    this.model.position.y = 0;
    this.model.visible = true;
    this.dormant = this.startsDormant;
    this.onReset();
  }

  protected onReset(): void {}
}
