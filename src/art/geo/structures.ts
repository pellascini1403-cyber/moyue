import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { Placer } from '../../world/BuildContext';
import { ColliderProps } from '../../physics/Collider';
import { WorldMatKey } from '../materials';
import { boxG, cylG, latheG, prismG, sphereG, torusG } from './basic';
import { roofGeometry } from './roof';
import { fbm3, valueNoise2 } from '../../core/math';

const ROOF_TINT = 0xffffff;

export interface PlatformOpts {
  mat?: WorldMatKey;
  trim?: WorldMatKey | null;
  collide?: ColliderProps | boolean;
  color?: number;
  /** extra visual depth below (foundation) */
  foundation?: number;
}

/** Cut-stone platform. Top surface at local y = 0. */
export function stonePlatform(P: Placer, lx: number, ly: number, lz: number, w: number, d: number, h: number, o: PlatformOpts = {}): void {
  const mat = o.mat ?? 'stone';
  P.box(mat, lx, ly - h / 2, lz, w, h, d, {
    collide: o.collide ?? true,
    color: o.color,
    ao: { y0: P.origin.y + ly - h, y1: P.origin.y + ly, min: 0.45 },
  });
  if (o.trim !== null) {
    const t = o.trim ?? 'stoneDark';
    P.box(t, lx, ly - 0.12, lz, w + 0.16, 0.24, d + 0.16, {});
  }
  if (o.foundation) {
    P.box('stoneDark', lx, ly - h - o.foundation / 2, lz, w * 0.9, o.foundation, d * 0.9, {
      ao: { y0: P.origin.y + ly - h - o.foundation, y1: P.origin.y + ly - h, min: 0.2 },
    });
  }
}

/** Straight stair flight rising along local +z. Visual steps + a single ramp collider. */
export function stairs(P: Placer, lx: number, ly: number, lz: number, width: number, run: number, rise: number,
  o: { mat?: WorldMatKey; sides?: boolean; collide?: boolean } = {}): void {
  const n = Math.max(2, Math.round(rise / 0.22));
  const r = run / n, h = rise / n;
  const mat = o.mat ?? 'stone';
  for (let i = 0; i < n; i++) {
    const top = ly + (i + 1) * h;
    // each step box extends down to the base so there are no gaps underneath
    const bh = (i + 1) * h;
    P.box(mat, lx, top - bh / 2, lz + i * r + r / 2, width, bh, r, {
      ao: { y0: P.origin.y + ly, y1: P.origin.y + top, min: 0.55 },
      jitter: 0.05,
    });
  }
  if (o.sides) {
    for (const s of [-1, 1]) {
      const len = Math.hypot(run, rise);
      const ang = Math.atan2(rise, run);
      P.box('stoneDark', lx + s * (width / 2 + 0.2), ly + rise / 2 + 0.25, lz + run / 2, 0.4, 0.5, len, { rx: -ang, collide: { walkable: false } });
    }
  }
  if (o.collide !== false) {
    const len = Math.hypot(run, rise);
    const a = Math.atan2(rise, run);
    const t = 0.5;
    // surface line from (z=-r/2, y=0) to (z=run-r/2, y=rise)
    const mz = lz + run / 2 - r / 2, my = ly + rise / 2;
    const nY = Math.cos(a), nZ = -Math.sin(a);
    P.collider(lx, my - (nY * t) / 2, mz - (nZ * t) / 2, width / 2, t / 2, len / 2 + r * 0.25, {}, 0, -a, 0);
    // flat lip over the top step, overlapping the landing so there is never a seam
    const z0 = lz + run - r * 0.75, z1 = lz + run + 0.6;
    P.collider(lx, ly + rise - 0.2, (z0 + z1) / 2, width / 2, 0.2, (z1 - z0) / 2, { safe: true });
  }
}

export interface BridgeOpts {
  width?: number;
  arch?: number;
  missing?: number[];
  rails?: boolean;
  mat?: WorldMatKey;
  segLen?: number;
  deck?: number;
}

