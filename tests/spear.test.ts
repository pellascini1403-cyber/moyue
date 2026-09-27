import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { attackHits } from '../src/combat/Combat';
import { ActiveAttack, AttackKind } from '../src/player/PlayerController';
import { PlayerTuning } from '../src/player/PlayerTuning';
import { attackSpear, spearTip } from '../src/player/spearMoves';
import { solveTwoBone } from '../src/anim/ik';
import { HairChain } from '../src/anim/HairChain';
import { HAIR_DRAG, HAIR_REST, HAIR_STIFF } from '../src/player/playerDims';

type SpecKey = keyof typeof PlayerTuning.attack;
const SPEC: Record<string, SpecKey> = { slash1: 'slash', slash2: 'slash', slash3: 'finisher', airSlash: 'air', downSlash: 'down', upSlash: 'up', spin: 'spin' };

function atk(kind: AttackKind, t: number): ActiveAttack {
  const s = PlayerTuning.attack[SPEC[kind]];
  return { id: 1, kind, t, duration: s.duration, activeStart: s.activeStart, activeEnd: s.activeEnd, cancel: s.cancel,
    damage: s.damage, range: s.range, arc: s.arc, knockback: s.knockback, lunge: s.lunge, dir: new Vector3(0, 0, 1), hit: new Set() };
}

/** Sample the attack's active window; return tip positions (character space, facing +z). */
function activeTips(kind: AttackKind, samples = 24): { t: number; tip: Vector3 }[] {
  const s = PlayerTuning.attack[SPEC[kind]];
  const out: { t: number; tip: Vector3 }[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = s.activeStart + ((s.activeEnd - s.activeStart) * i) / samples;
    const [x, y, z] = spearTip(attackSpear(kind, t / s.duration));
    out.push({ t, tip: new Vector3(x, y, z) });
  }
  return out;
}

describe('spear moves agree with the hit volumes', () => {
  // a small target (radius 0.15) placed exactly where the spear tip is
  const probe = (p: Vector3) => ({ center: p.clone(), radius: 0.15 });

  for (const kind of ['slash1', 'slash2', 'slash3', 'airSlash'] as AttackKind[]) {
    it(`${kind}: the tip passes through the front of the hit sector during the active frames`, () => {
      const tips = activeTips(kind);
      const inside = tips.filter(({ t, tip }) => attackHits(atk(kind, t), new Vector3(), 0, probe(tip)));
      // the swing crosses the sector for a meaningful part of the active window
      expect(inside.length).toBeGreaterThan(tips.length * 0.25);
      // and the tip reaches close to the sector's edge: what you see is what hits
      const range = PlayerTuning.attack[SPEC[kind]].range;
      const reach = Math.max(...inside.map(({ tip }) => Math.hypot(tip.x, tip.z)));
      expect(reach).toBeGreaterThan(range - 0.35);
      expect(reach).toBeLessThanOrEqual(range + 0.05);
    });
  }

  it('the sweeps cut through the front, not only the sides', () => {
    for (const kind of ['slash1', 'slash2'] as AttackKind[]) {
      const yaws = activeTips(kind).map(({ tip }) => Math.atan2(tip.x, tip.z));
      expect(Math.min(...yaws)).toBeLessThan(-0.3);
      expect(Math.max(...yaws)).toBeGreaterThan(0.3);
    }
  });

  it('slash1 sweeps right → left and slash2 left → right', () => {
    const y1 = activeTips('slash1').map(({ tip }) => Math.atan2(tip.x, tip.z));
    const y2 = activeTips('slash2').map(({ tip }) => Math.atan2(tip.x, tip.z));
    expect(y1[y1.length - 1]).toBeGreaterThan(y1[0]);
    expect(y2[y2.length - 1]).toBeLessThan(y2[0]);
  });

  it('down-slash points the spear below the feet, up-slash above the head', () => {
    const down = activeTips('downSlash');
    expect(down[down.length >> 1].tip.y).toBeLessThan(-0.6);
    const up = activeTips('upSlash');
    expect(Math.max(...up.map(({ tip }) => tip.y))).toBeGreaterThan(1.6);
  });

  it('the charged spin carries the tip all the way around', () => {
    const s = PlayerTuning.attack.spin;
    const angles = new Set<number>();
    for (let i = 0; i <= 40; i++) {
      const t = s.activeStart + ((s.activeEnd - s.activeStart) * i) / 40;
      const [x, , z] = spearTip(attackSpear('spin', t / s.duration));
      angles.add(Math.floor(((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * 8));
    }
    expect(angles.size).toBe(8);
  });
});

describe('two-bone IK', () => {
  const l1 = 0.085, l2 = 0.085;
  const hand = (root: Vector3, q: Quaternion, bend: number) => {
    const elbow = new Vector3(0, -l1, 0).applyQuaternion(q).add(root);
    const fore = new Vector3(0, -l2, 0).applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -bend)).applyQuaternion(q);
    return elbow.add(fore);
  };
  it('reaches targets within reach', () => {
    const root = new Vector3(-0.12, 0.1, 0);
    const q = new Quaternion();
    for (const tgt of [new Vector3(-0.2, 0.05, 0.1), new Vector3(-0.12, 0.0, 0.12), new Vector3(0, 0.1, 0.1), new Vector3(-0.15, 0.2, 0.05)]) {
      const bend = solveTwoBone(root, tgt, l1, l2, new Vector3(-0.4, -0.4, -1).normalize(), q);
      expect(hand(root, q, bend).distanceTo(tgt)).toBeLessThan(1e-3);
    }
  });
  it('points straight at targets out of reach', () => {
    const root = new Vector3();
    const q = new Quaternion();
    const tgt = new Vector3(0, 0, 1);
    const bend = solveTwoBone(root, tgt, l1, l2, new Vector3(0, -1, 0), q);
    const h = hand(root, q, bend);
    expect(h.length()).toBeGreaterThan(l1 + l2 - 0.002);
    expect(h.clone().normalize().z).toBeGreaterThan(0.999);
  });
});

