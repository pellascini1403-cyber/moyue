import { Color, Vector3 } from 'three';
import type { Game } from '../game/Game';
import { Enemy } from './Enemy';
import { HitInfo } from '../combat/Combat';
import { buildInkMite, buildLanternWisp, buildShieldback, InkMiteView, WispView, ShieldbackView } from '../art/characters/EnemyModels';
import { Env } from '../core/env';
import { angleDelta, clamp, damp } from '../core/math';

const _v = new Vector3();

/** Ink Mite — small, fast, aggressive. Charges, telegraphs with a crouch, then lunges. */
export class InkMite extends Enemy {
  private view: InkMiteView | null = null;
  private lungeDir = new Vector3();
  private lostT = 0;
  private wanderT = 0;
  private wanderDir = 0;
  private gait = 0;

  constructor(game: Game, id: string, region: string, pos: Vector3, yaw = 0) {
    super(game, id, region, 'inkMite', {
      health: 3, radius: 0.34, height: 0.6, contactDamage: 1, jade: 3, gravity: 30, flying: false, sight: 10, poise: 1, knockResist: 0,
    }, pos, yaw);
    if (!Env.headless) {
      this.view = buildInkMite();
      this.model.add(this.view.root);
      this.registerMaterials(this.view.root);
    }
    this.wanderT = Math.random() * 2;
  }

  protected think(dt: number): void {
    const v = this.body.velocity;
    const d = this.horizDistToPlayer();
    const pp = this.player.position;
    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 1.5 + Math.random() * 2;
          this.wanderDir = Math.random() < 0.4 ? NaN : this.facing + (Math.random() - 0.5) * 2.5;
        }
        if (!Number.isNaN(this.wanderDir)) {
          this.turnToward(this.wanderDir, 4, dt);
          this.walk(Math.sin(this.facing), Math.cos(this.facing), 1.1, dt);
        } else this.walk(0, 0, 0, dt);
        if (this.canSeePlayer()) {
          this.aware = true;
          this.setState('alert');
          if (this.body.grounded) v.y = 5;
          this.game.sfx('miteAlert', this.position);
        }
        break;
      }
      case 'alert':
        this.walk(0, 0, 0, dt);
        this.turnToward(this.yawToPlayer(), 12, dt);
        if (this.stateT > 0.35) this.setState('chase');
        break;
      case 'chase': {
        const yaw = this.yawToPlayer();
        this.turnToward(yaw, 9, dt);
        this.walk(Math.sin(this.facing), Math.cos(this.facing), 4.3, dt);
        if (d < 2.5 && Math.abs(pp.y - this.position.y) < 1.4 && Math.abs(angleDelta(this.facing, yaw)) < 0.5) {
          this.setState('windup');
          this.game.sfx('miteWindup', this.position);
        }
        if (!this.canSeePlayer(this.stats.sight * 1.6)) {
          this.lostT += dt;
          if (this.lostT > 3) {
            this.lostT = 0;
            this.setState('return');
          }
        } else this.lostT = 0;
        if (!this.alivePlayer) this.setState('return');
        break;
      }
      case 'windup':
        this.walk(0, 0, 0, dt, 40);
        this.turnToward(this.yawToPlayer(), 5, dt);
        if (this.stateT > 0.42) {
          this.lungeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
          v.x = this.lungeDir.x * 9.5;
          v.z = this.lungeDir.z * 9.5;
          if (this.body.grounded) v.y = 4.2;
          this.setState('lunge');
          this.game.sfx('miteLunge', this.position);
        }
        break;
      case 'lunge':
        // keep momentum; stop at ledges
        if (!this.groundAhead(this.lungeDir.x, this.lungeDir.z, 0.8, 2.5)) {
          v.x *= 0.5;
          v.z *= 0.5;
        }
        if (this.stateT > 0.38 && this.body.grounded) this.setState('recover');
        if (this.stateT > 1.2) this.setState('recover');
        break;
      case 'recover':
        this.walk(0, 0, 0, dt, 25);
        if (this.stateT > 0.55) this.setState('chase');
        break;
      case 'return': {
        const hx = this.home.x - this.position.x, hz = this.home.z - this.position.z;
        const hd = Math.hypot(hx, hz);
        if (hd < 0.6) {
          this.setState('idle');
          this.aware = false;
          break;
        }
        this.turnToward(Math.atan2(hx, hz), 6, dt);
        this.walk(Math.sin(this.facing), Math.cos(this.facing), 2.5, dt);
        if (this.canSeePlayer()) this.setState('chase');
        break;
      }
    }
  }

  protected onStagger(): void {
    if (this.state === 'windup' || this.state === 'lunge') this.setState('recover');
  }

  protected animate(dt: number, t: number): void {
    const vw = this.view;
    if (!vw) return;
    const hs = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    this.gait += hs * dt * 3.5;
    const crouch = this.state === 'windup' ? Math.min(1, this.stateT / 0.3) : 0;
    vw.body.position.y = 0.32 - crouch * 0.12 + Math.abs(Math.sin(this.gait)) * 0.03 * Math.min(1, hs);
    vw.body.scale.set(1 + crouch * 0.12, 1 - crouch * 0.18, 1 + crouch * 0.05);
    vw.body.rotation.x = this.state === 'lunge' ? -0.35 : crouch * 0.25;
    vw.legs.forEach((leg, i) => {
      const ph = this.gait + i * 2.1;
      leg.rotation.x = Math.sin(ph) * 0.5 * Math.min(1, hs / 2);
      leg.rotation.z = Math.cos(ph) * 0.12;
    });
    const glow = this.state === 'windup' ? 1.5 + Math.sin(t * 40) * 0.8 : 1;
    vw.eyes.color.setRGB(2.4 * glow, 0.9 * glow, 0.25 * glow);
  }
}