/** Arched stone bridge along local +z (0 → length). Deck follows y = arch·sin(πt). */
export function archBridge(P: Placer, lx: number, ly: number, lz: number, length: number, o: BridgeOpts = {}): { segments: { z0: number; z1: number; y0: number; y1: number }[] } {
  const width = o.width ?? 3;
  const arch = o.arch ?? length * 0.12;
  const segLen = o.segLen ?? 2.2;
  const n = Math.max(2, Math.round(length / segLen));
  const mat = o.mat ?? 'stone';
  const deck = o.deck ?? 0.5;
  const missing = new Set(o.missing ?? []);
  const yAt = (t: number) => ly + arch * Math.sin(Math.PI * t);
  const segs: { z0: number; z1: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const z0 = lz + t0 * length, z1 = lz + t1 * length;
    const y0 = yAt(t0), y1 = yAt(t1);
    segs.push({ z0, z1, y0, y1 });
    if (missing.has(i)) {
      // broken ends: jagged chunks
      for (const [zz, yy, dir] of [[z0, y0, 1], [z1, y1, -1]] as [number, number, number][]) {
        if (missing.has(dir > 0 ? i - 1 : i + 1)) continue;
        P.box(mat, lx - width * 0.2, yy - 0.35, zz + dir * 0.25, width * 0.5, 0.5, 0.5, { rz: 0.3, rx: 0.2 * dir });
      }
      continue;
    }
    const len = Math.hypot(z1 - z0, y1 - y0) + 0.04;
    const ang = Math.atan2(y1 - y0, z1 - z0);
    const mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
    P.box(mat, lx, my - deck / 2, mz, width, deck, len, { rx: -ang, collide: true, ao: { y0: P.origin.y + my - 1.5, y1: P.origin.y + my, min: 0.5 } });
    // arch body beneath (visual)
    const body = 0.4 + (1 - Math.sin(Math.PI * ((t0 + t1) / 2))) * arch * 1.2;
    P.box('stoneDark', lx, my - deck - body / 2 + 0.02, mz, width * 0.92, body, len * 0.98, {
      rx: -ang, ao: { y0: P.origin.y + my - deck - body, y1: P.origin.y + my, min: 0.3 },
    });
    if (o.rails !== false) {
      for (const s of [-1, 1]) {
        P.box('stonePale', lx + s * (width / 2 - 0.12), my + 0.36, mz, 0.18, 0.12, len, { rx: -ang, color: 0xd8d2c4 });
        P.box('stonePale', lx + s * (width / 2 - 0.12), my + 0.12, mz, 0.12, 0.3, len * 0.9, { rx: -ang });
        P.collider(lx + s * (width / 2 - 0.12), my + 0.25, mz, 0.1, 0.35, len / 2, { walkable: false, camera: false }, 0, -ang, 0);
      }
      if (!missing.has(i - 1) || i === 0) {
        for (const s of [-1, 1]) {
          P.box('stonePale', lx + s * (width / 2 - 0.12), y0 + 0.3, z0, 0.26, 0.6, 0.26, {});
          P.add('stonePale', sphereG(8), lx + s * (width / 2 - 0.12), y0 + 0.66, z0, 0, 0, 0, 0.24, 0.24, 0.24);
        }
      }
    }
  }
  return { segments: segs };
}

export interface GateOpts {
  mat?: WorldMatKey;
  roof?: WorldMatKey;
  tiers?: 1 | 3;
  plaque?: boolean;
  collide?: boolean;
}

