import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture, LinearMipmapLinearFilter, LinearFilter } from 'three';
import { Env } from '../core/env';
import { fbm2, valueNoise2, hash2 } from '../core/math';
import { Rng } from '../core/rng';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: Ctx } | null {
  if (Env.headless) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  return { c, g };
}

function toTexture(c: HTMLCanvasElement, repeat = true, srgb = true): Texture {
  const t = new CanvasTexture(c);
  if (repeat) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, Texture | null>();
function cached(key: string, make: () => Texture | null): Texture | null {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) ?? null;
}

/** Tileable fbm: sample on a torus-ish wrap by blending. */
function tileNoise(x: number, y: number, size: number, scale: number, oct = 4): number {
  const u = x / size, v = y / size;
  const a = fbm2(u * scale, v * scale, oct);
  const b = fbm2((u - 1) * scale, v * scale, oct);
  const c = fbm2(u * scale, (v - 1) * scale, oct);
  const d = fbm2((u - 1) * scale, (v - 1) * scale, oct);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function pixels(size: number, fn: (x: number, y: number) => [number, number, number, number?]): HTMLCanvasElement | null {
  const cv = canvas(size, size);
  if (!cv) return null;
  const img = cv.g.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * size + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a ?? 255;
    }
  cv.g.putImageData(img, 0, 0);
  return cv.c;
}

/** Cut stone blocks with worn edges and cracks. 1 tile ≈ 2 m. */
export function stoneTexture(): Texture | null {
  return cached('stone', () => {
    const S = 256;
    const c = pixels(S, (x, y) => {
      const n = tileNoise(x, y, S, 6, 4);
      const fine = tileNoise(x, y, S, 24, 2);
      // block grid: 2 rows, staggered
      const row = Math.floor((y / S) * 4);
      const off = row % 2 ? 0.5 : 0;
      const bx = ((x / S) * 2 + off) % 1;
      const by = ((y / S) * 4) % 1;
      const edge = Math.min(bx, 1 - bx) * 2 * 0.5, edgeY = Math.min(by, 1 - by);
      const e = Math.min(edge * 3.2, edgeY * 1.6);
      const groove = e < 0.05 ? 0.45 : e < 0.12 ? 0.8 : 1;
      let v = 0.55 + n * 0.5 + (fine - 0.5) * 0.18;
      v *= groove;
      const blockTint = hash2(Math.floor((x / S) * 2 + off), row) * 0.12;
      v *= 0.94 + blockTint;
      return [v * 150, v * 156, v * 162];
    });
    return c ? toTexture(c) : null;
  });
}

/** Rough cavern rock with strata. */
export function rockTexture(): Texture | null {
  return cached('rock', () => {
    const S = 256;
    const c = pixels(S, (x, y) => {
      const n = tileNoise(x, y, S, 4, 5);
      const strata = Math.sin((y / S) * Math.PI * 10 + n * 6) * 0.5 + 0.5;
      const fine = tileNoise(x, y, S, 20, 2);
      let v = 0.45 + n * 0.55 + strata * 0.12 + (fine - 0.5) * 0.25;
      v = Math.max(0.15, v);
      return [v * 120, v * 128, v * 140];
    });
    return c ? toTexture(c) : null;
  });
}

/** Weathered lacquered wood: faded vermilion over dark grain. */
export function woodTexture(): Texture | null {
  return cached('wood', () => {
    const S = 256;
    const c = pixels(S, (x, y) => {
      const grain = Math.sin((x / S) * 60 + tileNoise(x, y, S, 3, 3) * 12) * 0.5 + 0.5;
      const wear = tileNoise(x, y, S, 8, 4);
      const flake = wear > 0.62 ? 1 : 0;
      const base = 0.8 + grain * 0.2;
      // lacquer red vs exposed dark wood
      const r = flake ? 70 * base : 205 * base;
      const g = flake ? 45 * base : 205 * base;
      const b = flake ? 35 * base : 205 * base;
      return [r, g, b];
    });
    return c ? toTexture(c) : null;
  });
}

