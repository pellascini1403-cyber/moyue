import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PlayerController } from '../src/player/PlayerController';
import { PlayerTuning, gravityFor } from '../src/player/PlayerTuning';
import { allAbilities, noAbilities } from '../src/player/Abilities';
import { DT, box, floorWorld, run, settle } from './helpers';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

function spawn(world: PhysicsWorld, x = 0, y = 0.01, z = 0): PlayerController {
  const pc = new PlayerController();
  pc.body.teleport(new Vector3(x, y, z));
  settle(pc, world, 10);
  return pc;
}

describe('ground movement', () => {
  it('stands still on flat ground without drifting', () => {
    const w = floorWorld();
    const pc = spawn(w);
    expect(pc.grounded).toBe(true);
    const p0 = pc.position.clone();
    settle(pc, w, 120);
    expect(pc.position.distanceTo(p0)).toBeLessThan(1e-3);
    expect(pc.state).toBe('idle');
  });

  it('reaches full run speed quickly and stops quickly', () => {
    const w = floorWorld();
    const pc = spawn(w);
    let framesToFull = -1;
    run(pc, w, 30, () => ({ moveX: 1 }), (f) => {
      if (framesToFull < 0 && pc.horizontalSpeed >= PlayerTuning.runSpeed * 0.99) framesToFull = f + 1;
    });
    expect(framesToFull).toBeGreaterThan(0);
    expect(framesToFull * DT).toBeLessThan(0.15);
    const xAtRelease = pc.position.x;
    let framesToStop = -1;
    run(pc, w, 30, () => ({}), (f) => {
      if (framesToStop < 0 && pc.horizontalSpeed < 0.01) framesToStop = f + 1;
    });
    expect(framesToStop * DT).toBeLessThan(0.12);
    expect(pc.position.x - xAtRelease).toBeLessThan(0.5);
  });

  it('walks up and down a 25° ramp without sliding when idle', () => {
    const w = floorWorld();
    // ramp rising along +x
    const ang = (25 * Math.PI) / 180;
    const len = 10;
    box(w, 3 + Math.cos(ang) * len / 2, Math.sin(ang) * len / 2 - 0.5 / Math.cos(ang), 0, len / 2, 0.5, 3, {}, { z: ang });
    const pc = spawn(w);
    let maxY = 0;
    let airborneOnRamp = 0;
    run(pc, w, 70, () => ({ moveX: 1 }), () => {
      maxY = Math.max(maxY, pc.position.y);
      if (!pc.grounded) airborneOnRamp++;
    });
    expect(maxY).toBeGreaterThan(1.5);
    expect(airborneOnRamp).toBeLessThan(3);
    settle(pc, w, 20);
    const p = pc.position.clone();
    settle(pc, w, 120);
    expect(pc.grounded).toBe(true);
    expect(pc.position.distanceTo(p)).toBeLessThan(0.05);
  });

  it('steps onto a small ledge automatically', () => {
    const w = floorWorld();
    box(w, 5, 0.15, 0, 2, 0.15, 3); // 0.3 m step
    const pc = spawn(w);
    let airborne = 0;
    run(pc, w, 40, () => ({ moveX: 1 }), () => { if (!pc.grounded) airborne++; });
    expect(pc.position.x).toBeGreaterThan(4);
    expect(pc.position.y).toBeGreaterThan(0.29);
    expect(airborne).toBe(0);
  });

  it('is blocked by walls', () => {
    const w = floorWorld();
    box(w, 3, 2, 0, 0.5, 2, 5);
    const pc = spawn(w);
    run(pc, w, 90, () => ({ moveX: 1 }));
    expect(pc.position.x).toBeLessThan(2.5 - PlayerTuning.radius + 0.02);
    expect(pc.position.x).toBeGreaterThan(2.0);
  });
});