/** Ceremonial gate (pillars, lintels, plaque, small roofs). Faces local ±z, spans local x. */
export function ceremonialGate(P: Placer, lx: number, ly: number, lz: number, width: number, height: number, o: GateOpts = {}): void {
  const pm = o.mat ?? 'wood';
  const pr = Math.max(0.28, width * 0.045);
  for (const s of [-1, 1]) {
    const x = lx + s * width / 2;
    P.add('stoneDark', boxG(), x, ly + 0.5, lz, 0, 0, 0, pr * 3.2, 1, pr * 3.2);
    P.add(pm, cylG(pr, pr * 1.05, 14), x, ly + height / 2, lz, 0, 0, 0, 1, height, 1, { ao: { y0: P.origin.y + ly, y1: P.origin.y + ly + height, min: 0.55 } });
    // stone clasps
    P.add('stoneDark', boxG(), x, ly + 1.4, lz, 0, 0, 0, pr * 0.9, 1.6, pr * 4.2);
    if (o.collide !== false) P.cylCollider(x, ly + height / 2, lz, pr * 1.2, height / 2, {});
  }
  const beamY = ly + height * 0.78;
  P.box(pm, lx, beamY, lz, width + pr * 5, pr * 1.4, pr * 1.6, {});
  P.box('woodDark', lx, beamY + pr * 2.3, lz, width + pr * 3, pr * 1.2, pr * 1.3, {});
  if (o.plaque !== false) {
    P.box('ink', lx, beamY + pr * 1.2 + 0.45, lz, width * 0.34, 0.9, 0.12, {});
    P.box('gold', lx, beamY + pr * 1.2 + 0.45, lz, width * 0.37, 1.0, 0.08, {});
  }
  const roofY = beamY + pr * 3.2;
  const { shell, caps } = roofGeometry(width / 2 + pr * 4, pr * 3.2, pr * 2.6, { upturn: pr * 1.4, flare: 0.25, seg: 5 });
  P.add(o.roof ?? 'roof', shell, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0, color: ROOF_TINT });
  P.add('roof', caps, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { color: 0x6e6a60, uvScale: 0.001 });
  if (o.tiers === 3) {
    for (const s of [-1, 1]) {
      const { shell: s2, caps: c2 } = roofGeometry(width * 0.2, pr * 2.6, pr * 2, { upturn: pr, flare: 0.3, seg: 4 });
      P.add(o.roof ?? 'roof', s2, lx + s * width * 0.42, roofY - pr * 2, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
      P.add('roof', c2, lx + s * width * 0.42, roofY - pr * 2, lz, 0, 0, 0, 1, 1, 1, { color: 0x6e6a60, uvScale: 0.001 });
    }
  }
}

export interface PagodaOpts {
  tiers?: number;
  base?: number; // half-size of ground tier
  tierH?: number;
  shrink?: number;
  roof?: WorldMatKey;
  body?: WorldMatKey;
  windows?: boolean;
  balconies?: boolean;
  sides?: 4 | 8;
  collide?: boolean;
  lanterns?: boolean;
}

