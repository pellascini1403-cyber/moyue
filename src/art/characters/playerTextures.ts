import {
  CanvasTexture, EquirectangularReflectionMapping, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, Texture,
} from 'three';
import { Env } from '../../core/env';
import { Rng } from '../../core/rng';
import { MASK_EYES, MASK_OUTLINE, MASK_UV_SPAN } from './maskShape';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: Ctx } | null {
  if (Env.headless || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  return g ? { c, g } : null;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = false): Texture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ mask

const S = 512;
/** Mask metres → canvas pixels. */
const px = (x: number) => (0.5 + x / (2 * MASK_UV_SPAN)) * S;
const py = (y: number) => (0.5 - y / (2 * MASK_UV_SPAN)) * S;

/** A cloud scroll: a spiral of `turns` turns around (cx, cy), starting at angle `start`. */
function scroll(g: Ctx, cx: number, cy: number, r: number, turns: number, dir: number, start: number): void {
  const steps = 48;
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = start + dir * u * turns * Math.PI * 2;
    const rr = r * (1 - u * 0.78);
    const x = px(cx + Math.cos(a) * rr), y = py(cy + Math.sin(a) * rr);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

function path(g: Ctx, pts: [number, number][], close = false): void {
  g.beginPath();
  g.moveTo(px(pts[0][0]), py(pts[0][1]));
  for (let i = 1; i < pts.length; i++) g.lineTo(px(pts[i][0]), py(pts[i][1]));
  if (close) g.closePath();
  g.stroke();
}

function bez(g: Ctx, p0: [number, number], c1: [number, number], c2: [number, number], p1: [number, number]): void {
  g.beginPath();
  g.moveTo(px(p0[0]), py(p0[1]));
  g.bezierCurveTo(px(c1[0]), py(c1[1]), px(c2[0]), py(c2[1]), px(p1[0]), py(p1[1]));
  g.stroke();
}

/**
 * The gold pattern of the reference mask, drawn with the current stroke: a
 * border following the hexagonal outline, a ridge line from the top peak to
 * the chin, arched brows over the eyes ending in cloud scrolls at the temples,
 * a pair of scrolls on the upper forehead, facet lines from the eyes to the
 * chin and small curls on the cheeks.
 */
function filigree(g: Ctx): void {
  path(g, MASK_OUTLINE.map(([x, y]) => [x * 0.93, y * 0.94] as [number, number]), true);
  path(g, [[0, 0.232], [0, -0.232]]);
  for (const s of [-1, 1]) {
    // brow: from the ridge, up over the eye, down to a scroll at the temple
    bez(g, [0, 0.07], [s * 0.05, 0.125], [s * 0.15, 0.13], [s * 0.2, 0.085]);
    scroll(g, s * 0.192, 0.062, 0.024, 1.1, s > 0 ? -1 : 1, s > 0 ? Math.PI * 0.35 : Math.PI * 0.65);
    // upper forehead scrolls, joined to the ridge
    bez(g, [0, 0.205], [s * 0.03, 0.212], [s * 0.06, 0.2], [s * 0.078, 0.18]);
    scroll(g, s * 0.075, 0.158, 0.024, 1.15, s > 0 ? -1 : 1, s > 0 ? Math.PI * 0.2 : Math.PI * 0.8);
    // temple line from the brow scroll to the border
    bez(g, [s * 0.215, 0.07], [s * 0.225, 0.1], [s * 0.232, 0.13], [s * 0.232, 0.16]);
    // lower face: inner facet from under the eye to the chin
    bez(g, [s * 0.06, -0.125], [s * 0.05, -0.165], [s * 0.025, -0.205], [s * 0.004, -0.23]);
    // outer facet from the outer corner of the eye down along the jaw
    bez(g, [s * 0.178, -0.108], [s * 0.19, -0.14], [s * 0.14, -0.175], [s * 0.075, -0.205]);
    // cheek curl
    scroll(g, s * 0.214, -0.104, 0.018, 1.0, s > 0 ? 1 : -1, s > 0 ? Math.PI : 0);
  }
}

/**
 * Base colour, a packed data map (G = roughness, B = metalness) and a height
 * map (raised gold, recessed eyes) for the mask.
 */
export function maskTextures(): { map: Texture; orm: Texture; bump: Texture } | null {
  const a = canvas(S, S), b = canvas(S, S), c = canvas(S, S);
  if (!a || !b || !c) return null;
  const g = a.g, o = b.g, h = c.g;
  // lacquer: deep red, warmer in the middle of each facet, darker toward the rim
  const grd = g.createRadialGradient(S * 0.5, S * 0.42, S * 0.04, S * 0.5, S * 0.5, S * 0.52);
  grd.addColorStop(0, '#a52a24');
  grd.addColorStop(0.55, '#8e1d1c');
  grd.addColorStop(1, '#5c0e10');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const rng = new Rng(17);
  g.globalAlpha = 0.045;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng.next() < 0.5 ? '#ffb090' : '#300406';
    g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(1, 3), rng.range(4, 18));
  }
  g.globalAlpha = 1;
  o.fillStyle = 'rgb(0, 88, 0)'; // lacquer: roughness ≈ 0.35, not metallic
  o.fillRect(0, 0, S, S);
  h.fillStyle = 'rgb(128, 128, 128)';
  h.fillRect(0, 0, S, S);

  const er = (MASK_EYES.r / (2 * MASK_UV_SPAN)) * S;
  for (const s of [-1, 1]) {
    const cx = px(s * MASK_EYES.x), cy = py(MASK_EYES.y);
    // deep, glossy black eye holes with a faint reflection toward the top
    const eg = g.createRadialGradient(cx - er * 0.3, cy - er * 0.35, er * 0.05, cx, cy, er);
    eg.addColorStop(0, '#26262c');
    eg.addColorStop(0.45, '#0a0a0d');
    eg.addColorStop(1, '#020203');
    g.fillStyle = eg;
    g.beginPath();
    g.arc(cx, cy, er, 0, Math.PI * 2);
    g.fill();
    o.fillStyle = 'rgb(0, 22, 0)';
    o.beginPath();
    o.arc(cx, cy, er, 0, Math.PI * 2);
    o.fill();
    const hg = h.createRadialGradient(cx, cy, er * 0.2, cx, cy, er);
    hg.addColorStop(0, 'rgb(20,20,20)');
    hg.addColorStop(1, 'rgb(90,90,90)');
    h.fillStyle = hg;
    h.beginPath();
    h.arc(cx, cy, er, 0, Math.PI * 2);
    h.fill();
  }

  for (const k of [g, o, h]) {
    k.lineCap = 'round';
    k.lineJoin = 'round';
  }
  // relief: a dark groove beside every gold line, the gold, then a bright edge
  g.save();
  g.translate(1.5, 2.5);
  g.strokeStyle = 'rgba(40, 8, 4, 0.8)';
  g.lineWidth = 10;
  filigree(g);
  g.restore();
  g.strokeStyle = '#c0913c';
  g.lineWidth = 7;
  filigree(g);
  g.save();
  g.translate(-0.8, -1.3);
  g.strokeStyle = 'rgba(255, 228, 150, 0.8)';
  g.lineWidth = 2.2;
  filigree(g);
  g.restore();
  o.strokeStyle = 'rgb(0, 64, 255)'; // polished gold
  o.lineWidth = 8;
  filigree(o);
  h.filter = 'blur(1.5px)';
  h.strokeStyle = 'rgb(235, 235, 235)';
  h.lineWidth = 7.5;
  filigree(h);
  h.filter = 'none';
  // thick gold rims around the eyes
  for (const s of [-1, 1]) {
    const cx = px(s * MASK_EYES.x), cy = py(MASK_EYES.y);
    g.strokeStyle = '#d4a448';
    g.lineWidth = 11;
    g.beginPath();
    g.arc(cx, cy, er + 4, 0, Math.PI * 2);
    g.stroke();
    o.strokeStyle = 'rgb(0, 56, 255)';
    o.lineWidth = 12;
    o.beginPath();
    o.arc(cx, cy, er + 4, 0, Math.PI * 2);
    o.stroke();
    h.strokeStyle = 'rgb(250, 250, 250)';
    h.lineWidth = 11;
    h.beginPath();
    h.arc(cx, cy, er + 4, 0, Math.PI * 2);
    h.stroke();
  }
  return { map: tex(a.c, true), orm: tex(b.c, false), bump: tex(c.c, false) };
}