describe('jumping', () => {
  it('full jump reaches the tuned height', () => {
    const w = floorWorld();
    const pc = spawn(w);
    let maxY = 0;
    run(pc, w, 60, (f) => ({ jumpPressed: f === 0, jumpHeld: true }), () => (maxY = Math.max(maxY, pc.position.y)));
    // apex hang makes it slightly higher than nominal
    expect(maxY).toBeGreaterThan(PlayerTuning.jumpHeight * 0.95);
    expect(maxY).toBeLessThan(PlayerTuning.jumpHeight * 1.25);
    // clearly higher than the original 2.55 m jump (which peaked at ≈ 2.5 m)
    expect(maxY).toBeGreaterThan(3.1);
  });

  it('the higher jump keeps the original gravity (it does not feel heavier or faster)', () => {
    const pc = new PlayerController();
    const g0 = gravityFor(2.55, 0.36);
    expect(Math.abs(pc.gravity - g0) / g0).toBeLessThan(0.01);
  });

  it('a quick tap still gives a useful hop', () => {
    const w = floorWorld();
    const pc = spawn(w);
    let maxY = 0;
    run(pc, w, 60, (f) => ({ jumpPressed: f === 0, jumpHeld: f < 1 }), () => (maxY = Math.max(maxY, pc.position.y)));
    expect(maxY).toBeGreaterThan(1.2);
    expect(maxY).toBeLessThan(1.8);
  });

  it('tap jump is much lower than held jump (variable height)', () => {
    const w = floorWorld();
    const pc = spawn(w);
    let maxY = 0;
    run(pc, w, 60, (f) => ({ jumpPressed: f === 0, jumpHeld: f < 3 }), () => (maxY = Math.max(maxY, pc.position.y)));
    expect(maxY).toBeLessThan(PlayerTuning.jumpHeight * 0.6);
    expect(maxY).toBeGreaterThan(0.4);
  });

  it('coyote time allows a jump shortly after leaving a ledge', () => {
    const w = new PhysicsWorld();
    box(w, 0, -0.5, 0, 3, 0.5, 3); // platform x in [-3,3]
    const pc = spawn(w, 2.5);
    let leftAt = -1;
    let jumped = false;
    let maxY = 0;
    run(pc, w, 40, (f) => {
      const airborne = !pc.grounded;
      if (airborne && leftAt < 0) leftAt = f;
      const press = leftAt >= 0 && f === leftAt + 4 && !jumped; // ~66 ms after leaving
      if (press) jumped = true;
      return { moveX: 1, jumpPressed: press, jumpHeld: true };
    }, () => (maxY = Math.max(maxY, pc.position.y)));
    expect(leftAt).toBeGreaterThan(-1);
    expect(maxY).toBeGreaterThan(1.5); // the late jump still happened
  });

  it('jump buffer triggers a jump pressed just before landing', () => {
    const w = floorWorld();
    const pc = new PlayerController();
    pc.body.teleport(new Vector3(0, 3, 0));
    let pressFrame = -1;
    let jumpedAfterLanding = false;
    pc.hooks.onJump = () => (jumpedAfterLanding = true);
    run(pc, w, 90, (f) => {
      // press when about 0.25 m above ground and falling
      const press = pressFrame < 0 && pc.velocity.y < 0 && pc.position.y < 0.35 && pc.position.y > 0.05;
      if (press) pressFrame = f;
      return { jumpPressed: press, jumpHeld: true };
    });
    expect(pressFrame).toBeGreaterThan(-1);
    expect(jumpedAfterLanding).toBe(true);
  });

  it('horizontal running jump distance is ~4 m or more', () => {
    const w = new PhysicsWorld();
    box(w, -10, -0.5, 0, 10, 0.5, 3); // x in [-20, 0]
    box(w, 30, -30.5, 0, 50, 0.5, 50); // deep floor
    const pc = spawn(w, -8);
    let takeoffX = 0;
    let landX = 0;
    let jumped = false;
    run(pc, w, 200, (f) => {
      const press = !jumped && pc.position.x > -0.25 && pc.grounded;
      if (press) {
        jumped = true;
        takeoffX = pc.position.x;
      }
      return { moveX: 1, jumpPressed: press, jumpHeld: true };
    }, () => {
      if (jumped && landX === 0 && pc.position.y <= 0 && pc.velocity.y < 0) landX = pc.position.x;
    });
    expect(landX - takeoffX).toBeGreaterThan(5.3);
  });
});