/** Multi-tier pagoda. Returns the world-space balcony heights. */
export function pagoda(P: Placer, lx: number, ly: number, lz: number, o: PagodaOpts = {}): { tops: number[]; halfs: number[] } {
  const tiers = o.tiers ?? 5;
  const base = o.base ?? 5;
  const tierH = o.tierH ?? 5;
  const shrink = o.shrink ?? 0.1;
  const sides = o.sides ?? 4;
  let y = ly;
  const tops: number[] = [];
  const halfs: number[] = [];
  // plinth
  P.box('stoneDark', lx, y + 0.5, lz, base * 2.6, 1, base * 2.6, { ao: { y0: P.origin.y + y, y1: P.origin.y + y + 1, min: 0.4 } });
  P.box('stone', lx, y + 1.2, lz, base * 2.3, 0.4, base * 2.3, {});
  if (o.collide !== false) P.collider(lx, y + 0.7, lz, base * 1.3, 0.7, base * 1.3);
  y += 1.4;
  for (let i = 0; i < tiers; i++) {
    const half = base * (1 - shrink * i);
    const h = tierH * (1 - 0.06 * i) * (i === 0 ? 1.15 : 1);
    halfs.push(half);
    const bodyHalf = half * 0.78;
    // floor slab / balcony
    P.box('stoneDark', lx, y + 0.12, lz, half * 2, 0.24, half * 2, {});
    if (i > 0 && o.balconies !== false) {
      // railing ring
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const sub = P.sub(lx, 0, lz, a);
        sub.box('wood', 0, y + 0.62, half - 0.08, half * 2, 0.08, 0.08, {});
        sub.box('woodDark', 0, y + 0.35, half - 0.08, half * 2, 0.05, 0.05, {});
        for (let q = -3; q <= 3; q++) sub.box('wood', (q / 3) * (half - 0.1), y + 0.4, half - 0.08, 0.08, 0.55, 0.08, {});
      }
    }
    if (o.collide !== false) {
      P.collider(lx, y + 0.12, lz, half, 0.12, half, { safe: true });
      // core
      P.collider(lx, y + h * 0.4, lz, bodyHalf, h * 0.4, bodyHalf, { walkable: true });
    }
    // body
    const bodyH = h * 0.78;
    if (sides === 8) {
      P.add(o.body ?? 'plaster', prismG(8, bodyHalf * 1.08, bodyHalf * 1.08), lx, y + 0.24 + bodyH / 2, lz, 0, Math.PI / 8, 0, 1, bodyH, 1, { ao: { y0: P.origin.y + y, y1: P.origin.y + y + bodyH, min: 0.5 } });
    } else {
      P.box(o.body ?? 'plaster', lx, y + 0.24 + bodyH / 2, lz, bodyHalf * 2, bodyH, bodyHalf * 2, { ao: { y0: P.origin.y + y, y1: P.origin.y + y + bodyH, min: 0.5 } });
    }
    // columns + windows on each face
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const sub = P.sub(lx, 0, lz, a);
      for (const cx of [-1, -0.34, 0.34, 1]) {
        sub.add('wood', cylG(0.16 * (half / 5) + 0.06, 0.18 * (half / 5) + 0.06, 8), cx * bodyHalf * 0.98, y + 0.24 + bodyH / 2, bodyHalf + 0.05, 0, 0, 0, 1, bodyH, 1);
      }
      if (o.windows !== false) {
        const ww = bodyHalf * 0.5, wh = bodyH * 0.45;
        sub.box('windowGlow', 0, y + 0.24 + bodyH * 0.52, bodyHalf + 0.03, ww, wh, 0.06, {});
        // lattice
        for (let q = -2; q <= 2; q++) sub.box('woodDark', (q / 2) * ww * 0.5, y + 0.24 + bodyH * 0.52, bodyHalf + 0.08, 0.05, wh, 0.05, {});
        sub.box('woodDark', 0, y + 0.24 + bodyH * 0.52, bodyHalf + 0.08, ww, 0.05, 0.05, {});
        sub.light(0, y + 0.24 + bodyH * 0.52, bodyHalf + 1.2, 0xffa050, 3.5 * (half / 5), 7 + half, 0.05);
      }
      // bracket band
      sub.box('gold', 0, y + 0.24 + bodyH - 0.2, bodyHalf + 0.12, bodyHalf * 2, 0.16, 0.2, {});
      sub.box('wood', 0, y + 0.24 + bodyH + 0.08, bodyHalf + 0.2, bodyHalf * 2.1, 0.4, 0.3, {});
    }
    // roof
    const rHalf = half + Math.max(0.8, half * 0.28);
    const rH = rHalf * 0.5;
    const roofY = y + 0.24 + bodyH + 0.1;
    const { shell, caps } = roofGeometry(rHalf, rHalf, rH, { upturn: rHalf * 0.22, flare: 0.14, seg: 8, ornaments: false });
    P.add(o.roof ?? 'roof', shell, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
    P.add('roof', caps, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { color: 0x77726a, uvScale: 0.001 });
    if (o.collide !== false) {
      // roof as a solid, non-walkable body (you slide off, the camera respects it)
      P.collider(lx, roofY + rH * 0.25, lz, rHalf * 0.72, rH * 0.25, rHalf * 0.72, { walkable: false });
    }
    if (o.lanterns !== false) {
      // lanterns hanging from the four roof corners
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const dist = rHalf * 1.32;
        const px = lx + Math.sin(a) * dist * Math.SQRT1_2 * 1.05, pz = lz + Math.cos(a) * dist * Math.SQRT1_2 * 1.05;
        hangingLantern(P, px, roofY + rHalf * 0.12, pz, 1.2, 0.55 + half * 0.05);
      }
    }
    tops.push(P.origin.y + y + 0.24);
    y = roofY + rH * 0.55;
  }
  // spire
  P.add('bronze', cylG(0.12, 0.2, 8), lx, y + 2, lz, 0, 0, 0, 1, 4, 1);
  for (let r = 0; r < 5; r++) P.add('gold', torusG(0.45 - r * 0.06, 0.07, 5, 14), lx, y + 0.8 + r * 0.55, lz, Math.PI / 2, 0, 0);
  P.add('gold', sphereG(10), lx, y + 4.3, lz, 0, 0, 0, 0.55, 0.7, 0.55);
  P.glow(lx, y + 4.3, lz, 0xffc070, 2.2, 0.03);
  return { tops, halfs };
}

