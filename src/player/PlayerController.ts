import { Vector3 } from 'three';
import { CharacterBody } from '../physics/CharacterBody';
import { PhysicsWorld, playerFilter } from '../physics/PhysicsWorld';
import { approach, approachAngle, yawFromVector } from '../core/math';
import { Abilities, noAbilities } from './Abilities';
import { PlayerTuning, gravityFor, jumpVelocityFor } from './PlayerTuning';

export interface PlayerFrameInput {
  /** World-space desired movement (already camera relative), length 0..1. */
  moveX: number;
  moveZ: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  attackHeld: boolean;
  dashPressed: boolean;
  specialPressed: boolean;
  specialHeld: boolean;
  interactPressed: boolean;
}

export function emptyInput(): PlayerFrameInput {
  return {
    moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, attackPressed: false, attackHeld: false,
    dashPressed: false, specialPressed: false, specialHeld: false, interactPressed: false,
  };
}

export type MoveState =
  | 'idle' | 'run' | 'jump' | 'doubleJump' | 'fall' | 'dash' | 'wallSlide' | 'wallJump'
  | 'hurt' | 'dead' | 'heal' | 'slam' | 'slamLand' | 'locked';

export type AttackKind = 'slash1' | 'slash2' | 'slash3' | 'airSlash' | 'downSlash' | 'upSlash' | 'spin' | 'slam';

export interface ActiveAttack {
  id: number;
  kind: AttackKind;
  t: number;
  duration: number;
  activeStart: number;
  activeEnd: number;
  cancel: number;
  damage: number;
  range: number;
  arc: number;
  knockback: number;
  lunge: number;
  /** Direction of the swing. Horizontal for slashes, (0,-1,0) for down, (0,1,0) up. */
  dir: Vector3;
  hit: Set<unknown>;
}

export type AimResult = { kind: 'down' | 'up' | 'forward'; yaw?: number } | null;

export interface PlayerControllerHooks {
  onJump?(kind: 'ground' | 'double' | 'wall'): void;
  onLand?(impactSpeed: number): void;
  onDash?(dir: Vector3, airborne: boolean): void;
  onAttack?(a: ActiveAttack): void;
  onChargeReady?(): void;
  onHealStart?(): void;
  onHealComplete?(): void;
  onHealCancel?(): void;
  onFlare?(dir: Vector3): void;
  onSlamStart?(): void;
  onSlamLand?(): void;
  onWallCling?(): void;
  onStep?(): void;
  /** Soft aim: decides down/up slashes and swing yaw. */
  aim?(airborne: boolean, facing: number, inputX: number, inputZ: number): AimResult;
  canHeal?(): boolean;
  canFlare?(): boolean;
}

let ATTACK_ID = 1;

/**
 * Deterministic, render-free player movement + melee state machine.
 * Runs at a fixed 60 Hz step so it can be simulated in unit tests.
 */
export class PlayerController {
  readonly body: CharacterBody;
  readonly tuning = PlayerTuning;
  abilities: Abilities = noAbilities();
  hooks: PlayerControllerHooks = {};

  state: MoveState = 'idle';
  stateTime = 0;
  facing = 0;
  attack: ActiveAttack | null = null;
  comboIndex = 0;
  comboTimer = 0;
  attackBuffer = 0;
  chargeT = 0;
  chargeReady = false;
  coyote = 0;
  jumpBuffer = 0;
  jumpCuttable = false;
  airDashes = 1;
  airJumps = 1;
  dashTimer = 0;
  dashCooldown = 0;
  readonly dashDir = new Vector3();
  controlLock = 0;
  wallLock = 0;
  wallStick = 0;
  wallCoyote = 0;
  readonly lastWallNormal = new Vector3();
  iframes = 0;
  healTimer = 0;
  specialHoldT = 0;
  specialPending = false;
  slamTimer = 0;
  landTimer = 0;
  lastImpact = 0;
  /** Distance travelled on ground (for footsteps / animation phase). */
  stridePhase = 0;
  locked = false;
  readonly gravity: number;
  readonly jumpVelocity: number;
  readonly doubleJumpVelocity: number;

