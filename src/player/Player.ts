import { CircleGeometry, Color, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Game } from '../game/Game';
import { PlayerController, PlayerFrameInput, emptyInput, AimResult } from './PlayerController';
import { buildPlayerModel, PlayerView } from '../art/characters/PlayerModel';
import { PlayerAnimator } from './PlayerAnimator';
import { StepInput } from '../input/InputState';
import { attackHits, isActive, Damageable, HitInfo } from '../combat/Combat';
import { yawFromVector, angleDelta } from '../core/math';
import { glowTexture } from '../art/textures';
import { Env } from '../core/env';

const _o = new Vector3();
const _dir = new Vector3();
const _tmp = new Vector3();
const _down = new Vector3(0, -1, 0);

export const MOONLIGHT_PER_HIT = 11;

/** The player entity: controller + visuals + combat resolution + stats. */
export class Player {
  readonly ctrl = new PlayerController();
  readonly view: PlayerView | null;
  readonly anim: PlayerAnimator | null;
  health = 5;
  maxHealth = 5;
  moonlight = 0;
  maxMoonlight = 99;
  readonly prevPos = new Vector3();
  private frameInput: PlayerFrameInput = emptyInput();
  private shadow: Mesh | null = null;
  private shadowMat: MeshBasicMaterial | null = null;
  lastHitTime = 0;
  lockTarget: Damageable | null = null;
  deathTimer = 0;
  private fallTimer = 0;

  constructor(private game: Game) {
    const c = this.ctrl;
    if (!Env.headless) {
      this.view = buildPlayerModel();
      this.anim = new PlayerAnimator(this.view, c);
      game.scene.add(this.view.root);
      game.scene.add(this.view.scarf.mesh);
      this.shadowMat = new MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
      this.shadow = new Mesh(new CircleGeometry(0.45, 16), this.shadowMat);
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.renderOrder = 2;
      game.scene.add(this.shadow);
    } else {
      this.view = null;
      this.anim = null;
    }
    c.hooks = {
      onJump: (k) => {
        this.anim?.onJump(k);
        game.sfx(k === 'double' ? 'wingbeat' : k === 'wall' ? 'walljump' : 'jump', this.position);
        if (k === 'double') {
          game.fx.burst(_tmp.copy(this.position).add(new Vector3(0, 0.5, 0)), { count: 14, color: new Color(0.6, 1.4, 1.2), speed: 3, spread: 1, life: 0.35, size: 0.1, gravity: 2 });
          game.fx.ring(_tmp.copy(this.position).add(new Vector3(0, 0.3, 0)), 1.3, new Color(0.5, 1.2, 1.0), 0.35, 0.6);
        }
        if (k === 'wall') game.fx.burst(this.position.clone().add(new Vector3(0, 0.5, 0)), { count: 8, color: 0x9aa0a8, speed: 2, life: 0.3, size: 0.1, additive: false, gravity: 5 });
      },
      onLand: (impact) => {
        this.anim?.onLand(impact);
        if (impact > 4) {
          game.sfx(impact > 16 ? 'landHeavy' : 'land', this.position, Math.min(1, impact / 16));
          game.fx.burst(this.position.clone().add(new Vector3(0, 0.05, 0)), {
            count: Math.min(16, Math.round(impact)), color: 0x8b93a0, speed: 1.5 + impact * 0.12, spread: 1, dir: new Vector3(0, 0.3, 0),
            life: 0.45, size: 0.14, gravity: 3, additive: false,
          });
        }
        if (impact > c.tuning.hardLandSpeed) game.shake(0.25);
      },
      onDash: (dir, air) => {
        this.anim?.onDash();
        game.sfx('dash', this.position);
        game.fx.burst(this.position.clone().add(new Vector3(0, 0.5, 0)), { count: 12, color: new Color(0.7, 1.2, 1.3), speed: 5, dir: dir.clone().multiplyScalar(-1), spread: 0.4, life: 0.3, size: 0.12, gravity: 0 });
        if (air) game.fx.ring(this.position.clone().add(new Vector3(0, 0.5, 0)), 1.0, new Color(0.6, 1.1, 1.1), 0.25, 0.5, dir);
      },
      onAttack: (a) => {
        game.sfx(a.kind === 'spin' ? 'spin' : a.kind === 'slash3' ? 'slashHeavy' : 'slash', this.position);
        game.playerAttackFx(a, this);
      },
      onChargeReady: () => {
        game.sfx('chargeReady', this.position);
        game.fx.flash(this.position.clone().add(new Vector3(0, 0.6, 0)), 1.6, new Color(0.8, 1.6, 1.4));
      },
      onHealStart: () => game.sfx('healStart', this.position),
      onHealComplete: () => {
        if (this.moonlight >= c.tuning.healCost && this.health < this.maxHealth) {
          this.moonlight -= c.tuning.healCost;
          this.health = Math.min(this.maxHealth, this.health + 1);
          game.sfx('heal', this.position);
          game.fx.burst(this.position.clone().add(new Vector3(0, 0.6, 0)), { count: 26, color: new Color(1.4, 1.3, 0.9), speed: 2.5, spread: 1, life: 0.8, size: 0.12, gravity: -1.5 });
          game.fx.ring(this.position.clone().add(new Vector3(0, 0.1, 0)), 2.2, new Color(1.3, 1.2, 0.8), 0.6, 0.7);
          game.events.emit('playerHealed', { health: this.health });
        }
      },
      onHealCancel: () => game.stopSfx('healStart'),
      onFlare: (dir) => {
        if (this.moonlight < c.tuning.flareCost) return;
        this.moonlight -= c.tuning.flareCost;
        game.spawnFlare(this.position.clone().add(new Vector3(0, 0.6, 0)).addScaledVector(dir, 0.4), dir);
      },
      onSlamStart: () => game.sfx('slamStart', this.position),
      onSlamLand: () => {
        game.sfx('slam', this.position);
        game.shake(0.55);
        game.hitstop(0.06);
        game.fx.ring(this.position.clone().add(new Vector3(0, 0.08, 0)), 4, new Color(1.4, 1.1, 0.6), 0.45, 0.9);
        game.fx.burst(this.position.clone().add(new Vector3(0, 0.1, 0)), { count: 30, color: 0x9a9080, speed: 7, spread: 0.6, dir: new Vector3(0, 0.6, 0), life: 0.7, size: 0.18, gravity: 12, additive: false });
        game.onSlamImpact(this.position);
      },
      onWallCling: () => game.sfx('cling', this.position),
      onStep: () => game.sfx('step', this.position),
      aim: (airborne, facing, ix, iz) => this.aim(airborne, facing, ix, iz),
      canHeal: () => this.moonlight >= c.tuning.healCost && this.health < this.maxHealth,
      canFlare: () => this.moonlight >= c.tuning.flareCost,
    };
  }

