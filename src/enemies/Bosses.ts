import { AdditiveBlending, Color, DoubleSide, Mesh, MeshBasicMaterial, RingGeometry, Vector3, CylinderGeometry } from 'three';
import type { Game } from '../game/Game';
import { Enemy } from './Enemy';
import { Entity } from '../entities/Entity';
import { buildCenserWarden, buildTollingAbbot, updateChain, WardenView, AbbotView } from '../art/characters/EnemyModels';
import { Env } from '../core/env';
import { angleDelta, damp, clamp } from '../core/math';
import { spawnEnemy } from './registry';

const _v = new Vector3();

/**
 * Expanding ground shockwave. Hits the player when the ring passes under
 * them while they are on/near the ground — jump to clear it.
 */
export class Shockwave extends Entity {
  radius = 0.3;
  private mesh: Mesh | null = null;
  private hit = false;
  constructor(game: Game, pos: Vector3, public maxRadius: number, public speed: number, public height = 0.9, public damage = 1, color = new Color(1.6, 0.8, 0.35), public band = 0.55) {
    super(game, `wave_${Math.random().toString(36).slice(2)}`, '');
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.sleepDistance = 1e9;
    if (!Env.headless) {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      this.mesh = new Mesh(new CylinderGeometry(1, 1, 1, 48, 1, true), m);
      this.mesh.position.copy(pos);
      this.root.add(this.mesh);
      game.scene.add(this.root);
    }
  }
  fixedUpdate(dt: number): void {
    this.radius += this.speed * dt;
    if (this.radius >= this.maxRadius) {
      this.alive = false;
      this.dispose();
      return;
    }
    if (this.hit) return;
    const pp = this.game.player.position;
    const d = Math.hypot(pp.x - this.position.x, pp.z - this.position.z);
    const above = pp.y - this.position.y;
    if (Math.abs(d - this.radius) < this.band && above < this.height && above > -1.5) {
      if (this.game.damagePlayer(this.damage, this.position)) this.hit = true;
    }
  }
  render(): void {
    if (!this.mesh) return;
    const u = this.radius / this.maxRadius;
    this.mesh.scale.set(this.radius, this.height, this.radius);
    this.mesh.position.y = this.position.y + this.height / 2;
    (this.mesh.material as MeshBasicMaterial).opacity = 0.85 * (1 - u * u);
  }
}

