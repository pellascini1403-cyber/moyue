import { Euler, Quaternion, Vector3 } from 'three';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { Collider } from '../../src/physics/Collider';
import { BuildContext } from '../../src/world/BuildContext';
import { REGIONS } from '../../src/world/regions';
import { RegionContent, RegionDef, SpawnDef } from '../../src/world/Region';
import { PlayerController, emptyInput, PlayerFrameInput } from '../../src/player/PlayerController';
import { Abilities, noAbilities } from '../../src/player/Abilities';

export const DT = 1 / 60;

interface SimPlatform {
  id: string;
  collider: Collider;
  path: Vector3[];
  speed: number;
  pause: number;
  trigger: 'always' | 'ride';
  t: number;
  dir: number;
  pauseT: number;
  total: number;
  ridden: number;
}

/**
 * Headless replica of the game world's collision: every region's static
 * colliders plus the spawn-created ones (gates, platforms, hazards, seals).
 * Used to prove the critical path is traversable with the real controller.
 */
export class SimWorld {
  readonly physics = new PhysicsWorld();
  readonly content = new Map<string, RegionContent>();
  readonly defs = new Map<string, RegionDef>();
  readonly gates = new Map<string, Collider>();
  readonly seals: Collider[] = [];
  readonly platforms: SimPlatform[] = [];
  readonly spawns: { region: string; s: SpawnDef }[] = [];

  constructor(regions: RegionDef[] = REGIONS) {
    for (const def of regions) {
      if (def.always) continue;
      const ctx = new BuildContext(this.physics, def.seed, def.id);
      const c = def.build(ctx);
      this.content.set(def.id, c);
      this.defs.set(def.id, def);
      for (const s of c.spawns) {
        this.spawns.push({ region: def.id, s });
        this.addSpawn(s);
      }
    }
  }

  private addSpawn(s: SpawnDef): void {
    const P = this.physics;
    switch (s.type) {
      case 'hazardZone':
        P.add(Collider.box(s.pos, s.half, undefined, { hazard: s.damage, walkable: s.kind !== 'abyss', camera: false, safe: false, tag: s.kind === 'abyss' ? 'abyss' : s.kind }));
        break;
      case 'thornLotus': {
        const sc = s.scale ?? 1;
        P.add(Collider.cylinder(s.pos.clone().add(new Vector3(0, 0.35 * sc, 0)), 0.55 * sc, 0.35 * sc, { hazard: 1, pogo: true, walkable: true, safe: false, camera: false, tag: 'thorns' }));
        break;
      }
      case 'gate': {
        const q = new Quaternion().setFromEuler(new Euler(0, s.yaw, 0));
        const c = P.addDynamic(Collider.box(new Vector3(s.pos.x, s.pos.y + s.height / 2, s.pos.z), new Vector3(s.width / 2, s.height / 2, 0.3), q, { walkable: false, tag: 'gate' }));
        // barriers start open (they only close during arena fights)
        c.enabled = s.kind !== 'barrier';
        this.gates.set(s.id, c);
        break;
      }
      case 'breakWall':
      case 'crackedFloor': {
        const floor = s.type === 'crackedFloor';
        const q = new Quaternion().setFromEuler(new Euler(0, floor ? 0 : s.yaw, 0));
        const half = floor ? new Vector3(s.w / 2, 0.4, s.d / 2) : new Vector3(s.w / 2, s.h / 2, s.d / 2);
        const c = P.add(Collider.box(s.pos.clone(), half, q, { walkable: floor, tag: floor ? 'crackedFloor' : 'breakWall', safe: false }));
        if (floor) this.seals.push(c);
        break;
      }
      case 'platform': {
        let total = 0;
        for (let i = 0; i < s.path.length - 1; i++) total += s.path[i].distanceTo(s.path[i + 1]);
        const c = P.addDynamic(Collider.box(s.path[0].clone().add(new Vector3(0, -0.25, 0)), new Vector3(s.w / 2, 0.25, s.d / 2), undefined, { safe: false, tag: 'platform' }));
        this.platforms.push({ id: s.id, collider: c, path: s.path, speed: s.speed, pause: s.pause ?? 0.8, trigger: s.trigger ?? 'always', t: 0, dir: 1, pauseT: 0, total, ridden: 0 });
        break;
      }
      case 'ability':
        P.add(Collider.cylinder(s.pos.clone().add(new Vector3(0, 0.5, 0)), 0.8, 0.5, { walkable: true, safe: true }));
        break;
      case 'npc':
        P.add(Collider.cylinder(s.pos.clone().add(new Vector3(0, 0.6, 0)), 0.4, 0.6, { walkable: false, camera: false }));
        break;
      case 'urn':
        P.add(Collider.cylinder(s.pos.clone().add(new Vector3(0, 0.4, 0)), 0.32, 0.4, { walkable: true, camera: false }));
        break;
      default:
        break;
    }
  }