/** Hexagonal paper lantern hanging on a cord. (x,y,z) is the attachment point. */
export function hangingLantern(P: Placer, lx: number, ly: number, lz: number, cord: number, size = 0.6, lightIt = true): void {
  const bodyY = ly - cord - size * 0.6;
  if (cord > 0.05) P.add('chain', cylG(0.02, 0.02, 4), lx, ly - cord / 2, lz, 0, 0, 0, 1, cord, 1, { jitter: 0 });
  P.add('woodDark', prismG(6, size * 0.42, size * 0.42), lx, bodyY + size * 0.62, lz, 0, 0, 0, 1, size * 0.12, 1);
  P.add('lanternPaper', latheG([[0.2, -0.6], [0.43, -0.4], [0.5, 0], [0.43, 0.4], [0.2, 0.6]], 6), lx, bodyY, lz, 0, 0, 0, size, size, size, { uvScale: 0 });
  P.add('woodDark', prismG(6, size * 0.34, size * 0.34), lx, bodyY - size * 0.62, lz, 0, 0, 0, 1, size * 0.1, 1);
  P.add('cloth', cylG(0.01, size * 0.12, 5), lx, bodyY - size * 1.05, lz, 0, 0, 0, 1, size * 0.75, 1);
  if (lightIt) {
    P.glow(lx, bodyY, lz, 0xff8a3a, size * 5.5, 0.08);
    P.light(lx, bodyY, lz, 0xff7a36, 4 + size * 5, 7 + size * 9, 0.12);
  }
}

