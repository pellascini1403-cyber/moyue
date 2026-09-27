import { Quaternion, Vector3 } from 'three';
import { Pose, curve } from '../anim/Rig';
import { solveTwoBone } from '../anim/ik';
import { PlayerView } from '../art/characters/PlayerModel';
import { PlayerController } from './PlayerController';
import { damp } from '../core/math';
import { SpearPose, attackSpear, spearDir } from './spearMoves';
import { HAIR_DRAG, PLAYER_DIMS as D } from './playerDims';

const _v = new Vector3();
const _g = new Vector3();
const _h = new Vector3();
const _s = new Vector3();
const _t = new Vector3();
const _dir = new Vector3();
const _side = new Vector3();
const _wind = new Vector3();
const _q = new Quaternion();
const _qb = new Quaternion();
const _qr = new Quaternion();
const _up = new Vector3(0, 1, 0);
const POLE_R = new Vector3(-0.45, -0.45, -1).normalize();
const POLE_L = new Vector3(0.45, -0.45, -1).normalize();
const ARM = D.upperArm + D.foreArm;
/** Seconds after the last use of the spear before it goes back over the shoulder. */
const SHEATHE_AFTER = 2.2;

type GestureKind = 'flare' | 'interact' | 'ability';

const hold = (yaw: number, pitch: number, ext: number, slide = 0, twoHands = false, chestYaw = 0): SpearPose =>
  ({ yaw, pitch, ext, slide, twoHands, chestYaw, spin: 0 });

/**
 * Procedural animation for the protagonist. Poses are derived from the
 * controller state every frame (never the other way round), so animation can
 * never delay input: attacks, jumps and dashes start on the frame they happen.
 *
 * The spear follows authored curves (spearMoves.ts) that sweep its tip through
 * each attack's hit volume during the active frames; two-bone IK puts the hands
 * on the shaft. Hair (a shape-keeping verlet chain), cloak panels (springs) and
 * the spear ribbons add follow-through to every movement.
 */
export class PlayerAnimator {
  /** Ground height under the character (world), set by the Player each frame. */
  groundY = -Infinity;
  private squash = 0; // + stretch / - squash
  private squashV = 0;
  private lastState = '';
  private landImpact = 0;
  private landT = 1;
  private idleT = 0;
  private lookAround = 0;
  private glow = 0;
  private hurtFlash = 0;
  private deadT = 0;
  private sinceSpear = 99;
  private drawn = false;
  private sp: SpearPose = hold(-0.3, -0.55, 0.35);
  private cloakB = 0;
  private cloakBV = 0;
  private cloakS = 0;
  private cloakSV = 0;
  private cloakKick = 0;
  private gesture: { kind: GestureKind; t: number; dur: number } | null = null;
  private dynInit = false;
  private readonly skip = new Set<string>();

  constructor(private view: PlayerView, private ctrl: PlayerController) {}

