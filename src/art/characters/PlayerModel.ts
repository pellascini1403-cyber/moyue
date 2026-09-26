import {
  BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, Shape, ExtrudeGeometry, Vector3, CylinderGeometry, SphereGeometry, Material,
} from 'three';
import { Rig } from '../../anim/Rig';
import { characterMaterial } from '../materials';
import { addOutlines, outlineMaterial, wingMaterial } from './charMaterials';
import { latheG, taperTubeG, torusG } from '../geo/basic';

function mesh(g: BufferGeometry, m: Material, outline = true, name = ''): Mesh {
  const me = new Mesh(g, m);
  me.castShadow = true;
  me.userData.outline = outline;
  me.name = name;
  return me;
}

/** Slender wing-vein blade. Length along +y. */
function bladeGeometry(len: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-0.018, 0);
  s.bezierCurveTo(-0.045, len * 0.25, -0.04, len * 0.7, 0.0, len);
  s.bezierCurveTo(0.03, len * 0.72, 0.034, len * 0.3, 0.018, 0);
  s.lineTo(-0.018, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -0.004);
  return g;
}

/** Cicada wing membrane shape. Root at origin, extends along -y (hanging). */
function wingGeometry(len: number, width: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width * 0.9, -len * 0.1, width, -len * 0.6, width * 0.35, -len);
  s.bezierCurveTo(width * 0.1, -len * 0.9, -width * 0.2, -len * 0.4, 0, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: false, curveSegments: 12 });
  // UVs: x across (0..1), y along length (0..1)
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / width;
    uv[i * 2 + 1] = -pos.getY(i) / len;
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

export interface PlayerView {
  root: Group;
  body: Group;
  rig: Rig;
  eyeMat: MeshBasicMaterial;
  bladeMat: MeshStandardMaterial;
  bladeTip: Object3D;
  wingMats: ReturnType<typeof wingMaterial>[];
  scarf: Scarf;
  materials: MeshStandardMaterial[];
  outlines: Mesh[];
}

/** Verlet ribbon scarf trailing from the neck (world-space). */
export class Scarf {
  readonly mesh: Mesh;
  private pts: Vector3[] = [];
  private prev: Vector3[] = [];
  private readonly n = 8;
  private readonly seg = 0.075;
  private geo: BufferGeometry;
  private right = new Vector3(1, 0, 0);
  wind = new Vector3();

