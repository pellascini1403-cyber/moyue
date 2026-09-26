import { describe, expect, it, beforeAll } from 'vitest';
import { Vector3 } from 'three';
import { SimWorld, runRoute, v3, Leg, climbChimney, DT } from './sim/SimWorld';
import { noAbilities, Abilities } from '../src/player/Abilities';
import { PlayerController, emptyInput, PlayerFrameInput } from '../src/player/PlayerController';

let sim: SimWorld;
beforeAll(() => {
  sim = new SimWorld();
});

const withAb = (p: Partial<Abilities>): Abilities => ({ ...noAbilities(), ...p });
const fmt = (p: Vector3) => p.toArray().map((n) => n.toFixed(2)).join(', ');

describe('Region 1 — Cicada Threshold', () => {
  it('tomb → overlook → cliff path → broken bridge → plateau → rafts → terrace gate (no abilities)', () => {
    const legs: Leg[] = [
      { to: v3(0, 100, -3.5), jump: 'none', label: 'leave the tomb' },
      { to: v3(0, 100, -9), jump: 'none', label: 'overlook' },
      { to: v3(-5.2, 100, -11.6), jump: 'none', label: 'stair top' },
      { to: v3(-15, 97, -12), jump: 'none', label: 'first landing' },
      { to: v3(-22.5, 97, -12), label: 'first gap' },
      { to: v3(-28, 98.6, -12), label: 'step up' },
      { to: v3(-28, 98.6, -15.5), jump: 'none', label: 'bridge start' },
      { to: v3(-28, 98.6, -45), tol: 1.2, label: 'broken bridge', timeout: 15 },
      { to: v3(-28, 98.6, -52), jump: 'none', label: 'plateau' },
      { to: v3(-24, 96.4, -64.6), label: 'hanging raft', tol: 0.8 },
      { to: v3(-19, 95.2, -68), label: 'board the moving raft', tol: 1.0, waitFor: (s) => s.platformPos('th_lift_mp').x < -18.6 },
      { to: v3(-7, 93.4, -70), label: 'ride and hop off', tol: 1.2, waitFor: (s) => s.platformPos('th_lift_mp').x > -11.4 },
      { to: v3(-7, 90, -81.5), jump: 'none', label: 'down to the terrace gate' },
    ];
    const r = runRoute(sim, v3(0, 100.45, 1.6), legs, noAbilities(), 80);
    expect(r.ok, `failed at "${r.label}" at ${fmt(r.pos)}`).toBe(true);
  });

  it('the hidden ledge fragment is reachable with plain jumps', () => {
    const legs: Leg[] = [
      { to: v3(-36, 98.6, -50.5), jump: 'none', label: 'plateau west edge', tol: 0.6 },
      { to: v3(-38.8, 98.2, -49.5), label: 'pillar 1', tol: 0.7 },
      { to: v3(-43.5, 97.4, -46.5), label: 'pillar 2', tol: 0.7 },
      { to: v3(-47.2, 99.2, -43), label: 'pillar 3', tol: 0.7 },
      { to: v3(-51, 99.8, -39.5), label: 'alcove', tol: 0.9 },
    ];
    const r = runRoute(sim, v3(-28, 98.7, -52), legs, noAbilities(), 80);
    expect(r.ok, `failed at "${r.label}" at ${fmt(r.pos)}`).toBe(true);
  });
});

describe('Region 2 — Lantern Terraces', () => {
  it('gate → keeper court → trial terrace → pagoda bridge → balcony (no abilities)', () => {
    const legs: Leg[] = [
      { to: v3(-7, 86, -93.6), jump: 'none', label: 'stairs to the court' },
      { to: v3(5.8, 86, -100), jump: 'none', label: 'court east' },
      { to: v3(14.6, 82, -100), jump: 'none', label: 'down to the trial terrace' },
      { to: v3(30.3, 82, -104), jump: 'none', label: 'trial east edge' },
      { to: v3(47.7, 82, -104), jump: 'none', tol: 0.5, label: 'across the pagoda bridge', timeout: 12 },
    ];
    const r = runRoute(sim, v3(-7, 90.1, -82.5), legs, noAbilities(), 44);
    expect(r.ok, `failed at "${r.label}" at ${fmt(r.pos)}`).toBe(true);
  });

  it('dropping off the trial terrace lands on the pagoda foot (shortcut, no softlock)', () => {
    const legs: Leg[] = [
      { to: v3(34, 54, -100), jump: 'none', tol: 2.5, label: 'walk off the east edge and fall', timeout: 8 },
    ];
    const r = runRoute(sim, v3(28, 82.1, -99), legs, noAbilities(), 44);
    expect(r.ok, `failed at "${r.label}" at ${fmt(r.pos)}`).toBe(true);
  });

  it('pagoda foot → north stairs → mist landing, and the lift carries you back up', () => {
    const r = runRoute(sim, v3(34, 54.1, -101), [
      { to: v3(30, 54, -110.3), jump: 'none', label: 'pagoda foot north' },
      { to: v3(30, 48, -124), jump: 'none', label: 'stairs down to the mist landing' },
    ], noAbilities(), 44);
    expect(r.ok, `failed at "${r.label}" at ${fmt(r.pos)}`).toBe(true);
    const lift = runRoute(sim, v3(34, 54.1, -95), [
      { to: v3(32.8, 54, -90.4), jump: 'none', tol: 0.5, ignoreY: true, label: 'step onto the lift' },
      { to: v3(32.8, 82, -93.4), jump: 'none', tol: 0.6, label: 'ride up and step off', waitFor: (s) => s.platformPos('te_lift').y > 81.5, timeout: 15 },
    ], noAbilities(), 44);
    expect(lift.ok, `lift failed at "${lift.label}" at ${fmt(lift.pos)}`).toBe(true);
  });
});