/** Engraved gold for the pauldron lames and skirt trims (u around, v across the band). */
export function goldOrnamentTexture(): Texture | null {
  const cv = canvas(256, 64);
  if (!cv) return null;
  const g = cv.g;
  const v = g.createLinearGradient(0, 0, 0, 64);
  v.addColorStop(0, '#f0cf7a');
  v.addColorStop(0.5, '#c79a45');
  v.addColorStop(1, '#8a6224');
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(70, 40, 10, 0.75)';
  g.lineWidth = 2;
  g.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const x = i * 32 + 16;
    g.beginPath();
    g.arc(x, 32, 9, Math.PI * 0.2, Math.PI * 1.9);
    g.stroke();
    g.beginPath();
    g.arc(x + 4, 30, 4, Math.PI, Math.PI * 2.6);
    g.stroke();
    g.beginPath();
    g.moveTo(x + 9, 34);
    g.bezierCurveTo(x + 14, 44, x + 20, 44, x + 24, 34);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255, 240, 190, 0.6)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 3.5, 255, 57);
  return tex(cv.c, true, true);
}

/** Gold ribbon with crimson borders (u across, v along). */
export function ribbonTexture(): Texture | null {
  const cv = canvas(32, 64);
  if (!cv) return null;
  const g = cv.g;
  g.fillStyle = '#d9a441';
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = '#8e1a18';
  g.fillRect(0, 0, 5, 64);
  g.fillRect(27, 0, 5, 64);
  g.fillStyle = 'rgba(255, 236, 170, 0.5)';
  g.fillRect(12, 0, 3, 64);
  return tex(cv.c, true, true);
}

