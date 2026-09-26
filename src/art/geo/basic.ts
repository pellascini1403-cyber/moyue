import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Euler, LatheGeometry, Matrix4, Quaternion, SphereGeometry,
  Vector2, Vector3, TubeGeometry, CatmullRomCurve3, IcosahedronGeometry, ConeGeometry, TorusGeometry, PlaneGeometry,
} from 'three';

const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _p = new Vector3();

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  _p.set(x, y, z);
  return new Matrix4().compose(_p, _q, _s);
}

const unitBox = new BoxGeometry(1, 1, 1);
export function boxG(): BufferGeometry {
  return unitBox;
}

const cylCache = new Map<string, BufferGeometry>();
export function cylG(rTop = 0.5, rBot = 0.5, seg = 12, open = false): BufferGeometry {
  const k = `${rTop}|${rBot}|${seg}|${open}`;
  let g = cylCache.get(k);
  if (!g) cylCache.set(k, (g = new CylinderGeometry(rTop, rBot, 1, seg, 1, open)));
  return g;
}

export function coneG(seg = 8): BufferGeometry {
  return cylG(0, 0.5, seg);
}

const sphCache = new Map<number, BufferGeometry>();
export function sphereG(detail = 12): BufferGeometry {
  let g = sphCache.get(detail);
  if (!g) sphCache.set(detail, (g = new SphereGeometry(0.5, detail, Math.max(6, Math.floor(detail * 0.7)))));
  return g;
}

export function icoG(detail = 1): BufferGeometry {
  return new IcosahedronGeometry(0.5, detail);
}

/** Lathe from [radius, y] pairs (y ascending). */
export function latheG(profile: [number, number][], seg = 16, phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(0.0001, r), y)), seg, phiStart, phiLength);
}

export function tubeG(points: Vector3[], radius: number, segs = 16, radial = 6, closed = false): BufferGeometry {
  const curve = new CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  return new TubeGeometry(curve, segs, radius, radial, closed);
}

/** Tube with radius varying along its length (roots, horns, antennae). */
export function taperTubeG(points: Vector3[], r0: number, r1: number, segs = 16, radial = 6): BufferGeometry {
  const g = tubeG(points, 1, segs, radial);
  const pos = g.getAttribute('position');
  const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const center = new Vector3();
  const p = new Vector3();
  // TubeGeometry vertex layout: (segs+1) rings of (radial+1) vertices.
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, center);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(r).add(center);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function torusG(r: number, tube: number, radial = 6, tubular = 20): BufferGeometry {
  return new TorusGeometry(r, tube, radial, tubular);
}

export function planeG(w = 1, h = 1, sx = 1, sy = 1): BufferGeometry {
  return new PlaneGeometry(w, h, sx, sy);
}

export function coneOpen(seg = 8): BufferGeometry {
  return new ConeGeometry(0.5, 1, seg, 1, true);
}

/** Hexagonal / n-gon prism (lantern bodies, pagoda cores). */
export function prismG(sides: number, rTop = 0.5, rBot = 0.5): BufferGeometry {
  const g = new CylinderGeometry(rTop, rBot, 1, sides, 1, false);
  return g.toNonIndexed();
}