/** Lantern Wisp — hovering moth-spirit. Circles, telegraphs with a flare, then dives or spits embers. */
export class LanternWisp extends Enemy {
  private view: WispView | null = null;
  private orbit = Math.random() * Math.PI * 2;
  private attackCd = 2 + Math.random();
  private diveDir = new Vector3();
  private bob = Math.random() * 10;
  private spat = false;

  constructor(game: Game, id: string, region: string, pos: Vector3, yaw = 0) {
    super(game, id, region, 'lanternWisp', {
      health: 2, radius: 0.35, height: 0.8, contactDamage: 1, jade: 4, gravity: 0, flying: true, sight: 13, poise: 1, knockResist: 0,
    }, pos, yaw);
    this.body.setShape(0.3, 0.7);
    if (!Env.headless) {
      this.view = buildLanternWisp();
      this.model.add(this.view.root);
      this.registerMaterials(this.view.root);
    }
    this.leash = 18;
  }

  hurtboxes() {
    this.hurt[0].center.set(this.position.x, this.position.y + 0.4, this.position.z);
    this.hurt[0].radius = 0.45;
    return this.hurt;
  }

  private steer(target: Vector3, speed: number, accel: number, dt: number): void {
    const v = this.body.velocity;
    _v.subVectors(target, this.position);
    const d = _v.length();
    if (d > 1e-3) _v.multiplyScalar(Math.min(speed, d * 2.5) / d);
    const dx = _v.x - v.x, dy = _v.y - v.y, dz = _v.z - v.z;
    const l = Math.hypot(dx, dy, dz);
    const m = accel * dt;
    if (l <= m) v.set(_v.x, _v.y, _v.z);
    else {
      v.x += (dx / l) * m;
      v.y += (dy / l) * m;
      v.z += (dz / l) * m;
    }
  }

