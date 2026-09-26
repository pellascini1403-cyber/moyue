import { Vector3 } from 'three';
import { Pose, curve } from '../anim/Rig';
import { PlayerView } from '../art/characters/PlayerModel';
import { PlayerController } from './PlayerController';
import { damp } from '../core/math';

const _anchor = new Vector3();
const _right = new Vector3();
const _back = new Vector3();

/**
 * Procedural animation for the protagonist. Poses are derived from the
 * controller state every frame (never the other way round), so animation can
 * never delay input: attacks, jumps and dashes start on the frame they happen.
 */
export class PlayerAnimator {
  private squash = 0; // + stretch / - squash
  private squashV = 0;
  private lastState = '';
  private landImpact = 0;
  private idleT = 0;
  private lookAround = 0;
  private wingSpread = 0;
  private wingFlap = 0;
  private robeFlare = 0;
  private glow = 0;
  private hurtFlash = 0;
  private deadT = 0;
  private scarfInit = false;

  constructor(private view: PlayerView, private ctrl: PlayerController) {}

  onJump(kind: 'ground' | 'double' | 'wall'): void {
    this.squashV += kind === 'double' ? 3 : 5;
    if (kind === 'double') this.wingFlap = 1;
  }
  onLand(impact: number): void {
    this.landImpact = Math.min(1, impact / 18);
    this.squashV -= 2 + this.landImpact * 7;
  }
  onDash(): void {
    this.wingSpread = 1;
    this.squashV += 2;
  }
  onHurt(): void {
    this.hurtFlash = 1;
  }

