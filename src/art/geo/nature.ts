import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry,
  Matrix4, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3, BackSide,
} from 'three';
import { Placer, BuildContext } from '../../world/BuildContext';
import { fbm3, fbm2 } from '../../core/math';
import { Rng } from '../../core/rng';
import { cylG, latheG, sphereG, taperTubeG } from './basic';
import { inkMountainsTexture, mistTexture, shaftTexture, waterfallTexture } from '../textures';
import { WorldUniforms } from '../materials';
import { fogUniforms } from '../shaderFog';

/** Noise-displaced boulder (unit size, scaled by caller). */
export function boulderGeometry(seed: number, detail = 1, squash = 0.7): BufferGeometry {
  const g = new IcosahedronGeometry(0.5, detail);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 2.2 + seed, v.y * 2.2, v.z * 2.2, 3);
    v.multiplyScalar(0.7 + n * 0.6);
    v.y *= squash;
    if (v.y < -0.18) v.y = -0.18 - (v.y + 0.18) * 0.2; // flatten the base
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function boulder(P: Placer, lx: number, ly: number, lz: number, size: number, seed: number, o: { mat?: 'rock' | 'rockDark' | 'stone' | 'moss'; collide?: boolean; squash?: number; ry?: number } = {}): void {
  const g = boulderGeometry(seed, size > 3 ? 2 : 1, o.squash ?? 0.7);
  P.add(o.mat ?? 'rock', g, lx, ly, lz, 0, o.ry ?? seed, 0, size, size, size, { ao: { y0: P.origin.y + ly - size * 0.3, y1: P.origin.y + ly + size * 0.3, min: 0.4 } });
  if (o.collide) P.cylCollider(lx, ly + size * 0.1, lz, size * 0.42, size * 0.3, { walkable: true });
}

/**
 * The inside of an enormous cavern: a displaced open cylinder viewed from within.
 * Visual only (play space has its own colliders).
 */
export function cavernWall(ctx: BuildContext, cx: number, cy: number, cz: number, radius: number, height: number, seed: number, mat: 'rock' | 'rockDark' = 'rockDark', arc = Math.PI * 2, arcStart = 0): void {
  const radial = Math.max(24, Math.round((radius * arc) / 9));
  const rings = Math.max(8, Math.round(height / 9));
  const g = new CylinderGeometry(radius, radius, height, radial, rings, true, arcStart, arc);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const y = v.y;
    const ridges = fbm2(a * 9 + seed, y * 0.012, 4);
    const ledges = fbm2(a * 2 + seed * 3, y * 0.05, 3);
    const k = 1 + (ridges - 0.5) * 0.28 + (ledges - 0.5) * 0.12;
    pos.setX(i, v.x * k);
    pos.setZ(i, v.z * k);
    pos.setY(i, y + (fbm2(a * 5, y * 0.02 + seed, 2) - 0.5) * 12);
  }
  g.scale(-1, 1, 1); // flip winding so faces point inwards
  g.computeVertexNormals();
  ctx.batch.add(mat, g, new Matrix4().makeTranslation(cx, cy, cz), { uvScale: 14, ao: { y0: cy - height / 2, y1: cy + height / 2, min: 0.35 }, jitter: 0 });
}

/** Inverted dome ceiling far above, with hanging stalactites. */
export function cavernCeiling(ctx: BuildContext, cx: number, cy: number, cz: number, radius: number, seed: number, stalactites = 40): void {
  const g = new SphereGeometry(radius, 36, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 0.01 + seed, v.y * 0.01, v.z * 0.01, 3);
    v.y *= 0.35;
    v.multiplyScalar(0.9 + n * 0.25);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.scale(-1, 1, 1);
  g.computeVertexNormals();
  ctx.batch.add('rockDark', g, new Matrix4().makeTranslation(cx, cy, cz), { uvScale: 16, jitter: 0 });
  const rng = new Rng(seed);
  for (let i = 0; i < stalactites; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * radius * 0.9;
    const len = rng.range(6, 32);
    const w = len * rng.range(0.12, 0.22);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const yTop = cy + radius * 0.35 * Math.sqrt(Math.max(0, 1 - (r / radius) ** 2)) * 0.9;
    const sg = new CylinderGeometry(w, 0.05, len, 7, 3);
    const sp = sg.getAttribute('position');
    for (let k = 0; k < sp.count; k++) {
      const px = sp.getX(k), py = sp.getY(k), pz = sp.getZ(k);
      const n = fbm3(px + i, py * 0.3, pz, 2);
      sp.setXYZ(k, px * (0.8 + n * 0.5), py, pz * (0.8 + n * 0.5));
    }
    sg.computeVertexNormals();
    ctx.batch.add('rockDark', sg, new Matrix4().makeTranslation(x, yTop - len / 2, z), { uvScale: 6, ao: { y0: yTop - len, y1: yTop, min: 0.6 } });
  }
}