  protected think(dt: number): void {
    const pp = this.player.position;
    this.bob += dt;
    switch (this.state) {
      case 'idle': {
        _v.copy(this.home).add(new Vector3(Math.sin(this.bob * 0.7) * 1.2, Math.sin(this.bob * 1.3) * 0.4, Math.cos(this.bob * 0.5) * 1.2));
        this.steer(_v.clone(), 1.5, 6, dt);
        this.turnToward(this.facing + dt * 0.8, 1, dt);
        if (this.canSeePlayer()) {
          this.aware = true;
          this.setState('hover');
          this.game.sfx('wispAlert', this.position);
        }
        break;
      }
      case 'hover': {
        this.orbit += dt * 0.7;
        const target = new Vector3(pp.x + Math.cos(this.orbit) * 3.8, pp.y + 2.6 + Math.sin(this.bob * 2) * 0.3, pp.z + Math.sin(this.orbit) * 3.8);
        // stay within leash of home
        const fromHome = target.clone().sub(this.home);
        if (fromHome.length() > this.leash) target.copy(this.home).addScaledVector(fromHome.normalize(), this.leash);
        this.steer(target, 5, 10, dt);
        this.turnToward(this.yawToPlayer(), 6, dt);
        this.attackCd -= dt;
        if (this.attackCd <= 0 && this.alivePlayer && this.distToPlayer() < 12) {
          this.attackCd = 2.4 + Math.random() * 1.4;
          const far = this.horizDistToPlayer() > 6.5;
          this.setState(far ? 'spitWind' : 'telegraph');
          this.spat = false;
          this.game.sfx('wispCharge', this.position);
        }
        if (!this.canSeePlayer(this.stats.sight * 1.8)) this.setState('idle');
        break;
      }
      case 'telegraph': {
        const v = this.body.velocity;
        v.multiplyScalar(Math.exp(-6 * dt));
        this.turnToward(this.yawToPlayer(), 8, dt);
        if (this.stateT > 0.65) {
          this.diveDir.set(pp.x, pp.y + 0.5, pp.z).sub(this.position).normalize();
          this.setState('dive');
          this.game.sfx('wispDive', this.position);
        }
        break;
      }
      case 'dive': {
        const v = this.body.velocity;
        v.copy(this.diveDir).multiplyScalar(12.5);
        if (this.stateT > 0.55 || this.body.touchingWall || this.body.grounded) this.setState('recover');
        break;
      }
      case 'spitWind': {
        const v = this.body.velocity;
        v.multiplyScalar(Math.exp(-5 * dt));
        this.turnToward(this.yawToPlayer(), 8, dt);
        if (this.stateT > 0.5 && !this.spat) {
          this.spat = true;
          const from = this.position.clone().add(new Vector3(0, 0.4, 0));
          const to = pp.clone().add(new Vector3(0, 0.5, 0));
          const dir = to.sub(from).normalize();
          this.game.spawnEnemyProjectile(from, dir.multiplyScalar(7.5), 1);
        }
        if (this.stateT > 0.8) this.setState('hover');
        break;
      }
      case 'recover': {
        const target = this.position.clone().add(new Vector3(0, 2.2, 0)).addScaledVector(this.diveDir, -2);
        this.steer(target, 4, 10, dt);
        if (this.stateT > 0.8) this.setState('hover');
        break;
      }
    }
  }

  protected onStagger(): void {
    if (this.state === 'telegraph' || this.state === 'dive' || this.state === 'spitWind') this.setState('recover');
  }

  protected animate(dt: number, t: number): void {
    const vw = this.view;
    if (!vw) return;
    const flap = Math.sin(t * 26 + this.bob) * 0.7;
    vw.wings[0].rotation.z = -0.3 + flap;
    vw.wings[1].rotation.z = 0.3 - flap;
    vw.lantern.rotation.z = Math.sin(t * 2 + this.bob) * 0.12 - this.body.velocity.x * 0.02;
    vw.lantern.rotation.x = this.state === 'dive' ? 0.9 : this.body.velocity.z * 0.03;
    const charge = this.state === 'telegraph' || this.state === 'spitWind' ? Math.min(1, this.stateT / 0.5) : 0;
    const shake = charge > 0 ? Math.sin(t * 60) * 0.03 * charge : 0;
    vw.lantern.position.x = shake;
    const k = 1 + charge * 1.6 + Math.sin(t * 9 + this.bob) * 0.08;
    vw.paper.color.setRGB(1.8 * k, 1.25 * k, 1.0 * k);
    vw.glow.scale.setScalar(2.2 + charge * 1.8);
    vw.core.color.setRGB(2.5 * k, 1.2 * k, 0.4 * k);
  }
}

/** Shieldback — armoured guard. Blocks frontal strikes; slow to turn; overhead glaive sweep. */
export class Shieldback extends Enemy {
  private view: ShieldbackView | null = null;
  private struck = false;
  private patrolDir = 1;
  private shieldFlash = 0;

  constructor(game: Game, id: string, region: string, pos: Vector3, yaw = 0) {
    super(game, id, region, 'shieldback', {
      health: 7, radius: 0.5, height: 1.35, contactDamage: 1, jade: 9, gravity: 30, flying: false, sight: 9, poise: 3, knockResist: 0.6,
    }, pos, yaw);
    if (!Env.headless) {
      this.view = buildShieldback();
      this.model.add(this.view.root);
      this.registerMaterials(this.view.root);
    }
    this.leash = 10;
  }

  protected blocks(hit: HitInfo): boolean {
    if (this.state === 'recover' || this.state === 'strike' || this.staggerT > 0) return false;
    if (hit.kind === 'downSlash' || hit.kind === 'slam' || hit.kind === 'spin') return false;
    // hit.dir points from attacker to us; blocked when it comes from our front
    const attackYaw = Math.atan2(-hit.dir.x, -hit.dir.z);
    return Math.abs(angleDelta(this.facing, attackYaw)) < 1.2;
  }

  protected onBlocked(): void {
    this.shieldFlash = 1;
    if (this.state === 'guard' && this.horizDistToPlayer() < 3) {
      this.setState('windup');
      this.struck = false;
      this.game.sfx('guardWindup', this.position);
    }
  }

