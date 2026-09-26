import {
  AdditiveBlending, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, SphereGeometry,
  Sprite, Vector3, ConeGeometry, TorusGeometry, BufferGeometry, Material,
} from 'three';
import { characterMaterial, glowSpriteMaterial } from '../materials';
import { addOutlines, outlineMaterial, wingMaterial } from './charMaterials';
import { latheG, taperTubeG } from '../geo/basic';
import { lanternTexture } from '../textures';
import { bellGeometry } from '../geo/props';
import { mergeRigParts } from './merge';

function part(g: BufferGeometry, m: Material, outline = true): Mesh {
  const me = new Mesh(g, m);
  me.castShadow = true;
  me.userData.outline = outline;
  return me;
}

const inkRim = { color: new Color(0xb070ff), power: 2.2, strength: 0.7 };
const emberRim = { color: new Color(0xff6a3a), power: 2.4, strength: 0.6 };

export interface InkMiteView {
  root: Group;
  body: Object3D;
  legs: Object3D[];
  eyes: MeshBasicMaterial;
}

/** Ink Mite: a glossy blot of living ink on six needle legs, two ember eyes. */
export function buildInkMite(): InkMiteView {
  const root = new Group();
  const body = new Group();
  body.position.y = 0.32;
  root.add(body);
  const ink = characterMaterial({ color: 0x0c0d14, roughness: 0.25, metalness: 0.3 }, inkRim);
  const shell = part(new SphereGeometry(0.34, 16, 12), ink);
  shell.scale.set(1, 0.72, 1.18);
  body.add(shell);
  // dripping spines
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI - Math.PI / 2;
    const sp = part(new ConeGeometry(0.04, 0.22, 5), ink, false);
    sp.position.set(Math.sin(a) * 0.12, 0.22, Math.cos(a) * 0.12 - 0.05);
    sp.rotation.set(-0.5 + Math.cos(a) * 0.3, 0, Math.sin(a) * 0.4);
    body.add(sp);
  }
  const eyes = new MeshBasicMaterial({ color: new Color(2.4, 0.9, 0.25) });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.055, 8, 6), eyes);
    e.position.set(s * 0.11, 0.06, 0.34);
    body.add(e);
  }
  // mandibles
  for (const s of [-1, 1]) {
    const m = part(taperTubeG([new Vector3(s * 0.08, -0.06, 0.32), new Vector3(s * 0.12, -0.1, 0.46), new Vector3(s * 0.04, -0.12, 0.52)], 0.025, 0.008, 6, 4), ink, false);
    body.add(m);
  }
  const legs: Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1;
    const k = i % 3;
    const leg = new Group();
    leg.position.set(side * 0.22, 0.28, 0.14 - k * 0.16);
    const g = taperTubeG([new Vector3(0, 0, 0), new Vector3(side * 0.22, 0.12, 0), new Vector3(side * 0.34, -0.28, 0)], 0.022, 0.008, 8, 4);
    leg.add(part(g, ink, false));
    root.add(leg);
    legs.push(leg);
  }
  mergeRigParts(root);
  addOutlines(root, outlineMaterial(0.012));
  return { root, body, legs, eyes };
}

export interface WispView {
  root: Group;
  lantern: Object3D;
  wings: Object3D[];
  glow: Sprite;
  core: MeshBasicMaterial;
  paper: MeshBasicMaterial;
}