/** Rows of curved roof tiles (tiles run along V). */
export function roofTexture(): Texture | null {
  return cached('roof', () => {
    const S = 256;
    const c = pixels(S, (x, y) => {
      const u = (x / S) * 8;
      const fu = u - Math.floor(u);
      const ridge = Math.pow(Math.sin(fu * Math.PI), 0.6);
      const v = (y / S) * 6;
      const fv = v - Math.floor(v);
      const lap = fv > 0.85 ? 0.6 : 1;
      const n = tileNoise(x, y, S, 10, 3);
      let k = (0.35 + ridge * 0.65) * lap * (0.8 + n * 0.4);
      k = Math.max(0.12, k);
      return [k * 200, k * 210, k * 205];
    });
    return c ? toTexture(c) : null;
  });
}

/** Carved stone covered with vertical grooves and roots — the visual cue for climbable walls. */
export function carvedTexture(): Texture | null {
  return cached('carved', () => {
    const S = 256;
    const c = pixels(S, (x, y) => {
      const n = tileNoise(x, y, S, 5, 4);
      const grooves = Math.abs(Math.sin((x / S) * Math.PI * 12 + n * 2));
      const root = Math.abs(Math.sin((x / S) * Math.PI * 3 + Math.sin((y / S) * Math.PI * 4) * 1.4 + n * 3));
      const isRoot = root < 0.09;
      let v = 0.5 + n * 0.4;
      v *= 0.6 + grooves * 0.4;
      if (isRoot) return [60 + n * 30, 78 + n * 30, 52, 255];
      return [v * 140, v * 150, v * 150];
    });
    return c ? toTexture(c) : null;
  });
}

export function mossTexture(): Texture | null {
  return cached('moss', () => {
    const S = 128;
    const c = pixels(S, (x, y) => {
      const n = tileNoise(x, y, S, 8, 4);
      const v = 0.5 + n * 0.6;
      return [v * 90, v * 140, v * 95];
    });
    return c ? toTexture(c) : null;
  });
}

/** Radial glow for sprites / halos. */
export function glowTexture(): Texture | null {
  return cached('glow', () => {
    const cv = canvas(128, 128);
    if (!cv) return null;
    const g = cv.g.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cv.g.fillStyle = g;
    cv.g.fillRect(0, 0, 128, 128);
    return toTexture(cv.c, false);
  });
}

/** Soft round particle. */
export function dotTexture(): Texture | null {
  return cached('dot', () => {
    const cv = canvas(64, 64);
    if (!cv) return null;
    const g = cv.g.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cv.g.fillStyle = g;
    cv.g.fillRect(0, 0, 64, 64);
    return toTexture(cv.c, false);
  });
}

/** Soft mist sheet (tileable horizontally). */
export function mistTexture(): Texture | null {
  return cached('mist', () => {
    const S = 256;
    const c = pixels(S, (x, y) => {
      const n = tileNoise(x, y, S, 3, 5);
      const vy = y / S;
      const band = Math.sin(vy * Math.PI);
      const a = Math.max(0, (n - 0.35) * 1.8) * band;
      return [255, 255, 255, Math.min(255, a * 255)];
    });
    return c ? toTexture(c, true, false) : null;
  });
}

/**
 * Procedural "seal glyph": a few confident brush strokes inside a square.
 * Not a real character – an original ornamental mark.
 */
function drawGlyph(g: Ctx, rng: Rng, x: number, y: number, s: number, color: string, width: number): void {
  g.save();
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = width;
  const strokes = rng.int(3, 6);
  for (let i = 0; i < strokes; i++) {
    g.beginPath();
    const kind = rng.int(0, 3);
    const px = x + rng.range(0.15, 0.85) * s;
    const py = y + rng.range(0.15, 0.85) * s;
    if (kind === 0) {
      g.moveTo(x + s * 0.15, py);
      g.quadraticCurveTo(x + s * 0.5, py + rng.range(-0.08, 0.08) * s, x + s * 0.85, py);
    } else if (kind === 1) {
      g.moveTo(px, y + s * 0.12);
      g.quadraticCurveTo(px + rng.range(-0.1, 0.1) * s, y + s * 0.5, px, y + s * 0.88);
    } else if (kind === 2) {
      g.moveTo(px, py);
      g.quadraticCurveTo(px + s * 0.2, py + s * 0.05, px + s * 0.3 * rng.sign(), py + s * 0.3);
    } else {
      g.moveTo(px - s * 0.2, py - s * 0.1);
      g.lineTo(px + s * 0.15, py + s * 0.25);
    }
    g.stroke();
  }
  g.restore();
}

