import { Color, Group, Mesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3, CylinderGeometry, Sprite, ConeGeometry, TorusGeometry, BoxGeometry, OctahedronGeometry } from 'three';
import { characterMaterial, glowSpriteMaterial } from '../materials';
import { addOutlines, outlineMaterial, wingMaterial } from './charMaterials';
import { latheG, taperTubeG } from '../geo/basic';
import { lanternTexture } from '../textures';
import { mergeRigParts } from './merge';

function part(g: THREE_Geo, m: THREE_Mat, outline = true): Mesh {
  const me = new Mesh(g, m);
  me.userData.outline = outline;
  me.castShadow = true;
  return me;
}
type THREE_Geo = ConstructorParameters<typeof Mesh>[0];
type THREE_Mat = ConstructorParameters<typeof Mesh>[1];

export interface NpcView {
  root: Group;
  head: Object3D;
  body: Object3D;
  extra: Object3D[];
}

/** Weng, the Lantern-Keeper: an old moth with singed wings leaning on a lantern pole. */
export function buildWeng(): NpcView {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const fur = characterMaterial({ color: 0xbcae92, roughness: 0.95 }, { color: new Color(0xffd8a0), power: 2, strength: 0.5 });
  const robe = characterMaterial({ color: 0x3a2e40, roughness: 0.9 }, { color: new Color(0xffb070), power: 2.4, strength: 0.4 });
  body.add(part(latheG([[0.32, 0], [0.34, 0.3], [0.28, 0.7], [0.2, 0.95], [0.1, 1.05]], 14), robe));
  const head = new Group();
  head.position.set(0, 1.12, 0.06);
  body.add(head);
  const skull = part(new SphereGeometry(0.2, 14, 10), fur);
  skull.scale.set(1.1, 1, 1);
  head.add(skull);
  const eyeMat = new MeshBasicMaterial({ color: new Color(0.3, 0.3, 0.35) });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.06, 8, 6), eyeMat);
    e.position.set(s * 0.12, 0.02, 0.13);
    head.add(e);
    // feathered antennae
    const pts = [new Vector3(s * 0.08, 0.15, 0.08), new Vector3(s * 0.22, 0.4, 0.05), new Vector3(s * 0.34, 0.5, -0.1)];
    head.add(part(taperTubeG(pts, 0.02, 0.006, 8, 4), fur, false));
    for (let k = 1; k < 6; k++) {
      const base = pts[1].clone().lerp(pts[2], k / 6);
      head.add(part(taperTubeG([base, base.clone().add(new Vector3(s * 0.05, -0.1, 0.04))], 0.008, 0.003, 3, 3), fur, false));
    }
  }
  // fluffy collar
  const collar = part(new TorusGeometry(0.2, 0.08, 8, 16), fur, false);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.98;
  body.add(collar);
  // singed wings folded behind
  for (const s of [-1, 1]) {
    const w = new Mesh(new SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), wingMaterial(new Color(0.6, 0.5, 0.4)));
    w.scale.set(0.5, 0.05, 1);
    w.rotation.set(1.3, 0, s * 0.3);
    w.position.set(s * 0.18, 0.7, -0.25);
    body.add(w);
  }
  // lantern pole
  const pole = new Group();
  pole.position.set(-0.35, 0, 0.2);
  root.add(pole);
  pole.add(part(new CylinderGeometry(0.03, 0.035, 1.9, 6), characterMaterial({ color: 0x3a2618 }, { color: new Color(0xffb070), power: 2, strength: 0.3 }), false));
  pole.children[0].position.y = 0.95;
  const hook = part(taperTubeG([new Vector3(0, 1.9, 0), new Vector3(0, 2.05, 0.15), new Vector3(0, 1.95, 0.3)], 0.025, 0.02, 6, 4), characterMaterial({ color: 0x3a2618 }, { color: new Color(0xffb070), power: 2, strength: 0.3 }), false);
  pole.add(hook);
  const paper = new MeshBasicMaterial({ map: lanternTexture(), color: new Color(1.8, 1.3, 1.0) });
  const lamp = new Mesh(latheG([[0.06, -0.18], [0.16, -0.1], [0.18, 0], [0.16, 0.1], [0.06, 0.18]], 8), paper);
  lamp.position.set(0, 1.68, 0.3);
  pole.add(lamp);
  const glow = new Sprite(glowSpriteMaterial(new Color(1.1, 0.6, 0.25), 0.9));
  glow.position.copy(lamp.position);
  glow.scale.setScalar(2);
  pole.add(glow);
  mergeRigParts(root);
  addOutlines(root, outlineMaterial(0.012));
  return { root, head, body, extra: [lamp, pole] };
}