describe('Region 3 — Mistfall Cloister', () => {
  const toGap: Leg[] = [
    { to: v3(27, 48, -124), jump: 'none', label: 'bridge start' },
    { to: v3(21.2, 50, -124), jump: 'none', tol: 0.5, label: 'edge of the Great Gap' },
  ];
  it('the Great Gap cannot be crossed without Cloud Step', () => {
    const r = runRoute(sim, v3(30, 48.1, -124), [...toGap, { to: v3(8, 49.4, -124), label: 'jump the gap', tol: 1.5, timeout: 4 }], noAbilities(), 30);
    expect(r.ok).toBe(false);
  });

  it('with Cloud Step: Great Gap → island → broken span → cloister', () => {
    const r = runRoute(sim, v3(30, 48.1, -124), [
      ...toGap,
      { to: v3(8, 49.4, -124), dash: true, label: 'dash across the gap', tol: 1.5 },
      { to: v3(0, 48, -124), jump: 'none', label: 'pilgrim rock' },
      { to: v3(0, 48, -129), jump: 'none', label: 'north span start' },
      { to: v3(0, 48, -147.5), label: 'broken span', timeout: 12 },
      { to: v3(-5, 48, -148.4), jump: 'none', label: 'stair top' },
      { to: v3(-24, 44, -155), jump: 'none', label: 'cloister garden' },
    ], withAb({ dash: true }), 30);
    expect(r.ok, `failed at "${r.label}" at ${fmt(r.pos)}`).toBe(true);
  });

  const stair: Leg[] = [
    { to: v3(-24, 44, -167.5), jump: 'none', label: 'foot of the hanging stair', tol: 0.6 },
    { to: v3(-24, 47.8, -170.6), double: true, label: 'ledge 1' },
    { to: v3(-19.6, 51.6, -173.6), double: true, label: 'ledge 2' },
    { to: v3(-24.4, 55.4, -176.6), double: true, label: 'ledge 3' },
    { to: v3(-22, 59.2, -181.5), double: true, label: 'hermit’s terrace' },
  ];
  it('the Hanging Stair needs Wing Unfurl', () => {
    const r = runRoute(sim, v3(-24, 44.1, -160), stair.slice(0, 2), withAb({ dash: true }), 30);
    expect(r.ok).toBe(false);
    const r2 = runRoute(sim, v3(-24, 44.1, -160), stair, withAb({ dash: true, doubleJump: true }), 30);
    expect(r2.ok, `failed at "${r2.label}" at ${fmt(r2.pos)}`).toBe(true);
  });

  it('the carved chimney needs Cicada’s Grip and leads to the Wind Gate, the well drops into the Sanctum', () => {
    const run = (ab: Abilities) => {
      const pc = new PlayerController();
      pc.abilities = ab;
      pc.body.teleport(v3(-21, 59.3, -180.5));
      const inp: PlayerFrameInput = emptyInput();
      const step = (i: Partial<PlayerFrameInput>) => {
        Object.assign(inp, emptyInput(), i);
        pc.update(DT, inp, sim.physics);
      };
      for (let k = 0; k < 20; k++) step({});
      const ok = climbChimney(sim, pc, v3(-31.5, 59, -180.5), 71.8, v3(-33.4, 72, -188.5), step, v3(0, 0, -1));
      return { ok, pc };
    };
    expect(run(withAb({ dash: true, doubleJump: true })).ok).toBe(false);
    const { ok, pc } = run(withAb({ dash: true, doubleJump: true, wallCling: true }));
    expect(ok, `chimney failed at ${fmt(pc.position)}`).toBe(true);
    // walk north into the well and fall to the Sanctum
    const r = runRoute(sim, pc.position.clone(), [
      { to: v3(-34, 16, -196), jump: 'none', reachBelowY: 18, label: 'into the well', timeout: 10 },
    ], withAb({ dash: true, doubleJump: true, wallCling: true }));
    expect(r.ok, `well failed at ${fmt(r.pos)}`).toBe(true);
  });
});

