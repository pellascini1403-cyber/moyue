import { PLAYER_DIMS } from '../../player/playerDims';

/**
 * The protagonist's head is the lacquered mask itself: seen from the front a
 * hexagonal shield — a shallow peaked top, cut top corners, near-vertical
 * sides down past the eyes, then a V to the pointed chin — carried back into a
 * deep rounded box. Shared by the geometry and the texture painter so the gold
 * border follows the real outline. Mask-local coordinates: centre at the
 * origin, +z forward, +y up, +x = the character's left.
 */
const A = PLAYER_DIMS.maskHalfW;
const B = PLAYER_DIMS.maskHalfH;
const C = PLAYER_DIMS.maskHalfD;

/** Corners of the front outline (left half; mirrored) and how much each is rounded. */
const CORNERS: [number, number, number][] = [
  // x, y, rounding (0 sharp … 1 very soft)
  [0, B, 0.35], // top peak
  [0.78 * A, 0.77 * B, 0.45], // roof corner
  [A, 0.5 * B, 0.45], // top of the side
  [0.98 * A, -0.56 * B, 0.7], // bottom of the side, below the eyes, where the short V begins
  [0, -B, 0.2], // chin point
];

function roundedOutline(): [number, number][] {
  // full polygon counter-clockwise from the peak: left half then right half
  const poly: [number, number, number][] = [
    CORNERS[0],
    ...CORNERS.slice(1, 4).map(([x, y, r]) => [x, y, r] as [number, number, number]),
    CORNERS[4],
    ...CORNERS.slice(1, 4).reverse().map(([x, y, r]) => [-x, y, r] as [number, number, number]),
  ];
  const pts: [number, number][] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = poly[(i - 1 + n) % n];
    const [vx, vy, r] = poly[i];
    const [nx, ny] = poly[(i + 1) % n];
    const f = 0.5 * r;
    const ax = vx + (px - vx) * f, ay = vy + (py - vy) * f;
    const bx = vx + (nx - vx) * f, by = vy + (ny - vy) * f;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      pts.push([u * u * ax + 2 * u * t * vx + t * t * bx, u * u * ay + 2 * u * t * vy + t * t * by]);
    }
  }
  return pts;
}

/** Resample a closed polyline to `count` points evenly spaced by arc length. */
function resample(pts: [number, number][], count: number): [number, number][] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const l = Math.hypot(bx - ax, by - ay);
    seg.push(l);
    total += l;
  }
  const out: [number, number][] = [];
  let i = 0, acc = 0;
  for (let k = 0; k < count; k++) {
    const want = (k / count) * total;
    while (acc + seg[i] < want) acc += seg[i++];
    const t = seg[i] > 0 ? (want - acc) / seg[i] : 0;
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return out;
}

/** The front outline of the mask (mask-local metres), counter-clockwise from the top peak. */
export const MASK_OUTLINE: [number, number][] = resample(roundedOutline(), 72);

const E = 0.34; // squareness of the head from front to back
const sp = (a: number, e: number) => Math.sign(a) * Math.pow(Math.abs(a), e);

/**
 * Point on the head for outline index `i` and depth angle phi ∈ [-π/2, π/2]
 * (back … front). The front face bulges gently and carries a centre ridge.
 */
export function maskPoint(i: number, phi: number): [number, number, number] {
  const [ox, oy] = MASK_OUTLINE[((i % MASK_OUTLINE.length) + MASK_OUTLINE.length) % MASK_OUTLINE.length];
  const s = sp(Math.cos(phi), E);
  const x = ox * s, y = oy * s;
  let z = C * sp(Math.sin(phi), E);
  if (phi > 0) {
    const face = Math.min(1, Math.sin(phi) * 1.6);
    z += 0.034 * (1 - s * s) * face;
    z += 0.016 * Math.max(0, 1 - Math.abs(x) / 0.06) * face;
  } else {
    z -= 0.02 * (1 - s * s); // rounded back of the head
  }
  return [x, y, z];
}

/** Texture space: the front projection covers ±MASK_UV_SPAN metres. */
export const MASK_UV_SPAN = 0.285;
/** Eye holes: centre offset from the mask centre, radius. */
export const MASK_EYES = { x: 0.113, y: -0.055, r: 0.074 };