  onJump(kind: 'ground' | 'double' | 'wall'): void {
    this.squashV += kind === 'double' ? 3 : 5;
    if (kind === 'double') this.cloakKick = 1;
  }
  onLand(impact: number): void {
    this.landImpact = Math.min(1, impact / 18);
    this.landT = 0;
    this.squashV -= 2 + this.landImpact * 7;
  }
  onDash(): void {
    this.squashV += 2;
    this.cloakBV += 6;
  }
  onHurt(): void {
    this.hurtFlash = 1;
  }
  /** Lantern Flare: a palm strike with the left hand. */
  onFlare(): void {
    this.gesture = { kind: 'flare', t: 0, dur: 0.34 };
  }
  /** Talking, resting, reading, taking: a small bow of the head. */
  onInteract(): void {
    this.gesture = { kind: 'interact', t: 0, dur: 0.6 };
    this.sinceSpear = SHEATHE_AFTER;
  }
  /** A technique is learned: the spear is raised to the dark. */
  onAbility(): void {
    this.gesture = { kind: 'ability', t: 0, dur: 1.5 };
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
    const g = this.gesture;
    if (g) {
      g.t += dt;
      if (g.t >= g.dur) this.gesture = null;
    }
    const gu = g ? g.t / g.dur : 0;
    const hs = c.horizontalSpeed;
    const speedK = Math.min(1, hs / c.tuning.runSpeed);
    const a = c.attack;
    const airborne = !c.grounded;
    this.landT += dt;
    const land = this.landT < 0.22 ? (1 - this.landT / 0.22) * this.landImpact : 0;

    // ------------------------------------------------------------ spear: in hand or over the shoulder
    const usingSpear = !!a || c.charging || st === 'slam' || st === 'slamLand' || st === 'heal' || g?.kind === 'ability';
    this.sinceSpear = usingSpear ? 0 : this.sinceSpear + dt;
    const wantDrawn = st === 'dead' ? this.drawn : usingSpear || (this.sinceSpear < SHEATHE_AFTER && st !== 'wallSlide' && g?.kind !== 'interact');
    if (wantDrawn !== this.drawn) this.setDrawn(wantDrawn);

    const pose: Pose = {};
    let lambda = 18;
    let hipY = 0;
    let spTarget: SpearPose;
    const breathe = Math.sin(t * 2.1);

    // ------------------------------------------------------------ base pose from the movement state
    switch (st) {
      case 'idle':
      case 'locked': {
        this.idleT += dt;
        const look = Math.sin(this.idleT * 0.35) > 0.7 ? Math.sin(this.idleT * 0.9) * 0.4 : 0;
        this.lookAround = damp(this.lookAround, look, 2, dt);
        pose.spine = { x: 0.04 + breathe * 0.015 };
        pose.chest = { x: 0.02 + breathe * 0.012 };
        pose.head = { x: -0.04 + Math.sin(t * 2.1 + 1) * 0.015, y: this.lookAround, z: Math.sin(t * 0.7) * 0.02 };
        pose.shoulderL = { z: 0.12 + breathe * 0.02, x: 0.05 };
        pose.elbowL = { x: -0.3 };
        pose.shoulderR = { z: -0.12 - breathe * 0.02, x: 0.05 };
        pose.elbowR = { x: -0.3 };
        // weight on one leg, the other relaxed
        pose.legL = { x: -0.04, z: 0.05 };
        pose.legR = { x: 0.07, z: -0.06 };
        pose.shinL = { x: 0.06 };
        pose.shinR = { x: 0.14 };
        pose.skirt = { z: Math.sin(t * 1.3) * 0.02 };
        hipY = -0.004 + breathe * 0.003;
        lambda = 10;
        spTarget = hold(-0.35, -0.6, 0.35, 0.05, false, -0.12);
        break;
      }
      case 'run': {
        this.idleT = 0;
        const p = c.stridePhase * Math.PI;
        const s = Math.sin(p);
        const k = 0.3 + speedK * 0.7;
        pose.legL = { x: -s * 1.0 * k };
        pose.legR = { x: s * 1.0 * k };
        pose.shinL = { x: (0.2 + Math.max(0, Math.cos(p)) * 1.25) * k };
        pose.shinR = { x: (0.2 + Math.max(0, -Math.cos(p)) * 1.25) * k };
        // walk upright, lean into a run; the heavy head counters the lean
        pose.spine = { x: 0.06 + 0.3 * speedK, y: s * 0.1 };
        pose.chest = { y: -s * 0.14, x: 0.04 };
        pose.head = { x: -0.24 * speedK, y: s * 0.05 };
        pose.shoulderL = { x: s * 0.9 * k, z: 0.15 };
        pose.elbowL = { x: -0.7 };
        pose.shoulderR = { x: -s * 0.9 * k, z: -0.15 };
        pose.elbowR = { x: -0.7 };
        pose.skirt = { x: -0.1 * speedK, y: s * 0.08 };
        hipY = Math.abs(Math.cos(p)) * 0.032 * k - 0.015;
        lambda = 22;
        spTarget = hold(-2.55, -0.28, 0.55, 0);
        break;
      }
      case 'jump':
      case 'wallJump':
      case 'doubleJump': {
        const push = c.stateTime < 0.07 && st === 'jump';
        if (push) {
          // take-off: legs drive straight, arms swing up
          pose.legL = { x: 0.15 };
          pose.legR = { x: 0.25 };
          pose.shinL = { x: 0.05 };
          pose.shinR = { x: 0.15 };
          pose.shoulderL = { x: -0.8, z: 0.4 };
          pose.shoulderR = { x: -0.8, z: -0.4 };
          pose.spine = { x: -0.08 };
        } else {
          // rising: knees tucked, one leg higher (reference poses 3 and 7)
          pose.legL = { x: -1.15 };
          pose.shinL = { x: 1.65 };
          pose.legR = { x: -0.45 };
          pose.shinR = { x: 1.1 };
          pose.spine = { x: 0.14 };
          pose.shoulderL = { x: 0.55, z: 0.6 };
          pose.elbowL = { x: -0.5 };
          pose.shoulderR = { x: 0.45, z: -0.55 };
          pose.elbowR = { x: -0.4 };
        }
        pose.head = { x: -0.12 };
        if (st === 'doubleJump') {
          // a crouched turn in the air while the cloak opens like wings
          const u = Math.min(1, c.stateTime / 0.3);
          pose.spine = { x: 0.3 + Math.sin(u * Math.PI) * 0.45 };
          pose.legL = { x: -1.35 };
          pose.legR = { x: -1.15 };
          pose.shinL = { x: 2.0 };
          pose.shinR = { x: 1.9 };
          pose.shoulderL = { x: -0.3, z: 1.3 };
          pose.shoulderR = { x: -0.3, z: -1.3 };
        }
        lambda = 22;
        spTarget = hold(-2.2, 0.1, 0.6);
        break;
      }
      case 'fall': {
        const f = Math.min(1, -c.velocity.y / 18);
        pose.legL = { x: -0.3 + f * 0.2, z: 0.12 };
        pose.shinL = { x: 0.5 };
        pose.legR = { x: 0.2, z: -0.12 };
        pose.shinR = { x: 0.35 };
        pose.spine = { x: 0.04 - f * 0.12 };
        pose.head = { x: 0.12 * f };
        pose.shoulderL = { x: -0.25, z: 0.8 + f * 0.5 };
        pose.elbowL = { x: -0.4 };
        pose.shoulderR = { x: -0.2, z: -0.8 - f * 0.4 };
        pose.elbowR = { x: -0.35 };
        lambda = 12;
        spTarget = hold(-2.3, 0.25, 0.6);
        break;
      }
      case 'dash': {
        // reference pose 3: flung forward, legs trailing, everything streaming behind
        const air = airborne ? 0.25 : 0;
        pose.spine = { x: 0.85 + air };
        pose.chest = { x: 0.15 };
        pose.head = { x: -0.75 - air * 0.5 };
        pose.legL = { x: 0.95 };
        pose.shinL = { x: 1.1 };
        pose.legR = { x: 1.25 };
        pose.shinR = { x: 0.6 };
        pose.shoulderL = { x: 1.25, z: 0.35 };
        pose.shoulderR = { x: 1.3, z: -0.35 };
        pose.elbowL = { x: -0.2 };
        pose.elbowR = { x: -0.2 };
        pose.skirt = { x: -0.35 };
        lambda = 40;
        spTarget = hold(-2.95, 0.05, 0.8);
        break;
      }
      case 'wallSlide': {
        // back to the wall, feet braced, arms reaching back to grip the carving
        pose.spine = { x: -0.12 };
        pose.head = { x: 0.15, y: 0.25 };
        pose.legL = { x: -0.85, z: 0.3 };
        pose.shinL = { x: 1.35 };
        pose.legR = { x: -0.4, z: -0.2 };
        pose.shinR = { x: 1.1 };
        pose.shoulderL = { x: 0.95, z: 0.95 };
        pose.elbowL = { x: -0.8 };
        pose.shoulderR = { x: 0.7, z: -0.95 };
        pose.elbowR = { x: -0.6 };
        hipY = -0.02;
        lambda = 20;
        spTarget = hold(-2.4, -0.6, 0.5);
        break;
      }
      case 'hurt': {
        pose.spine = { x: -0.6 };
        pose.head = { x: -0.45, z: 0.15 };
        pose.shoulderL = { x: -1.0, z: 1.2 };
        pose.shoulderR = { x: -1.0, z: -1.2 };
        pose.legL = { x: -0.7 };
        pose.legR = { x: 0.45 };
        pose.shinL = { x: 0.9 };
        lambda = 35;
        spTarget = { ...this.sp, pitch: 0.4, ext: 0.4 };
        break;
      }
      case 'dead': {
        this.deadT += dt;
        const u = Math.min(1, this.deadT / 0.8);
        const kneel = Math.min(1, this.deadT / 0.3);
        pose.legL = { x: -1.5 * kneel };
        pose.shinL = { x: 2.3 * kneel };
        pose.legR = { x: -1.3 * kneel };
        pose.shinR = { x: 2.2 * kneel };
        pose.spine = { x: 1.15 * u };
        pose.head = { x: 0.4 * u };
        pose.shoulderL = { x: -0.6 * u, z: 0.2 };
        pose.shoulderR = { x: -0.6 * u, z: -0.2 };
        hipY = -0.19 * kneel;
        lambda = 7;
        spTarget = hold(-0.4, -1.3, 0.6);
        break;
      }
      case 'heal': {
        // kneeling on one knee, spear planted upright, the free hand at the heart
        const u = Math.min(1, c.stateTime / 0.22);
        pose.legL = { x: -1.55 * u };
        pose.shinL = { x: 2.4 * u };
        pose.legR = { x: -0.9 * u, z: -0.15 };
        pose.shinR = { x: 1.45 * u };
        pose.spine = { x: 0.12 };
        pose.head = { x: 0.35 + Math.sin(t * 2.4) * 0.03 };
        pose.shoulderL = { x: -1.1, z: -0.3 };
        pose.elbowL = { x: -1.5 };
        hipY = -0.14 * u + Math.sin(t * 3) * 0.004;
        lambda = 12;
        spTarget = hold(-0.45, 1.45, 0.25, 0.08);
        break;
      }
      case 'slam': {
        const up = c.stateTime < c.tuning.slamWindup;
        pose.spine = { x: up ? -0.35 : 0.5 };
        pose.legL = { x: -1.25 };
        pose.shinL = { x: 1.9 };
        pose.legR = { x: -1.05 };
        pose.shinR = { x: 1.7 };
        pose.head = { x: up ? -0.3 : 0.45 };
        lambda = 40;
        spTarget = up ? hold(0, 1.3, 0.7, 0.15, true) : hold(0, -1.45, 0.8, 0, true);
        break;
      }
      case 'slamLand': {
        pose.spine = { x: 0.65 };
        pose.legL = { x: -1.05, z: 0.35 };
        pose.shinL = { x: 1.85 };
        pose.legR = { x: 0.55, z: -0.35 };
        pose.shinR = { x: 1.2 };
        pose.head = { x: 0.3 };
        hipY = -0.13;
        lambda = 40;
        spTarget = attackSpear('slam', 1);
        break;
      }
      default:
        spTarget = hold(-0.35, -0.6, 0.35);
        break;
    }

    // ------------------------------------------------------------ attacks: authored spear curves + body
    if (a) {
      const u = Math.min(1, a.t / a.duration);
      lambda = 42;
      spTarget = attackSpear(a.kind, u);
      const sp = spTarget;
      switch (a.kind) {
        case 'slash1':
        case 'slash2': {
          // lunge stance, hips turning with the cut
          pose.legL = { x: -0.55, z: 0.12 };
          pose.shinL = { x: 0.45 };
          pose.legR = { x: 0.45, z: -0.12 };
          pose.shinR = { x: 0.35 };
          pose.spine = { x: 0.2, y: sp.yaw * 0.12 };
          pose.head = { y: -sp.yaw * 0.15 };
          pose.shoulderL = { x: -0.3, z: 0.7 };
          pose.elbowL = { x: -0.5 };
          hipY = -0.035;
          break;
        }
        case 'slash3': {
          // reference pose 6: the lunging thrust, body upright and head level, legs tucked
          const lean = curve([[0, 0.0], [0.2, -0.08], [0.35, 0.2], [1, 0.12]], u);
          pose.spine = { x: lean };
          pose.legL = { x: -0.95 };
          pose.shinL = { x: 1.45 };
          pose.legR = { x: -0.35 };
          pose.shinR = { x: 1.2 };
          pose.head = { x: -lean * 0.8 };
          pose.shoulderL = { x: 0.9, z: 0.55 };
          pose.elbowL = { x: -0.3 };
          hipY = -0.03;
          break;
        }
        case 'airSlash': {
          // reference pose 7: knees drawn up, the free arm flung open to the side
          const lean = curve([[0, -0.12], [0.12, -0.15], [0.45, 0.22], [1, 0.15]], u);
          pose.spine = { x: lean };
          pose.legL = { x: -1.05 };
          pose.shinL = { x: 1.55 };
          pose.legR = { x: -0.55 };
          pose.shinR = { x: 1.25 };
          pose.head = { x: -lean * 0.8 };
          pose.shoulderL = { x: -0.35, z: 1.35 };
          pose.elbowL = { x: -0.15 };
          break;
        }
        case 'downSlash': {
          pose.spine = { x: 0.45 };
          pose.head = { x: 0.5 };
          pose.legL = { x: -1.35 };
          pose.shinL = { x: 2.0 };
          pose.legR = { x: -1.2 };
          pose.shinR = { x: 1.9 };
          break;
        }
        case 'upSlash': {
          pose.spine = { x: -0.35 };
          pose.head = { x: -0.5 };
          pose.legL = { x: -0.7 };
          pose.shinL = { x: 1.1 };
          pose.legR = { x: -0.3 };
          pose.shinR = { x: 0.8 };
          pose.shoulderL = { x: 0.4, z: 0.6 };
          break;
        }
        case 'spin': {
          pose.legL = { x: -0.35, z: 0.4 };
          pose.legR = { x: 0.35, z: -0.4 };
          pose.shinL = { x: 0.4 };
          pose.shinR = { x: 0.4 };
          pose.spine = { x: 0.25 };
          pose.shoulderL = { x: -0.2, z: 1.25 };
          hipY = -0.05;
          break;
        }
        case 'slam':
          break;
      }
    } else if (c.charging) {
      // gathering moonlight: spear drawn low behind, body coiled
      const k = Math.min(1, c.chargeT / c.tuning.chargeTime);
      const tremble = c.chargeReady ? Math.sin(t * 60) * 0.02 : 0;
      spTarget = hold(-2.35 + tremble, -0.45, 0.9, 0, false, -0.55 * k);
      pose.legL = { x: -0.45, z: 0.3 };
      pose.shinL = { x: 0.5 };
      pose.legR = { x: 0.4, z: -0.3 };
      pose.shinR = { x: 0.45 };
      pose.spine = { ...(pose.spine ?? {}), x: 0.28 };
      pose.shoulderL = { x: -0.8, z: 0.5 };
      hipY -= 0.05 * k;
    }

    // ------------------------------------------------------------ gestures
    if (g) {
      if (g.kind === 'flare') {
        pose.chest = { ...(pose.chest ?? {}), y: -0.35 };
        if (!this.drawn) pose.shoulderR = { x: 0.6, z: -0.5 };
      } else if (g.kind === 'interact') {
        pose.head = { ...(pose.head ?? {}), x: Math.sin(gu * Math.PI) * 0.3 };
        pose.shoulderL = { x: -0.6 * Math.sin(gu * Math.PI), z: 0.15 };
        pose.elbowL = { x: -0.4 };
      } else if (g.kind === 'ability') {
        spTarget = hold(-0.15, 1.5, 1, 0.05);
        pose.head = { x: -0.35 };
        pose.spine = { x: -0.15 };
        pose.shoulderL = { x: -1.2, z: -0.25 };
        pose.elbowL = { x: -1.4 };
      }
    }

    // ------------------------------------------------------------ spear pose: exact during attacks, smoothed otherwise
    if (a || dt <= 0) this.sp = { ...spTarget };
    else {
      const k = 1 - Math.exp(-14 * dt);
      const s = this.sp;
      s.yaw += (spTarget.yaw - s.yaw) * k;
      s.pitch += (spTarget.pitch - s.pitch) * k;
      s.ext += (spTarget.ext - s.ext) * k;
      s.slide += (spTarget.slide - s.slide) * k;
      s.chestYaw += (spTarget.chestYaw - s.chestYaw) * k;
      s.spin = spTarget.spin;
      s.twoHands = spTarget.twoHands;
    }
    const sp = this.sp;
    if (this.drawn) pose.chest = { ...(pose.chest ?? {}), y: (pose.chest?.y ?? 0) + sp.chestYaw };

    // which arms the IK drives this frame
    this.skip.clear();
    const leftPalm = g?.kind === 'flare';
    const leftOnShaft = this.drawn && sp.twoHands;
    if (this.drawn) this.skip.add('shoulderR').add('elbowR');
    if (leftOnShaft || leftPalm) this.skip.add('shoulderL').add('elbowL');

    rig.apply(pose, lambda, dt, this.skip);
    rig.offset('hips', 0, hipY - land * 0.07, 0, 25, dt);
    if (land > 0) {
      // soak up the landing in the knees
      for (const [j, amt] of [['legL', -0.6], ['legR', -0.55], ['shinL', 1.0], ['shinR', 0.95]] as const) {
        const jo = rig.get(j);
        _q.setFromAxisAngle(_v.set(1, 0, 0), amt * land);
        jo.quaternion.multiply(_q);
      }
    }

    // ------------------------------------------------------------ squash & stretch (sub-stepped spring)
    const k = 180, damping = 16;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.squashV += (-k * this.squash - damping * this.squashV) * h;
      this.squash += this.squashV * h;
    }
    const sy = 1 + Math.max(-0.3, Math.min(0.3, this.squash * 0.05));
    const sx = 1 / Math.sqrt(sy);
    let sz = sx;
    if (st === 'dash') sz *= 1.12;
    v.body.scale.set(sx, sy, sz);
    v.body.rotation.y = a?.kind === 'spin' ? sp.spin % (Math.PI * 2) : 0;

