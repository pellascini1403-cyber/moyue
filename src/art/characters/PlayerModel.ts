import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, DynamicDrawUsage, ExtrudeGeometry, Float32BufferAttribute, Group,
  Material, Mesh, MeshStandardMaterial, Object3D, Raycaster, Shape, SphereGeometry, Texture, Vector3,
} from 'three';
import { Rig, curve } from '../../anim/Rig';
import { HairChain } from '../../anim/HairChain';
import { characterMaterial } from '../materials';
import { addOutlines, outlineMaterial } from './charMaterials';
import { latheG, taperTubeG, torusG } from '../geo/basic';
import { mergeRigParts } from './merge';
import { MASK_EYES, MASK_OUTLINE, MASK_UV_SPAN, maskPoint } from './maskShape';
import { cloakTexture, goldOrnamentTexture, hairTexture, maskTextures, playerEnvMap, ribbonTexture } from './playerTextures';
import { HAIR_REST, HAIR_STIFF, HAIR_THICK, HAIR_WIDTH, PLAYER_DIMS as D } from '../../player/playerDims';

/** Move a helper group's children into `parent`, keeping their placement (so they can merge). */
function bake(parent: Object3D, group: Object3D): void {
  group.updateMatrix();
  for (const c of [...group.children]) {
    c.applyMatrix4(group.matrix);
    parent.add(c);
  }
  group.removeFromParent();
}

function mesh(g: BufferGeometry, m: Material, outline = false, name = ''): Mesh {
  const me = new Mesh(g, m);
  me.castShadow = true;
  me.userData.outline = outline;
  me.name = name;
  return me;
}

const _up = new Vector3(0, 1, 0);

