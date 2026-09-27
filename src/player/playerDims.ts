/**
 * Protagonist proportions, measured from the design reference (the figure is
 * 1.0 m from the feet to the top of the mask; the swept hair rises to about
 * 1.34 m). Metres, feet at y = 0, facing +z; the character's right hand side
 * is -x. Shared by the model, the animator and the tests so the spear the
 * player sees and the hit volumes stay in agreement.
 *
 * Reference ratios: mask/head 51 % of the figure height and 53 % of it wide,
 * eyes ~60 % down the mask, body below the chin 49 % (a bell-shaped cloak
 * reaching almost to the ground, only the tips of the legs showing), spear
 * about 1.3 × the figure height.
 */
export const PLAYER_DIMS = {
  hipY: 0.13,
  chestY: 0.32,
  shoulderX: 0.135,
  /** Shoulder joint height above the feet. */
  shoulderY: 0.445,
  upperArm: 0.085,
  foreArm: 0.085,
  /** Top of the collar, where the mask's chin rests. */
  neckY: 0.49,
  /** Mask-head: half extents and centre height above the neck. */
  maskHalfW: 0.265,
  maskHalfH: 0.255,
  maskHalfD: 0.2,
  maskCenterY: 0.255,
  /** Spear: distances from the main grip toward the tip and toward the butt (1.32 m overall). */
  spearTip: 1.12,
  spearButt: 0.2,
} as const;

/** How far the spear tip can reach from the shoulder with the arm extended. */
export const SPEAR_REACH = PLAYER_DIMS.upperArm + PLAYER_DIMS.foreArm + PLAYER_DIMS.spearTip;

/**
 * Centre line of the copper mane in head space (head origin = top of the
 * neck at 0.49 m, ground ≈ -0.49): it rises from just behind the mask's top
 * edge, crests about 0.34 m above the mask, falls down the back to the
 * ground and sweeps around the right side, the tip curling up.
 */
export const HAIR_REST: readonly [number, number, number][] = [
  [-0.02, 0.36, 0.08], [-0.04, 0.5, 0.0], [-0.045, 0.62, -0.1], [-0.02, 0.665, -0.21], [0.06, 0.635, -0.31], [0.17, 0.55, -0.36],
  [0.26, 0.44, -0.38], [0.31, 0.31, -0.39], [0.32, 0.17, -0.39], [0.28, 0.03, -0.4], [0.18, -0.11, -0.42],
  [0.05, -0.24, -0.42], [-0.09, -0.35, -0.38], [-0.24, -0.43, -0.31], [-0.38, -0.46, -0.2], [-0.49, -0.46, -0.07],
  [-0.58, -0.45, 0.05], [-0.65, -0.42, 0.14], [-0.69, -0.37, 0.21], [-0.7, -0.32, 0.26],
];
/** How strongly each hair point returns to its styled place (per 60 Hz frame): the crown is set, the tail flows. */
export const HAIR_STIFF: readonly number[] = [1, 1, 1, 1, 0.9, 0.7, 0.5, 0.35, 0.25, 0.18, 0.13, 0.1, 0.08, 0.06, 0.05, 0.04, 0.035, 0.03, 0.03, 0.03];
/**
 * Mane cross-section along its length (s = 0 at the hairline, 1 at the tip):
 * as wide as the head over the crown, gathering into a thick, rounded tail.
 */
export const HAIR_WIDTH: readonly [number, number][] = [[0, 0.03], [0.03, 0.19], [0.07, 0.275], [0.13, 0.26], [0.22, 0.22], [0.32, 0.19], [0.48, 0.15], [0.62, 0.1], [0.78, 0.07], [0.92, 0.038], [1, 0.01]];
export const HAIR_THICK: readonly [number, number][] = [[0, 0.03], [0.03, 0.12], [0.09, 0.19], [0.2, 0.2], [0.32, 0.175], [0.48, 0.14], [0.62, 0.095], [0.78, 0.065], [0.92, 0.035], [1, 0.01]];
/** Air drag on the hair: acceleration per m/s of the character's velocity. */
export const HAIR_DRAG = 4.5;