/** Hanging stalactite cluster at a specific place (visual only). */
export function stalactite(P: Placer, lx: number, ly: number, lz: number, len: number, w: number, seed: number): void {
  const sg = new CylinderGeometry(w, 0.04, len, 7, 3);
  const sp = sg.getAttribute('position');
  for (let k = 0; k < sp.count; k++) {
    const px = sp.getX(k), py = sp.getY(k), pz = sp.getZ(k);
    const n = fbm3(px + seed, py * 0.3, pz, 2);
    sp.setXYZ(k, px * (0.8 + n * 0.5), py, pz * (0.8 + n * 0.5));
  }
  sg.computeVertexNormals();
  P.add('rockDark', sg, lx, ly - len / 2, lz, 0, 0, 0, 1, 1, 1, { uvScale: 5 });
}

/** Layered ink-wash silhouettes on huge inward-facing cylinders (parallax backdrop). */
export function inkBackdrop(ctx: BuildContext, cx: number, cy: number, cz: number, layers: { radius: number; height: number; color: number; opacity: number; seed: number; spiky?: boolean; y?: number; repeat?: number }[]): void {
  for (const L of layers) {
    const tex = inkMountainsTexture(L.seed, L.spiky ?? true);
    if (tex) {
      tex.repeat.set(L.repeat ?? 3, 1);
    }
    const g = new CylinderGeometry(L.radius, L.radius, L.height, 64, 1, true);
    const m = new MeshBasicMaterial({
      map: tex,
      color: new Color(L.color),
      transparent: true,
      opacity: L.opacity,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    const mesh = new Mesh(g, m);
    mesh.position.set(cx, cy + (L.y ?? 0), cz);
    mesh.renderOrder = -10 + L.radius * 0.001;
    mesh.frustumCulled = false;
    ctx.object(mesh);
  }
}

/** Scrolling mist sheet material (shared). */
export function mistMaterial(color: Color, opacity: number): ShaderMaterial {
  const tex = mistTexture();
  const m = new ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uColor: { value: color },
      uOpacity: { value: opacity },
      uTime: WorldUniforms.uTime,
      uSpeed: { value: 0.006 },
    },
    vertexShader: `
      varying vec2 vUv; varying float vDepth;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uSpeed;
      varying vec2 vUv; varying float vDepth;
      void main(){
        vec2 uv1 = vUv * vec2(3.0, 3.0) + vec2(uTime * uSpeed, uTime * uSpeed * 0.3);
        vec2 uv2 = vUv * vec2(5.0, 5.0) + vec2(-uTime * uSpeed * 0.7, uTime * uSpeed * 0.5);
        float a = texture2D(uMap, uv1).a * 0.6 + texture2D(uMap, uv2).a * 0.6;
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        float near = smoothstep(1.5, 12.0, vDepth);
        gl_FragColor = vec4(uColor, a * uOpacity * edge * near);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
  });
  return m;
}

/** Horizontal sea of mist (e.g. filling an abyss beneath bridges). */
export function mistSheet(ctx: BuildContext, x: number, y: number, z: number, w: number, d: number, color: number, opacity = 0.6): Mesh {
  const g = new PlaneGeometry(w, d, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mesh = new Mesh(g, mistMaterial(new Color(color), opacity));
  mesh.position.set(x, y, z);
  mesh.renderOrder = 5;
  ctx.object(mesh);
  return mesh;
}

/** Vertical light shaft (two crossed additive quads). */
export function lightShaft(ctx: BuildContext, x: number, y: number, z: number, w: number, h: number, color: number, opacity = 0.25, tilt = 0.15): void {
  const tex = shaftTexture();
  const m = new MeshBasicMaterial({
    map: tex, color: new Color(color), transparent: true, opacity, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, fog: false,
  });
  for (let i = 0; i < 2; i++) {
    const g = new PlaneGeometry(w, h);
    const mesh = new Mesh(g, m);
    mesh.position.set(x, y - h / 2, z);
    mesh.rotation.set(0, (i * Math.PI) / 2 + 0.4, tilt);
    mesh.renderOrder = 8;
    ctx.object(mesh);
  }
}

/** Waterfall ribbon with scrolling streaks + foam glow at the base. */
export function waterfall(ctx: BuildContext, x: number, yTop: number, z: number, width: number, height: number, rotY: number, color = 0xa9c8e0): void {
  const tex = waterfallTexture();
  const mat = new ShaderMaterial({
    uniforms: { ...fogUniforms(), uMap: { value: tex }, uTime: WorldUniforms.uTime, uColor: { value: new Color(color) } },
    fog: true,
    vertexShader: `#include <fog_pars_vertex>
      varying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform sampler2D uMap; uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        vec2 uv = vec2(vUv.x * 2.0, vUv.y * 3.0 + uTime * 1.4);
        float a = texture2D(uMap, uv).a;
        float b = texture2D(uMap, uv * vec2(1.3, 0.7) + vec2(0.3, uTime * 0.9)).a;
        float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        float fadeTop = smoothstep(1.0, 0.92, vUv.y);
        float fadeBot = smoothstep(0.0, 0.2, vUv.y);
        float alpha = (a * 0.55 + b * 0.45) * edge * fadeTop * mix(0.35, 1.0, fadeBot);
        gl_FragColor = vec4(uColor * (0.7 + b * 0.6), alpha * 0.8);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side: DoubleSide,
  });
  const g = new PlaneGeometry(width, height, 1, 8);
  // slight outward curve
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + height / 2) / height;
    pos.setZ(i, Math.pow(1 - t, 2) * width * 0.15);
  }
  const mesh = new Mesh(g, mat);
  mesh.position.set(x, yTop - height / 2, z);
  mesh.rotation.y = rotY;
  mesh.renderOrder = 6;
  ctx.object(mesh);
  ctx.glow(new Vector3(x, yTop - height + 1, z), 0x9fd0ff, width * 2.2, 0.15);
}

