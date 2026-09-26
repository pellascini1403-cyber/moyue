import { Box3, Color, Vector3 } from 'three';
import { BuildContext } from './BuildContext';
import { CameraZone } from '../camera/CameraRig';
import { AmbientSpec } from '../fx/AmbientParticles';
import { GradeParams } from '../fx/Renderer';
import { AbilityId } from '../player/Abilities';

export interface Atmosphere {
  background: number;
  fogColor: number;
  fogDensity: number;
  fogLow: number;
  fogHeight: number;
  fogFalloff: number;
  fogHeightDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  keyColor: number;
  keyIntensity: number;
  keyDir: [number, number, number];
  grade?: Partial<Omit<GradeParams, 'lift' | 'gain'>> & { lift?: [number, number, number]; gain?: [number, number, number] };
  particles: AmbientSpec[];
  music: string;
  ambience: string;
}

export type EnemyKind = 'inkMite' | 'lanternWisp' | 'shieldback' | 'silkDropper' | 'censerWarden' | 'tollingAbbot';

export type SpawnDef =
  | { type: 'enemy'; id: string; kind: EnemyKind; pos: Vector3; yaw?: number; leash?: number; patrol?: Vector3[]; arena?: string }
  | { type: 'shrine'; id: string; pos: Vector3; yaw: number; name: string }
  | { type: 'stele'; id: string; pos: Vector3; yaw: number; loreId: string }
  | { type: 'ability'; id: string; pos: Vector3; yaw: number; ability: AbilityId; arena?: string }
  | { type: 'fragment'; id: string; pos: Vector3 }
  | { type: 'jade'; id: string; pos: Vector3; amount: number }
  | { type: 'urn'; id: string; pos: Vector3; jade: number }
  | { type: 'npc'; id: string; pos: Vector3; yaw: number; npc: string }
  | { type: 'lever'; id: string; pos: Vector3; yaw: number; gate: string }
  | { type: 'gate'; id: string; pos: Vector3; yaw: number; width: number; height: number; kind: 'portcullis' | 'sealDoor' | 'barrier' }
  | { type: 'breakWall'; id: string; pos: Vector3; yaw: number; w: number; h: number; d: number }
  | { type: 'crackedFloor'; id: string; pos: Vector3; w: number; d: number }
  | { type: 'platform'; id: string; path: Vector3[]; w: number; d: number; speed: number; pause?: number; style?: 'lantern' | 'stone' | 'lift'; trigger?: 'always' | 'ride' }
  | { type: 'hazardZone'; id: string; pos: Vector3; half: Vector3; damage: number; kind: 'thorns' | 'pool' | 'abyss' }
  | { type: 'thornLotus'; id: string; pos: Vector3; scale?: number }
  | { type: 'trigger'; id: string; pos: Vector3; half: Vector3; event: string; once?: boolean }
  | { type: 'arena'; id: string; pos: Vector3; half: Vector3; gates: string[]; waves: string[][]; music?: string; reward?: string; boss?: string }
  | { type: 'hint'; id: string; pos: Vector3; radius: number; text: string; requires?: AbilityId; when?: AbilityId; onlyTouch?: boolean }
  | { type: 'bell'; id: string; pos: Vector3 };

export interface RegionContent {
  spawns: SpawnDef[];
  cameraZones: { box: Box3; zone: CameraZone }[];
  /** Named points (spawn, cinematic cameras...). */
  points: Record<string, Vector3>;
  /** Map rooms: rectangles on the XZ plane for the map screen. */
  rooms: { id: string; name: string; min: [number, number]; max: [number, number]; y: number }[];
}

export interface RegionDef {
  id: string;
  name: string;
  hanzi: string;
  subtitle: string;
  /** Rough bounds used for region detection & streaming. */
  bounds: Box3;
  killY: number;
  atmosphere: Atmosphere;
  seed: number;
  /** Max camera distance (to bounds) at which this region is drawn. Default 95 m. */
  viewDistance?: number;
  /** Extra camera volumes from which the region is always drawn (e.g. a shaft looking down into it). */
  viewFrom?: Box3[];
  /** Always-visible scenery (the great cavern shell); never the "current" region. */
  always?: boolean;
  build(ctx: BuildContext): RegionContent;
}

export function v(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

export function box3(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Box3 {
  return new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));
}

export function color(hex: number): Color {
  return new Color(hex);
}