/** Paper lantern skin: warm glow with ribs and an ornamental seal. */
export function lanternTexture(): Texture | null {
  return cached('lantern', () => {
    const cv = canvas(256, 256);
    if (!cv) return null;
    const g = cv.g;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#6a1208');
    grad.addColorStop(0.18, '#e2481c');
    grad.addColorStop(0.5, '#ffb04a');
    grad.addColorStop(0.82, '#e2481c');
    grad.addColorStop(1, '#5a0e06');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    // ribs
    g.strokeStyle = 'rgba(80,10,0,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo(0, 20 + i * 19);
      g.lineTo(256, 20 + i * 19);
      g.stroke();
    }
    const rng = new Rng(77);
    for (let i = 0; i < 4; i++) drawGlyph(g, rng, 18 + i * 64, 84, 40, 'rgba(60,5,0,0.75)', 5);
    return toTexture(cv.c, true);
  });
}

/** Talisman paper strips (seals on doors / gates). */
export function talismanTexture(): Texture | null {
  return cached('talisman', () => {
    const cv = canvas(64, 256);
    if (!cv) return null;
    const g = cv.g;
    g.fillStyle = '#d9b75a';
    g.fillRect(0, 0, 64, 256);
    g.strokeStyle = '#8f1a0c';
    g.lineWidth = 3;
    g.strokeRect(5, 5, 54, 246);
    const rng = new Rng(9);
    for (let i = 0; i < 4; i++) drawGlyph(g, rng, 10, 16 + i * 58, 44, '#8f1a0c', 4.5);
    return toTexture(cv.c, false);
  });
}

/** Stele inscription (rows of original glyph marks) on dark stone. */
export function steleTexture(seed: number): Texture | null {
  return cached(`stele${seed}`, () => {
    const cv = canvas(128, 256);
    if (!cv) return null;
    const g = cv.g;
    g.fillStyle = '#2b3036';
    g.fillRect(0, 0, 128, 256);
    const rng = new Rng(seed);
    for (let col = 0; col < 3; col++)
      for (let row = 0; row < 7; row++) drawGlyph(g, rng, 14 + col * 36, 14 + row * 34, 28, 'rgba(210,190,140,0.75)', 2.6);
    return toTexture(cv.c, false);
  });
}

/**
 * Ink-wash mountain / spire silhouettes for distant backdrops.
 * Alpha-only (white RGB) so each layer can be tinted by fog colour.
 */
export function inkMountainsTexture(seed: number, spiky = true): Texture | null {
  return cached(`mountains${seed}${spiky}`, () => {
    const W = 1024, H = 256;
    const cv = canvas(W, H);
    if (!cv) return null;
    const g = cv.g;
    const img = g.createImageData(W, H);
    const d = img.data;
    const rng = new Rng(seed);
    const peaks: { x: number; h: number; w: number }[] = [];
    for (let i = 0; i < 14; i++) peaks.push({ x: rng.range(0, W), h: rng.range(0.35, 0.95), w: rng.range(30, spiky ? 90 : 180) });
    for (let x = 0; x < W; x++) {
      let top = 0.08 + fbm2(x / 90 + seed, 0.5, 4) * 0.18;
      for (const p of peaks) {
        for (const off of [-W, 0, W]) {
          const dx = Math.abs(x - (p.x + off)) / p.w;
          if (dx < 1) {
            const prof = spiky ? Math.pow(1 - dx, 1.6) : Math.cos(dx * Math.PI * 0.5);
            top = Math.max(top, p.h * prof * (0.9 + valueNoise2(x / 14, seed) * 0.15));
          }
        }
      }
      const topPx = H * (1 - top);
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4;
        let a = 0;
        if (y >= topPx) {
          // ink wash: denser at the ridge, fading downward into mist
          const depth = (y - topPx) / H;
          a = Math.max(0, 1 - depth * 2.2) * (0.75 + fbm2(x / 30, y / 30, 3) * 0.35);
          if (y - topPx < 2) a = Math.min(1, a + 0.2);
        }
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.max(0, Math.min(255, a * 255));
      }
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(cv.c, true, false);
    t.wrapT = RepeatWrapping;
    return t;
  });
}