/** Lantern Wisp: a moth-spirit carrying its own little paper lantern. */
export function buildLanternWisp(): WispView {
  const root = new Group();
  const lantern = new Group();
  lantern.position.y = 0.2;
  root.add(lantern);
  const paper = new MeshBasicMaterial({ map: lanternTexture(), color: new Color(1.8, 1.25, 1.0) });
  const lamp = new Mesh(latheG([[0.08, -0.22], [0.2, -0.14], [0.23, 0], [0.2, 0.14], [0.08, 0.22]], 8), paper);
  lantern.add(lamp);
  const dark = characterMaterial({ color: 0x2a2018, roughness: 0.6 }, emberRim);
  const capT = part(new CylinderGeometry(0.1, 0.12, 0.05, 8), dark, false);
  capT.position.y = 0.24;
  lantern.add(capT);
  const capB = capT.clone();
  capB.position.y = -0.24;
  lantern.add(capB);
  const tassel = new Mesh(new ConeGeometry(0.04, 0.3, 5), new MeshBasicMaterial({ color: 0xa01a10 }));
  tassel.position.y = -0.42;
  tassel.rotation.x = Math.PI;
  lantern.add(tassel);
  // pale moth body riding on top
  const moth = characterMaterial({ color: 0xd8cfb8, roughness: 0.9 }, { color: new Color(0xffd0a0), power: 2, strength: 0.5 });
  const thorax = part(new SphereGeometry(0.1, 10, 8), moth);
  thorax.scale.set(1, 0.9, 1.4);
  thorax.position.y = 0.36;
  lantern.add(thorax);
  const head = part(new SphereGeometry(0.07, 10, 8), moth);
  head.position.set(0, 0.4, 0.14);
  lantern.add(head);
  const core = new MeshBasicMaterial({ color: new Color(2.5, 1.2, 0.4) });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.025, 6, 5), core);
    e.position.set(s * 0.045, 0.42, 0.19);
    lantern.add(e);
    const ant = part(taperTubeG([new Vector3(s * 0.03, 0.45, 0.18), new Vector3(s * 0.1, 0.58, 0.24), new Vector3(s * 0.16, 0.6, 0.2)], 0.012, 0.004, 6, 3), moth, false);
    lantern.add(ant);
  }
  const wings: Object3D[] = [];
  for (const s of [-1, 1]) {
    const w = new Group();
    w.position.set(s * 0.06, 0.38, 0);
    const wm = wingMaterial(new Color(0.95, 0.8, 0.6));
    const geo = new SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const mesh = new Mesh(geo, wm);
    mesh.scale.set(1, 0.05, 0.7);
    mesh.position.x = s * 0.25;
    mesh.renderOrder = 20;
    w.add(mesh);
    lantern.add(w);
    wings.push(w);
  }
  const glow = new Sprite(glowSpriteMaterial(new Color(1.0, 0.55, 0.2), 0.9));
  glow.scale.setScalar(2.2);
  lantern.add(glow);
  mergeRigParts(root);
  addOutlines(root, outlineMaterial(0.01));
  return { root, lantern, wings, glow, core, paper };
}

export interface ShieldbackView {
  root: Group;
  body: Object3D;
  shield: Object3D;
  glaive: Object3D;
  head: Object3D;
  legs: Object3D[];
  eyes: MeshBasicMaterial;
}

/** Shieldback: a temple-guard beetle behind a bronze disc shield, wielding a crescent glaive. */
export function buildShieldback(): ShieldbackView {
  const root = new Group();
  const body = new Group();
  body.position.y = 0.55;
  root.add(body);
  const shell = characterMaterial({ color: 0x1d2a24, roughness: 0.35, metalness: 0.4 }, { color: new Color(0x80ffb0), power: 2.5, strength: 0.35 });
  const bronze = characterMaterial({ color: 0x8a6a34, roughness: 0.35, metalness: 0.75 }, { color: new Color(0xffc070), power: 2.5, strength: 0.4 });
  const robe = characterMaterial({ color: 0x3a1512, roughness: 0.9 }, emberRim);
  const torso = part(latheG([[0.3, -0.35], [0.36, -0.1], [0.34, 0.2], [0.24, 0.42], [0.1, 0.5]], 14), robe);
  body.add(torso);
  const carapace = part(new SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), shell);
  carapace.scale.set(0.95, 1.05, 0.85);
  carapace.position.set(0, 0.05, -0.1);
  carapace.rotation.x = -0.35;
  body.add(carapace);
  const head = new Group();
  head.position.set(0, 0.55, 0.08);
  body.add(head);
  const skull = part(new SphereGeometry(0.17, 12, 10), shell);
  skull.scale.set(1.1, 0.85, 1.1);
  head.add(skull);
  const horn = part(taperTubeG([new Vector3(0, 0.08, 0.1), new Vector3(0, 0.3, 0.2), new Vector3(0, 0.42, 0.08)], 0.06, 0.015, 8, 5), shell, false);
  head.add(horn);
  const eyes = new MeshBasicMaterial({ color: new Color(1.8, 2.2, 1.2) });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.035, 6, 5), eyes);
    e.position.set(s * 0.1, 0.0, 0.15);
    head.add(e);
  }
  // shield on the left arm, facing forward
  const shield = new Group();
  shield.position.set(0.28, 0.1, 0.38);
  body.add(shield);
  const disc = part(new CylinderGeometry(0.46, 0.46, 0.06, 20), bronze);
  disc.rotation.x = Math.PI / 2;
  shield.add(disc);
  const boss = part(new SphereGeometry(0.12, 10, 8), bronze, false);
  boss.scale.z = 0.6;
  boss.position.z = 0.04;
  shield.add(boss);
  for (const r of [0.22, 0.36]) {
    const ring = part(new TorusGeometry(r, 0.018, 4, 24), bronze, false);
    ring.position.z = 0.035;
    shield.add(ring);
  }
  // glaive in the right hand
  const glaive = new Group();
  glaive.position.set(-0.36, 0.05, 0.1);
  body.add(glaive);
  const pole = part(new CylinderGeometry(0.025, 0.025, 1.9, 6), characterMaterial({ color: 0x2a1c14 }, emberRim), false);
  pole.position.y = 0.35;
  glaive.add(pole);
  const blade = part(taperTubeG([new Vector3(0, 1.25, 0), new Vector3(0, 1.55, 0.18), new Vector3(0, 1.7, 0.05), new Vector3(0, 1.62, -0.12)], 0.05, 0.01, 10, 4), bronze, false);
  blade.scale.x = 0.4;
  glaive.add(blade);
  const legs: Object3D[] = [];
  for (const s of [-1, 1]) {
    const leg = new Group();
    leg.position.set(s * 0.16, 0.3, 0);
    leg.add(part(taperTubeG([new Vector3(0, 0, 0), new Vector3(s * 0.08, -0.15, 0.04), new Vector3(s * 0.06, -0.3, 0.06)], 0.06, 0.04, 6, 5), shell));
    root.add(leg);
    legs.push(leg);
  }
  mergeRigParts(root);
  addOutlines(root, outlineMaterial(0.014));
  return { root, body, shield, glaive, head, legs, eyes };
}

