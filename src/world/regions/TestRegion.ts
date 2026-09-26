import { RegionDef, box3, v } from '../Region';
import { stonePlatform, pagoda, templeHall, ceremonialGate, archBridge, stoneLantern, hangingLantern, rockPillar, stairs, column, balustrade } from '../../art/geo/structures';
import { sageStatue, incenseShrine, steleFrame, guardianStatue } from '../../art/geo/props';
import { cavernWall, cavernCeiling, inkBackdrop, glowMushrooms, reeds, hangingRoots, mistSheet, lightShaft, waterfall, boulder, deadTree } from '../../art/geo/nature';

/** Kit showcase used during development to judge the art pipeline. */
export const TestRegion: RegionDef = {
  id: 'test',
  name: 'Kit Showcase',
  hanzi: '试',
  subtitle: 'development scene',
  bounds: box3(-200, -100, -200, 200, 200, 200),
  killY: -40,
  seed: 1,
  atmosphere: {
    background: 0x070b12,
    fogColor: 0x0d1624,
    fogDensity: 0.012,
    fogLow: 0x1a2a3a,
    fogHeight: -2,
    fogFalloff: 18,
    fogHeightDensity: 0.05,
    hemiSky: 0x5a7aa6,
    hemiGround: 0x1a1216,
    hemiIntensity: 2.4,
    keyColor: 0x9fc0ff,
    keyIntensity: 2.2,
    keyDir: [0.3, 1, 0.4],
    grade: { bloomStrength: 0.9 },
    particles: [
      { kind: 'dust', color: 0xbfd0e0, count: 260, size: 0.05, extent: 14, speed: 1, opacity: 0.45 },
      { kind: 'embers', color: 0xff9a50, count: 60, size: 0.06, extent: 16, speed: 1, opacity: 0.8 },
    ],
    music: 'threshold',
    ambience: 'cave',
  },
  build(ctx) {
    const P = ctx.place(0, 0, 0, 0);
    stonePlatform(P, 0, 0, 0, 40, 40, 3, {});
    stairs(P, -8, 0, 6, 3, 4, 2);
    stonePlatform(P, -8, 2, 12, 6, 4, 2, {});
    templeHall(P, 0, 0, -12, 6, 4, { frontScreens: true, sideWalls: true });
    pagoda(ctx.place(30, -10, -20), 0, 0, 0, { tiers: 7, base: 6, tierH: 5.5 });
    ceremonialGate(P, 0, 0, 14, 6, 6, { tiers: 3 });
    archBridge(ctx.place(0, 0, 20), 0, 0, 0, 16, { width: 3, arch: 2, missing: [3] });
    stoneLantern(P, 5, 0, 8);
    stoneLantern(P, -5, 0, 8);
    hangingLantern(P, 8, 5, 0, 1, 0.6);
    rockPillar(P, 14, 1, 10, 3, 20, {});
    column(P, -14, 0, -6, 6, 0.6, { broken: true, climbable: true });
    balustrade(P, 10, 0, -4, 8);
    sageStatue(ctx.place(-26, -2, -30, 0.4), 0, 0, 0, 2.2, { eyesGlow: true });
    guardianStatue(P, 12, 0, 4, 1.2);
    incenseShrine(P, -10, 0, -2);
    steleFrame(P, 8, 0, 12);
    glowMushrooms(P, -4, 0, 4, 12, 3);
    reeds(P, 4, 0, -2, 2, 20, 4);
    hangingRoots(P, 0, 12, 0, 8, 5, 3);
    boulder(P, -16, 0, 12, 3, 5, { collide: true });
    deadTree(P, 16, 0, -12, 5, 8);
    cavernWall(ctx, 0, 40, 0, 120, 200, 3);
    cavernCeiling(ctx, 0, 130, 0, 120, 7, 30);
    inkBackdrop(ctx, 0, 0, 0, [
      { radius: 300, height: 260, color: 0x1a2a3c, opacity: 0.9, seed: 1, y: 20 },
      { radius: 220, height: 180, color: 0x22364a, opacity: 0.8, seed: 2, y: 0 },
    ]);
    mistSheet(ctx, 0, -6, 0, 200, 200, 0x3a5068, 0.7);
    lightShaft(ctx, 20, 60, -10, 8, 70, 0x9fc8ff, 0.18);
    waterfall(ctx, -30, 30, 10, 6, 40, 0.8);
    return {
      spawns: [],
      cameraZones: [],
      points: { spawn: v(0, 0.1, 6) },
      rooms: [],
    };
  },
};
