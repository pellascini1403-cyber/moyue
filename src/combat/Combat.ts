import { Vector3 } from 'three';
import type { AttackKind, ActiveAttack } from '../player/PlayerController';

export interface Hurtbox {
  center: Vector3;
  radius: number;
}

export type HitKind = AttackKind | 'flare' | 'contact' | 'projectile' | 'hazard' | 'shockwave';

export interface HitInfo {
  damage: number;
  /** Unit direction of the hit (from attacker toward victim). */
  dir: Vector3;
  knockback: number;
  kind: HitKind;
  point: Vector3;
  fromPlayer: boolean;
}

export type HitResult = 'ignored' | 'hit' | 'blocked' | 'kill';

export interface Damageable {
  readonly damageableId: string;
  /** false = cannot be hit right now (dead, spawning...). */
  canBeHit(): boolean;
  hurtboxes(): Hurtbox[];
  takeHit(hit: HitInfo): HitResult;
  /** Pogo-able when struck from above. */
  readonly pogoable: boolean;
  /** Awards moonlight on hit (enemies yes, props no). */
  readonly givesMoonlight: boolean;
}

const _d = new Vector3();

/**
 * Tests whether a hurtbox is inside the swing volume of an attack.
 * Horizontal swings: a sector around the swing direction with a vertical span.
 * Down/up swings: a cone/cylinder below/above the player.
 */
export function attackHits(a: ActiveAttack, origin: Vector3, facing: number, hb: Hurtbox): boolean {
  _d.subVectors(hb.center, origin);
  const r = hb.radius;
  if (a.kind === 'downSlash' || a.kind === 'slam') {
    const h = Math.hypot(_d.x, _d.z);
    const below = -_d.y;
    if (a.kind === 'slam') return h <= a.range + r && _d.y > -1.6 && _d.y < 1.8;
    return below > -0.6 - r && below < a.range + r && h <= 1.25 + r + below * 0.2;
  }
  if (a.kind === 'upSlash') {
    const h = Math.hypot(_d.x, _d.z);
    return _d.y > 0.2 - r && _d.y < a.range + 0.8 + r && h <= 1.3 + r;
  }
  // chest height of the player is ~0.55
  const dy = _d.y - 0.55;
  if (dy < -1.0 - r || dy > 1.3 + r) return false;
  const h = Math.hypot(_d.x, _d.z);
  if (h > a.range + r) return false;
  if (a.arc >= Math.PI - 1e-3) return true;
  if (h < r + 0.35) return true;
  const ang = Math.atan2(_d.x, _d.z);
  let delta = ang - facing;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const pad = Math.asin(Math.min(1, r / Math.max(h, 1e-3)));
  return Math.abs(delta) <= a.arc / 2 + pad;
}

export function isActive(a: ActiveAttack): boolean {
  return a.t >= a.activeStart && a.t <= a.activeEnd;
}