// ------------------------------------------------------------------ cloak

/** Black silk with subtle tone-on-tone cloud embroidery (tileable). */
export function cloakTexture(): Texture | null {
  const cv = canvas(512, 512);
  if (!cv) return null;
  const g = cv.g;
  g.fillStyle = '#17130f';
  g.fillRect(0, 0, 512, 512);
  const rng = new Rng(5);
  g.globalAlpha = 0.07;
  for (let i = 0; i < 700; i++) {
    g.fillStyle = rng.next() < 0.5 ? '#35303a' : '#060508';
    g.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(10, 40), 1);
  }
  g.globalAlpha = 1;
  g.lineCap = 'round';
  // auspicious clouds: a rolling line of curls, stitched in dark grey thread
  const cloud = (x: number, y: number, r: number, flip: number) => {
    for (const [col, w] of [['rgba(0,0,0,0.55)', 5], ['rgba(92,72,42,0.85)', 2.4]] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.arc(x, y, r, Math.PI * 0.95, Math.PI * 2.05);
      g.arc(x + r * 1.55 * flip, y + r * 0.3, r * 0.72, Math.PI * 1.05, Math.PI * 2.25);
      g.stroke();
      g.beginPath();
      g.arc(x - r * 0.15, y + r * 0.12, r * 0.45, 0, Math.PI * 1.7);
      g.stroke();
      g.beginPath();
      g.moveTo(x - r * 1.2, y + r * 0.5);
      g.bezierCurveTo(x, y + r, x + r * 1.5 * flip, y + r * 0.95, x + r * 2.6 * flip, y + r);
      g.stroke();
    }
  };
  for (const [x, y, r, f] of [[120, 110, 34, 1], [370, 200, 30, -1], [180, 360, 32, 1], [420, 440, 26, -1], [40, 270, 22, 1]]) cloud(x, y, r, f);
  return tex(cv.c, true, true);
}

// ------------------------------------------------------------------ hair

/** Fine lengthwise strands (u around, v along the hair). */
export function hairTexture(): Texture | null {
  const cv = canvas(256, 256);
  if (!cv) return null;
  const g = cv.g;
  g.fillStyle = '#86441f';
  g.fillRect(0, 0, 256, 256);
  const rng = new Rng(23);
  for (let i = 0; i < 900; i++) {
    const x = rng.range(-4, 260);
    const l = rng.next();
    g.strokeStyle = l < 0.35 ? `rgba(38, 14, 6, ${rng.range(0.25, 0.6)})` : l < 0.8 ? `rgba(190, 104, 52, ${rng.range(0.3, 0.7)})` : `rgba(255, 190, 120, ${rng.range(0.35, 0.8)})`;
    g.lineWidth = rng.range(0.5, 1.4);
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + rng.range(-2, 2), 85, x + rng.range(-2, 2), 170, x, 256);
    g.stroke();
  }
  return tex(cv.c, true, true);
}

// ------------------------------------------------------------------ reflections

/**
 * A tiny equirectangular "cavern" for reflections on the protagonist's gold,
 * lacquer and hair: dark, a cool sky of mist overhead and a ring of warm
 * lantern light. Without it, metals render nearly black in the dark caves.
 */
export function playerEnvMap(): Texture | null {
  const cv = canvas(256, 128);
  if (!cv) return null;
  const g = cv.g;
  // mostly dark (little diffuse light) with small bright sources for crisp highlights
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, '#151b26');
  v.addColorStop(0.45, '#0b0d12');
  v.addColorStop(0.55, '#110b08');
  v.addColorStop(1, '#030304');
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 128);
  for (const [x, y, r, c] of [[30, 58, 9, '#ffd9a0'], [110, 62, 6, '#ffc080'], [170, 55, 11, '#ffe2b0'], [230, 64, 6, '#ffa060'], [140, 18, 16, '#a8c8f0'], [70, 30, 7, '#ffffff']] as const) {
    const gg = g.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, c);
    gg.addColorStop(0.5, c);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = tex(cv.c, true);
  t.mapping = EquirectangularReflectionMapping;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}
