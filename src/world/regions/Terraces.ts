import { Box3, Vector3 } from 'three';
import { RegionDef, box3, v } from '../Region';
import { RegionBuilder, stairFlight, bridgeBetween } from './helpers';
import { stonePlatform, stoneLantern, hangingLantern, balustrade, column, ceremonialGate, pagoda, templeHall, courtyard } from '../../art/geo/structures';
import { incenseShrine, steleFrame, guardianStatue, lanternString, sageStatue } from '../../art/geo/props';
import { boulder, glowMushrooms, reeds, hangingRoots, mistSheet, stalactite, waterfall, deadTree } from '../../art/geo/nature';
import { roofGeometry } from '../../art/geo/roof';
import { cylG } from '../../art/geo/basic';
import { REGION_TEXT } from '../../story/lore';

const T = REGION_TEXT.terraces;

/** Pagoda placement shared with tests (balcony heights derive from it). */
export const GREAT_PAGODA = { x: 52, y: 52.6, z: -104, tiers: 7, base: 7, tierH: 6, shrink: 0.08 };

/**
 * Region 2 — Thousand Lantern Terraces.
 * Warm lantern light against a cold blue cavern. The Lantern-Keeper's shrine,
 * the Cloud Step trial, the Great Gap (dash) and the descent of the Great
 * Pagoda's balconies. A lift shortcut links the pagoda's foot back up.
 */