/** Standing stone lantern with a little roof cap. */
export function stoneLantern(P: Placer, lx: number, ly: number, lz: number, h = 1.8, lightIt = true): void {
  const s = h / 1.8;
  P.box('stoneDark', lx, ly + 0.15 * s, lz, 0.7 * s, 0.3 * s, 0.7 * s, {});
  P.add('stone', cylG(0.14 * s, 0.18 * s, 8), lx, ly + 0.7 * s, lz, 0, 0, 0, 1, 0.8 * s, 1);
  P.box('stone', lx, ly + 1.15 * s, lz, 0.6 * s, 0.12 * s, 0.6 * s, {});
  P.box('lanternWarm', lx, ly + 1.4 * s, lz, 0.34 * s, 0.34 * s, 0.34 * s, {});
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box('stone', lx + dx * 0.2 * s, ly + 1.4 * s, lz + dz * 0.2 * s, 0.08 * s, 0.4 * s, 0.08 * s, {});
  const { shell, caps } = roofGeometry(0.45 * s, 0.45 * s, 0.25 * s, { upturn: 0.08 * s, flare: 0.2, seg: 3, ornaments: false, capRadius: 0.025 * s });
  P.add('stoneDark', shell, lx, ly + 1.6 * s, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
  P.add('stoneDark', caps, lx, ly + 1.6 * s, lz);
  P.add('stone', sphereG(6), lx, ly + 1.95 * s, lz, 0, 0, 0, 0.12 * s, 0.16 * s, 0.12 * s);
  P.collider(lx, ly + h / 2, lz, 0.3 * s, h / 2, 0.3 * s, { camera: false });
  if (lightIt) {
    P.glow(lx, ly + 1.4 * s, lz, 0xffa04a, 2.2 * s, 0.1);
    P.light(lx, ly + 1.5 * s, lz, 0xff8c3c, 3.5, 8, 0.15);
  }
}

export interface HallOpts {
  podium?: number;
  colH?: number;
  roof?: WorldMatKey;
  doubleRoof?: boolean;
  backWall?: boolean;
  sideWalls?: boolean;
  frontScreens?: boolean;
  steps?: boolean;
  collide?: boolean;
  lanterns?: boolean;
  glow?: boolean;
}

/** Temple hall: podium, column grid, walls, bracket band, sweeping hip roof. Front faces local +z. */
export function templeHall(P: Placer, lx: number, ly: number, lz: number, halfW: number, halfD: number, o: HallOpts = {}): { floorY: number } {
  const podium = o.podium ?? 1.2;
  const colH = o.colH ?? 5;
  const pw = halfW + 1.2, pd = halfD + 1.2;
  stonePlatform(P, lx, ly + podium, lz, pw * 2, pd * 2, podium, { collide: o.collide !== false ? { safe: true } : false });
  const fy = ly + podium;
  if (o.steps !== false) {
    // stairs rise along local +z, so build them rotated to climb towards the hall front
    const run = podium * 1.8;
    stairs(P.sub(lx, 0, lz + pd + run, Math.PI), 0, ly, 0, Math.min(halfW * 1.2, 6), run, podium, { sides: true });
  }
  // columns
  const nx = Math.max(2, Math.round((halfW * 2) / 3.2));
  const nz = Math.max(2, Math.round((halfD * 2) / 3.2));
  const colR = 0.3;
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const edge = i === 0 || i === nx || j === 0 || j === nz;
      if (!edge) continue;
      const x = lx - halfW + (i / nx) * halfW * 2;
      const z = lz - halfD + (j / nz) * halfD * 2;
      P.add('stoneDark', cylG(colR * 1.5, colR * 1.7, 10), x, fy + 0.15, z, 0, 0, 0, 1, 0.3, 1);
      P.add('wood', cylG(colR, colR * 1.08, 12), x, fy + colH / 2, z, 0, 0, 0, 1, colH, 1, { ao: { y0: P.origin.y + fy, y1: P.origin.y + fy + colH, min: 0.6 } });
      if (o.collide !== false) P.cylCollider(x, fy + colH / 2, z, colR * 1.1, colH / 2, { camera: false });
    }
  // walls
  const wallT = 0.3;
  if (o.backWall !== false) {
    P.box('plaster', lx, fy + colH / 2, lz - halfD, halfW * 2, colH, wallT, { collide: true, ao: { y0: P.origin.y + fy, y1: P.origin.y + fy + colH, min: 0.45 } });
    P.box('wood', lx, fy + 0.4, lz - halfD + 0.18, halfW * 2, 0.8, 0.1, {});
  }
  if (o.sideWalls) {
    for (const s of [-1, 1]) P.box('plaster', lx + s * halfW, fy + colH / 2, lz, wallT, colH, halfD * 2, { collide: true, ao: { y0: P.origin.y + fy, y1: P.origin.y + fy + colH, min: 0.45 } });
  }
  if (o.frontScreens) {
    for (let i = 0; i < nx; i++) {
      if (i === Math.floor(nx / 2)) continue; // central doorway
      const x0 = lx - halfW + (i / nx) * halfW * 2, x1 = lx - halfW + ((i + 1) / nx) * halfW * 2;
      const cx = (x0 + x1) / 2, w = x1 - x0 - colR * 2;
      P.box('woodDark', cx, fy + colH * 0.45, lz + halfD, w, colH * 0.9, 0.12, { collide: true });
      for (let q = 1; q < 6; q++) P.box('wood', cx - w / 2 + (q / 6) * w, fy + colH * 0.5, lz + halfD + 0.08, 0.05, colH * 0.7, 0.05, {});
      for (let q = 1; q < 6; q++) P.box('wood', cx, fy + colH * 0.15 + (q / 6) * colH * 0.7, lz + halfD + 0.08, w, 0.05, 0.05, {});
      if (o.glow !== false) P.box('windowGlow', cx, fy + colH * 0.5, lz + halfD - 0.05, w * 0.9, colH * 0.6, 0.02, {});
    }
  }
  // beams + brackets
  const by = fy + colH;
  for (const s of [-1, 1]) {
    P.box('wood', lx, by + 0.2, lz + s * halfD, halfW * 2 + 0.6, 0.5, 0.45, {});
    P.box('wood', lx + s * halfW, by + 0.2, lz, 0.45, 0.5, halfD * 2 + 0.6, {});
    P.box('gold', lx, by - 0.08, lz + s * (halfD + 0.24), halfW * 2, 0.1, 0.05, {});
  }
  for (let i = 0; i <= nx * 2; i++) {
    const x = lx - halfW + (i / (nx * 2)) * halfW * 2;
    for (const s of [-1, 1]) {
      P.box('woodDark', x, by + 0.62, lz + s * (halfD + 0.35), 0.35, 0.34, 0.7, {});
      P.box('gold', x, by + 0.84, lz + s * (halfD + 0.55), 0.4, 0.1, 0.5, {});
    }
  }
  // ceiling slab (camera + shelter)
  P.box('woodDark', lx, by + 0.9, lz, halfW * 2 + 0.6, 0.3, halfD * 2 + 0.6, { collide: { walkable: true } });
  // roof
  const rW = halfW + 2.2, rD = halfD + 2.2;
  const rH = rD * 0.62;
  const roofY = by + 1.05;
  if (o.doubleRoof) {
    const { shell, caps } = roofGeometry(rW, rD, rH * 0.35, { upturn: rD * 0.14, flare: 0.08, seg: 8, ornaments: false, curve: 1.3 });
    P.add(o.roof ?? 'roof', shell, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
    P.add('roof', caps, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { color: 0x77726a, uvScale: 0.001 });
    P.box('wood', lx, roofY + rH * 0.35 + 0.6, lz, halfW * 1.5, 1.2, halfD * 1.4, {});
    const { shell: s2, caps: c2 } = roofGeometry(halfW * 0.85 + 1.4, halfD * 0.75 + 1.4, (halfD * 0.75 + 1.4) * 0.65, { upturn: rD * 0.16, flare: 0.1, seg: 8 });
    P.add(o.roof ?? 'roof', s2, lx, roofY + rH * 0.35 + 1.1, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
    P.add('roof', c2, lx, roofY + rH * 0.35 + 1.1, lz, 0, 0, 0, 1, 1, 1, { color: 0x77726a, uvScale: 0.001 });
  } else {
    const { shell, caps } = roofGeometry(rW, rD, rH, { upturn: rD * 0.18, flare: 0.1, seg: 9 });
    P.add(o.roof ?? 'roof', shell, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
    P.add('roof', caps, lx, roofY, lz, 0, 0, 0, 1, 1, 1, { color: 0x77726a, uvScale: 0.001 });
  }
  if (o.collide !== false) {
    P.collider(lx, roofY + rH * 0.2, lz, rW * 0.75, rH * 0.2, rD * 0.7, { walkable: false });
  }
  if (o.lanterns !== false) {
    for (const s of [-1, 1]) hangingLantern(P, lx + s * halfW * 0.6, by - 0.1, lz + halfD + 0.4, 0.5, 0.7);
  }
  return { floorY: P.origin.y + fy };
}

/** Low carved balustrade along local x (length), centred. */
export function balustrade(P: Placer, lx: number, ly: number, lz: number, length: number, ry = 0, collide = true): void {
  const sub = P.sub(lx, 0, lz, ry);
  sub.box('stonePale', 0, ly + 0.72, 0, length, 0.12, 0.22, {});
  sub.box('stonePale', 0, ly + 0.08, 0, length, 0.16, 0.26, {});
  const n = Math.max(1, Math.round(length / 1.6));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (i / n) * length;
    sub.box('stonePale', x, ly + 0.42, 0, 0.2, 0.84, 0.2, {});
    sub.add('stonePale', sphereG(6), x, ly + 0.92, 0, 0, 0, 0, 0.2, 0.22, 0.2);
    if (i < n) sub.box('stone', x + length / n / 2, ly + 0.42, 0, length / n - 0.2, 0.45, 0.08, {});
  }
  if (collide) sub.collider(0, ly + 0.5, 0, length / 2, 0.5, 0.15, { walkable: false, camera: false });
}

/** Big carved column (free-standing, often broken). */
export function column(P: Placer, lx: number, ly: number, lz: number, h: number, r: number, o: { mat?: WorldMatKey; broken?: boolean; collide?: ColliderProps | boolean; climbable?: boolean } = {}): void {
  const mat = o.mat ?? (o.climbable ? 'carved' : 'stone');
  P.add('stoneDark', cylG(r * 1.35, r * 1.5, 12), lx, ly + 0.3, lz, 0, 0, 0, 1, 0.6, 1);
  P.add(mat, cylG(r, r * 1.05, 14), lx, ly + h / 2, lz, 0, 0, 0, 1, h, 1, { ao: { y0: P.origin.y + ly, y1: P.origin.y + ly + h, min: 0.5 }, uvScale: 2 });
  if (!o.broken) {
    P.add('stoneDark', cylG(r * 1.3, r * 1.1, 12), lx, ly + h + 0.25, lz, 0, 0, 0, 1, 0.5, 1);
  } else {
    P.add(mat, coneBroken(), lx, ly + h, lz, 0, 0, 0, r * 2, r * 1.2, r * 2);
  }
  const props = o.collide === false ? null : o.collide === true || o.collide === undefined ? { climbable: !!o.climbable } : o.collide;
  if (props) P.cylCollider(lx, ly + h / 2, lz, r * 1.05, h / 2, props);
}

let brokenCone: BufferGeometry | null = null;
function coneBroken(): BufferGeometry {
  if (brokenCone) return brokenCone;
  const g = new CylinderGeometry(0.5, 0.5, 1, 14, 3);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0) {
      const a = Math.atan2(z, x);
      pos.setY(i, y * (0.2 + valueNoise2(a * 3, 1) * 1.6));
    }
  }
  g.computeVertexNormals();
  brokenCone = g;
  return g;
}

