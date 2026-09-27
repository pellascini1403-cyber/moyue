import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, NormalBlending, Points, RingGeometry, Scene, ShaderMaterial, Vector3, PlaneGeometry, Quaternion,
} from 'three';
import { dotTexture, glowTexture, inkSplatTexture, slashTexture, streakTexture } from '../art/textures';
import { Rng } from '../core/rng';

const MAX_P = 900;

interface ParticleBuf {
  points: Points;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  baseSize: Float32Array;
  baseCol: Float32Array;
  attract: Float32Array; // 1 = homes toward target
  next: number;
}

function makeParticles(additive: boolean): ParticleBuf {
  const g = new BufferGeometry();
  const pos = new Float32Array(MAX_P * 3);
  const col = new Float32Array(MAX_P * 4);
  const size = new Float32Array(MAX_P);
  for (let i = 0; i < MAX_P; i++) pos[i * 3 + 1] = -99999;
  const pa = new Float32BufferAttribute(pos, 3);
  pa.setUsage(DynamicDrawUsage);
  const ca = new Float32BufferAttribute(col, 4);
  ca.setUsage(DynamicDrawUsage);
  const sa = new Float32BufferAttribute(size, 1);
  sa.setUsage(DynamicDrawUsage);
  g.setAttribute('position', pa);
  g.setAttribute('aColor', ca);
  g.setAttribute('aSize', sa);
  const m = new ShaderMaterial({
    uniforms: { uMap: { value: additive ? dotTexture() : inkSplatTexture() }, uPR: { value: 1 } },
    vertexShader: `
      attribute vec4 aColor; attribute float aSize; uniform float uPR; varying vec4 vColor;
      void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uPR * (300.0 / max(-mv.z, 0.3)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec4 vColor;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a; if (a * vColor.a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a * vColor.a); }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  const points = new Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = additive ? 30 : 29;
  return {
    points, pos, col, size,
    vel: new Float32Array(MAX_P * 3), life: new Float32Array(MAX_P), maxLife: new Float32Array(MAX_P),
    grav: new Float32Array(MAX_P), drag: new Float32Array(MAX_P), baseSize: new Float32Array(MAX_P),
    baseCol: new Float32Array(MAX_P * 4), attract: new Float32Array(MAX_P), next: 0,
  };
}

interface Transient {
  mesh: Mesh;
  t: number;
  dur: number;
  kind: 'slash' | 'ring' | 'flash' | 'decal';
  from: number;
  to: number;
  opacity: number;
  active: boolean;
}

export interface BurstOptions {
  count: number;
  color: Color | number;
  speed: number;
  spread?: number; // 0..1 hemisphere bias
  dir?: Vector3;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  additive?: boolean;
  up?: number;
}

const _v = new Vector3();
const _q = new Quaternion();
const _y = new Vector3(0, 1, 0);
const _d = new Vector3();
const _s = new Vector3();
const _n = new Vector3();
const _m = new Matrix4();
const MAX_STREAKS = 96;

/**
 * Enemy-defeat palette: cool jewel tones and a soft gold, bright enough to
 * bloom against the dark caves (values above 1 are HDR).
 */
const DEFEAT_COLORS = [
  new Color(0.35, 1.6, 2.0), // cyan
  new Color(0.4, 0.65, 2.1), // blue
  new Color(1.0, 0.45, 2.0), // violet
  new Color(1.9, 0.35, 1.45), // magenta
  new Color(2.0, 1.45, 0.55), // soft gold
  new Color(0.3, 1.85, 1.3), // turquoise
];

/** Short-lived glowing sparks drawn as streaks along their velocity (one instanced draw call). */
class Streaks {
  readonly mesh: InstancedMesh;
  private pos = new Float32Array(MAX_STREAKS * 3);
  private vel = new Float32Array(MAX_STREAKS * 3);
  private col = new Float32Array(MAX_STREAKS * 3);
  private life = new Float32Array(MAX_STREAKS);
  private maxLife = new Float32Array(MAX_STREAKS);
  private width = new Float32Array(MAX_STREAKS);
  private next = 0;
  private readonly c = new Color();

  constructor() {
    const g = new PlaneGeometry(1, 1);
    g.translate(-0.5, 0, 0); // x ∈ [-1, 0]: the head leads at 0
    const m = new MeshBasicMaterial({ map: streakTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
    this.mesh = new InstancedMesh(g, m, MAX_STREAKS);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 32;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_STREAKS; i++) {
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
    }
  }

  spawn(p: Vector3, v: Vector3, color: Color, life: number, width: number): void {
    const k = this.next;
    this.next = (this.next + 1) % MAX_STREAKS;
    this.pos.set([p.x, p.y, p.z], k * 3);
    this.vel.set([v.x, v.y, v.z], k * 3);
    this.col.set([color.r, color.g, color.b], k * 3);
    this.life[k] = this.maxLife[k] = life;
    this.width[k] = width;
  }

  update(dt: number, camPos: Vector3): void {
    let any = false;
    for (let k = 0; k < MAX_STREAKS; k++) {
      if (this.life[k] <= 0) continue;
      any = true;
      this.life[k] -= dt;
      const i = k * 3;
      if (this.life[k] <= 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(k, _m);
        continue;
      }
      const drag = Math.exp(-3.5 * dt);
      this.vel[i] *= drag;
      this.vel[i + 1] = this.vel[i + 1] * drag - 4 * dt;
      this.vel[i + 2] *= drag;
      this.pos[i] += this.vel[i] * dt;
      this.pos[i + 1] += this.vel[i + 1] * dt;
      this.pos[i + 2] += this.vel[i + 2] * dt;
      const speed = Math.hypot(this.vel[i], this.vel[i + 1], this.vel[i + 2]);
      _d.set(this.vel[i], this.vel[i + 1], this.vel[i + 2]).divideScalar(speed || 1);
      const len = Math.min(0.5, Math.max(0.05, speed * 0.05));
      _v.set(camPos.x - this.pos[i], camPos.y - this.pos[i + 1], camPos.z - this.pos[i + 2]);
      const camDist = _v.length();
      _v.divideScalar(camDist || 1);
      // never thinner than a few pixels, so the colours still read at play distance
      const w = Math.max(this.width[k], camDist * 0.008);
      _s.crossVectors(_d, _v);
      if (_s.lengthSq() < 1e-6) _s.set(0, 1, 0);
      _s.normalize();
      _n.crossVectors(_d, _s);
      const u = this.life[k] / this.maxLife[k];
      _m.makeBasis(_d.multiplyScalar(len), _s.multiplyScalar(w * (0.5 + 0.5 * u)), _n);
      _m.setPosition(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
      this.mesh.setMatrixAt(k, _m);
      const f = Math.pow(u, 0.7);
      this.mesh.setColorAt(k, this.c.setRGB(this.col[i] * f, this.col[i + 1] * f, this.col[i + 2] * f));
    }
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  clear(): void {
    this.life.fill(0);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_STREAKS; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Pooled combat & world effects: slash arcs, particles, rings, flashes. */
export class Effects {
  readonly group = new Group();
  private add: ParticleBuf;
  private ink: ParticleBuf;
  private transients: Transient[] = [];
  private rng = new Rng(99);
  private slashMat: MeshBasicMaterial;
  private slashGeos = new Map<string, BufferGeometry>();
  private streaks = new Streaks();
  attractTarget = new Vector3();
  /** Hook for a brief real light (set by the game to the light pool). */
  onLight?: (pos: Vector3, color: Color, intensity: number, distance: number, dur: number) => void;

  constructor(scene: Scene) {
    this.add = makeParticles(true);
    this.ink = makeParticles(false);
    this.group.add(this.add.points, this.ink.points, this.streaks.mesh);
    this.slashMat = new MeshBasicMaterial({
      map: slashTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false,
    });
    scene.add(this.group);
  }

  setPixelRatio(pr: number): void {
    (this.add.points.material as ShaderMaterial).uniforms.uPR.value = pr;
    (this.ink.points.material as ShaderMaterial).uniforms.uPR.value = pr;
  }

  /** Crescent geometry: arc of `arc` radians, inner/outer radius, UV.x along arc (1 = leading edge). */
  private crescent(arc: number, inner: number, outer: number): BufferGeometry {
    const key = `${arc.toFixed(2)}|${inner}|${outer}`;
    let g = this.slashGeos.get(key);
    if (g) return g;
    const segs = 20;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const a = -arc / 2 + t * arc;
      // taper the thickness toward the tail
      const o = inner + (outer - inner) * (0.35 + 0.65 * t);
      pos.push(Math.sin(a) * inner, 0, Math.cos(a) * inner, Math.sin(a) * o, 0, Math.cos(a) * o);
      uv.push(t, 0, t, 1);
      if (i < segs) {
        const b = i * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.slashGeos.set(key, g);
    return g;
  }

  private transient(kind: Transient['kind'], geo: BufferGeometry, mat: MeshBasicMaterial, dur: number): Transient {
    let tr = this.transients.find((t) => !t.active && t.kind === kind);
    if (!tr) {
      const mesh = new Mesh(geo, mat.clone());
      mesh.frustumCulled = false;
      mesh.renderOrder = 31;
      this.group.add(mesh);
      tr = { mesh, t: 0, dur, kind, from: 1, to: 1, opacity: 1, active: false };
      this.transients.push(tr);
    }
    tr.mesh.geometry = geo;
    tr.active = true;
    tr.t = 0;
    tr.dur = dur;
    tr.mesh.visible = true;
    tr.mesh.scale.set(1, 1, 1);
    tr.mesh.rotation.set(0, 0, 0);
    tr.mesh.quaternion.identity();
    return tr;
  }

  /**
   * Slash arc centred at `pos`, in the plane defined by `normal`, pointing
   * toward `dir`. `clockwise` flips the sweep direction.
   */
  slash(pos: Vector3, dir: Vector3, normal: Vector3, radius: number, arc: number, color: Color | number, clockwise: boolean, dur = 0.16, thick = 0.45): void {
    const g = this.crescent(arc, radius * (1 - thick), radius);
    const tr = this.transient('slash', g, this.slashMat, dur);
    const m = tr.mesh;
    m.position.copy(pos);
    // orient: local +y -> normal, local +z -> dir
    const n = _v.copy(normal).normalize();
    _q.setFromUnitVectors(_y, n);
    m.quaternion.copy(_q);
    const localZ = new Vector3(0, 0, 1).applyQuaternion(_q);
    const d = dir.clone().projectOnPlane(n).normalize();
    const ang = Math.atan2(new Vector3().crossVectors(localZ, d).dot(n), localZ.dot(d));
    m.rotateY(ang);
    if (clockwise) m.scale.x = -1;
    tr.from = 0.85;
    tr.to = 1.12;
    tr.opacity = 1;
    (m.material as MeshBasicMaterial).color.set(color);
  }

  ring(pos: Vector3, radius: number, color: Color | number, dur = 0.5, opacity = 0.8, up = new Vector3(0, 1, 0), thin = false): void {
    const g = thin ? THIN_RING_GEO : RING_GEO;
    const tr = this.transient('ring', g, RING_MAT, dur);
    tr.mesh.position.copy(pos);
    tr.mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), up);
    tr.from = 0.2 * radius;
    tr.to = radius;
    tr.opacity = opacity;
    (tr.mesh.material as MeshBasicMaterial).color.set(color);
  }

  flash(pos: Vector3, size: number, color: Color | number, dur = 0.12): void {
    const tr = this.transient('flash', FLASH_GEO, FLASH_MAT, dur);
    tr.mesh.position.copy(pos);
    tr.from = size * 0.6;
    tr.to = size;
    tr.opacity = 1;
    (tr.mesh.material as MeshBasicMaterial).color.set(color);
    tr.mesh.userData.billboard = true;
  }

  burst(pos: Vector3, o: BurstOptions): void {
    const buf = o.additive === false ? this.ink : this.add;
    const col = new Color(o.color);
    for (let i = 0; i < o.count; i++) {
      const k = buf.next;
      buf.next = (buf.next + 1) % MAX_P;
      buf.pos[k * 3] = pos.x;
      buf.pos[k * 3 + 1] = pos.y;
      buf.pos[k * 3 + 2] = pos.z;
      // random direction, biased toward o.dir
      let dx = this.rng.range(-1, 1), dy = this.rng.range(-1, 1), dz = this.rng.range(-1, 1);
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      if (o.dir) {
        const s = o.spread ?? 0.5;
        dx = dx * s + o.dir.x * (1 - s);
        dy = dy * s + o.dir.y * (1 - s);
        dz = dz * s + o.dir.z * (1 - s);
      }
      const sp = o.speed * this.rng.range(0.4, 1.1);
      buf.vel[k * 3] = dx * sp;
      buf.vel[k * 3 + 1] = dy * sp + (o.up ?? 0);
      buf.vel[k * 3 + 2] = dz * sp;
      const life = (o.life ?? 0.5) * this.rng.range(0.6, 1.2);
      buf.life[k] = life;
      buf.maxLife[k] = life;
      buf.grav[k] = o.gravity ?? 6;
      buf.drag[k] = o.drag ?? 2;
      buf.baseSize[k] = (o.size ?? 0.12) * this.rng.range(0.6, 1.4);
      buf.baseCol.set([col.r, col.g, col.b, 1], k * 4);
      buf.attract[k] = 0;
    }
  }

  /** Motes that drift then home into the attract target (moonlight gain). */
  motes(pos: Vector3, count: number, color: Color | number): void {
    const buf = this.add;
    const col = new Color(color);
    for (let i = 0; i < count; i++) {
      const k = buf.next;
      buf.next = (buf.next + 1) % MAX_P;
      buf.pos.set([pos.x + this.rng.range(-0.3, 0.3), pos.y + this.rng.range(-0.2, 0.4), pos.z + this.rng.range(-0.3, 0.3)], k * 3);
      buf.vel.set([this.rng.range(-2, 2), this.rng.range(1, 3), this.rng.range(-2, 2)], k * 3);
      buf.life[k] = buf.maxLife[k] = this.rng.range(0.6, 0.9);
      buf.grav[k] = 0;
      buf.drag[k] = 3;
      buf.baseSize[k] = this.rng.range(0.08, 0.14);
      buf.baseCol.set([col.r, col.g, col.b, 1], k * 4);
      buf.attract[k] = 1;
    }
  }

  /**
   * An enemy is defeated: a white-hot core, a violet halo, two fine rings,
   * streaking sparks in cool jewel tones and soft gold, a few motes that drift
   * up and fade, and a brief real light. About half a second, then darkness.
   * `size` scales it (1 = a small creature); `dir` biases the sparks away from the blow.
   */
  defeat(pos: Vector3, size = 1, dir?: Vector3): void {
    const s = Math.max(0.6, Math.min(2.5, size));
    this.flash(pos, 1.25 * s, new Color(1.7, 1.9, 2.2), 0.1);
    this.flash(pos, 2.3 * s, new Color(1.0, 0.42, 1.5), 0.24);
    _v.copy(pos).addScaledVector(_y, -0.25 * s);
    this.ring(_v, 1.25 * s, new Color(0.35, 1.5, 1.4), 0.36, 0.7, _y, true);
    this.ring(_v, 0.75 * s, new Color(1.2, 0.5, 1.7), 0.3, 0.6, _y, true);
    const n = Math.min(36, Math.round(20 * s));
    for (let i = 0; i < n; i++) {
      // mostly outward and upward, leaning away from the blow
      let dx = this.rng.range(-1, 1), dy = this.rng.range(-0.2, 1), dz = this.rng.range(-1, 1);
      if (dir) {
        dx += dir.x * 0.6;
        dz += dir.z * 0.6;
      }
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = this.rng.range(5.5, 9.5) * Math.sqrt(s);
      _d.set((dx / l) * sp, (dy / l) * sp + 1.5, (dz / l) * sp);
      this.streaks.spawn(pos, _d, DEFEAT_COLORS[i % DEFEAT_COLORS.length], this.rng.range(0.25, 0.5), 0.055 * Math.sqrt(s));
    }
    this.burst(pos, { count: Math.round(8 * s), color: DEFEAT_COLORS[4], speed: 3.5, spread: 1, life: 0.45, size: 0.1, gravity: 3 });
    this.burst(pos, { count: Math.round(6 * s), color: DEFEAT_COLORS[0], speed: 3, spread: 1, life: 0.4, size: 0.09, gravity: 2 });
    for (const c of [DEFEAT_COLORS[2], DEFEAT_COLORS[5], DEFEAT_COLORS[4]]) {
      this.burst(pos, { count: Math.round(3 * s), color: c.clone().multiplyScalar(0.7), speed: 1.3, spread: 1, life: 1.1, size: 0.075, gravity: -1.3, drag: 1.8 });
    }
    this.onLight?.(pos, new Color(0.65, 0.5, 1.0), 2.6 * s, 4.5 * s, 0.32);
  }

  update(dt: number, camQuat: Quaternion, camPos?: Vector3): void {
    if (camPos) this.streaks.update(dt, camPos);
    for (const buf of [this.add, this.ink]) {
      const tgt = this.attractTarget;
      for (let k = 0; k < MAX_P; k++) {
        if (buf.life[k] <= 0) {
          if (buf.size[k] !== 0) {
            buf.size[k] = 0;
            buf.pos[k * 3 + 1] = -99999;
          }
          continue;
        }
        buf.life[k] -= dt;
        const i3 = k * 3;
        if (buf.attract[k] > 0) {
          const age = 1 - buf.life[k] / buf.maxLife[k];
          if (age > 0.3) {
            const dx = tgt.x - buf.pos[i3], dy = tgt.y - buf.pos[i3 + 1], dz = tgt.z - buf.pos[i3 + 2];
            const d = Math.hypot(dx, dy, dz) || 1;
            const pull = 40 * (age - 0.3);
            buf.vel[i3] += (dx / d) * pull * dt * 10;
            buf.vel[i3 + 1] += (dy / d) * pull * dt * 10;
            buf.vel[i3 + 2] += (dz / d) * pull * dt * 10;
            if (d < 0.25) buf.life[k] = 0;
          }
        }
        buf.vel[i3 + 1] -= buf.grav[k] * dt;
        const dr = Math.exp(-buf.drag[k] * dt);
        buf.vel[i3] *= dr;
        buf.vel[i3 + 1] *= dr;
        buf.vel[i3 + 2] *= dr;
        buf.pos[i3] += buf.vel[i3] * dt;
        buf.pos[i3 + 1] += buf.vel[i3 + 1] * dt;
        buf.pos[i3 + 2] += buf.vel[i3 + 2] * dt;
        const u = Math.max(0, buf.life[k] / buf.maxLife[k]);
        buf.size[k] = buf.baseSize[k] * (0.4 + 0.6 * u);
        buf.col[k * 4] = buf.baseCol[k * 4];
        buf.col[k * 4 + 1] = buf.baseCol[k * 4 + 1];
        buf.col[k * 4 + 2] = buf.baseCol[k * 4 + 2];
        buf.col[k * 4 + 3] = Math.min(1, u * 1.6);
      }
      const g = buf.points.geometry;
      g.getAttribute('position').needsUpdate = true;
      g.getAttribute('aColor').needsUpdate = true;
      g.getAttribute('aSize').needsUpdate = true;
    }
    for (const tr of this.transients) {
      if (!tr.active) continue;
      tr.t += dt;
      const u = Math.min(1, tr.t / tr.dur);
      const m = tr.mesh.material as MeshBasicMaterial;
      if (tr.kind === 'slash') {
        const s = tr.from + (tr.to - tr.from) * (1 - (1 - u) * (1 - u));
        const sx = tr.mesh.scale.x < 0 ? -s : s;
        tr.mesh.scale.set(sx, s, s);
        m.opacity = tr.opacity * (u < 0.25 ? 1 : 1 - (u - 0.25) / 0.75);
      } else if (tr.kind === 'ring') {
        const s = tr.from + (tr.to - tr.from) * (1 - Math.pow(1 - u, 3));
        tr.mesh.scale.set(s, s, s);
        m.opacity = tr.opacity * (1 - u);
      } else if (tr.kind === 'flash') {
        const s = tr.from + (tr.to - tr.from) * u;
        tr.mesh.scale.set(s, s, s);
        tr.mesh.quaternion.copy(camQuat);
        m.opacity = tr.opacity * (1 - u);
      }
      if (u >= 1) {
        tr.active = false;
        tr.mesh.visible = false;
      }
    }
  }

  clear(): void {
    this.streaks.clear();
    for (const b of [this.add, this.ink]) b.life.fill(0);
    for (const t of this.transients) {
      t.active = false;
      t.mesh.visible = false;
    }
  }
}

const RING_GEO = new RingGeometry(0.85, 1, 48, 1);
const THIN_RING_GEO = new RingGeometry(0.95, 1, 64, 1);
const RING_MAT = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
const FLASH_GEO = new PlaneGeometry(1, 1);
const FLASH_MAT = new MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false });