describe('hair chain', () => {
  const rest = Array.from({ length: 10 }, (_, i) => new Vector3(0, 0.5 - i * 0.1, -0.1 * i));
  const stiff = rest.map((_, i) => (i === 0 ? 1 : 0.3 / (1 + i)));
  it('keeps its styled shape at rest and its length while moving', () => {
    const chain = new HairChain(rest, stiff);
    const m = new Matrix4();
    chain.reset(m);
    const len0 = chain.length();
    for (let i = 0; i < 120; i++) chain.update(1 / 60, m);
    // gravity sags the weakly held tip a little, the root stays put
    expect(chain.pos[0].distanceTo(rest[0])).toBeLessThan(1e-6);
    expect(chain.pos[3].distanceTo(rest[3])).toBeLessThan(0.08);
    expect(Math.abs(chain.length() - len0) / len0).toBeLessThan(0.05);
  });
  it('the real mane holds its sweep standing, and streams behind when running', () => {
    const rest2 = HAIR_REST.map(([x, y, z]) => new Vector3(x, y, z));
    const chain = new HairChain(rest2, [...HAIR_STIFF], [{ center: new Vector3(0, 0.25, 0), radius: 0.24 }], 0.045);
    const m = new Matrix4();
    chain.reset(m);
    chain.groundY = -0.46;
    for (let i = 0; i < 180; i++) chain.update(1 / 60, m);
    const tipStand = chain.pos[chain.n - 1].clone();
    // the crest keeps its styled height above the mask (the silhouette in the reference)
    expect(chain.pos[3].y).toBeGreaterThan(HAIR_REST[3][1] - 0.03);
    const len0 = chain.length();
    // run at the full run speed along +z
    const speed = 7.4;
    const wind = new Vector3(0, 0, -speed * HAIR_DRAG);
    let z = 0;
    for (let i = 0; i < 120; i++) {
      z += speed / 60;
      m.makeTranslation(0, 0, z);
      chain.update(1 / 60, m, wind);
    }
    const tipRun = chain.pos[chain.n - 1].clone().sub(new Vector3(0, 0, z));
    expect(tipRun.z).toBeLessThan(tipStand.z - 0.15);
    expect(Math.abs(chain.length() - len0) / len0).toBeLessThan(0.06);
  });
  it('never sinks below the ground', () => {
    const chain = new HairChain(rest, stiff.map(() => 0.01));
    const m = new Matrix4();
    chain.reset(m);
    chain.groundY = -0.3;
    for (let i = 0; i < 200; i++) chain.update(1 / 60, m);
    for (const p of chain.pos) expect(p.y).toBeGreaterThanOrEqual(-0.3);
  });
  it('is stable at low and uneven frame rates', () => {
    const chain = new HairChain(rest, stiff);
    const m = new Matrix4();
    chain.reset(m);
    for (let i = 0; i < 60; i++) chain.update(i % 3 === 0 ? 1 / 12 : 1 / 45, m);
    for (const p of chain.pos) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    expect(chain.pos[9].distanceTo(rest[9])).toBeLessThan(0.6);
  });
});