/** Natural rock pillar with a flat walkable top at local y=0. */
export function rockPillar(P: Placer, lx: number, ly: number, lz: number, r: number, depth: number, o: { mat?: WorldMatKey; moss?: boolean; seed?: number; collide?: ColliderProps | boolean; taper?: number } = {}): void {
  const seed = o.seed ?? Math.floor(lx * 13 + lz * 7);
  const segs = 14, rings = Math.max(4, Math.round(depth / 2.5));
  const taper = o.taper ?? 0.45;
  const g = new CylinderGeometry(r, r * taper, depth, segs, rings, false);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const t = (y + depth / 2) / depth; // 0 bottom, 1 top
    const n = fbm3(Math.cos(a) * 1.3 + seed, y * 0.25, Math.sin(a) * 1.3, 3);
    const top = y > depth / 2 - 1e-4;
    let k = 0.82 + n * 0.45;
    if (top) k = Math.min(k, 1.02);
    const rr = Math.hypot(x, z);
    if (rr > 1e-4) {
      pos.setX(i, (x / rr) * rr * k);
      pos.setZ(i, (z / rr) * rr * k);
    }
    if (!top) pos.setY(i, y + (n - 0.5) * 0.6 * (1 - t));
  }
  g.computeVertexNormals();
  g.translate(0, -depth / 2, 0);
  P.add(o.mat ?? 'rock', g, lx, ly, lz, 0, 0, 0, 1, 1, 1, { ao: { y0: P.origin.y + ly - depth, y1: P.origin.y + ly, min: 0.25 } });
  if (o.moss !== false) {
    P.add('moss', cylG(r * 0.98, r * 0.9, segs), lx, ly + 0.03, lz, 0, 0, 0, 1, 0.12, 1, { jitter: 0.15 });
  }
  if (o.collide !== false) {
    const props = o.collide === true || o.collide === undefined ? { safe: true } : o.collide;
    P.cylCollider(lx, ly - 1.5, lz, r * 0.93, 1.5, props);
    P.cylCollider(lx, ly - depth / 2 - 1, lz, r * 0.75, depth / 2 - 0.5, { walkable: false });
  }
}

/** Shallow tiled courtyard with inset pattern. */
export function courtyard(P: Placer, lx: number, ly: number, lz: number, w: number, d: number, h = 2, color?: number): void {
  stonePlatform(P, lx, ly, lz, w, d, h, { collide: { safe: true }, color });
  // inset border pattern
  P.box('stoneDark', lx, ly + 0.01, lz, w * 0.7, 0.02, 0.2, {});
  P.box('stoneDark', lx, ly + 0.01, lz, 0.2, 0.02, d * 0.7, {});
}

export function makeColor(c: number): Color {
  return new Color(c);
}

/** Simple quad strip for cloth banners hanging from beams. */
export function bannerGeometry(w: number, h: number): BufferGeometry {
  const g = new BufferGeometry();
  const segs = 6;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= segs; j++) {
    const t = j / segs;
    const sway = Math.sin(t * 2.2) * 0.08 * t;
    for (const s of [-0.5, 0.5]) {
      pos.push(s * w * (1 - t * 0.15), -t * h, sway);
      uv.push(s + 0.5, 1 - t);
    }
  }
  for (let j = 0; j < segs; j++) {
    const a = j * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const _tmp = new Vector3();
