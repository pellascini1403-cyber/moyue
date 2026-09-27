import { curve } from '../anim/Rig';
import type { AttackKind } from './PlayerController';
import { PLAYER_DIMS } from './playerDims';

/**
 * How the spear is held, in character space (+z forward, +x = the
 * character's left). Attacks are authored as curves over normalised attack
 * time u ∈ [0, 1] so the spear tip sweeps through the hit volume during the
 * attack's active frames (see tests/spear.test.ts).
 */
export interface SpearPose {
  /** Direction of the shaft: yaw (+ toward the left) and pitch (+ up). */
  yaw: number;
  pitch: number;
  /** Arm extension toward the grip, 0..1. */
  ext: number;
  /** Hand position up the shaft from the default grip (m); + pulls the spear back. */
  slide: number;
  twoHands: boolean;
  /** Chest twist (+ turns the chest to the left). */
  chestYaw: number;
  /** Extra whole-body yaw (the charged spin). */
  spin: number;
}

const P = (yaw: number, pitch: number, ext: number, slide = 0, twoHands = false, chestYaw = 0, spin = 0): SpearPose =>
  ({ yaw, pitch, ext, slide, twoHands, chestYaw, spin });

/** Spear pose during an attack at normalised time u. */
export function attackSpear(kind: AttackKind, u: number): SpearPose {
  switch (kind) {
    case 'slash1': {
      // forehand sweep, right → left: wind back, cut through the front, follow through
      const yaw = curve([[0, -1.55], [0.1, -1.85], [0.3, 0], [0.5, 1.45], [1, 1.7]], u);
      return P(yaw, curve([[0, -0.05], [0.3, -0.15], [1, -0.3]], u), curve([[0, 0.8], [0.15, 1]], u), curve([[0, 0], [0.15, -0.17]], u), false, yaw * 0.35);
    }
    case 'slash2': {
      // backhand, left → right, rising
      const yaw = curve([[0, 1.45], [0.1, 1.75], [0.3, 0], [0.5, -1.4], [1, -1.65]], u);
      return P(yaw, curve([[0, -0.3], [0.3, -0.1], [1, 0.15]], u), curve([[0, 0.8], [0.15, 1]], u), curve([[0, 0], [0.15, -0.17]], u), false, yaw * 0.35);
    }
    case 'slash3':
      // lunging thrust: coil back, then drive the spear straight through
      return P(
        curve([[0, -0.35], [0.2, -0.1], [0.35, 0]], u),
        curve([[0, 0.1], [0.2, 0.05], [0.35, -0.08], [1, -0.12]], u),
        curve([[0, 0.15], [0.18, 0], [0.3, 1], [0.7, 1], [1, 0.6]], u),
        curve([[0, 0.25], [0.18, 0.3], [0.3, -0.2], [0.8, -0.2], [1, 0]], u),
        false,
        curve([[0, -0.7], [0.2, -0.8], [0.32, 0.35], [1, 0.2]], u),
      );
    case 'airSlash':
      // reference pose 7: the flaming head raised high over the left shoulder, then cut across and down
      return P(
        curve([[0, 1.1], [0.1, 1.2], [0.3, 0], [0.45, -0.7], [1, -0.95]], u),
        curve([[0, 0.55], [0.1, 0.6], [0.3, 0.05], [0.45, -0.45], [1, -0.8]], u),
        1,
        curve([[0, 0.3], [0.12, -0.18]], u),
        false,
        curve([[0, 0.45], [0.3, -0.2], [1, -0.4]], u),
      );
    case 'downSlash':
      // pogo: both hands drive the spear point straight down
      return P(0, curve([[0, -0.9], [0.06, -1.45], [1, -1.5]], u), curve([[0, 0.3], [0.07, 1]], u), curve([[0, 0.35], [0.08, -0.05], [1, 0]], u), true);
    case 'upSlash':
      // rising arc from low in front to straight overhead
      return P(0, curve([[0, -0.45], [0.1, -0.6], [0.45, 1.45], [1, 1.5]], u), 1);
    case 'spin':
      // Moon-Cleave: arm out, the whole body turns a full circle
      return P(0, -0.08, 1, -0.05, false, 0, curve([[0, 0], [0.08, -0.35], [0.62, Math.PI * 2], [1, Math.PI * 2]], u));
    case 'slam':
      return P(0.15, -1.2, 0.9, 0.35, true);
  }
}

/** Unit direction of the shaft in character space. */
export function spearDir(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c];
}

/**
 * Approximate tip position in character space: the right shoulder (twisted
 * with the chest and the spin), the arm extended toward the grip, then the
 * shaft. The animator uses the real rig; this is the same arithmetic.
 */
export function spearTip(p: SpearPose): [number, number, number] {
  const D = PLAYER_DIMS;
  const turn = p.chestYaw + p.spin;
  const sx = -D.shoulderX * Math.cos(turn), sz = D.shoulderX * Math.sin(turn);
  const [dx, dy, dz] = spearDir(p.yaw, p.pitch);
  const c = Math.cos(p.spin), s = Math.sin(p.spin);
  const wx = dx * c + dz * s, wz = -dx * s + dz * c;
  const len = p.ext * (D.upperArm + D.foreArm) * 0.97 + D.spearTip - p.slide;
  return [sx + wx * len, D.shoulderY + dy * len, sz + wz * len];
}