  constructor(color: Color) {
    for (let i = 0; i < this.n; i++) {
      this.pts.push(new Vector3(0, -i * this.seg, 0));
      this.prev.push(new Vector3(0, -i * this.seg, 0));
    }
    this.geo = new BufferGeometry();
    const pos = new Float32Array(this.n * 2 * 3);
    const uv = new Float32Array(this.n * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < this.n; i++) {
      uv.set([0, i / (this.n - 1), 1, i / (this.n - 1)], i * 4);
      if (i < this.n - 1) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const pa = new Float32BufferAttribute(pos, 3);
    pa.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    const m = characterMaterial({ color, side: DoubleSide, roughness: 0.9 }, { color: new Color(0xff6040), power: 2, strength: 0.35 });
    this.mesh = new Mesh(this.geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  reset(anchor: Vector3): void {
    for (let i = 0; i < this.n; i++) {
      this.pts[i].copy(anchor).y -= i * this.seg;
      this.prev[i].copy(this.pts[i]);
    }
  }

  update(dt: number, anchor: Vector3, right: Vector3, back: Vector3): void {
    dt = Math.min(dt, 1 / 30);
    this.right.copy(right);
    const g = -9;
    this.pts[0].copy(anchor);
    for (let i = 1; i < this.n; i++) {
      const p = this.pts[i], q = this.prev[i];
      const vx = (p.x - q.x) * 0.9, vy = (p.y - q.y) * 0.9, vz = (p.z - q.z) * 0.9;
      q.copy(p);
      p.x += vx + (this.wind.x + back.x * 1.2) * dt * dt;
      p.y += vy + g * dt * dt;
      p.z += vz + (this.wind.z + back.z * 1.2) * dt * dt;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.pts[i - 1], b = this.pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5;
        const k = (d - this.seg) / d;
        if (i === 1) {
          b.x -= dx * k;
          b.y -= dy * k;
          b.z -= dz * k;
        } else {
          a.x += dx * k * 0.5;
          a.y += dy * k * 0.5;
          a.z += dz * k * 0.5;
          b.x -= dx * k * 0.5;
          b.y -= dy * k * 0.5;
          b.z -= dz * k * 0.5;
        }
      }
      this.pts[0].copy(anchor);
    }
    const pos = this.geo.getAttribute('position') as Float32BufferAttribute;
    for (let i = 0; i < this.n; i++) {
      const w = 0.055 * (1 - (i / this.n) * 0.45);
      const p = this.pts[i];
      pos.setXYZ(i * 2, p.x - this.right.x * w, p.y - this.right.y * w, p.z - this.right.z * w);
      pos.setXYZ(i * 2 + 1, p.x + this.right.x * w, p.y + this.right.y * w, p.z + this.right.z * w);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

/**
 * The protagonist: a small cicada-born warrior. Dark jade carapace head with
 * wide amber eyes, an ink robe, folded translucent wings worn like a cape,
 * a crimson scarf and a slender jade wing-blade.
 */
export function buildPlayerModel(): PlayerView {
  const rig = new Rig();
  const root = new Group();
  root.name = 'player';
  const body = new Group();
  root.add(body);
  const rimJade = { color: new Color(0x7fffd4), power: 2.6, strength: 0.55 };
  const carapace = characterMaterial({ color: 0x2c5a4a, roughness: 0.38, metalness: 0.15 }, rimJade);
  const robe = characterMaterial({ color: 0x15171d, roughness: 0.9 }, { color: new Color(0x6fa8c8), power: 2.4, strength: 0.4 });
  const sash = characterMaterial({ color: 0x3b9474, roughness: 0.6 }, rimJade);
  const gold = characterMaterial({ color: 0xc19a48, roughness: 0.35, metalness: 0.7 }, { color: new Color(0xffd080), power: 3, strength: 0.3 });
  const limb = characterMaterial({ color: 0x1d2a26, roughness: 0.6 }, rimJade);
  const bladeMat = characterMaterial({ color: 0x9ef0d6, roughness: 0.25, metalness: 0.2, emissive: 0x1d7a60, emissiveIntensity: 0.9 }, { color: new Color(0xb0fff0), power: 1.8, strength: 0.6 });
  const eyeMat = new MeshBasicMaterial({ color: new Color(2.6, 1.55, 0.45) });
  const ocelliMat = new MeshBasicMaterial({ color: new Color(1.6, 1.4, 0.6) });

  const hips = rig.add('hips', new Group());
  hips.position.set(0, 0.36, 0);
  body.add(hips);

  // Robe skirt
  const robeJ = rig.add('robe', new Group());
  hips.add(robeJ);
  robeJ.add(mesh(latheG([[0.11, 0.06], [0.14, 0.0], [0.19, -0.14], [0.235, -0.3], [0.2, -0.31]], 14), robe, true, 'robe'));
  const hem = mesh(torusG(0.225, 0.012, 4, 20), gold, false);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = -0.29;
  robeJ.add(hem);

  // Legs
  for (const [side, sx] of [['L', 0.075], ['R', -0.075]] as const) {
    const leg = rig.add(`leg${side}`, new Group());
    leg.position.set(sx, -0.02, 0);
    hips.add(leg);
    const thigh = mesh(new CylinderGeometry(0.045, 0.04, 0.18, 8), limb, true);
    thigh.position.y = -0.09;
    leg.add(thigh);
    const shin = rig.add(`shin${side}`, new Group());
    shin.position.y = -0.18;
    leg.add(shin);
    const calf = mesh(new CylinderGeometry(0.04, 0.03, 0.15, 8), limb, true);
    calf.position.y = -0.075;
    shin.add(calf);
    const foot = mesh(new SphereGeometry(0.05, 8, 6), limb, true);
    foot.scale.set(0.9, 0.55, 1.5);
    foot.position.set(0, -0.155, 0.025);
    shin.add(foot);
  }

  // Spine / chest
  const spine = rig.add('spine', new Group());
  spine.position.y = 0.04;
  hips.add(spine);
  const chest = rig.add('chest', new Group());
  chest.position.y = 0.12;
  spine.add(chest);
  const torso = mesh(latheG([[0.1, -0.16], [0.125, -0.06], [0.14, 0.04], [0.13, 0.1], [0.07, 0.14]], 14), robe, true, 'torso');
  chest.add(torso);
  const sashM = mesh(torusG(0.12, 0.022, 6, 16), sash, false);
  sashM.rotation.x = Math.PI / 2;
  sashM.position.y = -0.1;
  chest.add(sashM);
  // collar
  const collar = mesh(torusG(0.075, 0.018, 5, 14), gold, false);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.13;
  chest.add(collar);
  // Wings (folded like a cape)
  const wingMats: ReturnType<typeof wingMaterial>[] = [];
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    const wj = rig.add(`wing${side}`, new Group());
    wj.position.set(sx * 0.045, 0.1, -0.1);
    wj.rotation.set(0.28, sx * -0.12, sx * -0.18);
    chest.add(wj);
    const wm = wingMaterial();
    wingMats.push(wm);
    const wg = wingGeometry(0.62, 0.2);
    const w = new Mesh(wg, wm);
    if (sx < 0) w.scale.x = -1;
    w.renderOrder = 20;
    wj.add(w);
    // dark leading vein
    const vein = mesh(taperTubeG([new Vector3(0, 0, 0), new Vector3(sx * 0.12, -0.2, 0), new Vector3(sx * 0.1, -0.6, 0)], 0.008, 0.003, 8, 4), limb, false);
    wj.add(vein);
  }

  // Arms
  const handR = new Group();
  for (const [side, sx] of [['L', 0.14], ['R', -0.14]] as const) {
    const sh = rig.add(`shoulder${side}`, new Group());
    sh.position.set(sx, 0.07, 0);
    chest.add(sh);
    const pad = mesh(new SphereGeometry(0.055, 10, 8), carapace, true);
    pad.scale.set(1.1, 0.8, 1);
    sh.add(pad);
    const upper = mesh(new CylinderGeometry(0.035, 0.03, 0.13, 8), robe, true);
    upper.position.y = -0.07;
    sh.add(upper);
    const el = rig.add(`elbow${side}`, new Group());
    el.position.y = -0.13;
    sh.add(el);
    const fore = mesh(new CylinderGeometry(0.03, 0.026, 0.12, 8), limb, true);
    fore.position.y = -0.06;
    el.add(fore);
    const hand = mesh(new SphereGeometry(0.032, 8, 6), limb, true);
    hand.position.y = -0.13;
    el.add(hand);
    if (side === 'R') {
      handR.position.y = -0.13;
      el.add(handR);
    }
  }
  const blade = rig.add('blade', new Group());
  blade.rotation.x = Math.PI / 2;
  handR.add(blade);
  const guard = mesh(new CylinderGeometry(0.035, 0.035, 0.012, 8), gold, false);
  guard.position.y = 0.035;
  blade.add(guard);
  const grip = mesh(new CylinderGeometry(0.012, 0.012, 0.08, 6), limb, false);
  blade.add(grip);
  const bladeMesh = mesh(bladeGeometry(0.6), bladeMat, true, 'blade');
  bladeMesh.position.y = 0.04;
  blade.add(bladeMesh);
  const bladeTip = new Object3D();
  bladeTip.position.y = 0.62;
  blade.add(bladeTip);

  // Neck + head
  const neck = rig.add('neck', new Group());
  neck.position.y = 0.14;
  chest.add(neck);
  const head = rig.add('head', new Group());
  head.position.y = 0.1;
  neck.add(head);
  const skull = mesh(new SphereGeometry(0.17, 18, 14), carapace, true, 'head');
  skull.scale.set(1.1, 0.92, 1.0);
  head.add(skull);
  // face plate (slightly darker, forward)
  const face = mesh(new SphereGeometry(0.13, 14, 10), limb, false);
  face.scale.set(1.05, 0.8, 0.55);
  face.position.set(0, -0.035, 0.1);
  head.add(face);
  // crest ridge
  const crest = mesh(taperTubeG([new Vector3(0, 0.1, 0.12), new Vector3(0, 0.17, 0.0), new Vector3(0, 0.12, -0.14)], 0.022, 0.01, 8, 5), carapace, false);
  head.add(crest);
  // wide-set compound eyes
  for (const sx of [1, -1]) {
    const eye = new Mesh(new SphereGeometry(0.062, 12, 10), eyeMat);
    eye.scale.set(0.85, 1.05, 1);
    eye.position.set(sx * 0.155, 0.01, 0.075);
    head.add(eye);
  }
  // three ocelli on the brow
  for (const [x, y] of [[0, 0.085], [0.035, 0.065], [-0.035, 0.065]]) {
    const o = new Mesh(new SphereGeometry(0.012, 6, 5), ocelliMat);
    o.position.set(x, y, 0.13);
    head.add(o);
  }
  // short antennae
  for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
    const aj = rig.add(`ant${side}`, new Group());
    aj.position.set(sx * 0.07, 0.1, 0.1);
    head.add(aj);
    const a = mesh(taperTubeG([new Vector3(0, 0, 0), new Vector3(sx * 0.05, 0.08, 0.02), new Vector3(sx * 0.12, 0.12, -0.04)], 0.009, 0.003, 8, 4), limb, false);
    aj.add(a);
  }

  const scarf = new Scarf(new Color(0x9a1e1c));
  const outlines = addOutlines(root, outlineMaterial(0.012));
  return {
    root, body, rig, eyeMat, bladeMat, bladeTip, wingMats, scarf,
    materials: [carapace, robe, sash, gold, limb, bladeMat], outlines,
  };
}