/** Xun, the Pilgrim: a round beetle under an enormous pack of scrolls. */
export function buildXun(): NpcView {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const shell = characterMaterial({ color: 0x3a4a2a, roughness: 0.4, metalness: 0.3 }, { color: new Color(0xc0ff90), power: 2.4, strength: 0.4 });
  const cloth = characterMaterial({ color: 0x6a5a3a, roughness: 0.95 }, { color: new Color(0xffd8a0), power: 2, strength: 0.3 });
  const b = part(new SphereGeometry(0.34, 14, 10), shell);
  b.scale.set(1, 0.9, 1.1);
  b.position.y = 0.42;
  body.add(b);
  const head = new Group();
  head.position.set(0, 0.72, 0.2);
  body.add(head);
  head.add(part(new SphereGeometry(0.15, 12, 8), shell));
  const eyeMat = new MeshBasicMaterial({ color: new Color(1.6, 1.6, 1.2) });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.035, 6, 5), eyeMat);
    e.position.set(s * 0.07, 0.03, 0.13);
    head.add(e);
  }
  // wide straw hat
  const hat = part(new ConeGeometry(0.42, 0.18, 16), characterMaterial({ color: 0xa08a5a, roughness: 1 }, { color: new Color(0xffe0a0), power: 2, strength: 0.3 }));
  hat.position.y = 0.16;
  head.add(hat);
  // pack of scrolls
  const pack = new Group();
  pack.position.set(0, 0.8, -0.35);
  body.add(pack);
  pack.add(part(new BoxGeometry(0.6, 0.7, 0.35), cloth));
  for (let i = 0; i < 5; i++) {
    const sc = part(new CylinderGeometry(0.06, 0.06, 0.8, 8), characterMaterial({ color: 0xd8c8a0, roughness: 0.9 }, { color: new Color(0xffe0a0), power: 2, strength: 0.2 }), false);
    sc.rotation.z = Math.PI / 2 + (i - 2) * 0.15;
    sc.position.set(0, 0.4 + i * 0.06, (i % 2) * 0.08);
    pack.add(sc);
  }
  for (const s of [-1, 1]) {
    const leg = part(new CylinderGeometry(0.05, 0.04, 0.3, 6), shell);
    leg.position.set(s * 0.15, 0.12, 0.05);
    body.add(leg);
  }
  mergeRigParts(root);
  addOutlines(root, outlineMaterial(0.012));
  return { root, head, body, extra: [pack] };
}

/** Floating moon fragment (collectible). */
export function buildFragment(): { root: Group; core: MeshBasicMaterial } {
  const root = new Group();
  const core = new MeshBasicMaterial({ color: new Color(2.2, 2.1, 1.8) });
  const shard = new Mesh(new OctahedronGeometry(0.22, 0), core);
  shard.scale.set(0.7, 1.3, 0.5);
  root.add(shard);
  const glow = new Sprite(glowSpriteMaterial(new Color(1.0, 1.0, 0.85), 1));
  glow.scale.setScalar(2.6);
  root.add(glow);
  return { root, core };
}

/** Relic / technique scroll floating above an altar. */
export function buildRelic(color = new Color(0.9, 1.5, 1.3)): { root: Group; mat: MeshBasicMaterial; glow: Sprite } {
  const root = new Group();
  const mat = new MeshBasicMaterial({ color });
  const scroll = new Mesh(new CylinderGeometry(0.07, 0.07, 0.7, 10), characterMaterial({ color: 0xd8c8a0 }, { color: new Color(0xffe0a0), power: 2, strength: 0.6 }));
  scroll.rotation.z = Math.PI / 2;
  root.add(scroll);
  const band = new Mesh(new TorusGeometry(0.28, 0.025, 6, 24), mat);
  root.add(band);
  const band2 = band.clone();
  band2.rotation.y = Math.PI / 2;
  root.add(band2);
  const glow = new Sprite(glowSpriteMaterial(color.clone().multiplyScalar(0.7), 1));
  glow.scale.setScalar(3.2);
  root.add(glow);
  return { root, mat, glow };
}

export function buildJadeBead(): Mesh {
  const m = new Mesh(new OctahedronGeometry(0.09, 0), new MeshBasicMaterial({ color: new Color(0.6, 1.6, 1.1) }));
  return m;
}

export const _v = new Vector3();
