import { Box3, Vector3 } from 'three';
import { RegionDef, box3, v } from '../Region';
import { RegionBuilder, ledge, stairFlight, bridgeBetween } from './helpers';
import { stonePlatform, rockPillar, stoneLantern, hangingLantern, balustrade, column, ceremonialGate, pagoda } from '../../art/geo/structures';
import { sageStatue, incenseShrine, steleFrame, guardianStatue } from '../../art/geo/props';
import { boulder, glowMushrooms, reeds, hangingRoots, mistSheet, deadTree, stalactite, waterfall } from '../../art/geo/nature';
import { latheG, sphereG } from '../../art/geo/basic';
import { REGION_TEXT } from '../../story/lore';

const T = REGION_TEXT.threshold;

/**
 * Region 1 — The Cicada Threshold.
 * A jade tomb high on the cavern wall opens onto a vast overlook. A cliff path,
 * a broken bridge and a rock plateau with the first incense shrine lead down
 * towards the Lantern Terraces. First minute: move → look → jump → platform →
 * fight → discover.
 */
export const Threshold: RegionDef = {
  id: 'threshold',
  name: T.name,
  hanzi: T.hanzi,
  subtitle: T.subtitle,
  bounds: box3(-62, 88, -72, 12, 125, 10),
  killY: 80,
  seed: 101,
  atmosphere: {
    background: 0x0a0705,
    fogColor: 0x1a120b,
    fogDensity: 0.0105,
    fogLow: 0x4a3622,
    fogHeight: 92,
    fogFalloff: 14,
    fogHeightDensity: 0.05,
    hemiSky: 0x8a7458,
    hemiGround: 0x22140c,
    hemiIntensity: 2.3,
    keyColor: 0xf2d2a0,
    keyIntensity: 2.0,
    keyDir: [0.4, 1, 0.6],
    grade: { lift: [0.018, 0.01, 0.002], gain: [1.05, 0.99, 0.92], saturation: 1.06, warmth: 0.28, vignette: 0.5, bloomStrength: 0.9, bloomThreshold: 0.8, exposure: 1.05 },
    particles: [
      { kind: 'dust', color: 0xe8d0a8, count: 280, size: 0.05, extent: 14, speed: 1, opacity: 0.5 },
      { kind: 'fireflies', color: 0xf2dc80, count: 40, size: 0.09, extent: 18, speed: 1, opacity: 0.9 },
    ],
    music: 'threshold',
    ambience: 'cave',
  },
  build(ctx) {
    const R = new RegionBuilder(ctx, 'th');
    const W = R.W;
    const Y = 100;

    // ------------------------------------------------------------ A1 · the jade tomb
    stonePlatform(W, 0, Y, 0, 11, 11, 2, { mat: 'stoneDark', trim: null });
    const wallH = 6.4;
    const wall = (x: number, z: number, w: number, d: number) =>
      W.box('stoneDark', x, Y + wallH / 2, z, w, wallH, d, { collide: { walkable: false }, ao: { y0: Y, y1: Y + wallH, min: 0.5 } });
    wall(-5.9, 0, 0.8, 12.6);
    wall(5.9, 0, 0.8, 12.6);
    wall(0, 5.9, 12.6, 0.8);
    wall(-3.5, -5.9, 4.4, 0.8);
    wall(3.5, -5.9, 4.4, 0.8);
    W.box('stoneDark', 0, Y + 4.8, -5.9, 2.8, 3.2, 0.8, { collide: { walkable: false } });
    W.box('stoneDark', 0, Y + wallH + 0.4, 0, 12.6, 0.8, 12.6, { collide: { walkable: false } });
    // jade veins in the walls
    for (const [x, z, w, d] of [[-5.45, 0, 0.06, 10], [5.45, 0, 0.06, 10], [0, 5.45, 10, 0.06]] as const) {
      for (const hy of [1.2, 3.1, 5.0]) W.box('jade', x, Y + hy, z, w, 0.07, d, {});
    }
    for (const x of [-4, -2, 2, 4]) W.box('jade', x, Y + 3.2, 5.45, 0.07, 5.5, 0.06, {});
    // the cracked cocoon on its dais
    W.box('stone', 0, Y + 0.2, 1.8, 3.2, 0.4, 4.2, { collide: { safe: true } });
    W.box('gold', 0, Y + 0.34, 1.8, 3.3, 0.06, 4.3, {}); // a thin gilt band around the dais edge
    // two halves of the split jade cocoon lying open on the dais
    const shell = latheG([[0.01, 0], [0.45, 0.12], [0.62, 0.55], [0.58, 1.05], [0.32, 1.4], [0.04, 1.5]], 14, 0, Math.PI);
    W.add('jade', shell, -0.75, Y + 0.44, 2.4, 0, 0.2, 1.45, 0.75, 0.75, 0.75);
    W.add('jade', shell, 0.8, Y + 0.44, 2.6, 0, 0.2 + Math.PI, -1.45, 0.72, 0.72, 0.72);
    W.add('jade', sphereG(10), 0.2, Y + 0.45, 3.5, 0, 0, 0, 0.35, 0.12, 0.3);
    W.light(0, Y + 2.3, 2.4, 0x62d6c4, 1.7, 9, 0.03);
    W.glow(0, Y + 1.0, 2.2, 0x3cc0a0, 2.4, 0.03);
    glowMushrooms(W, -4.6, Y, 4.6, 7, 11, 0.8);
    glowMushrooms(W, 4.6, Y, -4.2, 5, 12, 0.7, false);
    reeds(W, 4.2, Y, 4.2, 0.8, 10, 13, 0.6);
    R.add({ type: 'stele', id: 'stele_waking', pos: v(-4.3, Y, -1.5), yaw: Math.PI / 2, loreId: 'waking' });
    steleFrame(ctx.place(-4.3, 0, -1.5, Math.PI / 2), 0, Y, 0);
    R.urn(4.2, Y, 3.6, 5);
    R.hint(0, Y, 1.5, 3.5, 'Use {move} to move · {look} to look around');
    R.hint(0, Y, -3.4, 2.4, 'The light beyond the door…');

    // ------------------------------------------------------------ A2 · the overlook
    ledge(W, 0, Y, -10.4, 13, 9.4, { depth: 14, seed: 3 });
    balustrade(W, -3.2, Y, -14.9, 6.5);
    balustrade(W, 4.6, Y, -14.9, 2.6);
    // a broken section of balustrade lies toppled below
    W.box('stonePale', 2.2, Y - 1.8, -16.4, 2.3, 0.3, 0.3, { rz: 0.5, ry: 0.4 });
    stoneLantern(W, -4.8, Y, -7.2, 1.9);
    stoneLantern(W, 4.8, Y, -7.2, 1.9);
    column(W, 5.6, Y, -13.2, 4.5, 0.45, { broken: true });
    boulder(W, 7.5, Y - 0.5, -9, 4, 31, { mat: 'rockDark', collide: true });
    boulder(W, 7, Y + 1, -3, 5, 32, { mat: 'rockDark' });
    hangingRoots(W, 3.5, Y + 12, -12, 7, 8, 33, 3);
    reeds(W, -3.5, Y, -13.6, 1.4, 14, 34, 0.7);

    // ------------------------------------------------------------ A3 · cliff path west
    stairFlight(W, v(-13.1, Y - 3, -11.6), v(-6.5, Y, -11.6), 3.2, true);
    ledge(W, -15, Y - 3, -12, 5, 5, { depth: 9, seed: 5 });
    R.hint(-15, Y - 3, -12, 3.2, 'Tap {jump} to leap. Hold it to leap higher.');
    ledge(W, -22.5, Y - 3, -12, 4.5, 5, { depth: 12, seed: 6 });
    ledge(W, -28, Y - 1.4, -12, 4, 5, { depth: 11, seed: 7 });
    stoneLantern(W, -29.4, Y - 1.4, -10.2, 1.6);
    // the cliff face to the south of the path
    for (let i = 0; i < 7; i++) {
      boulder(W, -8 - i * 4.6, Y + 1 + (i % 3), -4 - (i % 2) * 1.5, 6 + (i % 3), 40 + i, { mat: 'rockDark', squash: 1.4 });
    }
    W.collider(-21, Y + 3, -6.8, 14, 6, 0.8, { walkable: false });
    hangingRoots(W, -20, Y + 10, -9, 10, 9, 41, 5);
    glowMushrooms(W, -16.5, Y - 3, -10.2, 6, 42, 0.8);
    stalactite(W, -22, Y + 14, -14, 9, 1.2, 1);
    stalactite(W, -26, Y + 16, -18, 12, 1.6, 2);

    // ------------------------------------------------------------ A4 · the broken bridge
    const bFrom = v(-28, Y - 1.4, -14.4);
    const bTo = v(-28, Y - 1.4, -44.6);
    bridgeBetween(W, bFrom, bTo, { width: 3.2, arch: 2.2, missing: [4, 8], segLen: 2.3 });
    for (const s of [-1, 1]) {
      W.box('stoneDark', -28 + s * 1.9, Y - 1.4 + 1.3, -15.2, 0.5, 2.6, 0.5, {});
      hangingLantern(W, -28 + s * 1.9, Y - 1.4 + 2.6, -15.2, 0.2, 0.5);
    }
    R.hint(-28, Y - 1.4, -18, 3, 'The bridge is broken. Keep your momentum and {jump}.');
    R.hint(-28, Y - 1.4, -29.5, 2.6, '{dash} to dash forward — on the ground, or once in mid-air to carry a leap further.');
    // mist sea swallowing everything below the path
    mistSheet(ctx, -20, Y - 11, -30, 120, 90, 0x5a4630, 0.75);
    mistSheet(ctx, -20, Y - 16, -30, 140, 110, 0x3a2c1e, 0.9);
    R.abyss(-24, Y - 13, -30, 42, 38, 6);

    // ------------------------------------------------------------ A5 · the plateau
    const PY = Y - 1.4;
    rockPillar(W, -28, PY, -53, 9, 30, { seed: 8 });
    R.enemy('inkMite', -25.5, PY + 0.1, -51, Math.PI, 'th_mite_a');
    R.enemy('inkMite', -30.5, PY + 0.1, -56, Math.PI * 0.8, 'th_mite_b');
    R.hint(-28, PY, -46.5, 3.2, '{attack} to strike · strike foes beneath you in mid-air to bounce off them');
    incenseShrine(ctx.place(-33.4, 0, -56, Math.PI / 2), 0, PY, 0);
    R.add({ type: 'shrine', id: 'shrine_threshold', pos: v(-33.4, PY, -56), yaw: Math.PI / 2, name: 'Threshold Shrine' });
    R.hint(-32, PY, -56.5, 3.5, 'Rest at incense shrines to restore your lanterns and keep your progress · {interact}');
    R.add({ type: 'stele', id: 'stele_court', pos: v(-22.5, PY, -58), yaw: -Math.PI / 2 - 0.4, loreId: 'court' });
    steleFrame(ctx.place(-22.5, 0, -58, -Math.PI / 2 - 0.4), 0, PY, 0);
    R.add({ type: 'npc', id: 'npc_xun_1', pos: v(-33.8, PY, -49), yaw: -Math.PI / 2 + 0.5, npc: 'xun' });
    guardianStatue(W, -22.5, PY, -48.2, 1.1);
    column(W, -24.5, PY, -60, 5, 0.5, { broken: true });
    column(W, -30.5, PY, -60, 7, 0.5);
    deadTree(W, -33.5, PY, -52.5, 4.5, 51);
    glowMushrooms(W, -24.6, PY, -56.6, 9, 52, 1);
    reeds(W, -30, PY, -46, 2, 18, 53, 0.8);
    R.urn(-26, PY, -60.2, 7);
    R.urn(-35.4, PY, -52.4, 5);
    stoneLantern(W, -30.2, PY, -46.2, 1.4);

    // ------------------------------------------------------------ A6 · secret ledges west
    rockPillar(W, -38.8, PY - 0.4, -49.5, 1.3, 20, { seed: 60 });
    rockPillar(W, -43.5, PY - 1.2, -46.5, 1.2, 20, { seed: 61 });
    rockPillar(W, -47.2, PY + 0.6, -43, 1.2, 22, { seed: 62 });
    ledge(W, -51, PY + 1.2, -39.5, 3.6, 3.6, { depth: 8, seed: 63, rocks: false });
    R.add({ type: 'fragment', id: 'frag_threshold', pos: v(-51, PY + 2.4, -39.5) });
    R.urn(-52.2, PY + 1.2, -38.3, 12);
    boulder(W, -54.5, PY + 3, -37.5, 6, 64, { mat: 'rockDark', squash: 1.5 });
    glowMushrooms(W, -50, PY + 1.2, -38.4, 5, 65, 0.7);

    // ------------------------------------------------------------ A7 · down towards the terraces
    const lpY = PY - 2.2;
    stonePlatform(W, -24, lpY, -64.6, 3.2, 3.2, 0.6, { mat: 'woodDark', trim: 'wood', collide: { safe: true } });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) W.box('chain', -24 + sx * 1.4, lpY + 15, -64.6 + sz * 1.4, 0.05, 30, 0.05, {});
    hangingLantern(W, -24, lpY - 0.6, -64.6, 0.1, 0.5);
    R.add({ type: 'platform', id: 'th_lift_mp', path: [v(-19, lpY - 1.2, -68), v(-11, lpY - 1.2, -68)], w: 3, d: 3, speed: 2.2, pause: 0.9, style: 'lantern', trigger: 'always' });
    ledge(W, -7, lpY - 3, -70, 5, 5, { depth: 8, seed: 70 });
    stoneLantern(W, -8.8, lpY - 3, -68.4, 1.5);
    stairFlight(W, v(-7, 90, -79), v(-7, lpY - 3, -72.5), 3.4, true);
    ceremonialGate(ctx.place(-7, 0, -79.5, 0), 0, 90, 0, 6.4, 6.8, { tiers: 3 });
    R.hint(-24, lpY, -64.6, 2.4, 'Wait for the lantern raft, then {jump}.');

    // ------------------------------------------------------------ vistas: things seen from here
    // A colossal moth-sage carved into the western cavern wall
    sageStatue(ctx.place(-92, 0, -64, Math.PI / 2 - 0.25), 0, 58, 0, 5.2, { eyesGlow: true, collide: false });
    // the distant Great Pagoda (belongs to the terraces; visible from the overlook)
    void pagoda;
    // waterfalls pouring from the cliffs to the east
    waterfall(ctx, 22, 118, -30, 5, 50, -Math.PI / 2 + 0.3, 0xd8ccb4);
    waterfall(ctx, -64, 112, -18, 4, 45, Math.PI / 2, 0xd8ccb4);
    for (let i = 0; i < 6; i++) stalactite(W, -40 + i * 11, 125 + (i % 2) * 4, -20 - (i % 3) * 12, 14 + (i % 3) * 5, 2, 70 + i);

    return {
      spawns: R.spawns,
      cameraZones: [
        { box: new Box3(v(-5.4, Y - 1, -5.4), v(5.4, Y + 6, 5.4)), zone: { distance: 0.72, height: 0.2 } },
        { box: new Box3(v(-6.5, Y - 1, -15.2), v(6.5, Y + 6, -5.6)), zone: { distance: 1.35, pitch: 0.1, yaw: 0, yawStrength: 0.7, fov: 5, height: 0.8 } },
        { box: new Box3(v(-37, PY - 1, -62), v(-19, PY + 6, -44)), zone: { distance: 1.1 } },
      ],
      points: {
        start: v(0, Y + 0.45, 1.6),
        startYaw: v(Math.PI, 0, 0),
        openCam: v(1.6, Y + 1.2, 3.8),
        titleCam: v(-2, Y + 4.5, -13),
        titleLook: v(30, 70, -110),
      },
      rooms: [
        { id: 'th_tomb', name: 'Jade Tomb', min: [-6, -6], max: [6, 6], y: Y },
        { id: 'th_overlook', name: 'Overlook', min: [-6.5, -15], max: [6.5, -6], y: Y },
        { id: 'th_path', name: 'Cliff Path', min: [-31, -15], max: [-6.5, -9], y: Y - 2 },
        { id: 'th_bridge', name: 'Broken Bridge', min: [-30, -44], max: [-26, -15], y: Y - 1 },
        { id: 'th_plateau', name: 'Shrine Plateau', min: [-37, -62], max: [-19, -44], y: PY },
        { id: 'th_secret', name: 'Hidden Ledge', min: [-56, -50], max: [-40, -34], y: PY },
        { id: 'th_descent', name: 'Lantern Rafts', min: [-26, -80], max: [-4, -62], y: 93 },
      ],
    };
  },
};

export const _v = Vector3;