describe('forward dash', () => {
  /** Distance covered by one dash from standing, facing +x. */
  function dashDistance(ab = noAbilities()): { d: number; pc: PlayerController } {
    const w = floorWorld();
    const pc = spawn(w);
    pc.abilities = ab;
    pc.facing = Math.PI / 2;
    const x0 = pc.position.x;
    run(pc, w, 20, (f) => ({ dashPressed: f === 0 }));
    return { d: pc.position.x - x0, pc };
  }

  it('is available from the start and goes forward ≈ 4.3 m', () => {
    const { d, pc } = dashDistance();
    expect(d).toBeGreaterThan(4.0);
    expect(d).toBeLessThan(5.0);
    expect(Math.abs(pc.position.z)).toBeLessThan(1e-3);
  });

  it('once per airtime, and it holds its height while it lasts', () => {
    const w = floorWorld();
    const pc = spawn(w);
    let dashes = 0;
    pc.hooks.onDash = () => dashes++;
    const ys: number[] = [];
    run(pc, w, 70, (f) => ({ moveX: 1, jumpPressed: f === 0, jumpHeld: true, dashPressed: f === 20 || f === 32 || f === 44 }), () => {
      if (pc.state === 'dash') ys.push(pc.position.y);
    });
    expect(dashes).toBe(1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.01);
  });

  it('Cloud Step makes it longer and untouchable', () => {
    const base = dashDistance().d;
    const { d, pc } = dashDistance({ ...noAbilities(), dash: true });
    expect(d).toBeGreaterThan(base + 0.7);
    // invulnerable during a Cloud Step dash, not during a plain one
    const w = floorWorld();
    const p1 = spawn(w);
    run(p1, w, 3, (f) => ({ dashPressed: f === 0 }));
    expect(p1.invulnerable).toBe(false);
    const p2 = spawn(w);
    p2.abilities = { ...noAbilities(), dash: true };
    run(p2, w, 3, (f) => ({ dashPressed: f === 0 }));
    expect(p2.invulnerable).toBe(true);
    void pc;
  });

  it('stops at walls: no tunnelling through a thin wall', () => {
    const w = floorWorld();
    box(w, 1.5, 1, 0, 0.08, 1, 3); // 16 cm thick wall at x = 1.5
    const pc = spawn(w);
    pc.facing = Math.PI / 2;
    run(pc, w, 20, (f) => ({ dashPressed: f === 0, moveX: 1 }));
    expect(pc.position.x).toBeLessThan(1.5 - 0.08 - PlayerTuning.radius + 0.02);
  });

  it('dashing off a ledge carries on, then falls; the air dash is still there', () => {
    const w = new PhysicsWorld();
    box(w, -5, -0.5, 0, 5, 0.5, 3); // ledge ends at x = 0
    box(w, 20, -8.5, 0, 30, 0.5, 30); // floor 8 m below
    const pc = spawn(w, -1.5);
    pc.facing = Math.PI / 2;
    let dashes = 0;
    pc.hooks.onDash = () => dashes++;
    let offX = 0, minY = 0;
    run(pc, w, 12, (f) => ({ moveX: 1, dashPressed: f === 0 }), () => {
      if (pc.state === 'dash' && !pc.grounded) {
        offX = pc.position.x;
        minY = Math.min(minY, pc.position.y);
      }
    });
    expect(offX).toBeGreaterThan(2); // carried on past the edge…
    expect(minY).toBeGreaterThan(-0.01); // …level while dashing
    run(pc, w, 40, (f) => ({ moveX: 1, dashPressed: f === 26 })); // after the 0.4 s cooldown
    expect(pc.position.y).toBeLessThan(-0.5); // then fell
    expect(dashes).toBe(2); // and the air dash was still available
  });

  it('jump + air dash crosses a 7 m gap that a jump alone cannot', () => {
    const cross = (dash: boolean) => {
      const w = new PhysicsWorld();
      box(w, -10, -0.5, 0, 10, 0.5, 3); // x ≤ 0
      box(w, 17, -0.5, 0, 10, 0.5, 3); // x ≥ 7
      const pc = spawn(w, -6);
      let jumped = false;
      run(pc, w, 150, (f) => {
        const press = !jumped && pc.position.x > -0.3 && pc.grounded;
        if (press) jumped = true;
        return { moveX: 1, jumpPressed: press, jumpHeld: true, dashPressed: dash && jumped && !pc.grounded && pc.velocity.y < 1 && pc.state !== 'dash' };
      });
      return pc.position.y > -0.2 && pc.position.x > 7;
    };
    expect(cross(false)).toBe(false);
    expect(cross(true)).toBe(true);
  });
});