  point(region: string, name: string): Vector3 {
    const p = this.content.get(region)?.points[name];
    if (!p) throw new Error(`no point ${region}.${name}`);
    return p.clone();
  }

  spawnOf<T extends SpawnDef['type']>(type: T, id: string): Extract<SpawnDef, { type: T }> {
    const f = this.spawns.find((x) => x.s.type === type && (x.s as { id: string }).id === id);
    if (!f) throw new Error(`no ${type} ${id}`);
    return f.s as Extract<SpawnDef, { type: T }>;
  }

  stepPlatforms(dt: number, pc: PlayerController): void {
    for (const p of this.platforms) {
      const onMe = pc.grounded && pc.body.groundCollider === p.collider;
      p.ridden = onMe ? 0 : p.ridden + dt;
      if (p.trigger === 'ride') {
        const target = onMe ? p.total : p.ridden > 1.5 ? 0 : p.t;
        const st = p.speed * dt;
        p.t = Math.abs(target - p.t) <= st ? target : p.t + Math.sign(target - p.t) * st;
      } else if (p.pauseT > 0) p.pauseT -= dt;
      else {
        p.t += p.dir * p.speed * dt;
        if (p.t >= p.total) {
          p.t = p.total;
          p.dir = -1;
          p.pauseT = p.pause;
        } else if (p.t <= 0) {
          p.t = 0;
          p.dir = 1;
          p.pauseT = p.pause;
        }
      }
      // position along path
      let d = p.t;
      const pos = new Vector3();
      for (let i = 0; i < p.path.length - 1; i++) {
        const l = p.path[i].distanceTo(p.path[i + 1]);
        if (d <= l || i === p.path.length - 2) {
          pos.lerpVectors(p.path[i], p.path[i + 1], l > 0 ? Math.min(1, d / l) : 0);
          break;
        }
        d -= l;
      }
      const prev = p.collider.center.clone();
      p.collider.center.set(pos.x, pos.y - 0.25, pos.z);
      p.collider.velocity.subVectors(p.collider.center, prev).divideScalar(dt);
      p.collider.updateAABB();
    }
  }

  breakSealsNear(p: Vector3): void {
    for (const s of this.seals) {
      if (s.enabled && Math.hypot(s.center.x - p.x, s.center.z - p.z) < 3.5 && Math.abs(s.center.y - p.y) < 2) s.enabled = false;
    }
  }

  platformPos(id: string): Vector3 {
    const p = this.platforms.find((x) => x.id === id);
    if (!p) throw new Error(`no platform ${id}`);
    return p.collider.center.clone().add(new Vector3(0, 0.25, 0));
  }
}

export interface Leg {
  to: Vector3;
  /** 'edge' = jump when the ground ends ahead or the target is higher; 'none' = walk; 'now' = jump at leg start. */
  jump?: 'edge' | 'none' | 'now';
  double?: boolean;
  dash?: boolean;
  slam?: boolean;
  /** Hold still until this returns true (e.g. a moving platform arriving). */
  waitFor?: (sim: SimWorld, pc: PlayerController) => boolean;
  /** Arrival radius (horizontal). */
  tol?: number;
  /** Arrival ignores height (e.g. stepping onto a lift that immediately rises). */
  ignoreY?: boolean;
  /** Leg succeeds when the player drops below this height instead (falls, wells). */
  reachBelowY?: number;
  timeout?: number;
  /** Keep the stick pushed while waiting for landing. */
  label?: string;
}

/** Climb a two-wall chimney: alternate wall jumps until above `topY`, then steer to `exit`. */
export function climbChimney(sim: SimWorld, pc: PlayerController, entry: Vector3, topY: number, exit: Vector3, step: (i: Partial<PlayerFrameInput>) => void, wallDir?: Vector3): boolean {
  let clung = false;
  let entered = false;
  for (let f = 0; f < 60 * 20; f++) {
    const p = pc.position;
    if (p.y > topY) {
      // steer to the exit ledge
      const dx = exit.x - p.x, dz = exit.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8 && pc.grounded) return true;
      step({ moveX: dx / (d || 1), moveZ: dz / (d || 1), jumpPressed: pc.state === 'wallSlide', jumpHeld: true });
      continue;
    }
    const onWall = pc.state === 'wallSlide';
    if (onWall) clung = true;
    const dx = entry.x - p.x, dz = entry.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const i: Partial<PlayerFrameInput> = { jumpHeld: true };
    if (!clung) {
      // head for the entry; once inside the chimney push toward the first wall
      if (d < 1.0) entered = true;
      const inside = entered;
      i.moveX = inside && wallDir ? wallDir.x : dx / d;
      i.moveZ = inside && wallDir ? wallDir.z : dz / d;
      // jump at the ledge edge
      const probe = p.clone().add(new Vector3((dx / d) * 0.6, 0.5, (dz / d) * 0.6));
      if (pc.grounded && !sim.physics.raycast(probe, new Vector3(0, -1, 0), 1.4)) i.jumpPressed = true;
    }
    if (onWall && f % 3 === 0) i.jumpPressed = true;
    step(i);
    if (pc.body.hazard?.tag === 'abyss') return false;
  }
  return false;
}