  get position(): Vector3 {
    return this.ctrl.body.position;
  }
  get dead(): boolean {
    return this.ctrl.state === 'dead';
  }

  /** Soft aim: pick down/up slashes and swing direction toward nearby foes. */
  private aim(airborne: boolean, facing: number, ix: number, iz: number): AimResult {
    const p = this.position;
    const hasInput = Math.hypot(ix, iz) > 0.25;
    let best: { yaw: number; score: number } | null = null;
    let down = false, up = false;
    for (const d of this.game.damageables) {
      if (!d.canBeHit()) continue;
      for (const hb of d.hurtboxes()) {
        _dir.subVectors(hb.center, p);
        const h = Math.hypot(_dir.x, _dir.z);
        if (airborne && -_dir.y > 0.2 && -_dir.y < 3.4 && h < 1.4 + hb.radius) down = true;
        if (_dir.y > 1.1 && _dir.y < 3.4 && h < 1.2 + hb.radius) up = true;
        if (h > 3.6 + hb.radius || Math.abs(_dir.y - 0.5) > 2.2) continue;
        const yaw = yawFromVector(_dir.x, _dir.z);
        const off = Math.abs(angleDelta(facing, yaw));
        if (off > (hasInput ? 1.0 : 1.6)) continue;
        const score = h + off * 1.5;
        if (!best || score < best.score) best = { yaw, score };
      }
    }
    if (airborne && !down) {
      // pogo surfaces (thorn lotus etc.) directly below
      _o.copy(p).y += 0.3;
      const hit = this.game.physics.raycast(_o, _down, 2.8);
      if (hit && hit.collider.pogo) down = true;
    }
    if (down) return { kind: 'down' };
    if (up && !best) return { kind: 'up' };
    if (this.lockTarget && this.lockTarget.canBeHit()) {
      const hb = this.lockTarget.hurtboxes()[0];
      if (hb) {
        _dir.subVectors(hb.center, p);
        if (Math.hypot(_dir.x, _dir.z) < 6) return { kind: 'forward', yaw: yawFromVector(_dir.x, _dir.z) };
      }
    }
    return best ? { kind: 'forward', yaw: best.yaw } : null;
  }

  buildInput(step: StepInput): PlayerFrameInput {
    const f = this.frameInput;
    const b = this.game.cam.basis();
    f.moveX = b.rx * step.moveX + b.fx * step.moveY;
    f.moveZ = b.rz * step.moveX + b.fz * step.moveY;
    f.jumpPressed = step.pressed.jump;
    f.jumpHeld = step.held.jump;
    f.attackPressed = step.pressed.attack;
    f.attackHeld = step.held.attack;
    f.dashPressed = step.pressed.dash;
    f.specialPressed = step.pressed.special;
    f.specialHeld = step.held.special;
    f.interactPressed = step.pressed.interact;
    return f;
  }