/** Telegraph decal: a ring that fills to warn of an incoming impact. */
export class GroundMarker extends Entity {
  private mesh: Mesh | null = null;
  private t = 0;
  constructor(game: Game, pos: Vector3, public r: number, public dur: number, color = new Color(1.6, 0.25, 0.15)) {
    super(game, `mark_${Math.random().toString(36).slice(2)}`, '');
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.sleepDistance = 1e9;
    if (!Env.headless) {
      this.mesh = new Mesh(new RingGeometry(0.85, 1, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.copy(pos).y += 0.06;
      this.mesh.scale.setScalar(r);
      this.root.add(this.mesh);
      const inner = new Mesh(new RingGeometry(0, 1, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      inner.rotation.x = -Math.PI / 2;
      inner.position.copy(pos).y += 0.05;
      inner.scale.setScalar(0.01);
      inner.name = 'fill';
      this.root.add(inner);
      game.scene.add(this.root);
    }
  }
  fixedUpdate(dt: number): void {
    this.t += dt;
    if (this.t >= this.dur) {
      this.alive = false;
      this.dispose();
    }
  }
  render(): void {
    const fill = this.root.getObjectByName('fill') as Mesh | undefined;
    if (fill) fill.scale.setScalar(Math.max(0.01, this.r * Math.min(1, this.t / this.dur)));
  }
}

/** Falling ember with a ground marker. */
class Ember extends Entity {
  private mesh: Mesh | null = null;
  private vy = -2;
  constructor(game: Game, private target: Vector3, private delay: number) {
    super(game, `ember_${Math.random().toString(36).slice(2)}`, '');
    this.position.copy(target).y += 14;
    this.prevPosition.copy(this.position);
    this.sleepDistance = 1e9;
    game.addEntity(new GroundMarker(game, target, 1.1, delay + 0.6, new Color(1.6, 0.5, 0.15)));
    if (!Env.headless) {
      this.mesh = new Mesh(new CylinderGeometry(0.15, 0.05, 0.9, 6), new MeshBasicMaterial({ color: new Color(2.5, 1.0, 0.3) }));
      this.root.add(this.mesh);
      game.scene.add(this.root);
      this.root.visible = false;
    }
  }
  fixedUpdate(dt: number): void {
    this.delay -= dt;
    if (this.delay > 0) return;
    this.root.visible = true;
    this.vy -= 30 * dt;
    this.position.y += this.vy * dt;
    if (this.position.y <= this.target.y) {
      this.alive = false;
      this.dispose();
      this.game.fx.burst(this.target, { count: 14, color: new Color(1.8, 0.6, 0.2), speed: 5, spread: 0.8, dir: new Vector3(0, 1, 0), life: 0.5, size: 0.1, gravity: 10 });
      this.game.sfx('emberImpact', this.target, 0.6);
      const pp = this.game.player.position;
      if (Math.hypot(pp.x - this.target.x, pp.z - this.target.z) < 1.2 && pp.y - this.target.y < 1.5) this.game.damagePlayer(1, this.target);
    }
  }
}

// =================================================================================== Censer Warden
export class CenserWarden extends Enemy {
  private view: WardenView | null = null;
  private censer = new Vector3();
  private censerAngle = 0;
  private censerR = 1.4;
  private censerH = 1.0;
  private attackCd = 1.2;
  private struck = false;
  private next = 0;
  private phase2 = false;
  private chargeDir = new Vector3();
  private smoke: { pos: Vector3; t: number } | null = null;
  private combo = 0;

  constructor(game: Game, id: string, region: string, pos: Vector3, yaw = 0) {
    super(game, id, region, 'censerWarden', {
      health: 40, radius: 0.95, height: 2.3, contactDamage: 1, jade: 60, gravity: 30, flying: false, sight: 22, poise: 9, knockResist: 0.92,
    }, pos, yaw);
    if (!Env.headless) {
      this.view = buildCenserWarden();
      this.model.add(this.view.root);
      this.registerMaterials(this.view.root);
      this.view.censer.removeFromParent();
      this.root.parent?.add(this.view.censer);
      this.view.chain.removeFromParent();
      this.root.parent?.add(this.view.chain);
    }
    this.pogoable = true;
    this.leash = 30;
    this.hurt[0].radius = 1.2;
    this.censer.copy(pos);
  }

  get speedMul(): number {
    return this.phase2 ? 1.3 : 1;
  }

  protected onHurt(): void {
    if (!this.phase2 && this.health < this.stats.health * 0.5) {
      this.phase2 = true;
      this.game.sfx('bossPhase', this.position);
      this.game.shake(0.4);
      this.setState('roar');
    }
  }

  private pickAttack(): string {
    const d = this.horizDistToPlayer();
    const options: string[] = [];
    if (d > 7) options.push('charge', 'slam');
    else options.push('sweep', 'slam', 'sweep');
    if (this.phase2) options.push('smoke');
    let pick = options[this.next++ % options.length];
    if (pick === 'smoke' && this.smoke) pick = 'sweep';
    return pick;
  }

  protected think(dt: number): void {
    const s = this.speedMul;
    const yaw = this.yawToPlayer();
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    // censer rest position: dangling in front-right
    const restCenser = () => {
      this.censerAngle = damp(this.censerAngle, this.facing - 0.6, 6, dt);
      this.censerR = damp(this.censerR, 1.5, 6, dt);
      this.censerH = damp(this.censerH, 0.9 + Math.sin(this.stateT * 3) * 0.1, 6, dt);
    };
    if (this.smoke) {
      this.smoke.t += dt;
      if (this.smoke.t > 0.8 && this.smoke.t < 4) {
        const pp = this.player.position;
        if (Math.hypot(pp.x - this.smoke.pos.x, pp.z - this.smoke.pos.z) < 2.6 && pp.y - this.smoke.pos.y < 2) this.game.damagePlayer(1, this.smoke.pos);
      }
      if (Math.floor(this.smoke.t * 10) !== Math.floor((this.smoke.t - dt) * 10)) {
        this.game.fx.burst(this.smoke.pos.clone().add(new Vector3((Math.random() - 0.5) * 3, 0.3, (Math.random() - 0.5) * 3)), {
          count: 2, color: this.smoke.t < 0.8 ? 0x3a3530 : 0x1a1210, speed: 0.6, spread: 1, life: 1.6, size: 0.9, gravity: -0.5, drag: 1, additive: false,
        });
      }
      if (this.smoke.t > 4) this.smoke = null;
    }
    switch (this.state) {
      case 'idle':
        restCenser();
        this.walk(0, 0, 0, dt);
        if (this.canSeePlayer() || this.aware) {
          this.aware = true;
          this.setState('approach');
        }
        break;
      case 'roar':
        this.walk(0, 0, 0, dt);
        restCenser();
        if (this.stateT < 0.05) this.game.addEntity(new Shockwave(this.game, this.position.clone(), 7, 10, 0.7, 1, new Color(1.2, 0.5, 0.25)));
        if (this.stateT > 1.1) this.setState('approach');
        break;
      case 'approach': {
        restCenser();
        this.turnToward(yaw, 2.2 * s, dt);
        const d = this.horizDistToPlayer();
        this.walk(fx, fz, d > 3.2 ? 2.2 * s : 0, dt);
        this.attackCd -= dt;
        if (this.attackCd <= 0 && this.alivePlayer) {
          this.struck = false;
          const a = this.pickAttack();
          this.setState(a + 'Wind');
          this.game.sfx(a === 'sweep' ? 'censerWind' : a === 'slam' ? 'censerLift' : a === 'charge' ? 'guardAlert' : 'smokeWind', this.position);
        }
        break;
      }
      case 'sweepWind': {
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 3, dt);
        // pull the censer back behind
        this.censerAngle = damp(this.censerAngle, this.facing + 2.4, 8, dt);
        this.censerR = damp(this.censerR, 2.2, 6, dt);
        this.censerH = damp(this.censerH, 0.6, 6, dt);
        if (this.stateT > 0.85 / s) {
          this.setState('sweep');
          this.game.sfx('censerSwing', this.position);
        }
        break;
      }
      case 'sweep': {
        this.walk(0, 0, 0, dt);
        const dur = 0.75 / s;
        const u = Math.min(1, this.stateT / dur);
        this.censerAngle = this.facing + 2.4 - u * 5.4;
        this.censerR = 3.7;
        this.censerH = 0.55;
        if (!this.struck) {
          _v.copy(this.censer);
          const pp = this.player.position;
          const d = Math.hypot(pp.x - _v.x, pp.z - _v.z);
          if (d < 0.95 && pp.y - (this.position.y) < 1.1) this.struck = this.game.damagePlayer(1, this.position);
        }
        if (Math.floor(this.stateT * 20) % 2 === 0) this.game.fx.burst(this.censer, { count: 2, color: new Color(1.8, 0.7, 0.2), speed: 1, life: 0.5, size: 0.12, gravity: -1 });
        if (u >= 1) {
          this.combo++;
          if (this.phase2 && this.combo % 2 === 1) {
            this.struck = false;
            this.setState('sweepWind');
            this.stateT = 0.55 / s;
          } else this.recover(1.0);
        }
        break;
      }
      case 'slamWind':
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 2.5, dt);
        this.censerAngle = damp(this.censerAngle, this.facing, 8, dt);
        this.censerR = damp(this.censerR, 0.6, 6, dt);
        this.censerH = damp(this.censerH, 3.6, 6, dt);
        if (this.stateT > 0.9 / s) this.setState('slam');
        break;
      case 'slam': {
        this.walk(0, 0, 0, dt);
        const u = Math.min(1, this.stateT / 0.16);
        this.censerAngle = this.facing;
        this.censerR = 0.6 + u * 2.8;
        this.censerH = 3.6 - u * 3.4;
        if (u >= 1 && !this.struck) {
          this.struck = true;
          const at = this.position.clone().add(new Vector3(fx * 3.4, 0.05, fz * 3.4));
          this.game.addEntity(new Shockwave(this.game, at, 9, 9.5 * s, 0.9, 1));
          this.game.fx.burst(at, { count: 30, color: new Color(1.8, 0.7, 0.2), speed: 6, spread: 0.7, dir: new Vector3(0, 1, 0), life: 0.6, size: 0.14, gravity: 10 });
          this.game.fx.burst(at, { count: 20, color: 0x3a3028, speed: 5, spread: 0.8, dir: new Vector3(0, 0.6, 0), life: 1, size: 0.4, gravity: 6, additive: false });
          this.game.sfx('slamBoss', at);
          this.game.shake(0.5);
          const pp = this.player.position;
          if (Math.hypot(pp.x - at.x, pp.z - at.z) < 1.8 && pp.y - at.y < 2) this.game.damagePlayer(1, at);
        }
        if (this.stateT > 0.2) this.recover(1.2);
        break;
      }
      case 'chargeWind':
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 4, dt);
        restCenser();
        if (this.stateT > 0.7 / s) {
          this.chargeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
          this.setState('charge');
        }
        break;
      case 'charge': {
        restCenser();
        const v = this.body.velocity;
        v.x = this.chargeDir.x * 8.5 * s;
        v.z = this.chargeDir.z * 8.5 * s;
        this.strikePlayer(this.position.clone().add(new Vector3(this.chargeDir.x * 1.1, 1, this.chargeDir.z * 1.1)), 1.1, 1);
        if (this.stateT > 0.9 || this.body.touchingWall || !this.groundAhead(this.chargeDir.x, this.chargeDir.z, 1.4)) {
          if (this.body.touchingWall) {
            this.game.shake(0.4);
            this.game.sfx('crumble', this.position);
            this.recover(1.8);
          } else this.recover(0.9);
        }
        break;
      }
      case 'smokeWind':
        this.walk(0, 0, 0, dt);
        restCenser();
        if (this.stateT > 0.6) {
          this.smoke = { pos: this.player.position.clone(), t: 0 };
          this.game.sfx('smoke', this.smoke.pos);
          this.recover(0.8);
        }
        break;
      case 'recover':
        restCenser();
        this.walk(0, 0, 0, dt);
        if (this.stateT > this.recoverT) {
          this.attackCd = (this.phase2 ? 0.5 : 0.9) + Math.random() * 0.5;
          this.setState('approach');
        }
        break;
    }
    this.censer.set(this.position.x + Math.sin(this.censerAngle) * this.censerR, this.position.y + this.censerH, this.position.z + Math.cos(this.censerAngle) * this.censerR);
  }

  private recoverT = 1;
  private recover(t: number): void {
    this.recoverT = t;
    this.setState('recover');
  }

  protected animate(dt: number, t: number): void {
    const vw = this.view;
    if (!vw) return;
    const hs = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    if (this.dormant) {
      // kneeling in prayer, the censer resting on the flagstones
      vw.body.position.y = damp(vw.body.position.y, 0.55 + Math.sin(t * 0.8) * 0.02, 4, dt);
      vw.body.rotation.x = damp(vw.body.rotation.x, 0.45, 4, dt);
      vw.eyes.color.setRGB(0.6, 0.2, 0.08);
      this.censer.set(this.position.x + Math.sin(this.facing) * 1.4, this.position.y + 0.35, this.position.z + Math.cos(this.facing) * 1.4);
      vw.censer.position.copy(this.censer);
      const hand = new Vector3(-0.9, 0.6, 0.7).applyAxisAngle(new Vector3(0, 1, 0), this.facing).add(this.root.position);
      updateChain(vw, hand, this.censer.clone().add(new Vector3(0, 0.3, 0)));
      return;
    }
    vw.body.position.y = 1.0 + Math.abs(Math.sin(t * 4 * Math.min(1, hs))) * 0.05;
    const wind = this.state.endsWith('Wind') ? 1 : 0;
    vw.body.rotation.x = damp(vw.body.rotation.x, this.state === 'charge' ? 0.4 : wind * -0.15, 8, dt);
    vw.head.rotation.x = Math.sin(t * 1.4) * 0.05;
    vw.censer.position.copy(this.censer);
    vw.censer.rotation.y += dt * 3;
    const k = wind ? 1.6 + Math.sin(t * 30) * 0.4 : 1;
    vw.embers.color.setRGB(2.4 * k, 0.9 * k, 0.3 * k);
    vw.eyes.color.setRGB(2.6 * (wind ? 1.4 : 1), 1.0, 0.3);
    const hand = new Vector3(-0.9, 1.0, 0.7).applyAxisAngle(new Vector3(0, 1, 0), this.facing).add(this.root.position);
    updateChain(vw, hand, this.censer.clone().add(new Vector3(0, 0.3, 0)));
    vw.censer.visible = this.root.visible;
    vw.chain.visible = this.root.visible;
    if (this.dead) {
      vw.censer.visible = this.deathT < 0.6;
      vw.chain.visible = this.deathT < 0.6;
    }
  }

  protected onReset(): void {
    this.phase2 = false;
    this.smoke = null;
    this.attackCd = 1.2;
    if (this.view) {
      this.view.censer.visible = true;
      this.view.chain.visible = true;
    }
  }

  dispose(): void {
    super.dispose();
    this.view?.censer.removeFromParent();
    this.view?.chain.removeFromParent();
  }
}

// =================================================================================== Tolling Abbot
export class TollingAbbot extends Enemy {
  private view: AbbotView | null = null;
  private attackCd = 1.5;
  private phase = 1;
  private struck = false;
  private next = 0;
  private jumpFrom = new Vector3();
  private jumpTo = new Vector3();
  private chargeDir = new Vector3();
  private tolls = 0;
  private summoned = false;
  private emberT = 0;
  private recoverT = 1;
  arenaCenter = new Vector3();

