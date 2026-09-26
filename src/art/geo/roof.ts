import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tubeG, taperTubeG } from './basic';

export interface RoofOptions {
  /** Concavity of the profile (>1 = steep top, flat eaves). */
  curve?: number;
  /** Corner lift (m). */
  upturn?: number;
  /** Corner outward flare (fraction of depth). */
  flare?: number;
  thickness?: number;
  seg?: number;
  /** Ridge-end curls. */
  ornaments?: boolean;
  /** Cap tube radius (defaults relative to size). */
  capRadius?: number;
}

/**
 * Hip roof with a concave sweep and upturned corners — the signature silhouette of
 * the sanctuary architecture. Built around the origin: eaves at y=0, ridge at y=H.
 * `halfW` runs along X (ridge direction), `halfD` along Z.
 */
export function roofGeometry(halfW: number, halfD: number, H: number, o: RoofOptions = {}): { shell: BufferGeometry; caps: BufferGeometry } {
  let swap = false;
  let W = halfW, D = halfD;
  if (D > W) {
    swap = true;
    W = halfD;
    D = halfW;
  }
  const k = o.curve ?? 1.65;
  const U = o.upturn ?? D * 0.18;
  const F = o.flare ?? 0.12;
  const T = o.thickness ?? Math.max(0.08, D * 0.05);
  const seg = o.seg ?? 10;
  const nz = seg * 2;
  const nx = Math.max(nz, Math.round(nz * (W / D)));

  const surf = (u: number, v: number, out: Vector3): { r: number; side: boolean } => {
    const x0 = u * W, z0 = v * D;
    const dx = Math.max(Math.abs(x0) - (W - D), 0) / D;
    const dz = Math.abs(z0) / D;
    const r = Math.min(1, Math.max(dx, dz));
    const c = Math.pow(dx * dz, 2.2);
    const y = H * Math.pow(1 - r, k) + U * c * r * r;
    const fl = F * D * c;
    out.set(x0 + Math.sign(x0) * fl, y, z0 + Math.sign(z0) * fl);
    return { r, side: dx > dz };
  };

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new Vector3();
  const tile = Math.max(0.6, D * 0.35);
  // top then bottom sheet
  for (let sheet = 0; sheet < 2; sheet++) {
    const base = positions.length / 3;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = -1 + (2 * i) / nx;
        const v = -1 + (2 * j) / nz;
        const { r, side } = surf(u, v, p);
        const y = sheet === 0 ? p.y : p.y - T;
        positions.push(p.x, y, p.z);
        if (side) uvs.push(p.z / tile, (r * D) / tile);
        else uvs.push(p.x / tile, (r * D) / tile);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i;
        const b = a + 1;
        const c = a + (nx + 1);
        const d = c + 1;
        if (sheet === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  // Edge band joining sheets
  const perim: [number, number][] = [];
  for (let i = 0; i <= nx; i++) perim.push([i, 0]);
  for (let j = 1; j <= nz; j++) perim.push([nx, j]);
  for (let i = nx - 1; i >= 0; i--) perim.push([i, nz]);
  for (let j = nz - 1; j >= 1; j--) perim.push([0, j]);
  const bottomBase = (nx + 1) * (nz + 1);
  for (let q = 0; q < perim.length; q++) {
    const [i0, j0] = perim[q];
    const [i1, j1] = perim[(q + 1) % perim.length];
    const a = j0 * (nx + 1) + i0, b = j1 * (nx + 1) + i1;
    indices.push(a, bottomBase + a, b, b, bottomBase + a, bottomBase + b);
  }
  let shell = new BufferGeometry();
  shell.setAttribute('position', new Float32BufferAttribute(positions, 3));
  shell.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  shell = shell.toNonIndexed();

  // Caps: main ridge, four hips, eave fascia, ridge ornaments.
  const capR = o.capRadius ?? Math.max(0.05, D * 0.045);
  const caps: BufferGeometry[] = [];
  if (W - D > 0.05) {
    caps.push(tubeG([new Vector3(-(W - D), H + capR * 0.4, 0), new Vector3(0, H + capR * 0.4, 0), new Vector3(W - D, H + capR * 0.4, 0)], capR * 1.3, 4, 6));
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const pts: Vector3[] = [];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const x0 = sx * ((W - D) + t * D);
        const z0 = sz * t * D;
        surf(x0 / W, z0 / D, p);
        pts.push(p.clone().add(new Vector3(0, capR * 0.5, 0)));
      }
      caps.push(taperTubeG(pts, capR, capR * 0.8, 10, 5));
    }
  // Eave fascia
  const eave: Vector3[] = [];
  const ring = 40;
  for (let s = 0; s < ring; s++) {
    const a = (s / ring) * Math.PI * 2;
    // walk the rectangle perimeter in u,v
    const cu = Math.cos(a), sv = Math.sin(a);
    const m = Math.max(Math.abs(cu), Math.abs(sv));
    surf(cu / m, sv / m, p);
    eave.push(p.clone().add(new Vector3(0, -T * 0.5, 0)));
  }
  caps.push(tubeG(eave, T * 0.75, 80, 4, true));
  if (o.ornaments !== false) {
    for (const sx of [-1, 1]) {
      const ex = sx * Math.max(W - D, 0);
      const pts = [
        new Vector3(ex, H, 0),
        new Vector3(ex + sx * capR * 1.5, H + capR * 4, 0),
        new Vector3(ex + sx * capR * 0.5, H + capR * 7, 0),
        new Vector3(ex - sx * capR * 1.5, H + capR * 7.5, 0),
      ];
      caps.push(taperTubeG(pts, capR * 1.6, capR * 0.4, 10, 5));
    }
  }
  const capsNI = caps.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of capsNI) {
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
  }
  let capGeo = mergeGeometries(capsNI, false) ?? new BufferGeometry();
  if (swap) {
    shell.rotateY(Math.PI / 2);
    capGeo.rotateY(Math.PI / 2);
  }
  shell.computeBoundingBox();
  capGeo = capGeo;
  return { shell, caps: capGeo };
}

/** Height of the roof surface at local (x,z) — used to place colliders on roofs. */
export function roofHeightAt(halfW: number, halfD: number, H: number, x: number, z: number, curve = 1.65): number {
  let W = halfW, D = halfD;
  if (D > W) {
    W = halfD;
    D = halfW;
    const t = x;
    x = z;
    z = t;
  }
  const dx = Math.max(Math.abs(x) - (W - D), 0) / D;
  const dz = Math.abs(z) / D;
  const r = Math.min(1, Math.max(dx, dz));
  return H * Math.pow(1 - r, curve);
}