/** Give a geometry a uniform vertex colour (for parts sharing a vertex-coloured material). */
function tint(g: BufferGeometry, c: Color): BufferGeometry {
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

// =========================================================================== ribbons

/** Verlet ribbon in world space (the long gold ribbons tied below the spear's phoenix). */
export class Ribbon {
  readonly mesh: Mesh;
  private pts: Vector3[] = [];
  private prev: Vector3[] = [];
  private geo: BufferGeometry;
  private right = new Vector3(1, 0, 0);

  constructor(material: Material, private readonly n = 9, private readonly seg = 0.042, private readonly width = 0.017) {
    for (let i = 0; i < n; i++) {
      this.pts.push(new Vector3(0, -i * seg, 0));
      this.prev.push(new Vector3(0, -i * seg, 0));
    }
    this.geo = new BufferGeometry();
    const uv = new Float32Array(n * 4);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      uv.set([0, i / (n - 1), 1, i / (n - 1)], i * 4);
      if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const pa = new Float32BufferAttribute(new Float32Array(n * 6), 3);
    pa.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
  }

  reset(anchor: Vector3): void {
    for (let i = 0; i < this.n; i++) {
      this.pts[i].copy(anchor).y -= i * this.seg;
      this.prev[i].copy(this.pts[i]);
    }
  }

  update(dt: number, anchor: Vector3, right: Vector3, groundY: number): void {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    this.right.copy(right);
    this.pts[0].copy(anchor);
    for (let i = 1; i < this.n; i++) {
      const p = this.pts[i], q = this.prev[i];
      const vx = (p.x - q.x) * 0.93, vy = (p.y - q.y) * 0.93, vz = (p.z - q.z) * 0.93;
      q.copy(p);
      p.x += vx;
      p.y += vy - 7 * dt * dt;
      p.z += vz;
    }
    for (let it = 0; it < 3; it++) {
      this.pts[0].copy(anchor);
      for (let i = 1; i < this.n; i++) {
        const a = this.pts[i - 1], b = this.pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5;
        const k = (d - this.seg) / d;
        const wa = i === 1 ? 0 : 0.5;
        a.x += dx * k * wa;
        a.y += dy * k * wa;
        a.z += dz * k * wa;
        b.x -= dx * k * (1 - wa);
        b.y -= dy * k * (1 - wa);
        b.z -= dz * k * (1 - wa);
        if (b.y < groundY + 0.01) b.y = groundY + 0.01;
      }
    }
    const pos = this.geo.getAttribute('position') as Float32BufferAttribute;
    for (let i = 0; i < this.n; i++) {
      const w = this.width * (1 - (i / this.n) * 0.2);
      const p = this.pts[i];
      pos.setXYZ(i * 2, p.x - this.right.x * w, p.y - this.right.y * w, p.z - this.right.z * w);
      pos.setXYZ(i * 2 + 1, p.x + this.right.x * w, p.y + this.right.y * w, p.z + this.right.z * w);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// =========================================================================== hair

interface Strand {
  a: number; // angle around the cross-section
  k: number; // placement: fraction of the section's half-size (0 = core)
  r: number; // radius (m, at full thickness)
  radial: number;
  color: Color;
  core: boolean;
}

/**
 * Glossy copper hair as in the reference: one continuous mass (a smooth
 * elliptical core swept along the simulated chain) covered with fine surface
 * locks and a few loose strands. The cross-section is as wide as the head at
 * the crown and lies flat where the tail rests on the ground.
 */
export class HairMesh {
  readonly mesh: Mesh;
  private readonly geo: BufferGeometry;
  private readonly strands: Strand[] = [];
  private readonly rings: number;
  private readonly sub = 2;
  private centers: Vector3[] = [];
  private tangents: Vector3[] = [];
  private normals: Vector3[] = [];
  private offsets: number[] = [];
  private readonly bin = new Vector3();
  private readonly side = new Vector3();
  private readonly ground = new Vector3();

  constructor(private readonly chain: HairChain, material: Material) {
    const mid = new Color(0.55, 0.24, 0.1), hi = new Color(0.85, 0.46, 0.2);
    // one smooth mass; the fine strands live in the texture and the highlights
    this.strands.push({ a: 0, k: 0, r: 0, radial: 28, color: mid.clone(), core: true });
    // a few loose strands along the silhouette
    for (let j = 0; j < 6; j++) {
      this.strands.push({ a: 0.3 + j * 1.05, k: 0.99 + (j % 2) * 0.02, r: 0.005, radial: 3, color: hi.clone(), core: false });
    }
    this.rings = (chain.n - 1) * this.sub + 1;
    for (let i = 0; i < this.rings; i++) {
      this.centers.push(new Vector3());
      this.tangents.push(new Vector3());
      this.normals.push(new Vector3());
    }
    let verts = 0;
    for (const s of this.strands) {
      this.offsets.push(verts);
      verts += (s.radial + 1) * this.rings;
    }
    const dyn = (n: number) => {
      const a = new Float32BufferAttribute(new Float32Array(verts * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    const uv = new Float32Array(verts * 2);
    const col = new Float32Array(verts * 3);
    const idx: number[] = [];
    this.strands.forEach((s, si) => {
      const o = this.offsets[si];
      for (let i = 0; i < this.rings; i++) {
        const t = i / (this.rings - 1);
        // darker at the roots, richer along the sweep
        const shade = 0.7 + 0.3 * Math.min(1, t * 3);
        for (let j = 0; j <= s.radial; j++) {
          const vi = o + i * (s.radial + 1) + j;
          uv[vi * 2] = (j / s.radial) * (s.core ? 3 : 1);
          uv[vi * 2 + 1] = t * 4;
          // the underside of the mass sits in its own shadow
          const under = s.core ? 0.62 + 0.38 * Math.max(0, Math.sin((j / s.radial) * Math.PI * 2)) : 1;
          col[vi * 3] = s.color.r * shade * under;
          col[vi * 3 + 1] = s.color.g * shade * under;
          col[vi * 3 + 2] = s.color.b * shade * under;
          if (i < this.rings - 1 && j < s.radial) {
            // counter-clockwise seen from outside (∂θ × ∂length points outward)
            const a = vi, b = vi + s.radial + 1;
            idx.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      }
    });
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', dyn(3));
    this.geo.setAttribute('normal', dyn(3));
    this.geo.setAttribute('hairT', dyn(3));
    this.geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.name = 'hair';
  }

  /** Rebuild from the chain. `headSide` is the head's left vector in world space. */
  update(headSide: Vector3): void {
    const P = this.chain.pos;
    const n = this.chain.n;
    for (let i = 0; i < n - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
      for (let s = 0; s < this.sub; s++) {
        const t = s / this.sub, t2 = t * t, t3 = t2 * t;
        const c = this.centers[i * this.sub + s];
        for (const ax of ['x', 'y', 'z'] as const) {
          c[ax] = 0.5 * (2 * p1[ax] + (-p0[ax] + p2[ax]) * t + (2 * p0[ax] - 5 * p1[ax] + 4 * p2[ax] - p3[ax]) * t2 + (-p0[ax] + 3 * p1[ax] - 3 * p2[ax] + p3[ax]) * t3);
        }
      }
    }
    this.centers[this.rings - 1].copy(P[n - 1]);
    for (let i = 0; i < this.rings; i++) {
      const a = this.centers[Math.max(0, i - 1)], b = this.centers[Math.min(this.rings - 1, i + 1)];
      this.tangents[i].subVectors(b, a).normalize();
    }
    // width axis: the head's side at the crown, lying flat along the ground at the tail
    for (let i = 0; i < this.rings; i++) {
      const t = i / (this.rings - 1);
      const T = this.tangents[i];
      const g = Math.min(1, Math.max(0, (t - 0.55) / 0.25));
      this.ground.crossVectors(_up, T);
      if (this.ground.lengthSq() < 1e-4) this.ground.copy(headSide);
      this.ground.normalize();
      if (i > 0 && this.ground.dot(this.normals[i - 1]) < 0) this.ground.negate();
      this.side.copy(headSide).lerp(this.ground, g * g * (3 - 2 * g));
      const N = this.normals[i].copy(this.side).addScaledVector(T, -this.side.dot(T));
      if (N.lengthSq() < 1e-8) N.copy(i > 0 ? this.normals[i - 1] : headSide);
      N.normalize();
    }
    const pa = (this.geo.getAttribute('position') as Float32BufferAttribute).array as Float32Array;
    const na = (this.geo.getAttribute('normal') as Float32BufferAttribute).array as Float32Array;
    const ta = (this.geo.getAttribute('hairT') as Float32BufferAttribute).array as Float32Array;
    const bin = this.bin;
    this.strands.forEach((s, si) => {
      const o = this.offsets[si];
      for (let i = 0; i < this.rings; i++) {
        const t = i / (this.rings - 1);
        const w = curve(HAIR_WIDTH as [number, number][], t);
        const h = curve(HAIR_THICK as [number, number][], t);
        const c = this.centers[i], T = this.tangents[i], N = this.normals[i];
        bin.crossVectors(T, N);
        const a0 = s.a + t * 0.25;
        const ox = Math.cos(a0) * w * s.k, oy = Math.sin(a0) * h * s.k;
        const cx = c.x + N.x * ox + bin.x * oy, cy = c.y + N.y * ox + bin.y * oy, cz = c.z + N.z * ox + bin.z * oy;
        const rs = s.core ? 0 : s.r * (1 - 0.6 * t * t);
        for (let j = 0; j <= s.radial; j++) {
          const a = (j / s.radial) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          let rx: number, ry: number, nx: number, ny: number;
          if (s.core) {
            // soft clumped locks running along the hair
            const ph = t * 2.2;
            const r = 1 + 0.028 * Math.sin(9 * a + ph) + 0.012 * Math.sin(23 * a - ph * 1.7);
            const dr = 0.252 * Math.cos(9 * a + ph) + 0.276 * Math.cos(23 * a - ph * 1.7);
            rx = ca * w * r;
            ry = sa * h * r;
            // outward normal of the lobed ellipse
            const tx = w * (dr * ca - r * sa), ty = h * (dr * sa + r * ca);
            nx = ty;
            ny = -tx;
          } else {
            rx = nx = ca * rs;
            ry = ny = sa * rs;
          }
          const vi = (o + i * (s.radial + 1) + j) * 3;
          pa[vi] = cx + N.x * rx + bin.x * ry;
          pa[vi + 1] = cy + N.y * rx + bin.y * ry;
          pa[vi + 2] = cz + N.z * rx + bin.z * ry;
          const vx = N.x * nx + bin.x * ny, vy = N.y * nx + bin.y * ny, vz = N.z * nx + bin.z * ny;
          const l = Math.hypot(vx, vy, vz) || 1;
          na[vi] = vx / l;
          na[vi + 1] = vy / l;
          na[vi + 2] = vz / l;
          ta[vi] = T.x;
          ta[vi + 1] = T.y;
          ta[vi + 2] = T.z;
        }
      }
    });
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('normal').needsUpdate = true;
    this.geo.getAttribute('hairT').needsUpdate = true;
  }
}

/**
 * Hair shading: the character rim light plus two anisotropic highlight bands
 * along the strands (Kajiya–Kay style), scaled by the light actually reaching
 * the hair so it glints under lanterns and stays dim in the dark.
 */
function hairMaterial(map: Texture | null, env: Texture | null): MeshStandardMaterial {
  const m = characterMaterial(
    { map, color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.1, ...(env ? { envMap: env, envMapIntensity: 0.35 } : {}) },
    { color: new Color(1.0, 0.55, 0.25), power: 2.6, strength: 0.32 },
  );
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 hairT;\nvarying vec3 vHairT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHairT = normalize( ( modelViewMatrix * vec4( hairT, 0.0 ) ).xyz );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHairT;')
      .replace('#include <opaque_fragment>', `{
        vec3 hT = normalize( vHairT );
        vec3 hV = normalize( vViewPosition );
        vec3 hL = normalize( ( viewMatrix * vec4( 0.3, 1.0, 0.35, 0.0 ) ).xyz );
        vec3 hH = normalize( hL + hV );
        float c1 = dot( normalize( hT + normal * 0.1 ), hH );
        float c2 = dot( normalize( hT - normal * 0.15 ), hH );
        float s1 = pow( sqrt( max( 0.0, 1.0 - c1 * c1 ) ), 120.0 );
        float s2 = pow( sqrt( max( 0.0, 1.0 - c2 * c2 ) ), 26.0 );
        vec3 irr = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
        float lum = dot( irr, vec3( 0.3, 0.59, 0.11 ) ) / max( dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ), 0.03 );
        float k = clamp( lum, 0.06, 2.5 );
        outgoingLight += k * ( s1 * vec3( 1.0, 0.62, 0.3 ) * 0.3 + s2 * diffuseColor.rgb * 0.8 );
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'rimHair';
  return m;
}

// =========================================================================== cloak

/**
 * The black cloak: one draped surface from the collar under the chin almost
 * to the ground, open down the front over the armour, its hem falling to
 * points. Deformed on the CPU each frame (≈300 vertices) so it can billow,
 * open like wings and lift over the arms without seams.
 */
export class Cloak {
  readonly mesh: Mesh;
  private readonly rest: Float32Array;
  private readonly meta: Float32Array; // per vertex: t (0 top … 1 hem), angle
  private readonly geo: BufferGeometry;
  /** Back panel swing (rad, + = hem goes back). */
  billow = 0;
  /** Side panels opening outward (rad). */
  flare = 0;
  /** Extra lift over the left/right arm (rad). */
  armL = 0;
  armR = 0;
  private readonly topY = D.neckY - D.chestY;
  private readonly len = D.neckY - 0.1;

  constructor(material: Material, cols = 30, rows = 10) {
    const pos: number[] = [], uv: number[] = [], meta: number[] = [], idx: number[] = [];
    const radius = (t: number) => curve([[0, 0.09], [0.08, 0.162], [0.18, 0.186], [0.45, 0.2], [0.7, 0.218], [1, 0.238]], t);
    const gap = (t: number) => curve([[0, 0.12], [0.35, 0.2], [1, 0.42]], t);
    const points = [[0.02, 0.03], [Math.PI - 0.95, 0.035], [Math.PI, 0.04], [Math.PI + 0.95, 0.035], [-0.02, 0.03]];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const g = gap(t);
      for (let c = 0; c <= cols; c++) {
        const a = g + ((Math.PI * 2 - 2 * g) * c) / cols;
        const rad = radius(t);
        let drop = 0;
        if (r === rows || r === rows - 1) {
          for (const [pa, amp] of points) {
            const aa = pa < 0.5 && pa > 0 ? g + pa : pa < 0 ? Math.PI * 2 - g + pa : pa;
            let d = Math.abs(a - aa);
            d = Math.min(d, Math.PI * 2 - d);
            drop += amp * Math.pow(Math.max(0, 1 - d / 0.4), 1.6);
          }
          if (r === rows - 1) drop *= 0.35;
        }
        // soft folds deepening toward the hem
        const fold = 1 + 0.045 * t * Math.sin(a * 7 + 0.6) + 0.02 * t * Math.sin(a * 13);
        pos.push(Math.sin(a) * rad * 1.06 * fold, this.topY - this.len * t - drop, Math.cos(a) * rad * 0.94 * fold);
        uv.push((c / cols) * 3, t * 1.8);
        meta.push(t, a);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    this.rest = new Float32Array(pos);
    this.meta = new Float32Array(meta);
    this.geo = new BufferGeometry();
    const pa = new Float32BufferAttribute(new Float32Array(pos), 3);
    pa.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.geo.computeVertexNormals();
    this.mesh = new Mesh(this.geo, material);
    this.mesh.castShadow = true;
    this.mesh.name = 'cloak';
    this.mesh.frustumCulled = false;
  }

  update(): void {
    const pa = (this.geo.getAttribute('position') as Float32BufferAttribute).array as Float32Array;
    const y0 = this.topY - 0.03;
    for (let i = 0; i < this.meta.length / 2; i++) {
      const t = this.meta[i * 2], a = this.meta[i * 2 + 1];
      let x = this.rest[i * 3], y = this.rest[i * 3 + 1] - y0, z = this.rest[i * 3 + 2];
      const w = Math.pow(t, 0.8);
      const sa = Math.sin(a), back = Math.max(0, -Math.cos(a));
      // sides open outward (about the z axis), more over a raised arm
      const g = (this.flare + (sa > 0 ? this.armL : this.armR)) * Math.abs(sa) * w * (sa > 0 ? 1 : -1);
      if (g !== 0) {
        const c = Math.cos(g), s = Math.sin(g);
        const nx = x * c - y * s, ny = x * s + y * c;
        x = nx;
        y = ny;
      }
      // the back swings behind (about the x axis); the front edges follow a little
      const b = this.billow * (0.3 + 0.7 * back) * w;
      if (b !== 0) {
        const c = Math.cos(b), s = Math.sin(b);
        const ny = y * c + z * s, nz = -y * s + z * c;
        y = ny;
        z = nz;
      }
      pa[i * 3] = x;
      pa[i * 3 + 1] = y + y0;
      pa[i * 3 + 2] = z;
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// =========================================================================== geometry

/** The mask-head: the hexagonal outline carried back into a deep rounded box. */
function headGeometry(): BufferGeometry {
  const N = MASK_OUTLINE.length, LAT = 28;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= LAT; i++) {
    const phi = -Math.PI / 2 + (i / LAT) * Math.PI;
    for (let j = 0; j < N; j++) {
      const [x, y, z] = maskPoint(j, phi);
      pos.push(x, y, z);
      // the front carries the painted mask; everything behind maps to plain lacquer
      uv.push(0.5 + x / (2 * MASK_UV_SPAN), z > 0.01 ? 0.5 + y / (2 * MASK_UV_SPAN) : 0.99);
    }
  }
  for (let i = 0; i < LAT; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * N + j, b = i * N + ((j + 1) % N), c = a + N, d = b + N;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the faces point outward (the outline's direction decides the winding)
  const nz = g.getAttribute('normal').getZ(LAT * N - N + Math.floor(N / 4));
  if (nz < 0) {
    const ix = g.getIndex()!.array as Uint16Array | Uint32Array;
    for (let k = 0; k < ix.length; k += 3) {
      const tmp = ix[k + 1];
      ix[k + 1] = ix[k + 2];
      ix[k + 2] = tmp;
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Hair over the back and top of the head, strands flowing from front to back. */
function hairCapGeometry(): BufferGeometry {
  const N = MASK_OUTLINE.length, LAT = 12;
  const pos: number[] = [], uv: number[] = [], col: number[] = [], tan: number[] = [], idx: number[] = [];
  for (let i = 0; i <= LAT; i++) {
    const phi = -Math.PI / 2 + (i / LAT) * (Math.PI / 2 - 0.5);
    for (let j = 0; j <= N; j++) {
      const [x, y, z] = maskPoint(j % N, phi);
      pos.push(x * 1.035, y * 1.035 + 0.004, z * 1.05 - 0.006);
      // strands combed straight down the back of the head
      uv.push(x * 7, y * 3);
      col.push(0.55, 0.26, 0.11);
      tan.push(0, -1, 0);
    }
  }
  for (let i = 0; i < LAT; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('hairT', new Float32BufferAttribute(tan, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nz = g.getAttribute('normal').getZ(Math.floor(N / 4));
  if (nz > 0) {
    const ix = g.getIndex()!.array as Uint16Array | Uint32Array;
    for (let k = 0; k < ix.length; k += 3) {
      const tmp = ix[k + 1];
      ix[k + 1] = ix[k + 2];
      ix[k + 2] = tmp;
    }
    g.computeVertexNormals();
  }
  return g;
}

/** One curved armour lame: a partial open cylinder around the y axis. */
function lame(r0: number, r1: number, h: number, center: number, arc: number): BufferGeometry {
  return new CylinderGeometry(r0, r1, h, 14, 1, true, center - arc / 2, arc);
}

/** A "︾" chevron plate in the xy plane (for the chest and the skirt). */
function chevron(w: number, h: number, t: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-w / 2, h / 2);
  s.lineTo(0, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(w / 2 - t, h / 2);
  s.lineTo(0, -h / 2 + t * 1.4);
  s.lineTo(-w / 2 + t, h / 2);
  s.lineTo(-w / 2, h / 2);
  const g = new ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 1 });
  g.translate(0, 0, -0.0025);
  return g;
}

/** A sculpted flame tongue along +y (base at the origin), coloured crimson → orange → gold. */
function flameGeometry(len: number, w: number, curl: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-w * 0.5, 0);
  s.bezierCurveTo(-w * 1.1, len * 0.28, w * 0.5 + curl * 0.4, len * 0.55, curl - w * 0.25, len);
  s.bezierCurveTo(w * 1.1 + curl * 0.5, len * 0.6, w * 0.8, len * 0.3, w * 0.5, 0);
  s.lineTo(-w * 0.5, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -0.004);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const c0 = new Color(0.38, 0.02, 0.02), c1 = new Color(0.8, 0.08, 0.03), c2 = new Color(1.0, 0.5, 0.14);
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const u = Math.min(1, Math.max(0, p.getY(i) / len));
    if (u < 0.5) c.copy(c0).lerp(c1, u / 0.5);
    else c.copy(c1).lerp(c2, (u - 0.5) / 0.5);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

// =========================================================================== model

export interface PlayerView {
  root: Group;
  /** Squash & stretch and the spin attack act on this group. */
  body: Group;
  rig: Rig;
  cloak: Cloak;
  /** Spear: origin at the main grip, +y toward the flaming head. */
  spear: Group;
  spearTip: Object3D;
  spearButt: Object3D;
  /** Behind the shoulders: where the spear rests when not in use (its grip point). */
  backSocket: Object3D;
  handR: Object3D;
  handL: Object3D;
  maskMat: MeshStandardMaterial;
  spearGlow: MeshStandardMaterial[];
  hair: HairChain;
  hairMesh: HairMesh;
  ribbons: Ribbon[];
  /** Meshes simulated in world space (added to the scene next to the root). */
  worldMeshes: Mesh[];
  materials: MeshStandardMaterial[];
  outlines: Mesh[];
}

/**
 * The protagonist, built to the design reference: a large red-lacquered mask
 * head (hexagonal, gold cloud-scroll relief, big round black eyes in gold
 * rims) with two pinned dark buns; a great glossy copper mane that rises above
 * the head, falls behind to the ground and curls around the right side; a
 * bell-shaped black cloak embroidered with clouds over red-and-gold armour
 * (chest plate, knotted sash, two-tier skirt), large layered pauldrons, short
 * black tapered legs; and a red spear with a gold phoenix pommel, long gold
 * ribbons and a head of sculpted flames, carried diagonally across the back.
 */
export function buildPlayerModel(): PlayerView {
  const env = playerEnvMap();
  const envP = (i: number) => (env ? { envMap: env, envMapIntensity: i } : {});
  const warmRim = { color: new Color(1.0, 0.45, 0.3), power: 2.6, strength: 0.32 };
  const lacquer = characterMaterial({ color: 0x8e1c1b, roughness: 0.3, metalness: 0.06, emissive: 0x220505, ...envP(0.6) }, warmRim);
  const gold = characterMaterial({ color: 0xd4a44a, roughness: 0.28, metalness: 0.9, emissive: 0x2e2008, ...envP(1.1) }, { color: new Color(1, 0.8, 0.45), power: 3, strength: 0.3 });
  const goldT = goldOrnamentTexture();
  const goldOrnate = characterMaterial({ map: goldT, color: 0xffffff, roughness: 0.3, metalness: 0.85, emissive: 0x2e2008, ...envP(1.1) }, { color: new Color(1, 0.8, 0.45), power: 3, strength: 0.3 });
  const cloth = characterMaterial({ map: cloakTexture(), color: 0xffffff, roughness: 0.6, metalness: 0.05, side: DoubleSide, ...envP(0.35) }, { color: new Color(0.75, 0.66, 0.6), power: 2.2, strength: 0.3 });
  const black = characterMaterial({ color: 0x141318, roughness: 0.42, ...envP(0.4) }, { color: new Color(0.6, 0.62, 0.85), power: 2.4, strength: 0.38 });
  const sash = characterMaterial({ color: 0x4a443c, roughness: 0.78 }, { color: new Color(0.8, 0.8, 0.7), power: 2.5, strength: 0.25 });
  const bun = characterMaterial({ color: 0x2e2622, roughness: 0.4, ...envP(0.5) }, { color: new Color(1, 0.7, 0.45), power: 2.5, strength: 0.3 });
  const hairMat = hairMaterial(hairTexture(), env);
  const mt = maskTextures();
  // the painted design also feeds a faint emissive so the mask reads in the darkest caves
  const maskMat = characterMaterial({
    map: mt?.map ?? null, roughnessMap: mt?.orm ?? null, metalnessMap: mt?.orm ?? null,
    bumpMap: mt?.bump ?? null, bumpScale: 2.2,
    emissiveMap: mt?.map ?? null, emissive: new Color(0.3, 0.2, 0.16),
    color: mt ? 0xffffff : 0x8e1c1b, roughness: 1, metalness: mt ? 1 : 0.1, ...envP(0.9),
  }, { color: new Color(1.0, 0.5, 0.35), power: 2.6, strength: 0.35 });
  const flame = characterMaterial({ color: 0xffffff, vertexColors: true, emissive: 0xb01a06, emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.3, side: DoubleSide, ...envP(0.8) }, { color: new Color(1, 0.6, 0.2), power: 2, strength: 0.45 });
  const blade = characterMaterial({ color: 0xf0b95a, roughness: 0.22, metalness: 0.75, emissive: 0xff6a18, emissiveIntensity: 0.3, ...envP(1.0) }, { color: new Color(1, 0.8, 0.4), power: 2, strength: 0.45 });
  const ribbonMat = characterMaterial({ map: ribbonTexture(), color: 0xffffff, roughness: 0.35, metalness: 0.55, side: DoubleSide, ...envP(0.9) }, { color: new Color(1, 0.8, 0.4), power: 2, strength: 0.35 });

  const rig = new Rig();
  const root = new Group();
  root.name = 'player';
  const body = new Group();
  root.add(body);

  // ------------------------------------------------------------------ hips, two-tier armoured skirt, legs
  // position joints before registering them: the rig keeps their rest pose from this moment
  const hipsG = new Group();
  hipsG.position.set(0, D.hipY, 0);
  const hips = rig.add('hips', hipsG);
  body.add(hips);
  const skirt = rig.add('skirt', new Group());
  hips.add(skirt);
  for (let k = 0; k < 6; k++) {
    const c = (k / 6) * Math.PI * 2;
    // upper tier (sash → mid thigh) and lower tier (to just above the feet)
    const up = mesh(lame(0.128, 0.15, 0.09, c, 0.99), lacquer);
    up.position.y = 0.075;
    skirt.add(up);
    const upTrim = mesh(lame(0.152, 0.154, 0.016, c, 0.99), goldOrnate);
    upTrim.position.y = 0.033;
    skirt.add(upTrim);
    const low = mesh(lame(0.15, 0.172, 0.072, c, 0.99), lacquer);
    low.position.y = -0.002;
    skirt.add(low);
    const lowTrim = mesh(lame(0.174, 0.177, 0.016, c, 0.99), goldOrnate);
    lowTrim.position.y = -0.036;
    skirt.add(lowTrim);
  }
  // front: gold chevrons across the upper tier, gold studs on the lower
  for (const [y, w] of [[0.1, 0.13], [0.07, 0.11]] as const) {
    const ch = mesh(chevron(w, 0.035, 0.011), gold);
    ch.position.set(0, y, 0.147 - (0.1 - y) * 0.2);
    ch.rotation.x = -0.24;
    skirt.add(ch);
  }
  for (const x of [-0.07, -0.035, 0, 0.035, 0.07]) {
    const stud = mesh(new SphereGeometry(0.0075, 6, 5), gold);
    stud.position.set(x, 0.0, 0.162 - Math.abs(x) * 0.12);
    skirt.add(stud);
  }
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    const leg = rig.add(`leg${side}`, new Group());
    leg.position.set(sx * 0.056, -0.005, 0);
    hips.add(leg);
    const thigh = mesh(new CylinderGeometry(0.043, 0.042, 0.06, 10), black);
    thigh.position.y = -0.03;
    leg.add(thigh);
    const shin = rig.add(`shin${side}`, new Group());
    shin.position.y = -0.058;
    leg.add(shin);
    // short black peg with a rounded point, as in the reference
    shin.add(mesh(latheG([[0.042, 0.004], [0.044, -0.015], [0.04, -0.035], [0.03, -0.055], [0.017, -0.066], [0.001, -0.07]], 12), black, true));
  }

  // ------------------------------------------------------------------ torso, chest plate, sash, cloak
  const spine = rig.add('spine', new Group());
  spine.position.y = 0.03;
  hips.add(spine);
  const chest = rig.add('chest', new Group());
  chest.position.y = D.chestY - D.hipY - 0.03;
  spine.add(chest);
  const torso = mesh(latheG([[0.1, -0.075], [0.113, -0.02], [0.118, 0.05], [0.108, 0.12], [0.068, 0.168]], 16), lacquer, false, 'torso');
  torso.scale.z = 0.86;
  chest.add(torso);
  const band = mesh(torusG(0.117, 0.007, 5, 20), gold);
  band.rotation.x = Math.PI / 2;
  band.scale.y = 0.86;
  band.position.y = 0.0;
  chest.add(band);
  for (const [y, w] of [[0.11, 0.07], [0.08, 0.075], [0.05, 0.08]] as const) {
    const ch = mesh(chevron(w, 0.028, 0.009), gold);
    ch.position.set(0, y, 0.098 - (y - 0.05) * 0.25);
    ch.rotation.x = -0.25;
    chest.add(ch);
  }
  const sashM = mesh(torusG(0.107, 0.021, 6, 20), sash);
  sashM.rotation.x = Math.PI / 2;
  sashM.scale.y = 0.87;
  sashM.position.y = -0.07;
  chest.add(sashM);
  const knot = mesh(new SphereGeometry(0.024, 8, 6), sash);
  knot.position.set(0, -0.07, 0.097);
  knot.scale.set(1.35, 0.8, 0.7);
  chest.add(knot);
  for (const s of [-1, 1]) {
    chest.add(mesh(taperTubeG([new Vector3(s * 0.008, -0.075, 0.1), new Vector3(s * 0.022, -0.11, 0.108), new Vector3(s * 0.018, -0.14, 0.112)], 0.011, 0.008, 6, 4), sash));
  }
  const collar = mesh(torusG(0.082, 0.026, 8, 20), cloth);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = D.neckY - D.chestY - 0.006;
  chest.add(collar);
  const cloak = new Cloak(cloth);
  cloak.mesh.userData.noMerge = true;
  chest.add(cloak.mesh);
  const backSocket = new Group();
  backSocket.name = 'backSocket';
  // phoenix above the right shoulder at eye level, flaming head by the left foot
  backSocket.position.set(-0.4, 0.62 - D.chestY, -0.24);
  backSocket.rotation.set(-0.1, 0, -2.15);
  chest.add(backSocket);

  // ------------------------------------------------------------------ arms and the large layered pauldrons
  const hands: Object3D[] = [];
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    const sh = rig.add(`shoulder${side}`, new Group());
    sh.position.set(sx * D.shoulderX, D.shoulderY - D.chestY, 0);
    chest.add(sh);
    const pauldron = new Group();
    pauldron.position.set(sx * 0.03, 0.03, 0);
    pauldron.rotation.z = sx * 0.22;
    sh.add(pauldron);
    // a domed cap, then five lames stepping down over the upper arm like shingles
    const cap = mesh(new SphereGeometry(0.095, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lacquer);
    cap.scale.set(1.0, 0.68, 0.92);
    pauldron.add(cap);
    const capRim = mesh(torusG(0.094, 0.01, 6, 28), goldOrnate);
    capRim.rotation.x = Math.PI / 2;
    capRim.scale.y = 0.92;
    pauldron.add(capRim);
    const outside = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let l = 0; l < 5; l++) {
      const r0 = 0.095 + l * 0.006, y = -0.026 - l * 0.043;
      const plate = mesh(lame(r0, r0 + 0.01, 0.05, outside, 2.7), l % 2 === 0 ? goldOrnate : lacquer);
      plate.position.y = y;
      pauldron.add(plate);
      const edge = mesh(lame(r0 + 0.011, r0 + 0.013, 0.012, outside, 2.7), goldOrnate);
      edge.position.y = y - 0.024;
      pauldron.add(edge);
    }
    bake(sh, pauldron);
    const upper = mesh(new CylinderGeometry(0.028, 0.025, D.upperArm, 8), black, true);
    upper.position.y = -D.upperArm / 2;
    sh.add(upper);
    const el = rig.add(`elbow${side}`, new Group());
    el.position.y = -D.upperArm;
    sh.add(el);
    const fore = mesh(new CylinderGeometry(0.025, 0.022, D.foreArm, 8), black, true);
    fore.position.y = -D.foreArm / 2;
    el.add(fore);
    const bracer = mesh(new CylinderGeometry(0.031, 0.029, 0.05, 12), goldOrnate);
    bracer.position.y = -0.045;
    el.add(bracer);
    const bracerBand = mesh(new CylinderGeometry(0.0325, 0.0325, 0.013, 12), lacquer);
    bracerBand.position.y = -0.045;
    el.add(bracerBand);
    const hand = new Group();
    hand.name = `hand${side}`;
    hand.position.y = -D.foreArm;
    el.add(hand);
    const mitt = mesh(new SphereGeometry(0.03, 8, 6), black, true);
    mitt.scale.set(1, 1.15, 1);
    hand.add(mitt);
    hands.push(hand);
  }

  // ------------------------------------------------------------------ head: the mask, the buns and pins, the hair cap
  const neck = rig.add('neck', new Group());
  neck.position.y = D.neckY - D.chestY;
  chest.add(neck);
  const head = rig.add('head', new Group());
  neck.add(head);
  const mask = mesh(headGeometry(), maskMat, true, 'mask');
  mask.position.set(0, D.maskCenterY, 0);
  head.add(mask);
  // raised gold rims around the eye holes, seated on the face
  const ray = new Raycaster();
  mask.updateMatrixWorld(true);
  for (const s of [-1, 1]) {
    ray.set(new Vector3(s * MASK_EYES.x, D.maskCenterY + MASK_EYES.y, 1), new Vector3(0, 0, -1));
    const hit = ray.intersectObject(mask, false)[0];
    if (!hit) continue;
    const nrm = hit.face ? hit.face.normal.clone() : new Vector3(0, 0, 1);
    const rim = mesh(torusG(MASK_EYES.r + 0.006, 0.0095, 8, 32), gold);
    rim.position.copy(hit.point).addScaledVector(nrm, 0.002);
    rim.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), nrm);
    head.add(rim);
  }
  const cap = mesh(hairCapGeometry(), hairMat, false, 'hairCap');
  cap.position.copy(mask.position);
  head.add(cap);
  for (const s of [-1, 1]) {
    const bunM = mesh(new SphereGeometry(0.058, 14, 10), bun, true);
    bunM.position.set(s * 0.29, 0.4, -0.04);
    bunM.scale.set(0.85, 1, 1);
    head.add(bunM);
    // two red hairpins with gold ends, both pointing outward
    for (const dir of [new Vector3(s * 0.86, 0.5, 0.08), new Vector3(s * 0.9, -0.22, 0.34)]) {
      dir.normalize();
      const pin = new Group();
      pin.position.copy(bunM.position);
      pin.quaternion.setFromUnitVectors(_up, dir);
      head.add(pin);
      const stick = mesh(new CylinderGeometry(0.0055, 0.0055, 0.19, 6), lacquer);
      stick.position.y = 0.035;
      pin.add(stick);
      const ball = mesh(new SphereGeometry(0.012, 8, 6), gold);
      ball.position.y = 0.135;
      pin.add(ball);
      const ring = mesh(new CylinderGeometry(0.009, 0.009, 0.01, 8), gold);
      ring.position.y = 0.1;
      pin.add(ring);
      bake(head, pin);
    }
  }

  // ------------------------------------------------------------------ spear (1.32 m)
  const spear = new Group();
  spear.name = 'spear';
  const shaftFrom = -D.spearButt + 0.03, shaftTo = 0.8;
  const shaft = mesh(new CylinderGeometry(0.012, 0.013, shaftTo - shaftFrom, 8), lacquer);
  shaft.position.y = (shaftFrom + shaftTo) / 2;
  spear.add(shaft);
  const grip = mesh(new CylinderGeometry(0.0145, 0.0145, 0.12, 8), black);
  spear.add(grip);
  for (const y of [shaftFrom + 0.005, -0.065, 0.065, 0.42, 0.785]) {
    const r = mesh(new CylinderGeometry(0.017, 0.017, 0.016, 10), gold);
    r.position.y = y;
    spear.add(r);
  }
  // flaming head: a gold cup, a burst of sculpted flame tongues, a flame-shaped point
  const cup = mesh(latheG([[0.013, 0], [0.026, 0.025], [0.034, 0.05], [0.028, 0.058]], 12), gold);
  cup.position.y = 0.79;
  spear.add(cup);
  const spearGlow: MeshStandardMaterial[] = [flame, blade];
  for (let k = 0; k < 14; k++) {
    const petal = new Group();
    petal.position.y = 0.83;
    petal.rotation.y = (k / 14) * Math.PI * 2 + (k % 2) * 0.2;
    spear.add(petal);
    const long = k % 2 === 0;
    // flame tongues flare out and curl back, the long ones reaching past the point
    const f = mesh(flameGeometry(long ? 0.3 : 0.2, long ? 0.065 : 0.05, (k % 3 - 1) * 0.05), flame);
    f.position.z = 0.014;
    f.rotation.x = long ? 0.34 : 0.62;
    petal.add(f);
    bake(spear, petal);
  }
  const point = mesh(bladeGeometry(D.spearTip - 0.83, 0.05), blade);
  point.position.y = 0.83;
  spear.add(point);
  const point2 = point.clone();
  point2.rotation.y = Math.PI / 2;
  point2.scale.set(0.6, 0.95, 1);
  spear.add(point2);
  const spearTip = new Object3D();
  spearTip.position.y = D.spearTip;
  spear.add(spearTip);
  // phoenix pommel: an arched neck, a head with a hooked beak, a crest of long flame plumes
  const phoenix = new Group();
  phoenix.position.y = shaftFrom;
  phoenix.scale.setScalar(1.5);
  spear.add(phoenix);
  phoenix.add(mesh(taperTubeG([new Vector3(0, 0.01, 0), new Vector3(0, -0.03, 0.006), new Vector3(0, -0.058, 0.024), new Vector3(0, -0.07, 0.05)], 0.015, 0.011, 10, 6), gold));
  const ph = mesh(new SphereGeometry(0.022, 10, 8), gold);
  ph.position.set(0, -0.072, 0.056);
  ph.scale.set(0.8, 0.9, 1.25);
  phoenix.add(ph);
  const beak = mesh(taperTubeG([new Vector3(0, -0.07, 0.07), new Vector3(0, -0.075, 0.09), new Vector3(0, -0.088, 0.1)], 0.009, 0.001, 6, 5), gold);
  phoenix.add(beak);
  const eye = mesh(tint(new SphereGeometry(0.0045, 6, 5), new Color(0.9, 0.12, 0.04)), flame);
  for (const s2 of [-1, 1]) {
    const e = eye.clone();
    e.position.set(s2 * 0.015, -0.066, 0.064);
    phoenix.add(e);
  }
  for (let k = 0; k < 7; k++) {
    const a = -0.75 + k * 0.25;
    const lift = (k % 2) * 0.012;
    const plume = taperTubeG([
      new Vector3(0, -0.062, 0.045), new Vector3(Math.sin(a) * 0.018, -0.045 + lift, 0.02),
      new Vector3(Math.sin(a) * 0.035, -0.025 + lift, -0.025), new Vector3(Math.sin(a) * 0.045, -0.018 + lift * 2, -0.075 - (k % 3) * 0.015),
    ], 0.008, 0.0015, 10, 4);
    phoenix.add(mesh(k % 2 ? tint(plume, new Color(0.85, 0.12, 0.04)) : plume, k % 2 ? flame : gold));
  }
  bake(spear, phoenix);
  const spearButt = new Object3D();
  spearButt.position.y = shaftFrom + 0.01;
  spear.add(spearButt);
  const ribbons = [new Ribbon(ribbonMat, 10, 0.042, 0.024), new Ribbon(ribbonMat, 9, 0.042, 0.02)];

  // ------------------------------------------------------------------ hair simulation
  const hair = new HairChain(
    HAIR_REST.map(([x, y, z]) => new Vector3(x, y, z)),
    [...HAIR_STIFF],
    [
      { center: new Vector3(0, D.maskCenterY, 0), radius: 0.27 },
      { center: new Vector3(0, -0.2, -0.02), radius: 0.22 },
      { center: new Vector3(0, -0.36, 0), radius: 0.2 },
    ],
    0.05,
  );
  const hairMesh = new HairMesh(hair, hairMat);

  body.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = true) : null));
  mergeRigParts(root);
  mergeRigParts(spear);
  const outlines = addOutlines(root, outlineMaterial(0.006));
  backSocket.add(spear);
  return {
    root, body, rig, cloak, spear, spearTip, spearButt, backSocket,
    handR: hands[1], handL: hands[0], maskMat, spearGlow, hair, hairMesh, ribbons,
    worldMeshes: [hairMesh.mesh, ...ribbons.map((r) => r.mesh)],
    materials: [lacquer, gold, goldOrnate, cloth, black, sash, bun, hairMat, maskMat, flame, blade, ribbonMat],
    outlines,
  };
}

/** Flame-shaped spear point along +y. */
function bladeGeometry(len: number, w: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-w * 0.35, 0);
  s.bezierCurveTo(-w, len * 0.3, -w * 0.35, len * 0.62, -w * 0.12, len * 0.8);
  s.bezierCurveTo(-w * 0.05, len * 0.9, 0.01, len * 0.95, 0, len);
  s.bezierCurveTo(w * 0.45, len * 0.72, w, len * 0.35, w * 0.35, 0);
  s.lineTo(-w * 0.35, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -0.004);
  return g;
}