  fixedUpdate(dt: number, step: StepInput): void {
    const c = this.ctrl;
    this.prevPos.copy(c.body.position);
    const inp = this.buildInput(step);
    c.update(dt, inp, this.game.physics);

    if (c.state === 'dead') {
      this.deathTimer += dt;
      return;
    }
    // Resolve melee hits during active frames
    const a = c.attack;
    if (a && isActive(a)) {
      const facing = c.facing;
      let pogoed = false;
      for (const d of this.game.damageables) {
        if (a.hit.has(d) || !d.canBeHit()) continue;
        for (const hb of d.hurtboxes()) {
          if (!attackHits(a, c.position, facing, hb)) continue;
          a.hit.add(d);
          const dir = a.kind === 'downSlash' ? new Vector3(0, -1, 0) : a.kind === 'upSlash' ? new Vector3(0, 1, 0)
            : new Vector3().subVectors(hb.center, c.position).setY(0).normalize();
          const hit: HitInfo = {
            damage: a.damage, dir, knockback: a.knockback, kind: a.kind,
            point: hb.center.clone().lerp(c.position.clone().setY(hb.center.y), 0.35), fromPlayer: true,
          };
          const res = d.takeHit(hit);
          if (res === 'ignored') break;
          this.game.onPlayerHit(d, hit, res, a);
          if (a.kind === 'downSlash' && d.pogoable) pogoed = true;
          else if (a.kind !== 'spin' && a.kind !== 'slam' && a.kind !== 'downSlash' && a.kind !== 'upSlash') {
            c.recoil(dir.x, dir.z, res === 'blocked' ? 6 : 2.6);
          }
          if (d.givesMoonlight && res !== 'blocked') {
            this.moonlight = Math.min(this.maxMoonlight, this.moonlight + MOONLIGHT_PER_HIT);
          }
          break;
        }
      }
      // pogo off hazard surfaces
      if (a.kind === 'downSlash' && !pogoed && !a.hit.has('ground')) {
        _o.copy(c.position).y += 0.3;
        const hit = this.game.physics.raycast(_o, _down, 1.9);
        if (hit && hit.collider.pogo) {
          a.hit.add('ground');
          pogoed = true;
          this.game.sfx('pogo', hit.point);
          this.game.fx.burst(hit.point, { count: 10, color: new Color(1.4, 0.4, 0.3), speed: 3, life: 0.3, size: 0.1 });
        }
      }
      if (pogoed) {
        c.pogo();
        this.game.hitstop(0.035);
      }
    }

    // Hazards
    const body = c.body;
    if (body.hazard && (!c.invulnerable || this.game.isAbyss(body.hazard))) {
      this.game.hazardHit(body.hazard.hazard, this.game.isAbyss(body.hazard));
    }
    if (c.position.y < this.game.killY) {
      this.fallTimer += dt;
      if (this.fallTimer > 0.05) {
        this.fallTimer = 0;
        this.game.hazardHit(1, true);
      }
    }
    this.game.fx.attractTarget.copy(c.position).y += 0.6;
  }

  /** Enemy/hazard damage. Returns true if applied. */
  damage(amount: number, fromX: number, fromZ: number): boolean {
    const c = this.ctrl;
    if (c.invulnerable || this.dead) return false;
    if (!c.hurt(fromX, fromZ)) return false;
    this.health = Math.max((this.game as unknown as { god: boolean }).god ? 1 : 0, this.health - amount);
    this.anim?.onHurt();
    this.lastHitTime = this.game.time;
    if (this.health <= 0) {
      c.kill();
      this.deathTimer = 0;
    }
    return true;
  }

  render(dt: number, alpha: number, t: number): void {
    const v = this.view;
    if (!v) return;
    const c = this.ctrl;
    v.root.position.lerpVectors(this.prevPos, c.body.position, alpha);
    v.root.rotation.y = c.facing;
    this.anim!.update(dt, t);
    // blob shadow
    if (this.shadow && this.shadowMat) {
      _o.copy(v.root.position).y += 0.3;
      const hit = this.game.physics.raycast(_o, _down, 30);
      if (hit && hit.normal.y > 0.3) {
        const h = _o.y - 0.3 - hit.point.y;
        this.shadow.visible = true;
        this.shadow.position.copy(hit.point).y += 0.03;
        const s = Math.max(0.45, 1 - h * 0.05);
        this.shadow.scale.setScalar(s);
        this.shadowMat.opacity = Math.max(0.12, 0.7 - h * 0.035);
      } else this.shadow.visible = false;
    }
  }

  setVisible(v: boolean): void {
    if (this.view) {
      this.view.root.visible = v;
      this.view.scarf.mesh.visible = v;
    }
    if (this.shadow) this.shadow.visible = v;
  }
}
