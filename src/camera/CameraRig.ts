import { PerspectiveCamera, Vector3 } from 'three';
import { PhysicsWorld, cameraFilter } from '../physics/PhysicsWorld';
import { clamp, damp, dampAngle, valueNoise2, angleDelta } from '../core/math';

export interface CameraZone {
  /** Distance multiplier relative to default. */
  distance?: number;
  /** Preferred pitch (radians, positive looks down). */
  pitch?: number;
  /** Preferred yaw to drift towards (radians). */
  yaw?: number;
  /** Strength of the yaw drift 0..1. */
  yawStrength?: number;
  /** Extra height of the look pivot. */
  height?: number;
  fov?: number;
}

export interface CameraTargetInfo {
  position: Vector3;
  velocity: Vector3;
  grounded: boolean;
  facing: number;
}

const _desired = new Vector3();
const _dir = new Vector3();
const _look = new Vector3();

/**
 * Third-person orbit camera tuned for precision platforming:
 * - separate horizontal/vertical damping so jumps don't bob the view
 * - sphere-cast collision that pulls in instantly and eases back out
 * - gentle auto-recentre behind movement and look-down when falling
 * - zone hints for cinematic framing, trauma-based shake
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  yaw = 0;
  pitch = 0.3;
  baseDistance = 6.6;
  distanceMul = 1;
  private curDist = 6.6;
  readonly pivot = new Vector3();
  private pivotY = 0;
  private idleLook = 10;
  private trauma = 0;
  private shakeT = 0;
  zone: CameraZone | null = null;
  private zoneDist = 1;
  private zoneHeight = 0;
  private zoneFov = 0;
  autoRecenter = true;
  shakeScale = 1;
  lockTarget: Vector3 | null = null;
  /** Cinematic override: when set, camera eases to this position/look target. */
  cinematic: { pos: Vector3; look: Vector3; lambda: number } | null = null;
  private initialized = false;
  minPitch = -0.55;
  maxPitch = 1.2;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(60, aspect, 0.1, 1400);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.updateFov();
  }

  private updateFov(): void {
    // Keep a comfortable horizontal field of view on every aspect ratio.
    const hfov = (82 * Math.PI) / 180;
    let v = (2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect) * 180) / Math.PI;
    v = clamp(v, 52, 78) + this.zoneFov;
    if (Math.abs(this.camera.fov - v) > 0.01) {
      this.camera.fov = v;
      this.camera.updateProjectionMatrix();
    }
  }

  addTrauma(t: number): void {
    this.trauma = Math.min(1, this.trauma + t * this.shakeScale);
  }

  snapTo(target: CameraTargetInfo, yaw?: number): void {
    if (yaw !== undefined) this.yaw = yaw;
    this.pivot.copy(target.position).y += 1.1;
    this.pivotY = this.pivot.y;
    this.curDist = this.baseDistance * this.distanceMul * this.zoneDist;
    this.initialized = true;
  }

  update(dt: number, target: CameraTargetInfo, look: { x: number; y: number }, world: PhysicsWorld, lookActive: boolean): void {
    if (!this.initialized) this.snapTo(target);
    const cam = this.camera;

    if (this.cinematic) {
      cam.position.x = damp(cam.position.x, this.cinematic.pos.x, this.cinematic.lambda, dt);
      cam.position.y = damp(cam.position.y, this.cinematic.pos.y, this.cinematic.lambda, dt);
      cam.position.z = damp(cam.position.z, this.cinematic.pos.z, this.cinematic.lambda, dt);
      _look.copy(this.cinematic.look);
      cam.lookAt(_look);
      this.applyShake(dt);
      // keep orbit state in sync so control resumes smoothly
      _dir.subVectors(cam.position, _look);
      this.yaw = Math.atan2(_dir.x, _dir.z);
      this.pivot.copy(target.position).y += 1.1;
      this.pivotY = this.pivot.y;
      this.curDist = _dir.length();
      return;
    }

    // Zone blending
    const z = this.zone;
    this.zoneDist = damp(this.zoneDist, z?.distance ?? 1, 2.2, dt);
    this.zoneHeight = damp(this.zoneHeight, z?.height ?? 0, 2.2, dt);
    this.zoneFov = damp(this.zoneFov, z?.fov ?? 0, 2, dt);
    this.updateFov();

    // Manual look
    const hasLook = Math.abs(look.x) + Math.abs(look.y) > 1e-5 || lookActive;
    this.yaw += look.x;
    this.pitch = clamp(this.pitch + look.y, this.minPitch, this.maxPitch);
    this.idleLook = hasLook ? 0 : this.idleLook + dt;

    const v = target.velocity;
    const hs = Math.hypot(v.x, v.z);

    if (this.lockTarget) {
      _dir.subVectors(target.position, this.lockTarget);
      const wantYaw = Math.atan2(_dir.x, _dir.z);
      this.yaw = dampAngle(this.yaw, wantYaw, 5, dt);
      this.pitch = damp(this.pitch, 0.34, 3, dt);
    } else if (this.idleLook > 0.9) {
      // Automatic framing
      if (z?.yaw !== undefined && (z.yawStrength ?? 0) > 0) {
        this.yaw = dampAngle(this.yaw, z.yaw, 1.4 * (z.yawStrength ?? 1), dt);
      } else if (this.autoRecenter && hs > 2) {
        // Drift behind the movement direction, stronger for lateral movement.
        const moveYaw = Math.atan2(-v.x, -v.z); // camera sits opposite to travel
        const d = Math.abs(angleDelta(this.yaw, moveYaw));
        if (d < 2.6) this.yaw = dampAngle(this.yaw, moveYaw, 0.55 * (hs / 7.4), dt);
      }
      const wantPitch = z?.pitch ?? (v.y < -9 && !target.grounded ? 0.62 : 0.3);
      this.pitch = damp(this.pitch, wantPitch, v.y < -9 ? 1.6 : 0.8, dt);
    }

    // Pivot: fast horizontal, slower vertical while airborne (stable jumps).
    const lookAhead = 0.35;
    const px = target.position.x + v.x * lookAhead * 0.12;
    const pz = target.position.z + v.z * lookAhead * 0.12;
    this.pivot.x = damp(this.pivot.x, px, 12, dt);
    this.pivot.z = damp(this.pivot.z, pz, 12, dt);
    const wantY = target.position.y + 1.1 + this.zoneHeight;
    const vyLambda = target.grounded ? 9 : v.y < -6 ? 8 : 3.2;
    this.pivotY = damp(this.pivotY, wantY, vyLambda, dt);
    // never let the player leave the vertical frame
    this.pivotY = clamp(this.pivotY, wantY - 2.2, wantY + 2.2);
    this.pivot.y = this.pivotY;

    // Desired position
    const dist = this.baseDistance * this.distanceMul * this.zoneDist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).normalize();
    // Collision: sphere cast from pivot outwards.
    const hit = world.sphereCast(this.pivot, _dir, 0.28, dist, cameraFilter);
    const allowed = Math.max(0.6, hit - 0.05);
    if (allowed < this.curDist) this.curDist = damp(this.curDist, allowed, 30, dt);
    else this.curDist = damp(this.curDist, allowed, 3.2, dt);
    this.curDist = Math.min(this.curDist, allowed);
    _desired.copy(this.pivot).addScaledVector(_dir, this.curDist);
    cam.position.copy(_desired);
    _look.copy(this.pivot);
    if (this.lockTarget) {
      // frame both: look slightly towards the target
      _look.lerp(this.lockTarget, 0.3);
    }
    cam.lookAt(_look);
    this.applyShake(dt);
  }

  private applyShake(dt: number): void {
    this.shakeT += dt;
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = this.shakeT * 28;
      this.camera.rotation.x += (valueNoise2(t, 1.3) - 0.5) * 0.08 * s;
      this.camera.rotation.y += (valueNoise2(t, 7.1) - 0.5) * 0.08 * s;
      this.camera.rotation.z += (valueNoise2(t, 13.7) - 0.5) * 0.06 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
    }
  }

  /** Forward/right vectors on the ground plane (for camera-relative input). */
  basis(): { fx: number; fz: number; rx: number; rz: number } {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    return { fx, fz, rx: Math.cos(this.yaw), rz: -Math.sin(this.yaw) };
  }
}