  constructor() {
    this.body = new CharacterBody(PlayerTuning.radius, PlayerTuning.height);
    this.body.filter = playerFilter;
    this.gravity = gravityFor(PlayerTuning.jumpHeight, PlayerTuning.timeToApex);
    this.jumpVelocity = jumpVelocityFor(PlayerTuning.jumpHeight, this.gravity);
    this.doubleJumpVelocity = jumpVelocityFor(PlayerTuning.doubleJumpHeight, this.gravity);
  }

  get position(): Vector3 {
    return this.body.position;
  }
  get velocity(): Vector3 {
    return this.body.velocity;
  }
  get grounded(): boolean {
    return this.body.grounded;
  }
  get invulnerable(): boolean {
    return this.iframes > 0 || this.state === 'dead';
  }
  get horizontalSpeed(): number {
    return Math.hypot(this.body.velocity.x, this.body.velocity.z);
  }

  setState(s: MoveState): void {
    if (this.state !== s) {
      this.state = s;
      this.stateTime = 0;
    }
  }

  resetMotion(): void {
    this.body.velocity.set(0, 0, 0);
    this.attack = null;
    this.dashTimer = 0;
    this.controlLock = 0;
    this.wallLock = 0;
    this.chargeT = 0;
    this.chargeReady = false;
    this.specialPending = false;
    this.healTimer = 0;
    this.setState('idle');
  }

  /** Called when a downward/upward slash connects with something bounceable. */
  pogo(): void {
    this.body.velocity.y = this.tuning.pogoVelocity;
    this.body.grounded = false;
    this.airDashes = 1;
    this.airJumps = 1;
    this.jumpCuttable = false;
    this.dashTimer = 0;
    if (this.state !== 'dead') this.setState('jump');
  }

  /** Small push-back when a slash lands (keeps spacing readable). */
  recoil(dirX: number, dirZ: number, amount: number): void {
    if (this.state === 'dash' || this.state === 'dead') return;
    const v = this.body.velocity;
    v.x -= dirX * amount;
    v.z -= dirZ * amount;
  }

