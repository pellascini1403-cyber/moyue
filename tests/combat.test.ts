import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { attackHits } from '../src/combat/Combat';
import { ActiveAttack, AttackKind } from '../src/player/PlayerController';
import { PlayerTuning } from '../src/player/PlayerTuning';

function atk(kind: AttackKind): ActiveAttack {
  const spec = kind === 'downSlash' ? PlayerTuning.attack.down : kind === 'spin' ? PlayerTuning.attack.spin : PlayerTuning.attack.slash;
  return { id: 1, kind, t: 0.08, duration: spec.duration, activeStart: spec.activeStart, activeEnd: spec.activeEnd, cancel: spec.cancel,
    damage: spec.damage, range: spec.range, arc: spec.arc, knockback: spec.knockback, lunge: spec.lunge, dir: new Vector3(0, 0, 1), hit: new Set() };
}
const hb = (x: number, y: number, z: number, r = 0.4) => ({ center: new Vector3(x, y, z), radius: r });
const O = new Vector3(0, 0, 0);

describe('melee hit volumes', () => {
  it('forward slash hits in front, misses behind and far away', () => {
    expect(attackHits(atk('slash1'), O, 0, hb(0, 0.5, 1.6))).toBe(true);
    expect(attackHits(atk('slash1'), O, 0, hb(1.0, 0.5, 1.2))).toBe(true);
    expect(attackHits(atk('slash1'), O, 0, hb(0, 0.5, -1.6))).toBe(false);
    expect(attackHits(atk('slash1'), O, 0, hb(0, 0.5, 3.5))).toBe(false);
    expect(attackHits(atk('slash1'), O, 0, hb(0, 3.5, 1))).toBe(false);
  });
  it('facing rotates the swing', () => {
    expect(attackHits(atk('slash1'), O, Math.PI / 2, hb(1.6, 0.5, 0))).toBe(true);
    expect(attackHits(atk('slash1'), O, Math.PI / 2, hb(-1.6, 0.5, 0))).toBe(false);
  });
  it('down slash hits below only', () => {
    expect(attackHits(atk('downSlash'), O, 0, hb(0, -1.2, 0.2))).toBe(true);
    expect(attackHits(atk('downSlash'), O, 0, hb(0, 1.5, 0))).toBe(false);
  });
  it('spin hits all around', () => {
    for (const a of [0, 1, 2, 3, 4, 5]) expect(attackHits(atk('spin'), O, 0, hb(Math.sin(a) * 2.4, 0.5, Math.cos(a) * 2.4))).toBe(true);
  });
});