/** Bioluminescent mushroom cluster. */
export function glowMushrooms(P: Placer, lx: number, ly: number, lz: number, count: number, seed: number, scale = 1, lightIt = true): void {
  const rng = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0, 0.7) * scale;
    const h = rng.range(0.15, 0.6) * scale;
    const x = lx + Math.cos(a) * r, z = lz + Math.sin(a) * r;
    P.add('bone', cylG(0.03, 0.045, 5), x, ly + h / 2, z, rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2), scale, h, scale);
    const cw = rng.range(0.1, 0.24) * scale;
    P.add('glowPlant', latheG([[0.01, 0], [1, 0.05], [0.8, 0.35], [0.01, 0.5]], 7), x, ly + h, z, 0, 0, 0, cw, cw * 0.9, cw);
  }
  if (lightIt) {
    P.glow(lx, ly + 0.4 * scale, lz, 0x5ff0e0, 2.5 * scale, 0.04);
    P.light(lx, ly + 0.6 * scale, lz, 0x44e0d0, 2.2 * scale, 6 * scale, 0.03);
  }
}

/** Pale reeds / cave grass tufts (crossed quads). */
export function reeds(P: Placer, lx: number, ly: number, lz: number, spread: number, count: number, seed: number, height = 0.8): void {
  const rng = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const x = lx + rng.range(-spread, spread), z = lz + rng.range(-spread, spread);
    const h = height * rng.range(0.5, 1.2);
    const g = new PlaneGeometry(0.06, h, 1, 3);
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const t = (pos.getY(k) + h / 2) / h;
      pos.setX(k, pos.getX(k) * (1 - t) + t * t * 0.15);
    }
    g.translate(0, h / 2, 0);
    P.add('foliage', g, x, ly, z, rng.range(-0.25, 0.25), rng.range(0, Math.PI), rng.range(-0.25, 0.25), 1, 1, 1, { color: 0x9fb09a, jitter: 0.2 });
  }
}