  constructor(game: Game, id: string, region: string, pos: Vector3, yaw = 0) {
    super(game, id, region, 'tollingAbbot', {
      health: 90, radius: 1.4, height: 3.6, contactDamage: 1, jade: 150, gravity: 34, flying: false, sight: 30, poise: 14, knockResist: 0.95,
    }, pos, yaw);
    if (!Env.headless) {
      this.view = buildTollingAbbot();
      this.model.add(this.view.root);
      this.registerMaterials(this.view.root);
    }
    this.leash = 40;
    this.hurt[0].radius = 1.6;
    this.arenaCenter.copy(pos);
    this.pogoable = true;
  }

  hurtboxes() {
    this.hurt[0].center.set(this.position.x, this.position.y + 1.8, this.position.z);
    return this.hurt;
  }

  protected onHurt(): void {
    const f = this.health / this.stats.health;
    if (this.phase === 1 && f < 0.6) {
      this.phase = 2;
      this.game.sfx('bellCrack', this.position);
      this.game.shake(0.6);
      this.setState('crack');
    } else if (this.phase === 2 && f < 0.28) {
      this.phase = 3;
      this.game.sfx('bossPhase', this.position);
      this.game.shake(0.6);
      this.setState('crack');
    }
  }

  private pick(): string {
    const d = this.horizDistToPlayer();
    const seq = this.phase === 1 ? ['toll', 'sweep', 'leap', 'charge'] : this.phase === 2 ? ['leap', 'toll', 'charge', 'sweep', 'leap'] : ['leap', 'toll', 'charge', 'leap', 'sweep'];
    let a = seq[this.next++ % seq.length];
    if (a === 'sweep' && d > 5) a = 'leap';
    return a;
  }

