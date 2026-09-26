import { BufferGeometry, Vector3 } from 'three';
import { Placer } from '../../world/BuildContext';
import { boxG, cylG, latheG, sphereG, taperTubeG, torusG } from './basic';
import { roofGeometry } from './roof';
import { hangingLantern } from './structures';

/**
 * Colossal seated moth-sage statue: robed body, hands folded, feathered
 * antennae sweeping back like a crown, a broken halo behind. Faces local +z.
 */
export function sageStatue(P: Placer, lx: number, ly: number, lz: number, s: number, o: { broken?: boolean; moss?: boolean; collide?: boolean; eyesGlow?: boolean } = {}): void {
  const mat = 'stonePale' as const;
  const ao = { y0: P.origin.y + ly, y1: P.origin.y + ly + s * 9, min: 0.35 };
  // plinth
  P.box('stoneDark', lx, ly + s * 0.6, lz, s * 7.5, s * 1.2, s * 6, { ao, collide: o.collide !== false ? { safe: true } : undefined });
  P.box('stone', lx, ly + s * 1.35, lz, s * 7, s * 0.3, s * 5.6, {});
  const by = ly + s * 1.5;
  // folded legs
  P.add(mat, sphereG(14), lx, by + s * 0.6, lz + s * 0.6, 0, 0, 0, s * 5.8, s * 1.6, s * 3.6, { ao });
  // robed torso (lathe)
  P.add(mat, latheG([[2.6, 0], [2.7, 0.6], [2.3, 1.8], [1.9, 3.0], [1.75, 3.8], [1.2, 4.3], [0.5, 4.55]], 18), lx, by + s * 0.6, lz, 0, 0, 0, s, s, s * 0.8, { ao });
  // sleeves / arms resting in lap
  for (const side of [-1, 1]) {
    const pts = [
      new Vector3(lx + side * s * 1.9, by + s * 4.2, lz),
      new Vector3(lx + side * s * 2.4, by + s * 3.0, lz + s * 0.6),
      new Vector3(lx + side * s * 1.6, by + s * 1.9, lz + s * 1.6),
      new Vector3(lx + side * s * 0.4, by + s * 1.7, lz + s * 1.9),
    ].map((v) => v.sub(new Vector3(lx, 0, lz)));
    P.add(mat, taperTubeG(pts, s * 0.75, s * 0.45, 12, 8), lx, 0, lz, 0, 0, 0, 1, 1, 1, { ao });
  }
  // folded hands with a small held pearl
  P.add(mat, sphereG(10), lx, by + s * 1.85, lz + s * 1.95, 0, 0, 0, s * 1.2, s * 0.6, s * 0.8);
  P.add('jade', sphereG(10), lx, by + s * 2.35, lz + s * 1.95, 0, 0, 0, s * 0.45, s * 0.45, s * 0.45);
  P.glow(lx, by + s * 2.35, lz + s * 1.95, 0x5fe0b0, s * 2.2, 0.03);
  // head
  const hy = by + s * 5.6;
  if (!o.broken) {
    P.add(mat, sphereG(16), lx, hy, lz + s * 0.1, 0, 0, 0, s * 1.5, s * 1.75, s * 1.4, { ao });
    // serene face plane (slightly flattened front)
    P.add(mat, sphereG(12), lx, hy - s * 0.15, lz + s * 0.55, 0, 0, 0, s * 1.2, s * 1.35, s * 0.6);
    // closed eyes as dark grooves
    for (const side of [-1, 1]) {
      P.box('stoneDark', lx + side * s * 0.33, hy + s * 0.05, lz + s * 0.86, s * 0.42, s * 0.05, s * 0.05, { rz: side * -0.12 });
      if (o.eyesGlow) P.glow(lx + side * s * 0.33, hy + s * 0.05, lz + s * 0.9, 0x9ad8ff, s * 0.8, 0.1);
    }
    // feathered antennae crown
    for (const side of [-1, 1]) {
      const pts = [
        new Vector3(side * s * 0.4, s * 0.8, 0),
        new Vector3(side * s * 1.2, s * 2.0, -s * 0.4),
        new Vector3(side * s * 2.4, s * 2.8, -s * 1.3),
        new Vector3(side * s * 3.6, s * 2.9, -s * 2.4),
      ];
      P.add(mat, taperTubeG(pts, s * 0.16, s * 0.05, 14, 5), lx, hy, lz, 0, 0, 0, 1, 1, 1);
      // feather barbs
      for (let k = 1; k < 8; k++) {
        const t = k / 8;
        const base = pts[1].clone().lerp(pts[3], t);
        const tip = base.clone().add(new Vector3(side * s * 0.2, -s * 0.9 * (1 - t * 0.5), s * 0.3));
        P.add(mat, taperTubeG([base, base.clone().lerp(tip, 0.5).add(new Vector3(0, 0, s * 0.1)), tip], s * 0.07, s * 0.02, 5, 4), lx, hy, lz);
      }
    }
  } else {
    // broken neck stump + fallen head nearby
    P.add(mat, cylG(s * 0.9, s * 1.1, 10), lx, hy - s * 1.1, lz, 0, 0, 0.1, 1, s * 0.8, 1);
    P.add(mat, sphereG(14), lx + s * 4.5, ly + s * 1.4, lz + s * 3.5, 0.4, 0.8, 1.2, s * 1.5, s * 1.75, s * 1.4, { ao: { y0: P.origin.y + ly, y1: P.origin.y + ly + s * 3, min: 0.4 } });
  }
  // broken halo disc behind
  P.add('stone', torusG(s * 3.4, s * 0.22, 6, 28), lx, hy - s * 0.3, lz - s * 1.8, 0, 0, 0, 1, 1, 0.6);
  if (o.moss !== false) {
    P.add('moss', sphereG(10), lx - s * 2, by + s * 0.2, lz + s * 1.5, 0, 0, 0, s * 2.5, s * 0.5, s * 1.8);
    P.add('moss', sphereG(10), lx + s * 1.2, by + s * 4.4, lz - s * 0.2, 0, 0, 0, s * 1.8, s * 0.4, s * 1.4);
  }
  if (o.collide !== false) {
    P.collider(lx, by + s * 2.4, lz + s * 0.2, s * 2.6, s * 2.4, s * 2.2, { walkable: true });
  }
}