  hurt(fromX: number, fromZ: number): boolean {
    if (this.invulnerable) return false;
    const t = this.tuning;
    let dx = this.position.x - fromX;
    let dz = this.position.z - fromZ;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) {
      dx = -Math.sin(this.facing);
      dz = -Math.cos(this.facing);
    } else {
      dx /= len;
      dz /= len;
    }
    this.cancelHeal();
    this.attack = null;
    this.dashTimer = 0;
    this.chargeT = 0;
    this.chargeReady = false;
    this.body.velocity.set(dx * t.hurtKnockback, t.hurtUp, dz * t.hurtKnockback);
    this.body.grounded = false;
    this.controlLock = t.hurtLock;
    this.iframes = t.hurtIFrames;
    this.jumpCuttable = false;
    this.setState('hurt');
    return true;
  }

  kill(): void {
    this.attack = null;
    this.dashTimer = 0;
    this.cancelHeal();
    this.setState('dead');
  }

  private cancelHeal(): void {
    if (this.state === 'heal') this.hooks.onHealCancel?.();
    this.healTimer = 0;
  }

  private startAttack(kind: AttackKind, dir: Vector3): void {
    const t = this.tuning.attack;
    const spec =
      kind === 'slash3' ? t.finisher
      : kind === 'airSlash' ? t.air
      : kind === 'downSlash' ? t.down
      : kind === 'upSlash' ? t.up
      : kind === 'spin' ? t.spin
      : kind === 'slam' ? t.slam
      : t.slash;
    this.attack = {
      id: ATTACK_ID++,
      kind,
      t: 0,
      duration: spec.duration,
      activeStart: spec.activeStart,
      activeEnd: spec.activeEnd,
      cancel: spec.cancel,
      damage: spec.damage,
      range: spec.range,
      arc: spec.arc,
      knockback: spec.knockback,
      lunge: spec.lunge,
      dir: dir.clone(),
      hit: new Set(),
    };
    if (spec.lunge > 0 && this.body.grounded) {
      const v = this.body.velocity;
      v.x += dir.x * spec.lunge;
      v.z += dir.z * spec.lunge;
    }
    this.hooks.onAttack?.(this.attack);
  }

  private tryStartAttack(inputX: number, inputZ: number, mag: number): boolean {
    if (this.attack && this.attack.t < this.attack.cancel) return false;
    const airborne = !this.body.grounded;
    let yaw = this.facing;
    if (mag > 0.25) yaw = yawFromVector(inputX, inputZ);
    const aim = this.hooks.aim?.(airborne, yaw, inputX, inputZ) ?? null;
    if (aim?.yaw !== undefined) yaw = aim.yaw;
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (this.state !== 'wallSlide') this.facing = yaw;
    else {
      // swing away from the wall
      this.facing = yawFromVector(this.body.wallNormal.x, this.body.wallNormal.z);
      fwd.set(this.body.wallNormal.x, 0, this.body.wallNormal.z);
    }
    if (airborne && aim?.kind === 'down') {
      this.startAttack('downSlash', new Vector3(0, -1, 0));
    } else if (aim?.kind === 'up') {
      this.startAttack('upSlash', new Vector3(0, 1, 0));
    } else if (airborne) {
      this.startAttack('airSlash', fwd);
    } else {
      if (this.comboTimer <= 0) this.comboIndex = 0;
      const kind: AttackKind = this.comboIndex === 0 ? 'slash1' : this.comboIndex === 1 ? 'slash2' : 'slash3';
      this.comboIndex = (this.comboIndex + 1) % 3;
      this.startAttack(kind, fwd);
    }
    return true;
  }

  update(dt: number, input: PlayerFrameInput, world: PhysicsWorld): void {
    const t = this.tuning;
    const body = this.body;
    const v = body.velocity;
    this.stateTime += dt;
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.controlLock = Math.max(0, this.controlLock - dt);
    this.wallLock = Math.max(0, this.wallLock - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    this.wallCoyote = Math.max(0, this.wallCoyote - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);

    const locked = this.locked || this.state === 'dead';
    let mx = locked ? 0 : input.moveX;
    let mz = locked ? 0 : input.moveZ;
    let mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
      mag = 1;
    }
    const inp = locked ? emptyInput() : input;
    if (inp.jumpPressed) this.jumpBuffer = t.jumpBuffer;
    if (inp.attackPressed) this.attackBuffer = t.attackBuffer;

    // Attack progression
    if (this.attack) {
      this.attack.t += dt;
      if (this.attack.t >= this.attack.duration) {
        if (this.attack.kind === 'slash1' || this.attack.kind === 'slash2') this.comboTimer = t.comboWindow;
        this.attack = null;
      }
    }

    if (this.state === 'dead') {
      v.x = approach(v.x, 0, 20 * dt);
      v.z = approach(v.z, 0, 20 * dt);
      v.y = Math.max(v.y - this.gravity * dt, -t.maxFall);
      body.move(world, dt, true);
      return;
    }

    const hurtLocked = this.controlLock > 0;
    if (hurtLocked) {
      mx = 0;
      mz = 0;
      mag = 0;
    } else if (this.state === 'hurt') {
      this.setState(body.grounded ? 'idle' : 'fall');
    }

    // ---------------------------------------------------------------- DASH
    const canAct = !hurtLocked && this.state !== 'heal' && this.state !== 'slam' && this.state !== 'slamLand';
    if (
      inp.dashPressed && canAct && this.abilities.dash && this.dashCooldown <= 0 && this.state !== 'dash' &&
      (body.grounded || this.airDashes > 0 || this.state === 'wallSlide')
    ) {
      let dx: number, dz: number;
      if (this.state === 'wallSlide') {
        dx = body.wallNormal.x;
        dz = body.wallNormal.z;
      } else if (mag > 0.2) {
        dx = mx / mag;
        dz = mz / mag;
      } else {
        dx = Math.sin(this.facing);
        dz = Math.cos(this.facing);
      }
      const airborne = !body.grounded;
      if (airborne && this.state !== 'wallSlide') this.airDashes--;
      this.dashDir.set(dx, 0, dz);
      this.dashTimer = t.dashTime;
      this.iframes = Math.max(this.iframes, t.dashIFrames);
      this.attack = null;
      this.chargeT = 0;
      this.chargeReady = false;
      this.facing = yawFromVector(dx, dz);
      this.setState('dash');
      this.hooks.onDash?.(this.dashDir, airborne);
    }

    if (this.state === 'dash') {
      this.dashTimer -= dt;
      const groundJump = this.jumpBuffer > 0 && (body.grounded || this.coyote > 0);
      if (this.dashTimer <= 0 || groundJump) {
        this.dashCooldown = t.dashCooldown;
        v.x = this.dashDir.x * t.runSpeed * (mag > 0.2 ? 1 : t.dashExitSpeedMul);
        v.z = this.dashDir.z * t.runSpeed * (mag > 0.2 ? 1 : t.dashExitSpeedMul);
        v.y = 0;
        this.setState(body.grounded ? 'run' : 'fall');
        if (!groundJump) {
          this.finishMove(world, dt, mx, mz, mag);
          return;
        }
      } else {
        v.set(this.dashDir.x * t.dashSpeed, 0, this.dashDir.z * t.dashSpeed);
        if (body.grounded) {
          const n = body.groundNormal;
          if (n.y < 0.999) v.y = -(n.x * v.x + n.z * v.z) / n.y;
        }
        body.move(world, dt, true);
        if (body.grounded) {
          this.coyote = t.coyoteTime;
          this.airDashes = 1;
          this.airJumps = 1;
        }
        return;
      }
    }

    // ---------------------------------------------------------------- SLAM
    if (this.state === 'slam') {
      if (this.stateTime < t.slamWindup) {
        v.set(0, 2, 0);
      } else {
        v.set(0, -t.slamSpeed, 0);
      }
      body.move(world, dt, false);
      if (body.grounded) {
        this.setState('slamLand');
        this.startAttack('slam', new Vector3(0, -1, 0));
        this.hooks.onSlamLand?.();
      }
      return;
    }
    if (this.state === 'slamLand') {
      v.x = approach(v.x, 0, 60 * dt);
      v.z = approach(v.z, 0, 60 * dt);
      if (this.stateTime >= t.slamRecover) this.setState('idle');
      body.move(world, dt, true);
      return;
    }

    // ---------------------------------------------------------------- SPECIAL (heal / flare / slam)
    if (inp.specialPressed && canAct) {
      if (!body.grounded && this.abilities.bellStrike) {
        this.attack = null;
        this.setState('slam');
        this.hooks.onSlamStart?.();
        body.move(world, dt, false);
        return;
      }
      if (!body.grounded) {
        if (this.abilities.lanternFlare && (this.hooks.canFlare?.() ?? true)) this.fireFlare();
      } else {
        this.specialPending = true;
        this.specialHoldT = 0;
      }
    }
    if (this.specialPending) {
      if (inp.specialHeld && body.grounded && !hurtLocked) {
        this.specialHoldT += dt;
        const holdNeeded = this.abilities.lanternFlare ? t.specialTapTime : 0.08;
        if (this.specialHoldT >= holdNeeded) {
          this.specialPending = false;
          if (this.hooks.canHeal?.() ?? true) {
            this.attack = null;
            this.healTimer = 0;
            this.setState('heal');
            this.hooks.onHealStart?.();
          }
        }
      } else {
        this.specialPending = false;
        if (this.specialHoldT < t.specialTapTime && this.abilities.lanternFlare && !hurtLocked &&
            (this.hooks.canFlare?.() ?? true)) {
          this.fireFlare();
        }
      }
    }
    if (this.state === 'heal') {
      if (!inp.specialHeld || !body.grounded || hurtLocked) {
        this.cancelHeal();
        this.setState('idle');
      } else {
        this.healTimer += dt;
        if (this.healTimer >= t.healTime) {
          this.hooks.onHealComplete?.();
          this.healTimer = 0;
          if (!(this.hooks.canHeal?.() ?? true)) this.setState('idle');
        }
        v.x = approach(v.x, 0, 60 * dt);
        v.z = approach(v.z, 0, 60 * dt);
        v.y = Math.min(v.y, 0) - this.gravity * dt;
        body.move(world, dt, true);
        return;
      }
    }

    // ---------------------------------------------------------------- JUMP
    let jumped = false;
    if (this.jumpBuffer > 0 && !hurtLocked) {
      const onWall = this.state === 'wallSlide' || (this.abilities.wallCling && this.wallCoyote > 0 && !body.grounded);
      if (onWall) {
        const n = this.state === 'wallSlide' ? body.wallNormal : this.lastWallNormal;
        v.x = n.x * t.wallJumpOut;
        v.z = n.z * t.wallJumpOut;
        v.y = t.wallJumpUp;
        this.wallLock = t.wallJumpLock;
        this.wallCoyote = 0;
        this.facing = yawFromVector(n.x, n.z);
        this.setState('wallJump');
        this.hooks.onJump?.('wall');
        jumped = true;
      } else if (body.grounded || this.coyote > 0) {
        v.y = this.jumpVelocity;
        this.setState('jump');
        this.hooks.onJump?.('ground');
        jumped = true;
      } else if (this.abilities.doubleJump && this.airJumps > 0) {
        this.airJumps--;
        v.y = this.doubleJumpVelocity;
        this.setState('doubleJump');
        this.hooks.onJump?.('double');
        jumped = true;
      }
      if (jumped) {
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.jumpCuttable = true;
        body.grounded = false;
        if (this.attack && this.attack.t >= this.attack.cancel) this.attack = null;
      }
    }
    if (this.jumpCuttable && v.y > 0 && !inp.jumpHeld) {
      v.y *= t.jumpCutMul;
      this.jumpCuttable = false;
    }
    if (v.y <= 0) this.jumpCuttable = false;

    // ---------------------------------------------------------------- ATTACK
    if (!hurtLocked && this.state !== 'heal') {
      if (this.attackBuffer > 0 && this.tryStartAttack(mx, mz, mag)) {
        this.attackBuffer = 0;
        this.chargeT = 0;
        this.chargeReady = false;
      }
      if (this.abilities.chargedSlash) {
        if (inp.attackHeld) {
          this.chargeT += dt;
          if (!this.chargeReady && this.chargeT >= t.chargeTime) {
            this.chargeReady = true;
            this.hooks.onChargeReady?.();
          }
        } else {
          if (this.chargeReady && (!this.attack || this.attack.t >= this.attack.cancel)) {
            this.startAttack('spin', new Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)));
          }
          this.chargeT = 0;
          this.chargeReady = false;
        }
      }
    }

    this.finishMove(world, dt, mx, mz, mag, jumped);
  }

  get charging(): boolean {
    return this.abilities.chargedSlash && this.chargeT > this.tuning.chargeDelay;
  }

  private fireFlare(): void {
    const dir = new Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.hooks.onFlare?.(dir);
  }

  private finishMove(world: PhysicsWorld, dt: number, mx: number, mz: number, mag: number, jumped = false): void {
    const t = this.tuning;
    const body = this.body;
    const v = body.velocity;

    // ------------------------------------------------ horizontal
    let speedMul = 1;
    if (this.attack && body.grounded) speedMul = t.groundAttackMoveMul;
    if (this.charging && body.grounded) speedMul = Math.min(speedMul, 0.55);
    if (this.landTimer > 0) speedMul = Math.min(speedMul, 0.35);
    // Analog: gentle curve so small tilts give precise slow movement.
    const analog = mag < 0.95 ? mag * (0.4 + 0.6 * mag) / 1 : 1;
    const targetX = mx / (mag || 1) * analog * t.runSpeed * speedMul;
    const targetZ = mz / (mag || 1) * analog * t.runSpeed * speedMul;
    let accel: number;
    if (body.grounded) {
      if (mag > 0.08) accel = v.x * targetX + v.z * targetZ < 0 ? t.turnAccel : t.groundAccel;
      else accel = t.groundDecel;
    } else {
      accel = mag > 0.08 ? t.airAccel : t.airDecel;
      if (this.wallLock > 0) accel *= 0.15;
    }
    if (this.controlLock > 0) accel = body.grounded ? 25 : 4;
    const dvx = targetX - v.x, dvz = targetZ - v.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl <= maxDv) {
      v.x = targetX;
      v.z = targetZ;
    } else {
      v.x += (dvx / dl) * maxDv;
      v.z += (dvz / dl) * maxDv;
    }

    // ------------------------------------------------ facing
    if (this.state === 'wallSlide') {
      this.facing = yawFromVector(body.wallNormal.x, body.wallNormal.z);
    } else if (!this.attack && !this.charging && mag > 0.1 && this.controlLock <= 0) {
      this.facing = approachAngle(this.facing, yawFromVector(mx, mz), t.turnRate * dt);
    }

    // ------------------------------------------------ vertical
    if (body.grounded && !jumped) {
      const n = body.groundNormal;
      const gc = body.groundCollider;
      // Follow real slopes (ramps); flat tops ignore edge-contact normals.
      v.y = n.y < 0.999 && gc && !gc.upright ? -(n.x * v.x + n.z * v.z) / n.y : 0;
      v.y -= 0.5; // keep contact
    } else {
      let g = this.gravity;
      if (v.y < 0) g *= t.fallGravityMul;
      else if (v.y < t.apexThreshold && this.jumpCuttable) g *= t.apexGravityMul;
      v.y -= g * dt;
      if (this.state === 'wallSlide') v.y = Math.max(v.y, -t.wallSlideSpeed);
      v.y = Math.max(v.y, -t.maxFall);
    }

    // ------------------------------------------------ wall cling
    if (this.abilities.wallCling && !body.grounded && this.state !== 'dash' && this.controlLock <= 0) {
      const wc = body.wallCollider;
      if (this.state !== 'wallSlide' && body.touchingWall && wc?.climbable && this.wallLock <= 0) {
        const into = -(mx * body.wallNormal.x + mz * body.wallNormal.z);
        // Holding into the wall clings at any time; brushing into it clings once the rise slows.
        if (into > 0.3 || (body.wallHitSpeed > 1.5 && v.y <= 6)) {
          if (v.y > 0) v.y *= 0.3;
          this.setState('wallSlide');
          this.airDashes = 1;
          this.airJumps = 1;
          this.wallStick = 0;
          if (v.y < -1) v.y = -1;
          this.attack = null;
          this.hooks.onWallCling?.();
        }
      }
    }
    if (this.state === 'wallSlide') {
      const n = body.wallNormal;
      const away = mx * n.x + mz * n.z;
      if (away > 0.5) this.wallStick += dt;
      else this.wallStick = 0;
      // hug the wall so contact persists
      v.x = -n.x * 2;
      v.z = -n.z * 2;
      if (this.wallStick > t.wallDetachTime) {
        v.x = n.x * 3;
        v.z = n.z * 3;
        this.setState('fall');
      }
    }

    // Slide off non-walkable tops (roofs, railings) instead of perching on them.
    if (body.slideFrom && !body.grounded) {
      const c = body.slideFrom;
      let sx = body.position.x - c.center.x, sz = body.position.z - c.center.z;
      const sl = Math.hypot(sx, sz) || 1;
      sx /= sl;
      sz /= sl;
      v.x += sx * 30 * dt;
      v.z += sz * 30 * dt;
      const hv = v.x * sx + v.z * sz;
      if (hv < 3) {
        v.x += sx * (3 - hv);
        v.z += sz * (3 - hv);
      }
    }
    const prevVy = v.y;
    body.move(world, dt, !jumped && this.state !== 'jump' && this.state !== 'doubleJump' && this.state !== 'wallJump');

    // ------------------------------------------------ post
    if (this.state === 'wallSlide') {
      if (!body.touchingWall || !body.wallCollider?.climbable) {
        this.wallCoyote = t.wallCoyote;
        this.setState('fall');
      } else {
        this.lastWallNormal.copy(body.wallNormal);
      }
    }
    if (body.touchingWall && body.wallCollider?.climbable && this.abilities.wallCling && !body.grounded) {
      this.lastWallNormal.copy(body.wallNormal);
      if (this.state === 'wallSlide') this.wallCoyote = t.wallCoyote;
    }

    if (body.grounded) {
      if (!body.wasGrounded) {
        this.lastImpact = -prevVy;
        if (this.lastImpact > t.hardLandSpeed) this.landTimer = 0.14;
        this.hooks.onLand?.(this.lastImpact);
        this.jumpCuttable = false;
      }
      this.coyote = t.coyoteTime;
      this.airDashes = 1;
      this.airJumps = 1;
      if (this.state !== 'hurt' && this.state !== 'heal') {
        const moving = Math.hypot(v.x, v.z) > 0.4 && mag > 0.05;
        this.setState(moving ? 'run' : 'idle');
      }
      // Stride for footsteps
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0.5) {
        const before = Math.floor(this.stridePhase);
        this.stridePhase += (hs * dt) / 1.05;
        if (Math.floor(this.stridePhase) !== before) this.hooks.onStep?.();
      }
    } else {
      if (this.state === 'idle' || this.state === 'run') this.setState('fall');
      if ((this.state === 'jump' || this.state === 'doubleJump' || this.state === 'wallJump') && v.y < 0) this.setState('fall');
    }
    if (body.hitCeiling) this.jumpCuttable = false;
  }
}