  update(dt: number, t: number): void {
    const c = this.ctrl;
    const v = this.view;
    const rig = v.rig;
    const st = c.state;
    if (st !== this.lastState) {
      if (st === 'dead') this.deadT = 0;
      this.lastState = st;
    }
    const hs = c.horizontalSpeed;
    const speedK = Math.min(1, hs / c.tuning.runSpeed);
    const pose: Pose = {};
    let lambda = 18;
    let hipY = 0;

    // --------------------------------------------------------------- base locomotion
    const breathe = Math.sin(t * 2.1);
    switch (st) {
      case 'idle': {
        this.idleT += dt;
        const look = Math.sin(this.idleT * 0.35) > 0.7 ? Math.sin(this.idleT * 0.9) * 0.45 : 0;
        this.lookAround = damp(this.lookAround, look, 2, dt);
        pose.spine = { x: 0.06 + breathe * 0.02 };
        pose.chest = { x: 0.02 + breathe * 0.015 };
        pose.head = { x: -0.06 + Math.sin(t * 2.1 + 1) * 0.02, y: this.lookAround };
        pose.shoulderL = { z: 0.14 + breathe * 0.02, x: 0.05 };
        pose.elbowL = { x: -0.2 };
        pose.shoulderR = { z: -0.2, x: -0.25 };
        pose.elbowR = { x: -0.45 };
        pose.blade = { x: 0.95, z: 0.15 };
        pose.legL = { x: -0.05, z: 0.04 };
        pose.legR = { x: 0.08, z: -0.04 };
        pose.shinL = { x: 0.1 };
        pose.shinR = { x: 0.12 };
        pose.antL = { z: Math.sin(t * 1.3) * 0.12, x: Math.sin(t * 0.9) * 0.1 };
        pose.antR = { z: -Math.sin(t * 1.1 + 1) * 0.12, x: Math.sin(t * 0.8 + 2) * 0.1 };
        hipY = -0.005 + breathe * 0.004;
        lambda = 10;
        break;
      }
      case 'run': {
        this.idleT = 0;
        const p = c.stridePhase * Math.PI;
        const s = Math.sin(p);
        const k = 0.35 + speedK * 0.65;
        pose.legL = { x: -s * 0.95 * k };
        pose.legR = { x: s * 0.95 * k };
        pose.shinL = { x: (0.25 + Math.max(0, Math.cos(p)) * 1.2) * k };
        pose.shinR = { x: (0.25 + Math.max(0, -Math.cos(p)) * 1.2) * k };
        pose.spine = { x: 0.18 + 0.22 * speedK, y: s * 0.12 };
        pose.chest = { y: -s * 0.18, x: 0.05 };
        pose.head = { x: -0.22 * speedK, y: s * 0.08 };
        pose.shoulderL = { x: s * 0.8 * k, z: 0.12 };
        pose.elbowL = { x: -0.6 };
        pose.shoulderR = { x: 0.55, z: -0.25 };
        pose.elbowR = { x: -0.25 };
        pose.blade = { x: 1.9, z: 0.1 };
        pose.antL = { x: 0.5 * speedK };
        pose.antR = { x: 0.5 * speedK };
        hipY = Math.abs(Math.cos(p)) * 0.035 * k - 0.02;
        lambda = 22;
        break;
      }
      case 'jump':
      case 'wallJump':
      case 'doubleJump': {
        const rising = c.velocity.y > 0;
        pose.legL = { x: -0.9 };
        pose.shinL = { x: 1.5 };
        pose.legR = { x: 0.25 };
        pose.shinR = { x: 0.7 };
        pose.spine = { x: rising ? 0.05 : 0.15 };
        pose.head = { x: -0.15 };
        pose.shoulderL = { x: -0.4, z: 0.6 };
        pose.elbowL = { x: -0.5 };
        pose.shoulderR = { x: 0.4, z: -0.5 };
        pose.elbowR = { x: -0.3 };
        pose.blade = { x: 1.6 };
        pose.antL = { x: 0.6 };
        pose.antR = { x: 0.6 };
        if (st === 'doubleJump') {
          // tuck-and-spin: a quick forward roll driven by time in state
          const u = Math.min(1, c.stateTime / 0.32);
          pose.spine = { x: 0.4 + Math.sin(u * Math.PI) * 0.6 };
          pose.legL = { x: -1.3 };
          pose.legR = { x: -1.1 };
          pose.shinL = { x: 2.0 };
          pose.shinR = { x: 1.9 };
        }
        lambda = 20;
        break;
      }
      case 'fall': {
        const f = Math.min(1, -c.velocity.y / 18);
        pose.legL = { x: -0.35 + f * 0.2, z: 0.1 };
        pose.shinL = { x: 0.6 };
        pose.legR = { x: 0.3, z: -0.1 };
        pose.shinR = { x: 0.45 };
        pose.spine = { x: 0.05 - f * 0.1 };
        pose.head = { x: 0.15 * f };
        pose.shoulderL = { x: -0.3, z: 0.7 + f * 0.4 };
        pose.elbowL = { x: -0.4 };
        pose.shoulderR = { x: 0.2, z: -0.7 - f * 0.3 };
        pose.elbowR = { x: -0.3 };
        pose.blade = { x: 1.4 };
        pose.antL = { x: -0.3 * f };
        pose.antR = { x: -0.3 * f };
        lambda = 12;
        break;
      }
      case 'dash': {
        pose.spine = { x: 0.75 };
        pose.chest = { x: 0.1 };
        pose.head = { x: -0.55 };
        pose.legL = { x: 0.9 };
        pose.shinL = { x: 0.9 };
        pose.legR = { x: 1.2 };
        pose.shinR = { x: 0.5 };
        pose.shoulderL = { x: 1.2, z: 0.2 };
        pose.shoulderR = { x: 1.3, z: -0.2 };
        pose.blade = { x: 2.6 };
        pose.antL = { x: 1.0 };
        pose.antR = { x: 1.0 };
        lambda = 40;
        break;
      }
      case 'wallSlide': {
        pose.spine = { x: -0.15 };
        pose.head = { x: 0.1, y: 0.2 };
        pose.legL = { x: -0.8, z: 0.3 };
        pose.shinL = { x: 1.3 };
        pose.legR = { x: -0.4, z: -0.2 };
        pose.shinR = { x: 1.1 };
        pose.shoulderL = { x: 0.9, z: 0.9 };
        pose.elbowL = { x: -0.8 };
        pose.shoulderR = { x: 0.6, z: -0.9 };
        pose.elbowR = { x: -0.6 };
        pose.blade = { x: 1.2 };
        hipY = -0.02;
        lambda = 20;
        break;
      }
      case 'hurt': {
        pose.spine = { x: -0.55 };
        pose.head = { x: -0.4 };
        pose.shoulderL = { x: -1.0, z: 1.1 };
        pose.shoulderR = { x: -1.0, z: -1.1 };
        pose.legL = { x: -0.6 };
        pose.legR = { x: 0.4 };
        pose.shinL = { x: 0.8 };
        pose.blade = { x: 1.2 };
        lambda = 35;
        break;
      }
      case 'dead': {
        this.deadT += dt;
        const u = Math.min(1, this.deadT / 0.6);
        pose.spine = { x: 0.9 * u };
        pose.head = { x: 0.6 * u };
        pose.legL = { x: -1.4 * u };
        pose.shinL = { x: 2.2 * u };
        pose.legR = { x: -1.3 * u };
        pose.shinR = { x: 2.1 * u };
        pose.shoulderL = { x: 0.3, z: 0.2 };
        pose.shoulderR = { x: 0.3, z: -0.2 };
        pose.blade = { x: 0.2 };
        hipY = -0.25 * u;
        lambda = 8;
        break;
      }
      case 'heal': {
        const u = Math.min(1, c.stateTime / 0.25);
        pose.legL = { x: -1.3 * u, z: 0.4 };
        pose.shinL = { x: 2.2 * u };
        pose.legR = { x: -1.3 * u, z: -0.4 };
        pose.shinR = { x: 2.2 * u };
        pose.spine = { x: 0.1 };
        pose.head = { x: 0.35 };
        pose.shoulderL = { x: -0.9, z: -0.35 };
        pose.elbowL = { x: -1.3, y: -0.3 };
        pose.shoulderR = { x: -0.9, z: 0.35 };
        pose.elbowR = { x: -1.3, y: 0.3 };
        pose.blade = { x: 0.1 };
        hipY = -0.2 * u + Math.sin(t * 3) * 0.005;
        lambda = 12;
        break;
      }
      case 'slam': {
        const up = c.stateTime < c.tuning.slamWindup;
        pose.spine = { x: up ? -0.3 : 0.5 };
        pose.legL = { x: -1.2 };
        pose.shinL = { x: 1.8 };
        pose.legR = { x: -1.0 };
        pose.shinR = { x: 1.6 };
        pose.shoulderR = { x: up ? -2.8 : -2.2, z: -0.2 };
        pose.shoulderL = { x: up ? -2.6 : -2.2, z: 0.2 };
        pose.elbowR = { x: -0.4 };
        pose.elbowL = { x: -0.4 };
        pose.blade = { x: 1.6 };
        lambda = 40;
        break;
      }
      case 'slamLand': {
        pose.spine = { x: 0.7 };
        pose.legL = { x: -1.0, z: 0.3 };
        pose.shinL = { x: 1.8 };
        pose.legR = { x: 0.6, z: -0.3 };
        pose.shinR = { x: 1.2 };
        pose.shoulderR = { x: -0.9, z: -0.2 };
        pose.shoulderL = { x: 0.6, z: 0.7 };
        pose.blade = { x: 2.9 };
        hipY = -0.16;
        lambda = 40;
        break;
      }
      default:
        break;
    }

    // --------------------------------------------------------------- attacks (upper body override)
    const a = c.attack;
    if (a) {
      const u = a.t / a.duration;
      lambda = 42;
      switch (a.kind) {
        case 'slash1':
        case 'airSlash': {
          // wide sweep right → left
          const sweep = curve([[0, -1.6], [0.12, -1.75], [0.42, 1.2], [1, 1.35]], u);
          pose.chest = { y: sweep * 0.45, x: 0.1 };
          pose.spine = { ...(pose.spine ?? {}), y: sweep * 0.25 };
          pose.shoulderR = { x: -1.45, y: sweep, z: -0.1 };
          pose.elbowR = { x: curve([[0, -0.9], [0.2, -0.2], [1, -0.3]], u) };
          pose.blade = { x: Math.PI / 2 + 0.1, z: -0.25 };
          pose.shoulderL = { x: -0.2, z: 0.5 };
          pose.head = { y: -sweep * 0.2 };
          break;
        }
        case 'slash2': {
          // backhand left → right, slightly rising
          const sweep = curve([[0, 1.5], [0.12, 1.65], [0.42, -1.3], [1, -1.45]], u);
          pose.chest = { y: sweep * 0.45, x: 0.1 };
          pose.spine = { ...(pose.spine ?? {}), y: sweep * 0.25 };
          pose.shoulderR = { x: curve([[0, -1.2], [0.42, -1.7], [1, -1.6]], u), y: sweep, z: 0.2 };
          pose.elbowR = { x: -0.25 };
          pose.blade = { x: Math.PI / 2 - 0.05, z: 0.3, y: Math.PI };
          pose.shoulderL = { x: 0.3, z: 0.6 };
          pose.head = { y: -sweep * 0.2 };
          break;
        }
        case 'slash3': {
          // overhead cleave with a lunge
          const raise = curve([[0, -2.9], [0.2, -3.1], [0.45, -0.7], [1, -0.55]], u);
          pose.spine = { x: curve([[0, -0.25], [0.2, -0.3], [0.45, 0.55], [1, 0.4]], u) };
          pose.shoulderR = { x: raise, z: -0.15 };
          pose.shoulderL = { x: raise * 0.8, z: 0.2 };
          pose.elbowR = { x: -0.15 };
          pose.elbowL = { x: -0.5 };
          pose.blade = { x: Math.PI / 2 };
          pose.legL = { x: -0.7 };
          pose.shinL = { x: 0.6 };
          pose.legR = { x: 0.5 };
          pose.shinR = { x: 0.4 };
          hipY = -0.04;
          break;
        }
        case 'downSlash': {
          pose.spine = { x: 0.6 };
          pose.head = { x: 0.5 };
          const sw = curve([[0, -2.6], [0.12, -2.8], [0.45, 0.4], [1, 0.3]], u);
          pose.shoulderR = { x: sw, z: -0.1 };
          pose.shoulderL = { x: sw * 0.5, z: 0.4 };
          pose.elbowR = { x: -0.1 };
          pose.blade = { x: Math.PI / 2 };
          pose.legL = { x: -1.1 };
          pose.shinL = { x: 1.8 };
          pose.legR = { x: -0.9 };
          pose.shinR = { x: 1.6 };
          break;
        }
        case 'upSlash': {
          pose.spine = { x: -0.35 };
          pose.head = { x: -0.5 };
          const sw = curve([[0, 0.6], [0.12, 0.8], [0.45, -2.9], [1, -2.8]], u);
          pose.shoulderR = { x: sw, z: -0.2 };
          pose.elbowR = { x: -0.1 };
          pose.blade = { x: Math.PI / 2 };
          pose.shoulderL = { x: 0.3, z: 0.5 };
          break;
        }
        case 'spin': {
          pose.shoulderR = { x: -1.5, z: -0.15 };
          pose.shoulderL = { x: -1.2, z: 0.3 };
          pose.blade = { x: Math.PI / 2 };
          pose.spine = { x: 0.2 };
          pose.legL = { x: -0.5, z: 0.3 };
          pose.legR = { x: 0.5, z: -0.3 };
          hipY = -0.06;
          break;
        }
        case 'slam':
          break;
      }
    } else if (c.charging) {
      const k = Math.min(1, c.chargeT / c.tuning.chargeTime);
      pose.shoulderR = { x: 0.9, z: -0.7, y: -0.5 };
      pose.elbowR = { x: -0.5 };
      pose.blade = { x: 2.2 + k * 0.4 };
      pose.chest = { y: -0.5 * k };
      pose.spine = { ...(pose.spine ?? {}), x: 0.3 };
      hipY -= 0.05 * k;
    }

    // wing behaviour
    this.wingFlap = Math.max(0, this.wingFlap - dt * 3.2);
    this.wingSpread = Math.max(0, this.wingSpread - dt * 4);
    const airborne = !c.grounded;
    const spreadBase = st === 'dash' ? 1 : st === 'heal' ? 0.6 : airborne ? 0.25 : speedK * 0.18;
    const spread = Math.max(spreadBase, this.wingSpread, this.wingFlap);
    const flap = this.wingFlap > 0 ? Math.sin((1 - this.wingFlap) * Math.PI * 3) * 0.9 : 0;
    const flutter = Math.sin(t * (airborne ? 30 : 4)) * (airborne ? 0.08 : 0.02);
    pose.wingL = { x: 0.35 * speedK + spread * 0.5, z: spread * 1.4 + flap + flutter, y: spread * 0.4 };
    pose.wingR = { x: 0.35 * speedK + spread * 0.5, z: -(spread * 1.4 + flap + flutter), y: -spread * 0.4 };
    this.robeFlare = damp(this.robeFlare, airborne ? 0.25 : speedK * 0.18 + (a?.kind === 'spin' ? 0.5 : 0), 8, dt);
    pose.robe = { x: -this.robeFlare * 0.5 };

    rig.apply(pose, lambda, dt);
    rig.offset('hips', 0, hipY, 0, 25, dt);

    // squash & stretch spring
    // sub-stepped spring so it stays stable at low frame rates
    const k = 180, damping = 16;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.squashV += (-k * this.squash - damping * this.squashV) * h;
      this.squash += this.squashV * h;
    }
    const sy = 1 + Math.max(-0.35, Math.min(0.35, this.squash * 0.06));
    const sx = 1 / Math.sqrt(sy);
    let sz = sx;
    if (st === 'dash') sz *= 1.15;
    v.body.scale.set(sx, sy, sz);
    const robeScale = 1 + this.robeFlare;
    rig.get('robe').scale.set(robeScale, 1, robeScale);

