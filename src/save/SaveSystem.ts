import { Abilities, noAbilities } from '../player/Abilities';
import { SafeStorage } from './storage';

export const SAVE_VERSION = 1;
const KEY = 'moyue_save_v1';
const BACKUP = 'moyue_save_v1_bak';

export type FlagValue = boolean | number | string;

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  playTime: number;
  /** Shrine the player respawns at. */
  shrine: string;
  abilities: Abilities;
  /** Moon fragment ids collected (every 3 → +1 max lantern). */
  fragments: string[];
  jade: number;
  flags: Record<string, FlagValue>;
  /** Pickups / urns / walls consumed permanently. */
  consumed: string[];
  visitedRooms: string[];
  loreRead: string[];
  moonVessels: number;
  deaths: number;
  /** Jade dropped where the player last died (recoverable). */
  lostJade: { amount: number; x: number; y: number; z: number } | null;
}

export function newSave(startShrine: string): SaveData {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    playTime: 0,
    shrine: startShrine,
    abilities: noAbilities(),
    fragments: [],
    jade: 0,
    flags: {},
    consumed: [],
    visitedRooms: [],
    loreRead: [],
    moonVessels: 0,
    deaths: 0,
    lostJade: null,
  };
}

export const BASE_HEALTH = 5;
export function maxHealthFor(s: SaveData): number {
  return BASE_HEALTH + Math.floor(s.fragments.length / 3);
}
export function maxMoonlightFor(s: SaveData): number {
  return 99 + s.moonVessels * 33;
}

function fnv(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

interface Envelope {
  data: SaveData;
  sum: string;
}

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Validate + sanitise untrusted JSON into a SaveData (throws when unusable). */
export function sanitize(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('not an object');
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number' || r.version > SAVE_VERSION) throw new Error('bad version');
  if (typeof r.shrine !== 'string' || !r.shrine) throw new Error('bad shrine');
  const base = newSave(r.shrine);
  const ab = noAbilities();
  if (r.abilities && typeof r.abilities === 'object') {
    for (const k of Object.keys(ab) as (keyof Abilities)[]) {
      ab[k] = (r.abilities as Record<string, unknown>)[k] === true;
    }
  }
  const num = (v: unknown, d: number, lo = 0, hi = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const flags: Record<string, FlagValue> = {};
  if (r.flags && typeof r.flags === 'object') {
    for (const [k, v] of Object.entries(r.flags as Record<string, unknown>)) {
      if (typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) flags[k] = v;
    }
  }
  let lost: SaveData['lostJade'] = null;
  const lj = r.lostJade as Record<string, unknown> | null | undefined;
  if (lj && typeof lj === 'object' && [lj.amount, lj.x, lj.y, lj.z].every((x) => typeof x === 'number' && Number.isFinite(x as number))) {
    lost = { amount: lj.amount as number, x: lj.x as number, y: lj.y as number, z: lj.z as number };
  }
  return {
    ...base,
    version: SAVE_VERSION,
    createdAt: num(r.createdAt, base.createdAt),
    updatedAt: num(r.updatedAt, base.updatedAt),
    playTime: num(r.playTime, 0),
    abilities: ab,
    fragments: isStrArr(r.fragments) ? [...new Set(r.fragments)] : [],
    jade: Math.floor(num(r.jade, 0, 0, 999999)),
    flags,
    consumed: isStrArr(r.consumed) ? [...new Set(r.consumed)] : [],
    visitedRooms: isStrArr(r.visitedRooms) ? [...new Set(r.visitedRooms)] : [],
    loreRead: isStrArr(r.loreRead) ? [...new Set(r.loreRead)] : [],
    moonVessels: Math.floor(num(r.moonVessels, 0, 0, 3)),
    deaths: Math.floor(num(r.deaths, 0)),
    lostJade: lost,
  };
}

function parseEnvelope(text: string | null): SaveData | null {
  if (!text) return null;
  try {
    const env = JSON.parse(text) as Envelope;
    if (!env || typeof env !== 'object' || !env.data) return null;
    const body = JSON.stringify(env.data);
    if (fnv(body) !== env.sum) return null;
    return sanitize(env.data);
  } catch {
    return null;
  }
}

export interface LoadResult {
  data: SaveData | null;
  /** 'ok' | 'none' | 'recovered' (primary corrupt, backup used) | 'corrupt' (both unusable) */
  status: 'ok' | 'none' | 'recovered' | 'corrupt';
}

/**
 * Persistent save with integrity checks. Every write keeps the previous good
 * save as a backup; a corrupted primary falls back to the backup.
 */
export const SaveSystem = {
  load(): LoadResult {
    const primaryText = SafeStorage.get(KEY);
    const primary = parseEnvelope(primaryText);
    if (primary) return { data: primary, status: 'ok' };
    const backup = parseEnvelope(SafeStorage.get(BACKUP));
    if (backup) return { data: backup, status: primaryText ? 'recovered' : 'recovered' };
    if (primaryText) return { data: null, status: 'corrupt' };
    return { data: null, status: 'none' };
  },

  write(data: SaveData): boolean {
    data.updatedAt = Date.now();
    const body = JSON.stringify(data);
    const env: Envelope = { data, sum: fnv(body) };
    const prev = SafeStorage.get(KEY);
    if (prev && parseEnvelope(prev)) SafeStorage.set(BACKUP, prev);
    return SafeStorage.set(KEY, JSON.stringify(env));
  },

  exists(): boolean {
    return SaveSystem.load().data !== null;
  },

  erase(): void {
    SafeStorage.remove(KEY);
    SafeStorage.remove(BACKUP);
  },

  keys: { KEY, BACKUP },
};