/** Standing beetle-guardian statue with a crescent halberd (faces local +z). */
export function guardianStatue(P: Placer, lx: number, ly: number, lz: number, s: number, collide = true): void {
  const mat = 'stone' as const;
  P.box('stoneDark', lx, ly + s * 0.3, lz, s * 1.6, s * 0.6, s * 1.6, { collide: collide ? { safe: true } : undefined });
  const by = ly + s * 0.6;
  P.add(mat, latheG([[0.75, 0], [0.8, 0.4], [0.6, 1.3], [0.7, 2.1], [0.8, 2.6], [0.45, 2.9], [0.2, 3.0]], 12), lx, by, lz, 0, 0, 0, s, s, s * 0.8, { ao: { y0: P.origin.y + by, y1: P.origin.y + by + 3 * s, min: 0.4 } });
  // carapace shell on back
  P.add('stoneDark', sphereG(12), lx, by + s * 2.1, lz - s * 0.3, 0.2, 0, 0, s * 1.6, s * 2.0, s * 0.9);
  // head with horn
  P.add(mat, sphereG(10), lx, by + s * 3.25, lz + s * 0.1, 0, 0, 0, s * 0.8, s * 0.7, s * 0.8);
  P.add(mat, taperTubeG([new Vector3(0, 0, 0), new Vector3(0, s * 0.5, s * 0.35), new Vector3(0, s * 1.0, s * 0.2)], s * 0.14, s * 0.03, 6, 5), lx, by + s * 3.45, lz + s * 0.35);
  // halberd
  P.add('bronze', cylG(0.5, 0.5, 6), lx + s * 0.95, by + s * 2.2, lz + s * 0.4, 0, 0, 0, s * 0.1, s * 4.6, s * 0.1);
  P.add('bronze', torusG(s * 0.5, s * 0.07, 4, 12), lx + s * 1.2, by + s * 4.2, lz + s * 0.4, 0, Math.PI / 2, 0, 1, 1, 1);
  if (collide) P.collider(lx, by + s * 1.6, lz, s * 0.75, s * 1.6, s * 0.75, { walkable: true });
}