    // glow: blade & wings during attacks/charge/dash
    const wantGlow = a ? 1 : c.chargeReady ? 1 : c.charging ? 0.5 : st === 'dash' ? 0.8 : st === 'heal' ? 0.7 : 0;
    this.glow = damp(this.glow, wantGlow, a ? 30 : 8, dt);
    v.bladeMat.emissiveIntensity = 0.9 + this.glow * 2.5 + (c.chargeReady ? Math.sin(t * 20) * 0.8 + 0.8 : 0);
    for (const wm of v.wingMats) wm.uniforms.uGlow.value = this.glow * (st === 'dash' || st === 'heal' ? 0.8 : 0.3);

    // hurt flash / invulnerability flicker
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    const flick = c.iframes > 0 && st !== 'dash' && c.iframes < c.tuning.hurtIFrames - 0.05 ? (Math.floor(t * 20) % 2 === 0 ? 0.35 : 1) : 1;
    v.body.visible = flick > 0.5 || st === 'dead';
    const eyeK = st === 'dead' ? Math.max(0.05, 1 - this.deadT) : 1;
    v.eyeMat.color.setRGB(2.6 * eyeK + this.hurtFlash * 2, 1.55 * eyeK + this.hurtFlash, 0.45 * eyeK + this.hurtFlash);

    // scarf follows the neck
    const neck = rig.get('neck');
    neck.updateWorldMatrix(true, false);
    _anchor.set(0, 0.02, -0.06).applyMatrix4(neck.matrixWorld);
    const yaw = v.root.rotation.y;
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _back.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(2 + hs * 2.5);
    _back.y = 0;
    if (!this.scarfInit) {
      v.scarf.reset(_anchor);
      this.scarfInit = true;
    }
    v.scarf.wind.set(-c.velocity.x * 6, 0, -c.velocity.z * 6);
    v.scarf.update(dt, _anchor, _right, _back);
  }

  resetScarf(): void {
    this.scarfInit = false;
  }
}
