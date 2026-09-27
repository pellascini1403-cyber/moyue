/**
 * Ferry platforms (a moving-platform trigger): the platform waits at one end
 * of its path, carries a rider to the other end, and when nobody is aboard it
 * crosses to whichever end the player is nearer, so it is always there to
 * pick them up in either direction. Shared by the game and the headless
 * traversal simulation.
 */
export interface FerryState {
  riding: boolean;
  /** Path distance the current trip is heading to. */
  to: number;
}

export function newFerry(): FerryState {
  return { riding: false, to: 0 };
}

/**
 * Where along the path (0..total) the ferry should head this step.
 * `ridden`: seconds since the player last stood on it; `dStart`/`dEnd`: the
 * player's distance to either end of the path.
 */
export function ferryTarget(s: FerryState, onMe: boolean, ridden: number, t: number, total: number, dStart: number, dEnd: number): number {
  if (onMe) {
    if (!s.riding) {
      s.riding = true;
      s.to = t < total / 2 ? total : 0;
    }
    return s.to;
  }
  // a hop on the deck does not end the trip
  if (ridden < 1) return s.riding ? s.to : t;
  s.riding = false;
  if (Math.min(dStart, dEnd) > 30) return t;
  return dStart <= dEnd ? 0 : total;
}