/** Vertical light-shaft gradient. */
export function shaftTexture(): Texture | null {
  return cached('shaft', () => {
    const cv = canvas(64, 256);
    if (!cv) return null;
    const g = cv.g;
    const img = g.createImageData(64, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 64; x++) {
        const u = x / 63;
        const across = Math.pow(Math.sin(u * Math.PI), 2.5);
        const along = Math.pow(1 - y / 255, 0.7) * Math.min(1, y / 20);
        const streak = 0.75 + valueNoise2(x / 5, 0.3) * 0.5;
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = across * along * streak * 255;
      }
    g.putImageData(img, 0, 0);
    return toTexture(cv.c, false, false);
  });
}

/** Ink splash (for hit effects & decals). */
export function inkSplatTexture(): Texture | null {
  return cached('ink', () => {
    const cv = canvas(128, 128);
    if (!cv) return null;
    const g = cv.g;
    const rng = new Rng(5);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(64, 64, 26, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(28, 56);
      g.beginPath();
      g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rng.range(3, 10), 0, Math.PI * 2);
      g.fill();
      g.lineWidth = rng.range(3, 8);
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(64 + Math.cos(a) * r * 0.9, 64 + Math.sin(a) * r * 0.9);
      g.stroke();
    }
    return toTexture(cv.c, false, false);
  });
}

/** Swing trail texture: bright leading edge fading along the arc. */
export function slashTexture(): Texture | null {
  return cached('slash', () => {
    const W = 256, H = 64;
    const cv = canvas(W, H);
    if (!cv) return null;
    const g = cv.g;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1); // along arc: 1 = leading edge
        const v = y / (H - 1); // across: 1 = outer edge
        const edge = Math.pow(v, 3.5);
        const body = Math.pow(v, 1.2) * 0.55;
        const fade = Math.pow(u, 1.6);
        const streak = 0.8 + valueNoise2(x / 6, y / 2) * 0.3;
        const a = Math.min(1, (edge + body) * fade * streak);
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a * 255;
      }
    g.putImageData(img, 0, 0);
    return toTexture(cv.c, false, false);
  });
}

/** Spark streak: bright head at u = 1 fading to the tail at u = 0, soft across. */
export function streakTexture(): Texture | null {
  return cached('streak', () => {
    const W = 64, H = 16;
    const cv = canvas(W, H);
    if (!cv) return null;
    const img = cv.g.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1), v = Math.abs(y / (H - 1) - 0.5) * 2;
        const a = Math.pow(u, 1.6) * (1 - v * v) + (u > 0.86 ? (1 - v) * 0.8 : 0);
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.min(1, a) * 255;
      }
    cv.g.putImageData(img, 0, 0);
    return toTexture(cv.c, false, false);
  });
}

/** Stylised waterfall streaks (scrolling). */
export function waterfallTexture(): Texture | null {
  return cached('waterfall', () => {
    const S = 128;
    const c = pixels(S, (x, y) => {
      const n = tileNoise(x, y * 0.25, S, 6, 3);
      const streak = Math.pow(Math.abs(Math.sin((x / S) * Math.PI * 9 + n * 4)), 3);
      const a = 0.35 + streak * 0.5 + n * 0.3;
      return [255, 255, 255, Math.min(255, a * 255)];
    });
    return c ? toTexture(c, true, false) : null;
  });
}

export function hashNoiseTexture(): Texture | null {
  return cached('noise', () => {
    const S = 128;
    const c = pixels(S, (x, y) => {
      const n = tileNoise(x, y, S, 4, 4) * 255;
      return [n, tileNoise(x + 50, y + 20, S, 8, 3) * 255, hash2(x, y) * 255];
    });
    return c ? toTexture(c, true, false) : null;
  });
}
