import { RegionDef, box3 } from '../Region';
import { cavernWall, cavernCeiling, inkBackdrop, lightShaft } from '../../art/geo/nature';
import { chainLine } from '../../art/geo/props';
import { hangingLantern } from '../../art/geo/structures';
import { Vector3 } from 'three';
import { Rng } from '../../core/rng';

/**
 * The great cavern that contains the whole descent: an enormous rock shell,
 * a dome of stalactites lost in darkness, ink-wash spires in the far distance
 * and lantern chains strung across the void.
 */
export const Backdrop: RegionDef = {
  id: 'backdrop',
  name: 'The Great Hollow',
  hanzi: '大渊',
  subtitle: '',
  bounds: box3(-400, -200, -500, 400, 400, 300),
  killY: -500,
  seed: 11,
  always: true,
  atmosphere: {
    background: 0x05070b, fogColor: 0x0b1220, fogDensity: 0.01, fogLow: 0x122030, fogHeight: 0, fogFalloff: 30, fogHeightDensity: 0.02,
    hemiSky: 0x506a90, hemiGround: 0x140e12, hemiIntensity: 2, keyColor: 0x9fb8e0, keyIntensity: 1.5, keyDir: [0.3, 1, 0.2],
    particles: [], music: 'threshold', ambience: 'cave',
  },
  build(ctx) {
    const W = ctx.place(0, 0, 0, 0);
    // One colossal cavern around everything
    cavernWall(ctx, -5, 40, -130, 175, 330, 5, 'rockDark');
    cavernCeiling(ctx, -5, 200, -130, 175, 9, 70);
    // Distant ink-wash spires (parallax layers)
    inkBackdrop(ctx, -5, 0, -130, [
      { radius: 165, height: 190, color: 0x121c2a, opacity: 0.85, seed: 3, y: 10, repeat: 4 },
      { radius: 150, height: 150, color: 0x1a2a3c, opacity: 0.7, seed: 7, y: -10, repeat: 5 },
      { radius: 135, height: 110, color: 0x22384c, opacity: 0.55, seed: 13, y: -30, spiky: false, repeat: 3 },
    ]);
    // A pale shaft of the world above falling onto the great pagoda
    lightShaft(ctx, 48, 190, -118, 26, 150, 0x9ec4ff, 0.14, 0.05);
    lightShaft(ctx, -25, 170, -170, 16, 130, 0x8fd0d8, 0.1, -0.1);
    // Lantern chains strung across the void (seen from everywhere)
    const rng = new Rng(21);
    const chains: [Vector3, Vector3][] = [
      [new Vector3(-60, 128, -40), new Vector3(20, 122, -95)],
      [new Vector3(95, 120, -60), new Vector3(30, 118, -150)],
      [new Vector3(-80, 110, -150), new Vector3(10, 105, -205)],
      [new Vector3(60, 95, -200), new Vector3(-20, 90, -250)],
    ];
    for (const [a, b] of chains) {
      chainLine(W, a, b, 0.08);
      const n = 6;
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * a.distanceTo(b) * 0.08;
        hangingLantern(W, p.x, p.y, p.z, rng.range(1, 4), rng.range(1.4, 2.2), i % 2 === 0);
      }
    }
    return { spawns: [], cameraZones: [], points: {}, rooms: [] };
  },
};