export const Terraces: RegionDef = {
  id: 'terraces',
  name: T.name,
  hanzi: T.hanzi,
  subtitle: T.subtitle,
  bounds: box3(-22, 50, -126, 70, 100, -79),
  killY: 44,
  seed: 202,
  viewDistance: 140, // the Great Pagoda is a landmark seen from the Threshold overlook
  atmosphere: {
    background: 0x070a14,
    fogColor: 0x101a30,
    fogDensity: 0.0095,
    fogLow: 0x1e2c4c,
    fogHeight: 62,
    fogFalloff: 16,
    fogHeightDensity: 0.04,
    hemiSky: 0x4a64a8,
    hemiGround: 0x2a1410,
    hemiIntensity: 2.2,
    keyColor: 0x8fa8e8,
    keyIntensity: 1.6,
    keyDir: [0.5, 1, 0.3],
    grade: { lift: [0.01, 0.004, 0.02], gain: [1.04, 0.99, 0.98], saturation: 1.05, vignette: 0.48, bloomStrength: 1.0, bloomThreshold: 0.78, exposure: 1.05 },
    particles: [
      { kind: 'embers', color: 0xffa050, count: 120, size: 0.06, extent: 16, speed: 1, opacity: 0.85 },
      { kind: 'dust', color: 0xd0c0e0, count: 200, size: 0.045, extent: 14, speed: 1, opacity: 0.4 },
    ],
    music: 'terraces',
    ambience: 'terraces',
  },
  build(ctx) {
    const R = new RegionBuilder(ctx, 'te');
    const W = R.W;

    // ------------------------------------------------------------ T0 · arrival & T1 · keeper's courtyard
    stonePlatform(W, -7, 90, -82.5, 6.4, 6.2, 1.5, { collide: { safe: true } });
    W.box('rockDark', -7, 84, -82.5, 5.6, 10, 5.6, {});
    stairFlight(W, v(-7, 86, -92), v(-7, 90, -85.6), 3.6, true);
    courtyard(W, -4, 86, -102, 22, 20, 3);
    W.box('rockDark', -4, 78, -102, 20, 13, 18, { ao: { y0: 70, y1: 84, min: 0.2 } });
    // west cliff with a cracked section hiding a cave
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      W.box('carved', -15.6, 91, -94 - i * 4, 1.2, 10, 4.05, { collide: { walkable: false } });
    }
    W.box('carved', -15.6, 94.5, -102, 1.2, 3, 4.05, { collide: { walkable: false } });
    R.add({ type: 'breakWall', id: 'te_crackwall', pos: v(-15.6, 87.5, -102), yaw: Math.PI / 2, w: 4, h: 3, d: 1.2 });
    stonePlatform(W, -18.8, 86, -102, 5.2, 4.4, 1, { mat: 'rockDark', trim: null, collide: { safe: true } });
    W.box('rockDark', -21.8, 89, -102, 1, 6, 5, { collide: { walkable: false } });
    W.box('rockDark', -18.8, 89, -99.2, 6, 6, 1, { collide: { walkable: false } });
    W.box('rockDark', -18.8, 89, -104.8, 6, 6, 1, { collide: { walkable: false } });
    W.box('rockDark', -18.8, 92.4, -102, 6, 1, 6, { collide: { walkable: false } });
    R.add({ type: 'fragment', id: 'frag_terraces', pos: v(-19.4, 87.2, -102) });
    glowMushrooms(W, -20.6, 86, -103.5, 5, 201, 0.6);
    R.hint(-13.5, 86, -102, 2.6, 'This stone rings hollow… {attack} it.');

    incenseShrine(ctx.place(-12, 0, -96.5, Math.PI / 2), 0, 86, 0);
    R.add({ type: 'shrine', id: 'shrine_terraces', pos: v(-12, 86, -96.5), yaw: Math.PI / 2, name: 'Keeper’s Shrine' });
    R.add({ type: 'npc', id: 'npc_weng', pos: v(-11.8, 86, -104.5), yaw: Math.PI / 2 - 0.3, npc: 'weng' });
    templeHall(W, -4, 86, -119, 6.5, 4, { frontScreens: true, sideWalls: true, podium: 1.2, colH: 4.6 });
    R.add({ type: 'stele', id: 'stele_lanterns', pos: v(-4, 87.2, -121.6), yaw: 0, loreId: 'lanterns' });
    steleFrame(ctx.place(-4, 0, -121.6, 0), 0, 87.2, 0);
    for (const [x, z] of [[-9, -93], [1, -93], [-14, -110], [5.5, -110], [5.5, -95]] as const) stoneLantern(W, x, 86, z, 1.9);
    for (let i = 0; i < 3; i++) {
      const x = -12 + i * 8;
      W.add('wood', cylG(0.15, 0.18, 8), x, 91, -92.4, 0, 0, 0, 1, 10, 1);
      W.add('wood', cylG(0.15, 0.18, 8), x, 91, -111.4, 0, 0, 0, 1, 10, 1);
      lanternString(W, v(x, 95.5, -92.4), v(x, 95.5, -111.4), 4, 0.55);
    }
    R.enemy('lanternWisp', 0, 89.5, -104, 0, 'te_wisp_a');
    R.enemy('lanternWisp', 3, 90, -97, 0, 'te_wisp_b');
    R.enemy('inkMite', 2, 86.1, -108, Math.PI, 'te_mite_a');
    R.urn(-13.5, 86, -93.5, 6);
    R.urn(5.8, 86, -107, 8);
    reeds(W, -12, 86, -110, 1.6, 14, 202, 0.7);
    R.hint(-7, 90, -83, 3, 'Lantern Wisps swoop when they glow. Strike upward or leap to meet them.');

    // ------------------------------------------------------------ T2 · the Cloud Step trial
    stairFlight(W, v(13.2, 82, -100), v(7.2, 86, -100), 4, true);
    courtyard(W, 22, 82, -100, 18, 16, 3);
    W.box('rockDark', 22, 74.5, -100, 16, 12, 14, { ao: { y0: 68, y1: 80, min: 0.2 } });
    balustrade(W, 22, 82, -92.1, 17);
    balustrade(W, 15, 82, -107.9, 3.5);
    balustrade(W, 26.5, 82, -107.9, 8.5);
    // pavilion over the altar
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) W.add('wood', cylG(0.12, 0.14, 8), 26 + dx, 84.2, -103.5 + dz, 0, 0, 0, 1, 4.4, 1);
    const pr = roofGeometry(2.8, 2.8, 1.5, { upturn: 0.5, flare: 0.2, seg: 5 });
    W.add('roofRed', pr.shell, 26, 86.4, -103.5, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
    W.add('roof', pr.caps, 26, 86.4, -103.5, 0, 0, 0, 1, 1, 1, { color: 0x8a7a60 });
    hangingLantern(W, 26, 86.3, -103.5, 0.4, 0.55);
    R.add({ type: 'ability', id: 'altar_dash', pos: v(26, 82, -103.5), yaw: 0, ability: 'dash', arena: 'arena_cloud' });
    R.enemy('inkMite', 18, 82.1, -97, 0, 'te_ar_m1', 'arena_cloud');
    R.enemy('inkMite', 25, 82.1, -95, 0, 'te_ar_m2', 'arena_cloud');
    R.enemy('lanternWisp', 20, 85, -102, 0, 'te_ar_w1', 'arena_cloud');
    R.enemy('lanternWisp', 27, 85.5, -97, 0, 'te_ar_w2', 'arena_cloud');
    R.enemy('inkMite', 16, 82.1, -104, 0, 'te_ar_m3', 'arena_cloud');
    R.enemy('shieldback', 22, 82.1, -99, Math.PI, 'te_ar_s1', 'arena_cloud');
    R.add({ type: 'gate', id: 'gate_t2_west', pos: v(13.4, 82, -100), yaw: Math.PI / 2, width: 4.6, height: 4, kind: 'barrier' });
    R.add({ type: 'gate', id: 'gate_t2_east', pos: v(30.8, 82, -104), yaw: Math.PI / 2, width: 3.6, height: 4, kind: 'barrier' });
    R.add({
      type: 'arena', id: 'arena_cloud', pos: v(22, 84, -100), half: v(7.6, 4, 6.6), gates: ['gate_t2_west', 'gate_t2_east'],
      waves: [['te_ar_m1', 'te_ar_m2'], ['te_ar_w1', 'te_ar_w2', 'te_ar_m3'], ['te_ar_s1']], music: 'battle',
    });
    R.hint(22, 82, -100, 4, 'Shieldbacks block blows from the front. Strike from above, from behind, or after their swing.');
    guardianStatue(W, 15.2, 82, -93.6, 1.0, true);
    guardianStatue(W, 15.2, 82, -106.4, 1.0, true);

    // ------------------------------------------------------------ the Great Gap & the Great Pagoda
    const P = GREAT_PAGODA;
    const pg = pagoda(ctx.place(P.x, 0, P.z, 0), 0, P.y, 0, { tiers: P.tiers, base: P.base, tierH: P.tierH, shrink: P.shrink, body: 'plaster', roof: 'roof' });
    const t4 = pg.tops[4];
    // bridge from T2's east edge to the fourth balcony
    bridgeBetween(W, v(31, t4, -104), v(P.x - pg.halfs[4] - 0.05, t4, -104), { width: 3, arch: 1.4, segLen: 2 });
    R.hint(P.x - pg.halfs[4] + 0.4, t4, -104, 2.2, 'Balconies below… drop from ledge to ledge to reach the pagoda’s foot.');
    // pagoda base terrace T3 and exit north
    stonePlatform(W, 34, 54, -101.5, 16, 19, 3, { collide: { safe: true } });
    W.box('rockDark', 34, 46, -101.5, 14, 14, 17, { ao: { y0: 38, y1: 51, min: 0.2 } });
    R.enemy('shieldback', 33, 54.1, -104, Math.PI / 2, 'te_guard_t3');
    R.enemy('inkMite', 38, 54.1, -97, 0, 'te_mite_t3');
    R.add({ type: 'platform', id: 'te_lift', path: [v(32.8, 54, -90.4), v(32.8, t4, -90.4)], w: 3, d: 3, speed: 5, style: 'lift', trigger: 'ride' });
    stonePlatform(W, 32.8, t4, -93.2, 3, 2, 1, { collide: { safe: true } });
    R.hint(32.8, 54, -91.5, 3, 'An old lift. Stand on it to ride back up to the trial terrace.');
    stairFlight(W, v(30, 48, -121.5), v(30, 54, -111.4), 4, true);
    ceremonialGate(ctx.place(30, 0, -110.8, 0), 0, 54, 0, 5.6, 6, { tiers: 1 });
    stoneLantern(W, 27, 54, -110, 1.8);
    stoneLantern(W, 38, 54, -110, 1.8);
    R.urn(40.5, 54, -93.5, 10);
    R.urn(27.5, 54, -93.8, 6);

    // secret: twin carved pillars beside the bridge (wall-jump chimney) → Moon-Cleave
    column(W, 42.6, 54, -108.4, 42, 0.9, { climbable: true, collide: { climbable: true, walkable: false } });
    column(W, 42.6, 54, -112.2, 42, 0.9, { climbable: true, collide: { climbable: true, walkable: false } });
    stonePlatform(W, 42.6, 96.6, -113.4, 3.4, 3.6, 0.8, { collide: { safe: true } });
    R.add({ type: 'ability', id: 'altar_cleave', pos: v(42.6, 96.6, -113.6), yaw: 0, ability: 'chargedSlash' });
    R.hint(38, t4, -104, 3, 'Carved stone… a clinging creature might climb it.', 'wallCling');

    // ------------------------------------------------------------ dressing
    mistSheet(ctx, 30, 58, -104, 90, 60, 0x4a3a5a, 0.55);
    mistSheet(ctx, 30, 49, -104, 120, 80, 0x2a2440, 0.85);
    R.abyss(35, 47, -104, 45, 30, 6);
    sageStatue(ctx.place(68, 0, -140, -Math.PI / 4), 0, 42, 0, 3.6, { eyesGlow: true, collide: false, moss: true });
    waterfall(ctx, 74, 110, -95, 6, 60, -Math.PI / 2);
    for (let i = 0; i < 8; i++) stalactite(W, 10 + i * 8, 108 + (i % 3) * 3, -86 - (i % 4) * 9, 12 + (i % 3) * 6, 1.8, 200 + i);
    // lower terraces cascading into the mist (scenery)
    for (let i = 0; i < 4; i++) {
      const y = 76 - i * 6;
      stonePlatform(W, 4 + i * 3, y, -84 - i * 2, 10, 5, 2, { collide: false });
      stoneLantern(W, 1 + i * 3, y, -84 - i * 2, 1.6, i % 2 === 0);
    }
    lanternString(W, v(-4, 97, -112), v(P.x, t4 + 16, P.z), 6, 0.7);
    lanternString(W, v(22, 92, -92), v(P.x, t4 + 10, P.z + 6), 5, 0.6);
    lanternString(W, v(-14, 96, -93), v(22, 94, -92), 5, 0.55);
    hangingRoots(W, -15, 100, -100, 8, 9, 210, 4);
    deadTree(W, 36, 54, -110, 4, 211, false);
    boulder(W, 45, 53.5, -93, 3, 212, { mat: 'rockDark', collide: true });
    glowMushrooms(W, 39, 54, -94, 6, 213, 0.8);

    return {
      spawns: R.spawns,
      cameraZones: [
        { box: new Box3(v(31, t4 - 2, -106.5), v(P.x - 3, t4 + 6, -101.5)), zone: { distance: 1.25, yaw: -Math.PI / 2 + 0.35, yawStrength: 0.35 } },
        { box: new Box3(v(P.x - 8, P.y, P.z - 8), v(P.x + 8, t4, P.z + 8)), zone: { distance: 1.15, pitch: 0.55 } },
        { box: new Box3(v(-15, 85, -112), v(7, 92, -92)), zone: { distance: 1.1 } },
      ],
      points: { pagoda: v(P.x, P.y, P.z) },
      rooms: [
        { id: 'te_arrival', name: 'Terrace Gate', min: [-10, -86], max: [-4, -79], y: 90 },
        { id: 'te_t1', name: 'Keeper’s Court', min: [-15, -112], max: [7, -92], y: 86 },
        { id: 'te_hall', name: 'Hall of Names', min: [-11, -124], max: [3, -112], y: 87 },
        { id: 'te_cave', name: 'Hollow Stone', min: [-21, -105], max: [-15.5, -99], y: 86 },
        { id: 'te_t2', name: 'Cloud Step Terrace', min: [13, -108], max: [31, -92], y: 82 },
        { id: 'te_gap', name: 'Pagoda Bridge', min: [31, -106], max: [47, -102], y: t4 },
        { id: 'te_pagoda', name: 'Great Pagoda', min: [P.x - 9, P.z - 9], max: [P.x + 9, P.z + 9], y: 70 },
        { id: 'te_t3', name: 'Pagoda Foot', min: [26, -111], max: [42, -92], y: 54 },
        { id: 'te_pillars', name: 'Twin Pillars', min: [40.5, -114], max: [44.5, -106.5], y: 96 },
      ],
    };
  },
};

export const _v = Vector3;