/** Twisting roots / vines hanging from (lx,ly,lz). */
export function hangingRoots(P: Placer, lx: number, ly: number, lz: number, count: number, len: number, seed: number, spread = 1.5): void {
  const rng = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const x = lx + rng.range(-spread, spread), z = lz + rng.range(-spread, spread);
    const L = len * rng.range(0.5, 1.2);
    const pts: Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push(new Vector3(x + Math.sin(t * 5 + i) * 0.3 * t, ly - t * L, z + Math.cos(t * 4 + i) * 0.3 * t));
    }
    P.add('woodDark', taperTubeG(pts, 0.09, 0.015, 10, 4), 0, 0, 0, 0, 0, 0, 1, 1, 1, { color: 0x6a7060 });
  }
}

/** Gnarled dead tree (recursive branches). */
export function deadTree(P: Placer, lx: number, ly: number, lz: number, height: number, seed: number, collide = true): void {
  const rng = new Rng(seed);
  const branch = (start: Vector3, dir: Vector3, len: number, r: number, depth: number) => {
    const pts: Vector3[] = [start.clone()];
    const d = dir.clone();
    const p = start.clone();
    for (let k = 1; k <= 4; k++) {
      d.x += rng.range(-0.35, 0.35);
      d.z += rng.range(-0.35, 0.35);
      d.y += rng.range(-0.1, 0.15);
      d.normalize();
      p.addScaledVector(d, len / 4);
      pts.push(p.clone());
    }
    // points are world-space: add without a placer transform
    P.ctx.batch.add('woodDark', taperTubeG(pts, r, r * 0.45, 8, 5), undefined, { color: 0x4a4038 });
    if (depth > 0) {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const nd = d.clone().add(new Vector3(rng.range(-0.9, 0.9), rng.range(-0.1, 0.5), rng.range(-0.9, 0.9))).normalize();
        branch(pts[rng.int(2, 4)], nd, len * 0.62, r * 0.5, depth - 1);
      }
    }
  };
  const base = P.p(lx, ly, lz);
  branch(base, new Vector3(0, 1, 0), height * 0.55, height * 0.06, 3);
  if (collide) P.cylCollider(lx, ly + height * 0.25, lz, height * 0.06, height * 0.25, { walkable: false });
}

/** Thorn lotus: spiky hazard you can bounce on with a downward strike. */
export function thornLotusGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const rng = new Rng(3);
  const base = new SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(base.toNonIndexed());
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tilt = rng.range(0.3, 0.9);
    const cone = new CylinderGeometry(0.0, 0.09, 0.9, 5, 1).toNonIndexed();
    cone.translate(0, 0.45, 0);
    cone.rotateZ(-tilt);
    cone.rotateY(a);
    cone.translate(Math.cos(a) * 0.2, 0.15, -Math.sin(a) * 0.2);
    parts.push(cone);
  }
  const merged = mergeGeos(parts);
  return merged;
}

function mergeGeos(parts: BufferGeometry[]): BufferGeometry {
  let total = 0;
  for (const p of parts) total += p.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    const a = p.getAttribute('position').array as Float32Array;
    pos.set(a, o);
    o += a.length;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function lotusPads(P: Placer, lx: number, ly: number, lz: number, count: number, seed: number, spread = 3): void {
  const rng = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const r = rng.range(0.3, 0.9);
    P.add('foliage', cylG(1, 1, 10), lx + rng.range(-spread, spread), ly + 0.02, lz + rng.range(-spread, spread), 0, 0, 0, r, 0.03, r, { color: 0x3f6a4a });
  }
}

export function moundSphere(): BufferGeometry {
  return sphereG(10);
}
