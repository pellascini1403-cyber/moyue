import { SafeStorage } from './storage';

export type TouchButtonId = 'jump' | 'attack' | 'dash' | 'special' | 'interact' | 'lock';
export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface ButtonLayout {
  /** Centre offset from the bottom-right safe corner, in control units. */
  x: number;
  y: number;
  /** Size multiplier. */
  s: number;
}

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  quality: Quality;
  cameraSensitivity: number;
  invertY: boolean;
  autoCamera: boolean;
  cameraDistance: number;
  stickDeadzone: number;
  stickSensitivity: number;
  floatingStick: boolean;
  buttonScale: number;
  buttonOpacity: number;
  slideBetweenButtons: boolean;
  layout: Partial<Record<TouchButtonId, ButtonLayout>>;
  screenShake: number;
  haptics: boolean;
  showHints: boolean;
  showFps: boolean;
}

export const DEFAULT_LAYOUT: Record<TouchButtonId, ButtonLayout> = {
  jump: { x: 1.2, y: 1.15, s: 1.4 },
  attack: { x: 2.95, y: 0.95, s: 1.3 },
  dash: { x: 2.55, y: 2.6, s: 1.02 },
  special: { x: 1.0, y: 2.85, s: 1.0 },
  interact: { x: 4.45, y: 2.3, s: 0.95 },
  lock: { x: 4.3, y: 0.9, s: 0.78 },
};

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.85,
    musicVolume: 0.65,
    sfxVolume: 0.9,
    ambienceVolume: 0.75,
    quality: 'auto',
    cameraSensitivity: 1,
    invertY: false,
    autoCamera: true,
    cameraDistance: 1,
    stickDeadzone: 0.12,
    stickSensitivity: 1,
    floatingStick: true,
    buttonScale: 1,
    buttonOpacity: 0.8,
    slideBetweenButtons: true,
    layout: {},
    screenShake: 1,
    haptics: true,
    showHints: true,
    showFps: false,
  };
}

const KEY = 'moyue_settings_v1';

export function loadSettings(): Settings {
  const d = defaultSettings();
  const raw = SafeStorage.get(KEY);
  if (!raw) return d;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const out: Settings = { ...d };
    for (const k of Object.keys(d) as (keyof Settings)[]) {
      const v = parsed[k];
      if (v === undefined || v === null) continue;
      if (typeof v !== typeof d[k]) continue;
      (out as unknown as Record<string, unknown>)[k] = v;
    }
    // sanitise numbers
    const clampN = (v: number, lo: number, hi: number, def: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
    out.masterVolume = clampN(out.masterVolume, 0, 1, d.masterVolume);
    out.musicVolume = clampN(out.musicVolume, 0, 1, d.musicVolume);
    out.sfxVolume = clampN(out.sfxVolume, 0, 1, d.sfxVolume);
    out.ambienceVolume = clampN(out.ambienceVolume, 0, 1, d.ambienceVolume);
    out.cameraSensitivity = clampN(out.cameraSensitivity, 0.2, 3, 1);
    out.cameraDistance = clampN(out.cameraDistance, 0.7, 1.4, 1);
    out.stickDeadzone = clampN(out.stickDeadzone, 0, 0.45, d.stickDeadzone);
    out.stickSensitivity = clampN(out.stickSensitivity, 0.5, 2, 1);
    out.buttonScale = clampN(out.buttonScale, 0.6, 1.6, 1);
    out.buttonOpacity = clampN(out.buttonOpacity, 0.15, 1, d.buttonOpacity);
    out.screenShake = clampN(out.screenShake, 0, 1.5, 1);
    if (!['auto', 'low', 'medium', 'high'].includes(out.quality)) out.quality = 'auto';
    if (typeof out.layout !== 'object' || Array.isArray(out.layout)) out.layout = {};
    return out;
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  SafeStorage.set(KEY, JSON.stringify(s));
}

export function layoutFor(s: Settings, id: TouchButtonId): ButtonLayout {
  const l = s.layout[id];
  if (l && Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.s)) return l;
  return DEFAULT_LAYOUT[id];
}