    // ------------------------------------------------------------ arms on the spear (IK) and the spear itself
    v.root.updateMatrixWorld(true);
    if (this.drawn) this.placeSpear(sp);
    if (leftPalm) {
      const chest = rig.get('chest');
      const reach = Math.sin(Math.min(1, gu * 2.2) * Math.PI * 0.5);
      _t.set(0.06, 0.1 - D.chestY + D.shoulderY - 0.1, 0.08 + 0.12 * reach);
      this.ikArm('L', chest.localToWorld(_t.clone()));
    }

    // ------------------------------------------------------------ cloak: springs driven by motion
    const vel = c.velocity;
    const fwdSpeed = vel.x * Math.sin(c.facing) + vel.z * Math.cos(c.facing);
    const latSpeed = vel.x * Math.cos(c.facing) - vel.z * Math.sin(c.facing);
    this.cloakKick = Math.max(0, this.cloakKick - dt * 2.2);
    const wantB = Math.min(1.35, Math.max(0, fwdSpeed * 0.07) + Math.max(0, -vel.y) * 0.025 + (airborne ? 0.12 : 0) + (st === 'dash' ? 0.8 : 0) + this.cloakKick * 0.8)
      + Math.sin(t * 1.7) * 0.025;
    const wantS = (airborne ? 0.2 : 0.02) + this.cloakKick * 1.15 + (a?.kind === 'spin' ? 0.55 : 0) + (st === 'dash' ? 0.25 : 0) + land * 0.25;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const hh = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.cloakBV += ((wantB - this.cloakB) * 90 - this.cloakBV * 10) * hh;
      this.cloakB += this.cloakBV * hh;
      this.cloakSV += ((wantS - this.cloakS) * 80 - this.cloakSV * 9) * hh;
      this.cloakS += this.cloakSV * hh;
    }
    const lat = Math.max(-0.4, Math.min(0.4, latSpeed * 0.04));
    // the cloak lifts over a raised arm so the arm never cuts through the cloth
    const lift = (side: 'L' | 'R') => {
      const down = _t.set(0, -1, 0).applyQuaternion(rig.get(`shoulder${side}`).getWorldQuaternion(_q));
      return Math.max(0, Math.acos(Math.max(-1, Math.min(1, -down.y))) - 0.35) * 0.75;
    };
    v.cloak.billow = this.cloakB;
    v.cloak.flare = this.cloakS;
    v.cloak.armL = lift('L') + Math.max(0, lat);
    v.cloak.armR = lift('R') + Math.max(0, -lat);
    v.cloak.update();

    // ------------------------------------------------------------ glow, hurt flash, i-frame flicker
    const wantGlow = a ? 1 : c.chargeReady ? 1 : c.charging ? 0.5 : st === 'heal' ? 0.6 : g?.kind === 'ability' ? 1 : 0;
    this.glow = damp(this.glow, wantGlow, a ? 30 : 8, dt);
    const pulse = c.chargeReady ? Math.sin(t * 20) * 0.6 + 0.6 : 0;
    v.spearGlow[0].emissiveIntensity = 0.8 + this.glow * 1.6 + pulse;
    v.spearGlow[1].emissiveIntensity = 0.35 + this.glow * 1.4 + pulse;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    const heal = st === 'heal' ? 0.35 + Math.sin(t * 5) * 0.1 : 0;
    v.maskMat.emissive.setRGB(0.3 + this.hurtFlash * 1.4 + heal * 0.9, 0.2 + this.hurtFlash * 0.35 + heal * 0.8, 0.16 + this.hurtFlash * 0.25 + heal * 0.5);
    const flick = c.iframes > 0 && st !== 'dash' && c.iframes < c.tuning.hurtIFrames - 0.05 ? Math.floor(t * 20) % 2 === 0 : true;
    const visible = flick || st === 'dead';
    v.body.visible = visible;
    v.spear.visible = visible;
    for (const m of v.worldMeshes) m.visible = visible && v.root.visible;

    // ------------------------------------------------------------ hair and ribbons (world space)
    const head = rig.get('head');
    if (!this.dynInit) {
      v.hair.reset(head.matrixWorld);
      v.spearButt.getWorldPosition(_v);
      for (const r of v.ribbons) r.reset(_v);
      this.dynInit = true;
    }
    v.hair.groundY = this.groundY;
    _wind.set(-vel.x * HAIR_DRAG, 0, -vel.z * HAIR_DRAG);
    v.hair.update(dt, head.matrixWorld, _wind);
    _side.setFromMatrixColumn(head.matrixWorld, 0).normalize();
    v.hairMesh.update(_side);
    v.spearButt.getWorldPosition(_v);
    _side.setFromMatrixColumn(v.spear.matrixWorld, 0).normalize();
    v.ribbons[0].update(dt, _v, _side, this.groundY);
    _v.addScaledVector(_side, 0.012);
    v.ribbons[1].update(dt, _v, _side, this.groundY);
  }

  /** Put the spear in the right hand along the authored direction; the left hand joins for two-handed moves. */
  private placeSpear(sp: SpearPose): void {
    const v = this.view;
    const [dx, dy, dz] = spearDir(sp.yaw, sp.pitch);
    // body space → world (the body carries the facing and the spin)
    v.body.getWorldQuaternion(_qb);
    _dir.set(dx, dy, dz).applyQuaternion(_qb).normalize();
    const shoulder = v.rig.get('shoulderR');
    shoulder.getWorldPosition(_s);
    _g.copy(_s).addScaledVector(_dir, Math.max(0.02, sp.ext) * ARM * 0.97);
    this.ikArm('R', _g);
    v.handR.getWorldPosition(_h);
    if (sp.twoHands) this.ikArm('L', _t.copy(_h).addScaledVector(_dir, 0.14));
    // world transform → root space
    const root = v.root;
    _v.copy(_h).addScaledVector(_dir, -sp.slide);
    root.worldToLocal(_v);
    v.spear.position.copy(_v);
    _q.setFromUnitVectors(_up, _dir);
    root.getWorldQuaternion(_qr);
    v.spear.quaternion.copy(_qr.invert().multiply(_q));
    v.spear.updateMatrixWorld(true);
  }

  private ikArm(side: 'L' | 'R', targetWorld: Vector3): void {
    const rig = this.view.rig;
    const chest = rig.get('chest');
    const sh = rig.get(`shoulder${side}`);
    const el = rig.get(`elbow${side}`);
    const target = chest.worldToLocal(_t.copy(targetWorld));
    const bend = solveTwoBone(sh.position, target, D.upperArm, D.foreArm, side === 'R' ? POLE_R : POLE_L, _q);
    sh.quaternion.copy(_q);
    el.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -bend);
    sh.updateMatrixWorld(true);
  }

  private setDrawn(drawn: boolean): void {
    const v = this.view;
    this.drawn = drawn;
    if (drawn) {
      v.root.add(v.spear);
    } else {
      v.backSocket.add(v.spear);
      v.spear.position.set(0, 0, 0);
      v.spear.quaternion.identity();
    }
  }

  get spearDrawn(): boolean {
    return this.drawn;
  }

  resetDynamics(): void {
    this.dynInit = false;
  }
}