export interface RouteResult {
  ok: boolean;
  failedLeg: number;
  label: string;
  pos: Vector3;
  hazardHits: number;
  frames: number;
}

/** Autopilot that drives the real PlayerController through a list of legs. */
export function runRoute(sim: SimWorld, start: Vector3, legs: Leg[], abilities: Abilities = noAbilities(), killY = -1e9): RouteResult {
  const pc = new PlayerController();
  pc.abilities = { ...abilities };
  pc.body.teleport(start);
  pc.hooks.onSlamLand = () => sim.breakSealsNear(pc.position);
  let frames = 0;
  let hazardHits = 0;
  const inp: PlayerFrameInput = emptyInput();
  const step = (i: Partial<PlayerFrameInput>) => {
    Object.assign(inp, emptyInput(), i);
    sim.stepPlatforms(DT, pc);
    pc.update(DT, inp, sim.physics);
    frames++;
    if (pc.body.hazard) hazardHits++;
  };
  for (let k = 0; k < 20; k++) step({});
  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li];
    const label = leg.label ?? `leg ${li}`;
    // wait phase
    if (leg.waitFor) {
      let w = 0;
      while (!leg.waitFor(sim, pc) && w < 60 * 20) {
        step({});
        w++;
      }
    }
    let jumped = false;
    let jumpFrames = 0;
    let doubled = false;
    let dashed = false;
    let slammed = false;
    const tol = leg.tol ?? 0.9;
    const limit = (leg.timeout ?? 10) * 60;
    let ok = false;
    let settle = 0;
    for (let f = 0; f < limit; f++) {
      const p = pc.position;
      const dx = leg.to.x - p.x, dz = leg.to.z - p.z;
      const hd = Math.hypot(dx, dz);
      const dirX = hd > 1e-3 ? dx / hd : 0, dirZ = hd > 1e-3 ? dz / hd : 0;
      const arrived = hd < tol && pc.grounded && (leg.ignoreY || Math.abs(p.y - leg.to.y) < 1.3);
      if (leg.reachBelowY !== undefined && p.y < leg.reachBelowY) {
        ok = true;
        break;
      }
      if (arrived) {
        settle++;
        if (settle > 6) {
          ok = true;
          break;
        }
        step({});
        continue;
      }
      // slow down near the target to avoid overshooting small platforms
      const mag = hd < 1.2 && pc.grounded ? Math.max(0.35, hd / 1.2) : 1;
      const i: Partial<PlayerFrameInput> = { moveX: dirX * mag, moveZ: dirZ * mag };
      const wantJump = leg.jump ?? 'edge';
      if (!jumped && pc.grounded) {
        let doJump = false;
        if (wantJump === 'now') doJump = true;
        else if (wantJump === 'edge') {
          // ground ahead?
          const probe = p.clone().add(new Vector3(dirX * 0.75, 0.5, dirZ * 0.75));
          const hit = sim.physics.raycast(probe, new Vector3(0, -1, 0), 1.4);
          const higher = leg.to.y - p.y > 0.5 && hd < 5.5;
          if (!hit || hit.collider.hazard > 0 || higher) doJump = true;
        }
        if (doJump) {
          jumped = true;
          i.jumpPressed = true;
        }
      }
      if (jumped) {
        jumpFrames++;
        i.jumpHeld = true;
        if (leg.dash && !dashed && jumpFrames > 10 && pc.velocity.y < 4) {
          i.dashPressed = true;
          dashed = true;
        }
        if (leg.double && !doubled && jumpFrames > 12 && pc.velocity.y < 1.5 && !pc.grounded) {
          i.jumpPressed = true;
          doubled = true;
        }
        if (leg.slam && !slammed && jumpFrames > 14 && hd < 0.8 && !pc.grounded) {
          i.specialPressed = true;
          slammed = true;
        }
        if (pc.grounded && jumpFrames > 5) {
          // landed: allow another jump for the next obstacle
          jumped = false;
          jumpFrames = 0;
          doubled = false;
          dashed = false;
        }
      }
      step(i);
      if (pc.position.y < killY) break;
      if (pc.body.hazard && pc.body.hazard.tag === 'abyss') break;
    }
    if (!ok) return { ok: false, failedLeg: li, label, pos: pc.position.clone(), hazardHits, frames };
  }
  return { ok: true, failedLeg: -1, label: 'done', pos: pc.position.clone(), hazardHits, frames };
}

export function v3(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}