export interface WardenView {
  root: Group;
  body: Object3D;
  armR: Object3D;
  censer: Object3D;
  chainPts: Vector3[];
  chain: Mesh;
  head: Object3D;
  embers: MeshBasicMaterial;
  eyes: MeshBasicMaterial;
}

/** Censer Warden: a hunched monk-beetle whirling a smoking bronze censer on a chain. */
export function buildCenserWarden(): WardenView {
  const root = new Group();
  const body = new Group();
  body.position.y = 1.0;
  root.add(body);
  const robe = characterMaterial({ color: 0x4a1a14, roughness: 0.9 }, emberRim);
  const shell = characterMaterial({ color: 0x18201e, roughness: 0.3, metalness: 0.4 }, { color: new Color(0xffa060), power: 2.5, strength: 0.4 });
  const bronze = characterMaterial({ color: 0x8a6a34, roughness: 0.35, metalness: 0.75 }, { color: new Color(0xffc070), power: 2.5, strength: 0.5 });
  const skirt = part(latheG([[0.75, -1.0], [0.7, -0.6], [0.6, -0.1], [0.5, 0.3], [0.3, 0.6]], 16), robe);
  body.add(skirt);
  const hump = part(new SphereGeometry(0.75, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), shell);
  hump.position.set(0, 0.25, -0.25);
  hump.rotation.x = -0.6;
  body.add(hump);
  const head = new Group();
  head.position.set(0, 0.55, 0.45);
  body.add(head);
  const skull = part(new SphereGeometry(0.28, 12, 10), shell);
  skull.scale.set(1, 0.8, 1.1);
  head.add(skull);
  const eyes = new MeshBasicMaterial({ color: new Color(2.6, 1.0, 0.3) });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.05, 8, 6), eyes);
    e.position.set(s * 0.14, 0.02, 0.24);
    head.add(e);
    // drooping antennae like a long beard
    head.add(part(taperTubeG([new Vector3(s * 0.08, 0.1, 0.22), new Vector3(s * 0.2, 0.0, 0.5), new Vector3(s * 0.16, -0.6, 0.55), new Vector3(s * 0.1, -1.0, 0.4)], 0.025, 0.008, 12, 4), shell, false));
  }
  // prayer beads
  const beads = part(new TorusGeometry(0.42, 0.05, 6, 18), characterMaterial({ color: 0x3a2a1a, roughness: 0.4 }, emberRim), false);
  beads.rotation.x = Math.PI / 2 - 0.4;
  beads.position.set(0, 0.25, 0.25);
  body.add(beads);
  const armR = new Group();
  armR.position.set(-0.55, 0.3, 0.2);
  body.add(armR);
  armR.add(part(taperTubeG([new Vector3(0, 0, 0), new Vector3(-0.3, -0.3, 0.2), new Vector3(-0.35, -0.55, 0.45)], 0.12, 0.08, 8, 6), robe));
  const censer = new Group();
  root.add(censer);
  const pot = part(latheG([[0.05, -0.35], [0.3, -0.3], [0.38, -0.1], [0.36, 0.1], [0.24, 0.2], [0.26, 0.26], [0.1, 0.36]], 12), bronze);
  censer.add(pot);
  const embers = new MeshBasicMaterial({ color: new Color(2.4, 0.9, 0.3), transparent: true, blending: AdditiveBlending, depthWrite: false });
  const emberCore = new Mesh(new SphereGeometry(0.22, 10, 8), embers);
  censer.add(emberCore);
  const glow = new Sprite(glowSpriteMaterial(new Color(1.2, 0.5, 0.2), 0.9));
  glow.scale.setScalar(2.2);
  censer.add(glow);
  const chainPts = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const chain = new Mesh(new BufferGeometry(), characterMaterial({ color: 0x2b2a28, metalness: 0.6, roughness: 0.4 }, emberRim));
  chain.frustumCulled = false;
  root.add(chain);
  mergeRigParts(root);
  addOutlines(root, outlineMaterial(0.02));
  return { root, body, armR, censer, chainPts, chain, head, embers, eyes };
}

