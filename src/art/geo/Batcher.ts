import {
  BufferGeometry, Color, Float32BufferAttribute, Group, Matrix4, Mesh, Vector3, Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WorldMatKey } from '../materials';

export interface AddOptions {
  /** Base vertex colour (multiplied with material colour). */
  color?: Color | number;
  /** Ambient-occlusion style darkening towards the bottom (world Y). */
  ao?: { y0: number; y1: number; min: number };
  /** Metres per texture tile for world-space box-mapped UVs. 0 = keep geometry UVs. */
  uvScale?: number;
  /** Random brightness variation per add call (0..1). */
  jitter?: number;
  castShadow?: boolean;
}

const WORLD_UV: Partial<Record<WorldMatKey, number>> = {
  stone: 2.2, stoneDark: 2.2, stonePale: 2.2, rock: 7, rockDark: 7, wood: 1.6, woodDark: 1.6,
  plaster: 3, carved: 2.4, moss: 3, gold: 0, bronze: 0, jade: 0, crimson: 0, ink: 0, bone: 0,
};

const _n = new Vector3();
const _p = new Vector3();
const _c = new Color();

/**
 * Collects static geometry per (material, spatial cell) and merges it into a few
 * large meshes – keeps draw calls low on mobile while preserving frustum culling.
 */
export class Batcher {
  /** Spatial cell size for splitting merged meshes (frustum culling granularity). */
  constructor(private cell = 48) {}
  private parts = new Map<string, { key: WorldMatKey; geos: BufferGeometry[]; shadow: boolean }>();
  private seed = 1;

  add(key: WorldMatKey, source: BufferGeometry, matrix?: Matrix4, opts: AddOptions = {}): void {
    let g = source.index ? source.toNonIndexed() : source.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const count = pos.count;

    // UVs
    const uvScale = opts.uvScale ?? WORLD_UV[key] ?? 0;
    if (uvScale > 0 || !g.getAttribute('uv')) {
      const s = uvScale > 0 ? 1 / uvScale : 0.5;
      const uv = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        _p.fromBufferAttribute(pos, i);
        _n.fromBufferAttribute(nrm, i);
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        if (ay >= ax && ay >= az) {
          uv[i * 2] = _p.x * s;
          uv[i * 2 + 1] = _p.z * s;
        } else if (ax >= az) {
          uv[i * 2] = _p.z * s;
          uv[i * 2 + 1] = _p.y * s;
        } else {
          uv[i * 2] = _p.x * s;
          uv[i * 2 + 1] = _p.y * s;
        }
      }
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    }

    // Vertex colours: tint * AO * jitter
    const base = _c.set(opts.color ?? 0xffffff);
    const jitter = opts.jitter ?? 0.08;
    this.seed = (this.seed * 16807) % 2147483647;
    const jv = 1 - jitter + ((this.seed % 1000) / 1000) * jitter * 2;
    const col = new Float32Array(count * 3);
    const existing = g.getAttribute('color');
    for (let i = 0; i < count; i++) {
      let k = jv;
      if (opts.ao) {
        const y = pos.getY(i);
        const t = Math.min(1, Math.max(0, (y - opts.ao.y0) / Math.max(0.001, opts.ao.y1 - opts.ao.y0)));
        k *= opts.ao.min + (1 - opts.ao.min) * (t * t * (3 - 2 * t));
      }
      let r = base.r * k, gg = base.g * k, b = base.b * k;
      if (existing) {
        r *= existing.getX(i);
        gg *= existing.getY(i);
        b *= existing.getZ(i);
      }
      col[i * 3] = r;
      col[i * 3 + 1] = gg;
      col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    // keep only the attributes all parts share
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    }
    g.morphAttributes = {};

    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const CELL = this.cell;
    const cx = Math.floor((bb.min.x + bb.max.x) / 2 / CELL);
    const cz = Math.floor((bb.min.z + bb.max.z) / 2 / CELL);
    const cy = Math.floor((bb.min.y + bb.max.y) / 2 / CELL);
    const shadow = !!opts.castShadow;
    const id = `${key}|${cx}|${cy}|${cz}|${shadow ? 1 : 0}`;
    let entry = this.parts.get(id);
    if (!entry) this.parts.set(id, (entry = { key, geos: [], shadow }));
    entry.geos.push(g);
  }

  get size(): number {
    let n = 0;
    for (const p of this.parts.values()) n += p.geos.length;
    return n;
  }

  build(materials: Record<WorldMatKey, Material>, parent: Group): { meshes: number; triangles: number } {
    let meshes = 0, triangles = 0;
    for (const entry of this.parts.values()) {
      if (!entry.geos.length) continue;
      const merged = mergeGeometries(entry.geos, false);
      for (const g of entry.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new Mesh(merged, materials[entry.key]);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.receiveShadow = true;
      mesh.castShadow = entry.shadow;
      mesh.name = `batch:${entry.key}`;
      parent.add(mesh);
      meshes++;
      triangles += merged.getAttribute('position').count / 3;
    }
    this.parts.clear();
    return { meshes, triangles };
  }
}
