import { Vector3 } from 'three';
import { BuildContext, Placer } from '../BuildContext';
import { SpawnDef, v } from '../Region';
import { stonePlatform, rockPillar, stairs, archBridge, hangingLantern, stoneLantern } from '../../art/geo/structures';
import { boulder } from '../../art/geo/nature';
import { WorldMatKey } from '../../art/materials';

/** Accumulates spawns and map rooms while a region is built. */
export class RegionBuilder {
  readonly spawns: SpawnDef[] = [];
  readonly W: Placer;
  private n = 0;
  constructor(public ctx: BuildContext, public prefix: string) {
    this.W = ctx.place(0, 0, 0, 0);
  }
  id(tag: string): string {
    return `${this.prefix}_${tag}_${this.n++}`;
  }
  add(s: SpawnDef): SpawnDef {
    this.spawns.push(s);
    return s;
  }
  enemy(kind: Extract<SpawnDef, { type: 'enemy' }>['kind'], x: number, y: number, z: number, yaw = 0, id?: string, arena?: string): string {
    const eid = id ?? this.id(kind);
    this.add({ type: 'enemy', id: eid, kind, pos: v(x, y, z), yaw, arena });
    return eid;
  }
  /** `requires`: shown only while the ability is missing. `when`: shown only once it is owned. */
  hint(x: number, y: number, z: number, radius: number, text: string, requires?: Extract<SpawnDef, { type: 'hint' }>['requires'], when?: Extract<SpawnDef, { type: 'hint' }>['when']): void {
    this.add({ type: 'hint', id: this.id('hint'), pos: v(x, y, z), radius, text, requires, when });
  }
  urn(x: number, y: number, z: number, jade = 6): void {
    this.add({ type: 'urn', id: this.id('urn'), pos: v(x, y, z), jade });
  }
  abyss(cx: number, cy: number, cz: number, hx: number, hz: number, depth = 4): void {
    this.add({ type: 'hazardZone', id: this.id('abyss'), pos: v(cx, cy - depth / 2, cz), half: v(hx, depth / 2, hz), damage: 1, kind: 'abyss' });
  }
}

/** Flat walkable slab with a rock skirt going down into the dark (floating-island feel). */
export function ledge(P: Placer, x: number, y: number, z: number, w: number, d: number, o: { mat?: WorldMatKey; depth?: number; rocks?: boolean; seed?: number } = {}): void {
  stonePlatform(P, x, y, z, w, d, 1.2, { mat: o.mat ?? 'stone', collide: { safe: true } });
  const depth = o.depth ?? 10;
  // rocky underside
  P.box('rockDark', x, y - 1.2 - depth / 2, z, w * 0.85, depth, d * 0.85, { ao: { y0: P.origin.y + y - depth - 1.2, y1: P.origin.y + y - 1.2, min: 0.15 } });
  if (o.rocks !== false) {
    const s = o.seed ?? Math.floor(x * 3 + z * 5);
    boulder(P, x - w * 0.42, y - 1.6, z + d * 0.3, Math.min(w, d) * 0.5, s, { mat: 'rockDark', squash: 1 });
    boulder(P, x + w * 0.4, y - 2.2, z - d * 0.35, Math.min(w, d) * 0.6, s + 1, { mat: 'rockDark', squash: 1 });
  }
}

export function pillarStep(P: Placer, x: number, y: number, z: number, r: number, depth = 16, seed?: number): void {
  rockPillar(P, x, y, z, r, depth, { seed, moss: true });
}

export function stairFlight(P: Placer, from: Vector3, to: Vector3, width: number, sides = false): void {
  // build a flight that climbs from `from` (low) to `to` (high)
  const dx = to.x - from.x, dz = to.z - from.z;
  const run = Math.hypot(dx, dz);
  const rise = to.y - from.y;
  const yaw = Math.atan2(dx, dz);
  const S = P.ctx.place(from.x, 0, from.z, yaw);
  stairs(S, 0, from.y, 0, width, run, rise, { sides });
}

export function bridgeBetween(P: Placer, from: Vector3, to: Vector3, o: Parameters<typeof archBridge>[5] = {}): ReturnType<typeof archBridge> {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const S = P.ctx.place(from.x, 0, from.z, yaw);
  return archBridge(S, 0, from.y, 0, len, o);
}

export { hangingLantern, stoneLantern, v };
