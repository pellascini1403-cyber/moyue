/**
 * All movement/combat numbers in one place. Units: metres, seconds.
 * The protagonist is ~1 m tall; environments are built at real scale around it.
 */
export const PlayerTuning = {
  radius: 0.3,
  height: 1.0,

  runSpeed: 7.4,
  groundAccel: 85,
  groundDecel: 110,
  turnAccel: 150,
  airAccel: 60,
  airDecel: 18,
  turnRate: 24, // model yaw rad/s

  jumpHeight: 2.55,
  timeToApex: 0.36,
  fallGravityMul: 1.42,
  apexGravityMul: 0.6,
  apexThreshold: 2.2,
  jumpCutMul: 0.42,
  maxFall: 24,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,
  hardLandSpeed: 23,

  doubleJumpHeight: 2.15,

  dashSpeed: 21,
  dashTime: 0.17,
  dashCooldown: 0.42,
  dashIFrames: 0.12,
  dashExitSpeedMul: 0.55,

  wallSlideSpeed: 3.0,
  wallJumpUp: 12.8,
  wallJumpOut: 8.6,
  wallJumpLock: 0.17,
  wallDetachTime: 0.14,
  wallCoyote: 0.1,

  pogoVelocity: 12.6,

  hurtKnockback: 8.5,
  hurtUp: 6.5,
  hurtLock: 0.22,
  hurtIFrames: 1.25,

  healCost: 33,
  healTime: 0.85,
  specialTapTime: 0.2,
  flareCost: 33,

  slamSpeed: 32,
  slamWindup: 0.12,
  slamRecover: 0.3,

  attack: {
    slash: { duration: 0.3, activeStart: 0.04, activeEnd: 0.14, cancel: 0.17, damage: 1, range: 2.05, arc: 1.15, knockback: 7, lunge: 1.2 },
    finisher: { duration: 0.4, activeStart: 0.08, activeEnd: 0.2, cancel: 0.27, damage: 1.5, range: 2.35, arc: 1.3, knockback: 12, lunge: 3.6 },
    air: { duration: 0.28, activeStart: 0.03, activeEnd: 0.14, cancel: 0.17, damage: 1, range: 2.05, arc: 1.2, knockback: 7, lunge: 0 },
    down: { duration: 0.3, activeStart: 0.02, activeEnd: 0.2, cancel: 0.2, damage: 1, range: 2.2, arc: 0.9, knockback: 6, lunge: 0 },
    up: { duration: 0.3, activeStart: 0.03, activeEnd: 0.16, cancel: 0.18, damage: 1, range: 2.3, arc: 0.9, knockback: 6, lunge: 0 },
    spin: { duration: 0.48, activeStart: 0.05, activeEnd: 0.32, cancel: 0.4, damage: 2.5, range: 2.9, arc: Math.PI, knockback: 14, lunge: 0 },
    slam: { duration: 0.3, activeStart: 0, activeEnd: 0.12, cancel: 0.3, damage: 2, range: 3.2, arc: Math.PI, knockback: 13, lunge: 0 },
  },
  attackBuffer: 0.16,
  comboWindow: 0.36,
  chargeTime: 0.62,
  chargeDelay: 0.22,
  groundAttackMoveMul: 0.5,
};

export function gravityFor(height: number, apex: number): number {
  return (2 * height) / (apex * apex);
}
export function jumpVelocityFor(height: number, gravity: number): number {
  return Math.sqrt(2 * height * gravity);
}