describe('Region 4 — Crimson Sanctum', () => {
  it('well floor → approach → shrine → courtyard; Bell Strike breaks the seal into the ending shaft', () => {
    const ab = withAb({ dash: true, doubleJump: true, wallCling: true });
    const r = runRoute(sim, v3(-34, 16.1, -197.5), [
      { to: v3(-27, 16, -198), jump: 'none', label: 'out through the doorway' },
      { to: v3(-22, 16, -200.5), jump: 'none', label: 'approach start' },
      { to: v3(-9.5, 16, -202.5), jump: 'none', label: 'crimson approach' },
      { to: v3(-6, 16, -213), jump: 'none', label: 'shrine' },
      { to: v3(-5.5, 16, -222), jump: 'none', label: 'bridge' },
      { to: v3(6, 16, -222), jump: 'none', label: 'courtyard' },
    ], ab, -30);
    expect(r.ok, `failed at "${r.label}" at ${fmt(r.pos)}`).toBe(true);
    // without Bell Strike the seal holds
    const noSlam = runRoute(sim, v3(6, 16.1, -222), [{ to: v3(12, 16, -222), jump: 'none', timeout: 4, label: 'stand on seal' }], ab, -30);
    expect(noSlam.ok).toBe(true);
    expect(noSlam.pos.y).toBeGreaterThan(15.5);
    const slam = runRoute(sim, v3(8, 16.1, -222), [{ to: v3(12, 16, -222), jump: 'now', slam: true, reachBelowY: 8, timeout: 6, label: 'bell strike the seal' }], { ...ab, bellStrike: true }, -30);
    expect(slam.ok, `slam failed at ${fmt(slam.pos)}`).toBe(true);
  });

  it('the thorn pool can be crossed by bouncing on lotus (pogo)', () => {
    // Pogo sequence scripted: jump onto each lotus and strike down.
    const pc = new PlayerController();
    pc.body.teleport(v3(-14.5, 16.1, -197.2));
    let pogos = 0;
    pc.hooks.aim = (air) => {
      if (!air) return null;
      const hit = sim.physics.raycast(pc.position.clone().add(v3(0, 0.3, 0)), v3(0, -1, 0), 2.8);
      return hit && hit.collider.pogo ? { kind: 'down' } : null;
    };
    const targets = [-14.5, -11.1, -7.7, -4.3, -1.6];
    let ti = 0;
    for (let f = 0; f < 60 * 12 && ti < targets.length; f++) {
      const tx = targets[ti], tz = -193.3;
      const dx = tx - pc.position.x, dz = tz - pc.position.z;
      const d = Math.hypot(dx, dz);
      const i: Partial<PlayerFrameInput> = { moveX: d > 0.15 ? dx / d : 0, moveZ: d > 0.15 ? dz / d : 0, jumpHeld: true };
      if (pc.grounded && f < 30) i.jumpPressed = true;
      if (!pc.grounded && pc.velocity.y < 0 && d < 0.9) i.attackPressed = true;
      Object.assign(i, {});
      const before = pc.velocity.y;
      pc.update(DT, { ...emptyInput(), ...i }, sim.physics);
      // emulate the game's pogo resolution: a down-slash near a pogo surface bounces
      const a = pc.attack;
      if (a && a.kind === 'downSlash' && a.t <= a.activeEnd && !a.hit.has('ground')) {
        const hit = sim.physics.raycast(pc.position.clone().add(v3(0, 0.3, 0)), v3(0, -1, 0), 1.9);
        if (hit && hit.collider.pogo) {
          a.hit.add('ground');
          pc.pogo();
          pogos++;
          ti++;
        }
      }
      void before;
      if (ti === targets.length - 1 && pc.grounded && Math.abs(pc.position.x - -1.6) < 1.4) ti++;
    }
    expect(pogos).toBeGreaterThanOrEqual(3);
    expect(Math.abs(pc.position.x - -1.6)).toBeLessThan(1.6);
    expect(pc.position.y).toBeGreaterThan(16);
  });
});