export interface AbbotView {
  root: Group;
  body: Object3D;
  bell: Object3D;
  bellMat: Material;
  head: Object3D;
  armL: Object3D;
  armR: Object3D;
  eyes: MeshBasicMaterial;
  crack: MeshBasicMaterial;
}

/** The Tolling Abbot: a colossal horned beetle-monk who carries the great bronze bell. */
export function buildTollingAbbot(): AbbotView {
  const root = new Group();
  const body = new Group();
  body.position.y = 1.6;
  root.add(body);
  const robe = characterMaterial({ color: 0x5a0e0c, roughness: 0.85 }, { color: new Color(0xff5030), power: 2.2, strength: 0.6 });
  const shell = characterMaterial({ color: 0x141414, roughness: 0.25, metalness: 0.5 }, { color: new Color(0xff8050), power: 2.5, strength: 0.45 });
  const bronze = characterMaterial({ color: 0x7a5a2a, roughness: 0.3, metalness: 0.8 }, { color: new Color(0xffc070), power: 2.2, strength: 0.5 });
  const skirt = part(latheG([[1.2, -1.6], [1.15, -1.0], [0.95, -0.2], [0.8, 0.4], [0.5, 0.8]], 18), robe);
  body.add(skirt);
  const chest = part(new SphereGeometry(0.85, 16, 12), shell);
  chest.scale.set(1.1, 0.9, 0.9);
  chest.position.y = 0.6;
  body.add(chest);
  const head = new Group();
  head.position.set(0, 1.35, 0.35);
  body.add(head);
  const skull = part(new SphereGeometry(0.42, 14, 10), shell);
  skull.scale.set(1.1, 0.85, 1.2);
  head.add(skull);
  // great horn
  head.add(part(taperTubeG([new Vector3(0, 0.1, 0.3), new Vector3(0, 0.6, 0.6), new Vector3(0, 1.2, 0.5), new Vector3(0, 1.45, 0.15)], 0.16, 0.03, 12, 6), shell, false));
  const eyes = new MeshBasicMaterial({ color: new Color(3, 0.9, 0.3) });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.07, 8, 6), eyes);
    e.position.set(s * 0.22, 0.05, 0.4);
    head.add(e);
  }
  const armL = new Group();
  armL.position.set(0.95, 0.8, 0.1);
  body.add(armL);
  armL.add(part(taperTubeG([new Vector3(0, 0, 0), new Vector3(0.4, -0.5, 0.3), new Vector3(0.3, -1.1, 0.6)], 0.22, 0.14, 8, 6), robe));
  const armR = new Group();
  armR.position.set(-0.95, 0.8, 0.1);
  body.add(armR);
  armR.add(part(taperTubeG([new Vector3(0, 0, 0), new Vector3(-0.4, -0.5, 0.3), new Vector3(-0.3, -1.1, 0.6)], 0.22, 0.14, 8, 6), robe));
  // the bell: carried on the back, swung overhead in attacks
  const bell = new Group();
  bell.position.set(0, 2.2, -0.9);
  root.add(bell);
  const bm = part(bellGeometry(), bronze);
  bm.scale.setScalar(1.7);
  bm.position.y = 1.1;
  bell.add(bm);
  const crack = new MeshBasicMaterial({ color: new Color(2.6, 0.8, 0.2), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const crackMesh = new Mesh(taperTubeG([new Vector3(0.9, 0.9, 0.5), new Vector3(1.05, 0.3, 0.6), new Vector3(1.1, -0.2, 0.3), new Vector3(1.2, -0.8, 0.5)], 0.05, 0.02, 10, 4), crack);
  bell.add(crackMesh);
  mergeRigParts(root);
  addOutlines(root, outlineMaterial(0.028));
  return { root, body, bell, bellMat: bronze, head, armL, armR, eyes, crack };
}

export function updateChain(view: WardenView, from: Vector3, to: Vector3): void {
  const pts: Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const p = from.clone().lerp(to, t);
    p.y -= Math.sin(t * Math.PI) * 0.25;
    pts.push(p);
  }
  view.chain.geometry.dispose();
  view.chain.geometry = taperTubeG(pts, 0.035, 0.035, 10, 4);
}

export const _unused = DoubleSide;