  private recover(t: number): void {
    this.recoverT = t;
    this.setState('recover');
  }

  protected think(dt: number): void {
    const yaw = this.yawToPlayer();
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const fast = this.phase >= 3 ? 1.25 : this.phase === 2 ? 1.12 : 1;
    if (this.phase >= 3 && this.state !== 'crack') {
      this.emberT -= dt;
      if (this.emberT <= 0) {
        this.emberT = 1.6;
        const pp = this.player.position;
        for (let i = 0; i < 3; i++) {
          const t = pp.clone().add(new Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
          t.y = this.arenaCenter.y;
          this.game.addEntity(new Ember(this.game, t, 0.5 + i * 0.25));
        }
      }
    }
    switch (this.state) {
      case 'idle':
        this.walk(0, 0, 0, dt);
        if (this.aware || this.canSeePlayer()) {
          this.aware = true;
          this.setState('intro');
          this.game.sfx('bellToll', this.position);
        }
        break;
      case 'intro':
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 2, dt);
        if (this.stateT > 0.2 && this.stateT < 0.25) this.game.addEntity(new Shockwave(this.game, this.position.clone(), 10, 9, 0.4, 0, new Color(1.6, 1.1, 0.4), 0.2));
        if (this.stateT > 1.6) this.setState('stalk');
        break;
      case 'crack':
        this.walk(0, 0, 0, dt);
        if (this.stateT < 0.05) {
          this.game.addEntity(new Shockwave(this.game, this.position.clone(), 12, 10, 0.9, 1, new Color(1.8, 0.5, 0.2)));
          if (this.phase === 2 && !this.summoned) {
            this.summoned = true;
            for (const s of [-1, 1]) {
              const p = this.position.clone().add(new Vector3(s * 4, 0.2, 2));
              const m = spawnEnemy(this.game, 'inkMite', `${this.id}_mite${s}`, this.regionId, p, 0);
              m.spawnedByArena = true;
              m.aware = true;
              m.leash = 30;
              this.game.addEntity(m);
            }
          }
        }
        if (this.stateT > 1.3) this.setState('stalk');
        break;
      case 'stalk': {
        this.turnToward(yaw, 1.8 * fast, dt);
        const d = this.horizDistToPlayer();
        this.walk(fx, fz, d > 4 ? 2.4 * fast : 0, dt);
        this.attackCd -= dt;
        if (this.attackCd <= 0 && this.alivePlayer) {
          this.struck = false;
          const a = this.pick();
          this.setState(a + 'Wind');
          this.tolls = 0;
          this.game.sfx(a === 'toll' ? 'bellWind' : a === 'leap' ? 'bossLeap' : 'guardWindup', this.position);
        }
        break;
      }
      // --- toll: strike the bell, rings roll out along the floor
      case 'tollWind':
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 3, dt);
        if (this.stateT > 0.8 / fast) this.setState('toll');
        break;
      case 'toll': {
        this.walk(0, 0, 0, dt);
        const count = this.phase === 1 ? 2 : 3;
        const interval = 0.75 / fast;
        if (this.tolls < count && this.stateT >= this.tolls * interval) {
          this.tolls++;
          this.game.sfx('bellToll', this.position);
          this.game.shake(0.3);
          this.game.addEntity(new Shockwave(this.game, this.position.clone(), 16, 8 * fast, 1.0, 1, new Color(1.7, 1.2, 0.45), 0.5));
          this.game.fx.flash(this.position.clone().add(new Vector3(0, 3.5, 0)), 5, new Color(1.6, 1.1, 0.5));
        }
        if (this.stateT > count * interval + 0.3) this.recover(0.9);
        break;
      }
      // --- sweep: horn & arms swing in a frontal arc
      case 'sweepWind':
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 2.2, dt);
        if (this.stateT > 0.75 / fast) {
          this.setState('sweep');
          this.game.fx.slash(this.position.clone().add(new Vector3(0, 1.2, 0)), new Vector3(fx, 0, fz), new Vector3(0, 1, 0), 4.8, 2.4, new Color(1.8, 0.5, 0.25), false, 0.25, 0.45);
          this.game.sfx('guardStrike', this.position);
        }
        break;
      case 'sweep': {
        this.walk(fx, fz, this.stateT < 0.2 ? 5 : 0, dt, 50);
        if (!this.struck && this.stateT < 0.25) {
          const pp = this.player.position;
          const d = Math.hypot(pp.x - this.position.x, pp.z - this.position.z);
          const a = Math.abs(angleDelta(this.facing, Math.atan2(pp.x - this.position.x, pp.z - this.position.z)));
          if (d < 4.6 && a < 1.15 && pp.y - this.position.y < 2.2) this.struck = this.game.damagePlayer(1, this.position);
        }
        if (this.stateT > 0.35) this.recover(1.1);
        break;
      }
      // --- leap: jump high, hover over the player's position, slam down
      case 'leapWind':
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 3, dt);
        if (this.stateT > 0.55 / fast) {
          this.jumpFrom.copy(this.position);
          this.jumpTo.copy(this.player.position);
          // keep inside the arena
          _v.subVectors(this.jumpTo, this.arenaCenter);
          _v.y = 0;
          if (_v.length() > 11.5) _v.setLength(11.5);
          this.jumpTo.set(this.arenaCenter.x + _v.x, this.arenaCenter.y, this.arenaCenter.z + _v.z);
          this.game.addEntity(new GroundMarker(this.game, this.jumpTo, 2.8, 1.25 / fast));
          this.setState('leap');
          this.game.sfx('bossJump', this.position);
        }
        break;
      case 'leap': {
        const dur = 1.25 / fast;
        const u = Math.min(1, this.stateT / dur);
        const e = u < 0.7 ? u / 0.7 : 1;
        const x = this.jumpFrom.x + (this.jumpTo.x - this.jumpFrom.x) * e;
        const z = this.jumpFrom.z + (this.jumpTo.z - this.jumpFrom.z) * e;
        const y = this.jumpFrom.y + (u < 0.7 ? Math.sin(e * Math.PI * 0.5) * 9 : 9 * (1 - (u - 0.7) / 0.3));
        this.body.position.set(x, Math.max(this.jumpTo.y, y), z);
        this.body.velocity.set(0, 0, 0);
        if (u >= 1) {
          this.body.position.y = this.jumpTo.y + 0.05;
          this.setState('land');
          this.game.addEntity(new Shockwave(this.game, this.jumpTo.clone(), 11, 10 * fast, 0.9, 1));
          this.game.fx.burst(this.jumpTo.clone(), { count: 40, color: 0x3a2a24, speed: 7, spread: 0.7, dir: new Vector3(0, 0.8, 0), life: 1.1, size: 0.5, gravity: 9, additive: false });
          this.game.sfx('slamBoss', this.jumpTo);
          this.game.shake(0.8);
          const pp = this.player.position;
          if (Math.hypot(pp.x - this.jumpTo.x, pp.z - this.jumpTo.z) < 2.8 && pp.y - this.jumpTo.y < 2.5) this.game.damagePlayer(1, this.jumpTo);
          if (this.phase >= 2) this.tolls = -1;
        }
        return; // manual positioning, skip integrate side-effects via position copy below
      }
      case 'land':
        this.walk(0, 0, 0, dt);
        if (this.tolls === -1 && this.stateT > 0.45) {
          this.tolls = 0;
          this.game.addEntity(new Shockwave(this.game, this.position.clone(), 14, 8, 1.0, 1, new Color(1.7, 1.2, 0.45), 0.5));
          this.game.sfx('bellToll', this.position);
        }
        if (this.stateT > 1.3) this.recover(0.3);
        break;
      // --- charge: horn lowered, rushes across the arena; stunned on wall impact
      case 'chargeWind':
        this.walk(0, 0, 0, dt);
        this.turnToward(yaw, 3.5, dt);
        if (this.stateT > 0.8 / fast) {
          this.chargeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
          this.setState('charge');
          this.game.sfx('bossCharge', this.position);
        }
        break;
      case 'charge': {
        const v = this.body.velocity;
        v.x = this.chargeDir.x * 13 * fast;
        v.z = this.chargeDir.z * 13 * fast;
        this.strikePlayer(this.position.clone().add(new Vector3(this.chargeDir.x * 1.6, 1.2, this.chargeDir.z * 1.6)), 1.5, 1);
        _v.subVectors(this.position, this.arenaCenter);
        _v.y = 0;
        const outOfArena = _v.length() > 11.5 && _v.dot(this.chargeDir) > 0;
        if (this.body.touchingWall || outOfArena || this.stateT > 1.6) {
          this.game.shake(0.7);
          this.game.sfx('crumble', this.position);
          this.game.addEntity(new Shockwave(this.game, this.position.clone(), 6, 9, 0.7, 1, new Color(1.4, 0.7, 0.3)));
          this.setState('stunned');
          this.body.velocity.set(0, 0, 0);
        }
        break;
      }
      case 'stunned':
        this.walk(0, 0, 0, dt);
        if (this.stateT > 1.5) this.setState('stalk');
        break;
      case 'recover':
        this.walk(0, 0, 0, dt);
        if (this.stateT > this.recoverT) {
          this.attackCd = (this.phase >= 2 ? 0.5 : 0.9) + Math.random() * 0.4;
          this.setState('stalk');
        }
        break;
    }
  }

  protected integrate(dt: number): void {
    if (this.state === 'leap') {
      this.position.copy(this.body.position);
      return;
    }
    super.integrate(dt);
  }

  protected animate(dt: number, t: number): void {
    const vw = this.view;
    if (!vw) return;
    const wind = this.state.endsWith('Wind');
    const hs = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    if (this.dormant) {
      // seated vigil beside the great bell; the bell hums faintly
      vw.body.position.y = damp(vw.body.position.y, 0.9 + Math.sin(t * 0.6) * 0.03, 4, dt);
      vw.body.rotation.x = damp(vw.body.rotation.x, 0.3, 4, dt);
      vw.head.rotation.x = 0.35;
      vw.eyes.color.setRGB(0.7, 0.2, 0.08);
      vw.bell.rotation.z = Math.sin(t * 0.9) * 0.04;
      return;
    }
    vw.head.rotation.x = 0;
    vw.body.position.y = 1.6 + Math.abs(Math.sin(t * 3.5 * Math.min(1, hs / 2))) * 0.08;
    // bell: on the back; raised during toll
    const tolling = this.state === 'toll' || this.state === 'tollWind';
    vw.bell.position.y = damp(vw.bell.position.y, tolling ? 3.4 : 2.2, 6, dt);
    vw.bell.position.z = damp(vw.bell.position.z, tolling ? 0.2 : -0.9, 6, dt);
    vw.bell.rotation.z = tolling ? Math.sin(t * 10) * 0.08 : Math.sin(t * 1.2) * 0.03;
    vw.body.rotation.x = damp(vw.body.rotation.x, this.state === 'charge' || this.state === 'chargeWind' ? 0.45 : this.state === 'stunned' ? -0.25 : 0, 8, dt);
    vw.head.rotation.z = this.state === 'stunned' ? Math.sin(t * 8) * 0.2 : 0;
    vw.armL.rotation.x = damp(vw.armL.rotation.x, this.state === 'sweepWind' ? -1.4 : this.state === 'sweep' ? 0.9 : tolling ? -1.9 : 0, 10, dt);
    vw.armR.rotation.x = damp(vw.armR.rotation.x, this.state === 'sweepWind' ? -1.4 : this.state === 'sweep' ? 0.9 : tolling ? -1.9 : 0, 10, dt);
    const k = wind ? 1.5 + Math.sin(t * 25) * 0.4 : 1;
    vw.eyes.color.setRGB(3 * k, 0.9 * k, 0.3 * k);
    vw.crack.opacity = this.phase >= 2 ? (this.phase >= 3 ? 0.9 : 0.55) + Math.sin(t * 6) * 0.15 : 0;
    void clamp;
  }

  protected onReset(): void {
    this.phase = 1;
    this.summoned = false;
    this.attackCd = 1.5;
  }
}
