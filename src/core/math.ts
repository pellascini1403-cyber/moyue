import { Vector3 } from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}
export function remap(v: number, a0: number, a1: number, b0: number, b1: number): number {
  return lerp(b0, b1, clamp01(invLerp(a0, a1, v)));
}
/** Framerate independent exponential smoothing. */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}
export function dampVec3(a: Vector3, b: Vector3, lambda: number, dt: number): Vector3 {
  const t = 1 - Math.exp(-lambda * dt);
  a.x += (b.x - a.x) * t;
  a.y += (b.y - a.y) * t;
  a.z += (b.z - a.z) * t;
  return a;
}
/** Move `v` towards `target` by at most `delta`. */
export function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(v + delta, target);
  return Math.max(v - delta, target);
}
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}
export function approachAngle(a: number, target: number, delta: number): number {
  const d = angleDelta(a, target);
  if (Math.abs(d) <= delta) return target;
  return wrapAngle(a + Math.sign(d) * delta);
}
export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
export const ease = {
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outElastic: (t: number) => {
    const c4 = TAU / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};
export function yawFromVector(x: number, z: number): number {
  // yaw 0 faces +z. Rotation around Y.
  return Math.atan2(x, z);
}
export function horizontalLength(v: Vector3): number {
  return Math.hypot(v.x, v.z);
}
export function hash2(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth 2D value noise in [0,1]. */
export function valueNoise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm2(x: number, y: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
/** 3D value noise in [0,1]. */
export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a: number, b: number, c: number) => hash2(a * 7 + c * 131, b * 13 - c * 17);
  const x00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u);
  const x10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u);
  const x01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u);
  const x11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}