/** Stone stele frame (the inscription face is a separate mesh). Faces local +z. */
export function steleFrame(P: Placer, lx: number, ly: number, lz: number, h = 2.4): void {
  P.box('stoneDark', lx, ly + 0.25, lz, 1.6, 0.5, 1.0, {});
  // tortoise-like base mound
  P.add('stone', sphereG(10), lx, ly + 0.5, lz, 0, 0, 0, 1.5, 0.6, 1.1);
  P.box('stone', lx, ly + 0.55 + h / 2, lz, 1.1, h, 0.36, { collide: { walkable: false } });
  const { shell, caps } = roofGeometry(0.75, 0.32, 0.3, { upturn: 0.08, flare: 0.25, seg: 3, ornaments: false, capRadius: 0.03 });
  P.add('stoneDark', shell, lx, ly + 0.55 + h, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
  P.add('stoneDark', caps, lx, ly + 0.55 + h, lz);
}

/** Incense shrine: altar table, bronze censer, canopy, talisman strips. Faces local +z. */
export function incenseShrine(P: Placer, lx: number, ly: number, lz: number): void {
  // base
  P.box('stoneDark', lx, ly + 0.15, lz, 3.4, 0.3, 3.0, { collide: { safe: true } });
  P.box('stone', lx, ly + 0.36, lz, 3.0, 0.12, 2.6, {});
  // four posts + canopy
  for (const [dx, dz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) {
    P.add('wood', cylG(0.09, 0.1, 8), lx + dx, ly + 1.75, lz + dz, 0, 0, 0, 1, 2.8, 1);
  }
  P.box('wood', lx, ly + 3.15, lz, 3.0, 0.16, 2.6, {});
  const { shell, caps } = roofGeometry(2.0, 1.7, 0.9, { upturn: 0.3, flare: 0.2, seg: 5 });
  P.add('roof', shell, lx, ly + 3.25, lz, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
  P.add('roof', caps, lx, ly + 3.25, lz, 0, 0, 0, 1, 1, 1, { color: 0x77726a });
  P.collider(lx, ly + 3.5, lz, 1.9, 0.4, 1.6, { walkable: true });
  // altar table
  P.box('woodDark', lx, ly + 0.9, lz - 0.6, 2.0, 0.1, 0.8, {});
  P.box('woodDark', lx - 0.85, ly + 0.65, lz - 0.6, 0.12, 0.5, 0.7, {});
  P.box('woodDark', lx + 0.85, ly + 0.65, lz - 0.6, 0.12, 0.5, 0.7, {});
  // censer (lathe) on three feet
  P.add('bronze', latheG([[0.05, 0], [0.42, 0.05], [0.5, 0.25], [0.46, 0.45], [0.36, 0.5], [0.4, 0.55]], 14), lx, ly + 0.42, lz + 0.35, 0, 0, 0, 1, 1, 1);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    P.add('bronze', cylG(0.04, 0.06, 5), lx + Math.cos(a) * 0.3, ly + 0.46, lz + 0.35 + Math.sin(a) * 0.3, 0, 0, 0, 1, 0.12, 1);
  }
  for (const side of [-1, 1]) P.add('bronze', torusG(0.1, 0.025, 4, 8), lx + side * 0.48, ly + 0.9, lz + 0.35, 0, 0, Math.PI / 2);
  // talisman strips hanging from the canopy
  for (const dx of [-1.0, -0.35, 0.35, 1.0]) P.box('talisman', lx + dx, ly + 2.65, lz + 1.2, 0.18, 0.8, 0.01, {});
  hangingLantern(P, lx - 1.3, ly + 3.1, lz + 1.3, 0.2, 0.45, false);
  hangingLantern(P, lx + 1.3, ly + 3.1, lz + 1.3, 0.2, 0.45, false);
}

/** Great bronze temple bell (lathe). Origin at the bell's crown. */
export function bellGeometry(): BufferGeometry {
  return latheG([[0.02, 0], [0.38, -0.02], [0.52, -0.25], [0.56, -0.7], [0.62, -1.05], [0.74, -1.25], [0.7, -1.3], [0.5, -1.2]], 24);
}

export function urnGeometry(): BufferGeometry {
  return latheG([[0.01, 0], [0.22, 0.02], [0.34, 0.2], [0.36, 0.42], [0.24, 0.62], [0.16, 0.7], [0.2, 0.78], [0.18, 0.8]], 12);
}

export function templeBell(P: Placer, lx: number, ly: number, lz: number, s: number): void {
  P.add('bronze', bellGeometry(), lx, ly, lz, 0, 0, 0, s, s, s);
  P.add('bronze', torusG(0.2 * s, 0.05 * s, 5, 10), lx, ly + 0.15 * s, lz, 0, 0, 0);
  for (let k = 0; k < 4; k++) P.add('gold', torusG(0.62 * s - k * 0.02 * s, 0.025 * s, 4, 24), lx, ly - (0.5 + k * 0.18) * s, lz, Math.PI / 2, 0, 0);
}

export function chainLine(P: Placer, a: Vector3, b: Vector3, r = 0.05): void {
  const mid = a.clone().lerp(b, 0.5).add(new Vector3(0, -a.distanceTo(b) * 0.08, 0));
  P.ctx.batch.add('chain', taperTubeG([a, mid, b], r, r, 12, 4), undefined, {});
}

export function lanternString(P: Placer, a: Vector3, b: Vector3, count: number, size = 0.5): void {
  chainLine(P, a, b, 0.025);
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * a.distanceTo(b) * 0.08;
    const W = P.ctx.place(0, 0, 0, 0);
    hangingLantern(W, p.x, p.y, p.z, 0.3, size, i % 2 === 1);
  }
}

export { boxG };
