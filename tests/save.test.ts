import { describe, expect, it, beforeEach } from 'vitest';
import { SaveSystem, newSave, sanitize, maxHealthFor } from '../src/save/SaveSystem';
import { SafeStorage } from '../src/save/storage';
import { loadSettings, saveSettings, defaultSettings } from '../src/save/Settings';

beforeEach(() => SaveSystem.erase());

describe('save system', () => {
  it('round-trips a save', () => {
    const s = newSave('shrine_terraces');
    s.abilities.dash = true;
    s.fragments.push('a', 'b', 'c');
    s.jade = 123;
    s.flags['arena:x'] = true;
    SaveSystem.write(s);
    const r = SaveSystem.load();
    expect(r.status).toBe('ok');
    expect(r.data!.shrine).toBe('shrine_terraces');
    expect(r.data!.abilities.dash).toBe(true);
    expect(r.data!.jade).toBe(123);
    expect(maxHealthFor(r.data!)).toBe(6);
  });

  it('reports none when there is no save', () => {
    expect(SaveSystem.load()).toEqual({ data: null, status: 'none' });
  });

  it('falls back to the backup when the primary is corrupted', () => {
    const a = newSave('shrine_threshold');
    a.jade = 1;
    SaveSystem.write(a);
    const b = newSave('shrine_threshold');
    b.jade = 2;
    SaveSystem.write(b);
    SafeStorage.set(SaveSystem.keys.KEY, '{"data":{"version":1,"shrine":"x","jade":999},"sum":"nope"}');
    const r = SaveSystem.load();
    expect(r.status).toBe('recovered');
    expect(r.data!.jade).toBe(1);
  });

  it('reports corrupt when both copies are unusable', () => {
    SafeStorage.set(SaveSystem.keys.KEY, 'not json');
    expect(SaveSystem.load().status).toBe('corrupt');
  });

  it('sanitises hostile or malformed fields', () => {
    const s = sanitize({
      version: 1, shrine: 'shrine_x', jade: -50, abilities: { dash: 'yes', doubleJump: true },
      fragments: ['a', 'a', 3], flags: { ok: true, bad: { x: 1 } }, moonVessels: 99, playTime: Infinity,
    });
    expect(s.jade).toBe(0);
    expect(s.abilities.dash).toBe(false);
    expect(s.abilities.doubleJump).toBe(true);
    expect(s.fragments).toEqual([]);
    expect(s.flags).toEqual({ ok: true });
    expect(s.moonVessels).toBe(3);
    expect(s.playTime).toBe(0);
    expect(() => sanitize({ version: 99, shrine: 'x' })).toThrow();
    expect(() => sanitize(null)).toThrow();
  });
});

describe('settings', () => {
  it('clamps out-of-range values and ignores wrong types', () => {
    SafeStorage.set('moyue_settings_v1', JSON.stringify({ musicVolume: 7, stickDeadzone: -1, quality: 'ultra', invertY: 'yes', buttonScale: 1.2 }));
    const s = loadSettings();
    expect(s.musicVolume).toBe(1);
    expect(s.stickDeadzone).toBe(0);
    expect(s.quality).toBe('auto');
    expect(s.invertY).toBe(false);
    expect(s.buttonScale).toBeCloseTo(1.2);
  });
  it('round-trips', () => {
    const s = defaultSettings();
    s.cameraSensitivity = 1.7;
    s.layout.jump = { x: 1, y: 2, s: 1.5 };
    saveSettings(s);
    const l = loadSettings();
    expect(l.cameraSensitivity).toBeCloseTo(1.7);
    expect(l.layout.jump).toEqual({ x: 1, y: 2, s: 1.5 });
  });
});
