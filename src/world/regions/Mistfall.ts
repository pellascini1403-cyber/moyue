import { Box3, Color, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { RegionDef, box3, v } from '../Region';
import { RegionBuilder, ledge, stairFlight, bridgeBetween } from './helpers';
import { stonePlatform, stoneLantern, hangingLantern, column, rockPillar, templeHall, balustrade, ceremonialGate } from '../../art/geo/structures';
import { incenseShrine, steleFrame, sageStatue, templeBell } from '../../art/geo/props';
import { boulder, glowMushrooms, reeds, hangingRoots, mistSheet, stalactite, waterfall, deadTree, lotusPads, lightShaft } from '../../art/geo/nature';
import { roofGeometry } from '../../art/geo/roof';
import { cylG } from '../../art/geo/basic';
import { REGION_TEXT } from '../../story/lore';
import { WorldUniforms } from '../../art/materials';
import { Env } from '../../core/env';

const T = REGION_TEXT.mistfall;

/**
 * Region 3 — Mistfall Cloister.
 * Bridges over a sea of mist, waterfalls that forget which way is down, and a
 * drowned monastery garden guarded by the Censer Warden. The Hanging Stair
 * (double jump) leads to the hermit's terrace (wall cling); a carved chimney
 * climbs to the Wind Gate, where the Descent Well drops into the Sanctum.
 */
export const Mistfall: RegionDef = {
  id: 'mistfall',
  name: T.name,
  hanzi: T.hanzi,
  subtitle: T.subtitle,
  bounds: box3(-62, 30, -198, 36, 80, -120),
  killY: 5,
  seed: 303,
  atmosphere: {
    background: 0x100c08,
    fogColor: 0x2e2618,
    fogDensity: 0.016,
    fogLow: 0x8a7452,
    fogHeight: 44,
    fogFalloff: 10,
    fogHeightDensity: 0.07,
    hemiSky: 0xa09070,
    hemiGround: 0x1e1a12,
    hemiIntensity: 2.4,
    keyColor: 0xf4dcb0,
    keyIntensity: 1.8,
    keyDir: [-0.3, 1, 0.2],
    grade: { lift: [0.018, 0.012, 0.004], gain: [1.05, 0.99, 0.92], saturation: 1.0, warmth: 0.26, vignette: 0.42, bloomStrength: 0.8, bloomThreshold: 0.85, exposure: 1.08 },
    particles: [
      { kind: 'spores', color: 0xf0e0a0, count: 160, size: 0.06, extent: 16, speed: 1, opacity: 0.7 },
      { kind: 'dust', color: 0xf0e4c8, count: 240, size: 0.05, extent: 14, speed: 1, opacity: 0.35 },
    ],
    music: 'mistfall',
    ambience: 'water',
  },
  build(ctx) {
    const R = new RegionBuilder(ctx, 'mi');
    const W = R.W;

    // ------------------------------------------------------------ M0 · the misty bridges
    ledge(W, 30, 48, -124, 5, 5, { depth: 10, seed: 301 });
    // the Great Gap: the middle of the mist bridge fell long ago (dash)
    bridgeBetween(W, v(27.5, 48, -124), v(4.4, 48, -124), { width: 3.2, arch: 2.4, segLen: 2.1, missing: [4, 5, 6] });
    R.hint(23.5, 50, -124, 3.4, 'Too far to leap… leap, then {dash} in mid-air to cross the Great Gap.');
    rockPillar(W, 0, 48, -124, 4.6, 26, { seed: 302 });
    R.enemy('lanternWisp', 9, 52, -121, 0, 'mi_wisp_a');
    R.enemy('lanternWisp', 8, 52.5, -128, 0, 'mi_wisp_b');
    R.add({ type: 'npc', id: 'npc_xun_2', pos: v(1.2, 48, -121.8), yaw: Math.PI * 0.8, npc: 'xun' });
    stoneLantern(W, -2.6, 48, -126.6, 1.5);
    // hidden cave behind the western waterfall
    waterfall(ctx, -4.6, 60, -124, 3.2, 13, Math.PI / 2, 0xe0d8c0);
    stonePlatform(W, -8, 48, -124, 4.4, 4, 1.2, { mat: 'rockDark', trim: null, collide: { safe: true } });
    W.box('rockDark', -10.6, 51, -124, 1, 7, 5, { collide: { walkable: false } });
    W.box('rockDark', -8, 51, -126.4, 6, 7, 1, { collide: { walkable: false } });
    W.box('rockDark', -8, 51, -121.6, 6, 7, 1, { collide: { walkable: false } });
    W.box('rockDark', -8, 54.8, -124, 6, 1, 5, { collide: { walkable: false } });
    R.add({ type: 'fragment', id: 'frag_mistfall_falls', pos: v(-8.6, 49.2, -124) });
    glowMushrooms(W, -9.6, 48, -125.4, 5, 303, 0.6);
    R.hint(-2.5, 48, -124, 2.2, 'The water sounds hollow here…');
    // bridge north with one fallen segment
    bridgeBetween(W, v(0, 48, -128.4), v(0, 48, -146), { width: 3, arch: 1.6, missing: [3], segLen: 2.2 });
    ledge(W, 0, 48, -149, 8, 9, { depth: 12, seed: 304 });
    stoneLantern(W, 3.2, 48, -145.4, 1.6);
    incenseShrine(ctx.place(1.6, 0, -151, -Math.PI / 2), 0, 48, 0);
    R.add({ type: 'shrine', id: 'shrine_mistfall', pos: v(1.6, 48, -151), yaw: -Math.PI / 2, name: 'Cloister Shrine' });
    // falls pouring on both sides of the bridges
    waterfall(ctx, 14, 78, -135, 6, 40, 0.3, 0xe0d8c0);
    waterfall(ctx, 18, 80, -114, 5, 40, Math.PI - 0.4, 0xe0d8c0);
    waterfall(ctx, -14, 82, -118, 7, 44, Math.PI / 2 + 0.2, 0xe0d8c0);
    mistSheet(ctx, 5, 43.5, -140, 110, 90, 0xd0c0a0, 0.7);
    mistSheet(ctx, 5, 39, -140, 130, 110, 0x7a6a50, 0.95);
    R.abyss(8, 39, -138, 40, 26, 6);

    // ------------------------------------------------------------ M1 · the cloister garden
    stairFlight(W, v(-9.4, 44, -148.4), v(-4, 48, -148.4), 4, true);
    const CX = -24, CZ = -155;
    stonePlatform(W, CX, 44, CZ, 28, 28, 3, { collide: { safe: true }, color: 0xb0b8b4 });
    W.box('rockDark', CX, 36, CZ, 26, 14, 26, {});
    // covered walkways on three sides
    templeHall(ctx.place(CX - 11.5, 0, CZ, Math.PI / 2), 0, 44, 0, 11, 1.6, { podium: 0.3, colH: 4.2, backWall: true, steps: false, lanterns: false });
    templeHall(ctx.place(CX, 0, CZ + 11.8, Math.PI), 0, 44, 0, 7, 1.4, { podium: 0.3, colH: 4.2, backWall: true, steps: false, lanterns: true });
    // garden: pond, pavilion, dead tree, mushrooms
    const pond = new Mesh(new PlaneGeometry(9, 6), new MeshStandardMaterial({ color: new Color(0x3a6a78), roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.8 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(CX - 3, 44.03, CZ + 2.5);
    ctx.object(pond);
    lotusPads(W, CX - 3, 44.02, CZ + 2.5, 10, 305, 3.5);
    W.box('stoneDark', CX - 3, 44.08, CZ + 5.6, 9.4, 0.16, 0.3, {});
    W.box('stoneDark', CX - 3, 44.08, CZ - 0.6, 9.4, 0.16, 0.3, {});
    deadTree(W, CX + 5, 44, CZ - 3, 5.5, 306);
    glowMushrooms(W, CX + 6.5, 44, CZ + 4, 10, 307, 1.1);
    glowMushrooms(W, CX - 9, 44, CZ - 6, 8, 308, 0.9);
    reeds(W, CX - 7, 44, CZ + 5, 2, 20, 309, 0.9);
    const pv = roofGeometry(2.6, 2.6, 1.6, { upturn: 0.5, flare: 0.2, seg: 5 });
    for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) W.add('wood', cylG(0.12, 0.14, 8), CX + 5 + dx, 46.1, CZ + 5 + dz, 0, 0, 0, 1, 4.2, 1);
    W.add('roof', pv.shell, CX + 5, 48.2, CZ + 5, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
    W.add('roof', pv.caps, CX + 5, 48.2, CZ + 5, 0, 0, 0, 1, 1, 1, { color: 0x8a8070 });
    hangingLantern(W, CX + 5, 48.1, CZ + 5, 0.3, 0.5);
    R.add({ type: 'ability', id: 'altar_wings', pos: v(CX + 5, 44, CZ + 5), yaw: 0, ability: 'doubleJump', arena: 'arena_warden' });
    templeBell(W, CX - 9.5, 48.6, CZ - 9.2, 1.1);
    R.add({ type: 'stele', id: 'stele_mist', pos: v(CX - 8.8, 44.3, CZ + 7.6), yaw: Math.PI / 2, loreId: 'mist' });
    steleFrame(ctx.place(CX - 8.8, 0, CZ + 7.6, Math.PI / 2), 0, 44.3, 0);
    R.enemy('censerWarden', CX - 1, 44.1, CZ - 2, Math.PI / 2, 'boss_warden', 'arena_warden');
    R.add({ type: 'gate', id: 'gate_cloister_e', pos: v(-10.6, 44, -148.4), yaw: Math.PI / 2, width: 4.4, height: 4, kind: 'barrier' });
    R.add({ type: 'arena', id: 'arena_warden', pos: v(CX + 1, 47, CZ), half: v(11, 4, 9), gates: ['gate_cloister_e'], waves: [['boss_warden']], music: 'boss', boss: 'boss_warden' });
    R.hint(-9, 44, -149, 2.4, 'Smoke, and the creak of a chain… Rest first.');
    R.enemy('inkMite', CX - 8, 44.3, CZ - 11.3, 0, 'mi_mite_walk');
    R.urn(CX + 10, 44.3, CZ - 11, 10);
    R.urn(CX - 10.5, 44.3, CZ + 10, 10);
    column(W, CX + 12, 44, CZ + 12, 6, 0.45, { broken: true });

    // ------------------------------------------------------------ M2 · the Hanging Stair (double jump)
    const hs: [number, number, number, number, number][] = [
      [-24, 47.8, -170.6, 4.2, 3.2],
      [-19.6, 51.6, -173.6, 4, 3],
      [-24.4, 55.4, -176.6, 4, 3],
    ];
    for (const [x, y, z, w, d] of hs) {
      stonePlatform(W, x, y, z, w, d, 0.9, { collide: { safe: true } });
      W.box('rockDark', x, y - 3, z - 0.6, w * 0.8, 5, d * 0.7, {});
      hangingLantern(W, x + w / 2 - 0.3, y + 3.6, z - d / 2 + 0.2, 0.9, 0.45);
    }
    R.hint(-24, 44, -168, 3, 'The stair hangs too high… only wings could climb it.', 'doubleJump');
    R.hint(-24, 44, -168, 3, 'Leap, then {jump} again at the height of the leap.', undefined, 'doubleJump');
    // hermit's terrace + Cicada's Grip
    ledge(W, -22, 59.2, -181.5, 8, 6, { depth: 10, seed: 310 });
    R.add({ type: 'ability', id: 'altar_grip', pos: v(-20.5, 59.2, -182.6), yaw: 0, ability: 'wallCling' });
    deadTree(W, -24.8, 59.2, -183.6, 3.5, 311, false);
    stoneLantern(W, -18.6, 59.2, -179.4, 1.5);
    R.urn(-25, 59.2, -179.6, 12);

    // ------------------------------------------------------------ M3 · the chimney & the Wind Gate
    // two carved walls facing each other; enter the gap from the terrace and climb
    for (const z of [-178.4, -182.6]) {
      // tops are flush with the Wind Gate ledge so the climb ends on solid ground
      W.box('carved', -32, 61, z, 8, 22, 0.9, { collide: { climbable: true, walkable: true }, ao: { y0: 50, y1: 72, min: 0.4 } });
      hangingRoots(W, -32, 71, z, 3, 5, 312 - z, 2.5);
    }
    R.hint(-26, 59.2, -181.5, 2.8, 'Carved walls, close together. Cling, leap, cling again.', undefined, 'wallCling');
    stonePlatform(W, -33.4, 72, -188.25, 9, 10.5, 1.2, { collide: { safe: true } });
    W.box('rockDark', -33.4, 66, -188.2, 8, 11, 7, {});
    ceremonialGate(ctx.place(-33.4, 0, -186, 0), 0, 72, 0, 5.2, 5.4, { tiers: 1 });
    R.add({ type: 'fragment', id: 'frag_mistfall_gate', pos: v(-37, 73.2, -191) });
    R.add({ type: 'stele', id: 'stele_descent', pos: v(-29.8, 72, -191), yaw: -Math.PI / 2, loreId: 'descent' });
    steleFrame(ctx.place(-29.8, 0, -191, -Math.PI / 2), 0, 72, 0);
    // the Descent Well: a closed ring of rock falling into the dark. Entered only from the
    // Wind Gate ledge above; a low doorway at the bottom opens towards the Sanctum.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = -34 + Math.sin(a) * 5.4, z = -197.5 + Math.cos(a) * 5.4;
      const east = i === 2 || i === 3;
      const y0 = east ? 19.6 : 15;
      const top = 71;
      W.box('rockDark', x, (y0 + top) / 2, z, 3.6, top - y0, 1.2, { ry: a, collide: { walkable: false }, ao: { y0: 16, y1: 72, min: 0.2 } });
    }
    // fall catchers: stop long glides from the heights into the Sanctum around the well
    const catcher = (x0: number, x1: number, z0: number, z1: number, y: number) =>
      R.add({ type: 'hazardZone', id: R.id('catch'), pos: v((x0 + x1) / 2, y, (z0 + z1) / 2), half: v((x1 - x0) / 2, 2.5, (z1 - z0) / 2), damage: 1, kind: 'abyss' });
    catcher(-50, -10, -191.5, -185, 52);
    catcher(-28, -8, -206, -191.5, 52);
    catcher(-50, -40, -206, -191.5, 52);
    catcher(-42, -14, -185, -168.5, 40);
    R.hint(-34, 72, -192, 2.6, 'The well has no bottom that anyone remembers. Step in.');

    // ------------------------------------------------------------ dressing
    sageStatue(ctx.place(-58, 0, -150, Math.PI / 2), 0, 30, 0, 4.4, { eyesGlow: true, collide: false });
    lightShaft(ctx, CX, 110, CZ, 14, 70, 0xffe8b8, 0.14, 0.02);
    for (let i = 0; i < 10; i++) stalactite(W, -50 + i * 9, 100 + (i % 3) * 5, -130 - (i % 4) * 16, 14 + (i % 4) * 4, 2, 320 + i);
    boulder(W, 8, 47.4, -150, 3, 330, { mat: 'rockDark' });
    for (let i = 0; i < 5; i++) {
      balustrade(W, -40 + i * 0.1, 44.3, CZ - 13.6 + i * 6, 0.1, 0, false);
    }
    // animated water shimmer on the pond
    if (!Env.headless) {
      ctx.animated.push({
        update: (t) => {
          (pond.material as MeshStandardMaterial).opacity = 0.75 + Math.sin(t * 0.8) * 0.05;
        },
      });
    }
    void WorldUniforms;

    return {
      spawns: R.spawns,
      cameraZones: [
        { box: new Box3(v(-37, 44, -168), v(-11, 52, -142)), zone: { distance: 1.2, pitch: 0.45 } },
        { box: new Box3(v(-37, 58, -185), v(-29, 73, -178)), zone: { distance: 1.3, pitch: 0.25, yaw: Math.PI / 2, yawStrength: 0.6 } },
        { box: new Box3(v(-39, 17, -203), v(-29, 72, -192)), zone: { distance: 0.9, pitch: 1.05, height: 1 } },
      ],
      points: {},
      rooms: [
        { id: 'mi_bridge1', name: 'Mist Bridge', min: [4, -126], max: [32, -122], y: 48 },
        { id: 'mi_island', name: 'Pilgrim’s Rock', min: [-4.6, -128.6], max: [4.6, -119.4], y: 48 },
        { id: 'mi_falls', name: 'Behind the Falls', min: [-10.5, -126.4], max: [-5.8, -121.6], y: 48 },
        { id: 'mi_bridge2', name: 'Broken Span', min: [-1.5, -146], max: [1.5, -128], y: 48 },
        { id: 'mi_gate', name: 'Cloister Gate', min: [-13, -152], max: [3, -139], y: 48 },
        { id: 'mi_cloister', name: 'Drowned Cloister', min: [-38, -169], max: [-10, -141], y: 44 },
        { id: 'mi_stair', name: 'Hanging Stair', min: [-27, -178.5], max: [-17, -169], y: 52 },
        { id: 'mi_hermit', name: 'Hermit’s Terrace', min: [-26, -184.5], max: [-18, -178.5], y: 59 },
        { id: 'mi_chimney', name: 'Carved Chimney', min: [-36, -184], max: [-30.9, -179], y: 65 },
        { id: 'mi_windgate', name: 'Wind Gate', min: [-38, -193], max: [-29, -184], y: 72 },
      ],
    };
  },
};

export const _v = Vector3;