  protected think(dt: number): void {
    const d = this.horizDistToPlayer();
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 4);
    switch (this.state) {
      case 'idle': {
        // short patrol back and forth
        const fx = Math.sin(this.homeYaw), fz = Math.cos(this.homeYaw);
        const off = (this.position.x - this.home.x) * fx + (this.position.z - this.home.z) * fz;
        if (Math.abs(off) > 3) this.patrolDir = -Math.sign(off);
        const yaw = this.patrolDir > 0 ? this.homeYaw : this.homeYaw + Math.PI;
        this.turnToward(yaw, 2.5, dt);
        this.walk(Math.sin(this.facing), Math.cos(this.facing), 1.2, dt);
        if (this.canSeePlayer()) {
          this.aware = true;
          this.setState('guard');
          this.game.sfx('guardAlert', this.position);
        }
        break;
      }
      case 'guard': {
        const yaw = this.yawToPlayer();
        this.turnToward(yaw, 2.3, dt);
        const facingOk = Math.abs(angleDelta(this.facing, yaw)) < 0.5;
        if (d > 2.4) this.walk(Math.sin(this.facing), Math.cos(this.facing), 1.9, dt);
        else this.walk(0, 0, 0, dt);
        if (d < 2.9 && facingOk && this.stateT > 0.5 && this.alivePlayer) {
          this.setState('windup');
          this.struck = false;
          this.game.sfx('guardWindup', this.position);
        }
        if (!this.canSeePlayer(this.stats.sight * 1.7) && this.stateT > 2) this.setState('idle');
        break;
      }
      case 'windup':
        this.walk(0, 0, 0, dt);
        this.turnToward(this.yawToPlayer(), 1.2, dt);
        if (this.stateT > 0.7) this.setState('strike');
        break;
      case 'strike': {
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        this.walk(fx, fz, this.stateT < 0.15 ? 4 : 0, dt, 60);
        if (!this.struck && this.stateT > 0.06) {
          const c = this.position.clone().add(new Vector3(fx * 1.6, 0.7, fz * 1.6));
          if (this.strikePlayer(c, 1.25, 1)) this.struck = true;
          if (this.stateT > 0.2) this.struck = true;
          if (this.stateT < 0.1) {
            this.game.fx.slash(this.position.clone().add(new Vector3(0, 0.8, 0)), new Vector3(fx, 0, fz), new Vector3(0, 1, 0), 2.6, 2.4, new Color(1.6, 0.6, 0.3), true, 0.2, 0.4);
            this.game.sfx('guardStrike', this.position);
          }
        }
        if (this.stateT > 0.28) this.setState('recover');
        break;
      }
      case 'recover':
        this.walk(0, 0, 0, dt);
        if (this.stateT > 0.95) this.setState('guard');
        break;
    }
  }

  protected onStagger(): void {
    if (this.state === 'windup') this.setState('recover');
  }

  protected animate(dt: number, t: number): void {
    const vw = this.view;
    if (!vw) return;
    const hs = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    const step = t * 7 * Math.min(1, hs);
    vw.legs[0].rotation.x = Math.sin(step) * 0.4 * Math.min(1, hs);
    vw.legs[1].rotation.x = -Math.sin(step) * 0.4 * Math.min(1, hs);
    vw.body.position.y = 0.55 + Math.abs(Math.sin(step)) * 0.03;
    const wind = this.state === 'windup' ? Math.min(1, this.stateT / 0.5) : 0;
    const strike = this.state === 'strike' ? Math.min(1, this.stateT / 0.18) : 0;
    const rec = this.state === 'recover' ? 1 - Math.min(1, this.stateT / 0.95) : 0;
    // glaive: raised on windup, sweeps across on strike
    vw.glaive.rotation.x = damp(vw.glaive.rotation.x, -wind * 1.9 + strike * 1.2 + rec * 0.9, 18, dt);
    vw.glaive.rotation.z = damp(vw.glaive.rotation.z, strike * 1.2, 18, dt);
    vw.body.rotation.y = damp(vw.body.rotation.y, wind * 0.4 - strike * 0.6, 14, dt);
    // shield lowers during recovery (vulnerable window)
    vw.shield.rotation.x = damp(vw.shield.rotation.x, rec * 0.9, 10, dt);
    vw.shield.position.y = damp(vw.shield.position.y, 0.1 - rec * 0.3, 10, dt);
    vw.eyes.color.setRGB(1.8 + wind * 2, 2.2 - wind * 1.2, 1.2 - wind);
    vw.head.rotation.x = -0.1 + wind * -0.2;
    void clamp;
    void this.shieldFlash;
  }
}