describe('abilities', () => {
  it('double jump adds height', () => {
    const w = floorWorld();
    const pc = spawn(w);
    pc.abilities = allAbilities();
    let maxY = 0;
    run(pc, w, 90, (f) => ({ jumpPressed: f === 0 || f === 20, jumpHeld: true }), () => (maxY = Math.max(maxY, pc.position.y)));
    expect(maxY).toBeGreaterThan(PlayerTuning.jumpHeight + 1.5);
  });

  it('wall cling slows descent and wall jump pushes away from climbable walls', () => {
    const w = floorWorld();
    box(w, 2, 6, 0, 0.5, 6, 4, { climbable: true });
    const pc = spawn(w);
    pc.abilities = allAbilities();
    let clung = false;
    run(pc, w, 40, (f) => ({ moveX: 1, jumpPressed: f === 0, jumpHeld: true }), () => {
      if (pc.state === 'wallSlide') clung = true;
    });
    expect(clung).toBe(true);
    expect(pc.state).toBe('wallSlide');
    expect(pc.velocity.y).toBeGreaterThanOrEqual(-PlayerTuning.wallSlideSpeed - 1e-6);
    const x = pc.position.x;
    const y = pc.position.y;
    run(pc, w, 12, (f) => ({ moveX: 1, jumpPressed: f === 0, jumpHeld: true }));
    expect(pc.position.x).toBeLessThan(x - 0.5);
    expect(pc.position.y).toBeGreaterThan(y + 0.5);
  });

  it('does not cling to walls that are not climbable', () => {
    const w = floorWorld();
    box(w, 2, 6, 0, 0.5, 6, 4);
    const pc = spawn(w);
    pc.abilities = allAbilities();
    let clung = false;
    run(pc, w, 60, (f) => ({ moveX: 1, jumpPressed: f === 0, jumpHeld: true }), () => {
      if (pc.state === 'wallSlide') clung = true;
    });
    expect(clung).toBe(false);
  });
});

describe('moving platforms', () => {
  it('carries a standing player', () => {
    const w = new PhysicsWorld();
    const plat = box(w, 0, -0.5, 0, 2, 0.5, 2);
    w.remove(plat);
    w.addDynamic(plat);
    const pc = spawn(w);
    const x0 = pc.position.x;
    for (let i = 0; i < 60; i++) {
      plat.velocity.set(2, 0, 0);
      plat.center.x += 2 * DT;
      plat.updateAABB();
      pc.update(DT, { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, attackPressed: false, attackHeld: false, dashPressed: false, specialPressed: false, specialHeld: false, interactPressed: false }, w);
    }
    expect(pc.grounded).toBe(true);
    expect(pc.position.x - x0).toBeGreaterThan(1.8);
  });
});

describe('ramps', () => {
  it('walks over a ramp crest without launching', () => {
    const w = floorWorld();
    const ang = (25 * Math.PI) / 180;
    // ramp from x=3..~12 then a plateau
    const len = 10;
    const topY = Math.sin(ang) * len;
    box(w, 3 + Math.cos(ang) * len / 2, topY / 2 - 0.5 / Math.cos(ang), 0, len / 2, 0.5, 3, {}, { z: ang });
    box(w, 3 + Math.cos(ang) * len + 5, topY / 2, 0, 5, topY / 2, 3);
    const pc = spawn(w);
    let air = 0;
    run(pc, w, 180, () => ({ moveX: 1 }), () => { if (!pc.grounded) air++; });
    expect(pc.position.y).toBeGreaterThan(topY - 0.1);
    expect(air).toBeLessThan(4);
  });
});

describe('non-walkable tops', () => {
  it('slides off a non-walkable roof instead of perching on it', () => {
    const w = floorWorld();
    box(w, 0, 3, 0, 2, 0.5, 2, { walkable: false });
    const pc = new PlayerController();
    pc.body.teleport(new Vector3(0.3, 4, 0.2));
    settle(pc, w, 120);
    expect(pc.position.y).toBeLessThan(0.1);
    expect(pc.grounded).toBe(true);
  });
});

describe('wall-jump chimney', () => {
  it('climbs between two facing climbable walls by alternating wall jumps', () => {
    const w = floorWorld();
    // two walls 2.4 m apart, 14 m tall
    box(w, -1.6, 7, 0, 0.4, 7, 3, { climbable: true });
    box(w, 1.6, 7, 0, 0.4, 7, 3, { climbable: true });
    const pc = spawn(w, 0.5, 0.01, 0);
    pc.abilities = allAbilities();
    let maxY = 0;
    let clung = false;
    run(pc, w, 600, (f) => {
      // jump towards the +x wall holding into it; afterwards only press jump whenever clinging
      const onWall = pc.state === 'wallSlide';
      if (onWall) clung = true;
      return { moveX: clung ? 0 : 1, jumpPressed: f === 0 || (onWall && f % 4 === 0), jumpHeld: true };
    }, () => (maxY = Math.max(maxY, pc.position.y)));
    expect(maxY).toBeGreaterThan(10);
  });
});
