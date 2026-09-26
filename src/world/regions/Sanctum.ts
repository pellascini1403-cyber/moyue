import { Box3, Color, Mesh, PlaneGeometry, ShaderMaterial, Vector3, DoubleSide } from 'three';
import { RegionDef, box3, v } from '../Region';
import { RegionBuilder, ledge } from './helpers';
import { stonePlatform, stoneLantern, hangingLantern, column, ceremonialGate, templeHall, balustrade } from '../../art/geo/structures';
import { incenseShrine, steleFrame, guardianStatue, templeBell, sageStatue } from '../../art/geo/props';
import { boulder, hangingRoots, stalactite, deadTree, reeds } from '../../art/geo/nature';
import { bannerGeometry } from '../../art/geo/structures';
import { REGION_TEXT } from '../../story/lore';
import { WorldUniforms } from '../../art/materials';
import { fogUniforms } from '../../art/shaderFog';

const T = REGION_TEXT.sanctum;

/** Glowing cinnabar pool surface (hazard visual). */
function crimsonPool(w: number, d: number): Mesh {
  const m = new ShaderMaterial({
    uniforms: { ...fogUniforms(), uTime: WorldUniforms.uTime },
    fog: true,
    vertexShader: `#include <fog_pars_vertex>
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform float uTime; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * 0.35;
        float r = n(p + uTime * 0.08) * 0.6 + n(p * 2.3 - uTime * 0.12) * 0.4;
        float ripple = sin(length(vW.xz - vec2(12.0, -222.0)) * 1.4 - uTime * 1.6) * 0.5 + 0.5;
        // dark cinnabar with slow glowing veins (not lava: mostly deep red-black)
        float veins = smoothstep(0.62, 0.9, r) * (0.6 + ripple * 0.4);
        vec3 c = mix(vec3(0.07, 0.004, 0.006), vec3(0.28, 0.02, 0.02), r);
        c += vec3(1.3, 0.16, 0.06) * veins * 0.55;
        c += vec3(0.5, 0.05, 0.02) * pow(ripple, 8.0) * 0.25;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    side: DoubleSide,
  });
  const mesh = new Mesh(new PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/**
 * Region 4 — The Crimson Sanctum.
 * The bell-warden's hall: near-black stone, cinnabar pools, red lanterns. The
 * Tolling Abbot guards the sealed floor at the heart of the courtyard. Bell
 * Strike breaks the seal — and the descent continues.
 */
export const Sanctum: RegionDef = {
  id: 'sanctum',
  name: T.name,
  hanzi: T.hanzi,
  subtitle: T.subtitle,
  bounds: box3(-42, -12, -244, 34, 30, -186),
  // sunk deep below the cloister: only drawn when close, or when looking down the Descent Well
  viewDistance: 30,
  viewFrom: [box3(-42, 14, -206, -26, 90, -189)],
  killY: -30,
  seed: 404,
  atmosphere: {
    background: 0x060203,
    fogColor: 0x160608,
    fogDensity: 0.016,
    fogLow: 0x4a0a0c,
    fogHeight: 15,
    fogFalloff: 6,
    fogHeightDensity: 0.06,
    hemiSky: 0x5a3a48,
    hemiGround: 0x2a0606,
    hemiIntensity: 1.7,
    keyColor: 0xc08080,
    keyIntensity: 1.0,
    keyDir: [0.2, 1, -0.3],
    grade: { lift: [0.02, 0.0, 0.0], gain: [1.08, 0.94, 0.92], saturation: 1.1, vignette: 0.62, bloomStrength: 1.05, bloomThreshold: 0.75, exposure: 1.0 },
    particles: [
      { kind: 'ash', color: 0xb09090, count: 220, size: 0.05, extent: 14, speed: 1, opacity: 0.5 },
      { kind: 'embers', color: 0xff5030, count: 90, size: 0.06, extent: 16, speed: 1, opacity: 0.8 },
    ],
    music: 'sanctum',
    ambience: 'sanctum',
  },
  build(ctx) {
    const R = new RegionBuilder(ctx, 'sa');
    const W = R.W;
    const Y = 16;

    // ------------------------------------------------------------ S0 · the well's floor
    stonePlatform(W, -34, Y, -197.5, 11, 11, 2, { collide: { safe: true }, mat: 'stoneDark' });
    W.box('rockDark', -34, Y - 6, -197.5, 10, 10, 10, {});
    reeds(W, -36, Y, -199, 2.5, 18, 401, 0.8);
    hangingRoots(W, -34, Y + 20, -197.5, 10, 12, 402, 4);
    R.hint(-34, Y, -197.5, 4, 'The air tastes of iron and old incense.');

    // ------------------------------------------------------------ S1 · the crimson approach
    stonePlatform(W, -19, Y, -200.85, 20, 10.3, 2, { collide: { safe: true }, mat: 'stoneDark' });
    stonePlatform(W, -6, Y, -210, 6, 18, 2, { collide: { safe: true }, mat: 'stoneDark' });
    for (let i = 0; i < 3; i++) ceremonialGate(ctx.place(-26 + i * 7, 0, -202, Math.PI / 2), 0, Y, 0, 4.6, 5.6, { mat: 'wood', roof: 'roofRed', tiers: 1 });
    // pools of cinnabar either side (hazard)
    for (const [x, z, w, d] of [[-13.5, -193.2, 29, 5], [-19, -208.6, 14, 5], [-11, -214, 4, 8]] as const) {
      const pool = crimsonPool(w, d);
      pool.position.set(x, Y - 0.6, z);
      ctx.object(pool);
      W.box('stoneDark', x, Y - 1.4, z, w, 1.4, d, { collide: { hazard: 1, walkable: true, safe: false, tag: 'pool' } });
      W.light(x, Y + 0.5, z, 0xff2010, 3, 10, 0.1);
    }
    for (const x of [-24, -16, -9]) {
      hangingLantern(W, x, Y + 7, -199.2, 1.8, 0.6);
      hangingLantern(W, x, Y + 7, -204.8, 2.2, 0.55);
    }
    for (let i = 0; i < 6; i++) {
      W.add('cloth', bannerGeometry(0.7, 3.2), -27 + i * 4, Y + 6.5, -199.3 + (i % 2) * -5.4, 0, 0, 0, 1, 1, 1, { uvScale: 0 });
    }
    incenseShrine(ctx.place(-6, 0, -205, -Math.PI / 2), 0, Y, 0);
    R.add({ type: 'shrine', id: 'shrine_sanctum', pos: v(-6, Y, -205), yaw: -Math.PI / 2, name: 'Crimson Shrine' });
    R.add({ type: 'stele', id: 'stele_bell', pos: v(-3.6, Y, -212), yaw: -Math.PI / 2, loreId: 'bell' });
    steleFrame(ctx.place(-3.6, 0, -212, -Math.PI / 2), 0, Y, 0);
    R.add({ type: 'npc', id: 'npc_xun_3', pos: v(-8, Y, -212.5), yaw: Math.PI / 2, npc: 'xun' });
    R.enemy('shieldback', -14, Y + 0.1, -202, -Math.PI / 2, 'sa_guard');
    R.enemy('inkMite', -22, Y + 0.1, -201, -Math.PI / 2, 'sa_mite_a');
    R.enemy('lanternWisp', -18, Y + 3.5, -203, 0, 'sa_wisp');
    guardianStatue(W, -30.5, Y, -205.2, 1.2);
    guardianStatue(W, -30.5, Y, -198.8, 1.2);

    // pogo trial: thorn lotus across the pool to a hidden fragment
    for (let i = 0; i < 4; i++) R.add({ type: 'thornLotus', id: `sa_lotus_${i}`, pos: v(-14.5 + i * 3.4, Y - 0.7, -193.3), scale: 1.1 });
    ledge(W, -1.6, Y + 0.6, -193.3, 3, 3, { depth: 6, seed: 403, rocks: false });
    R.add({ type: 'fragment', id: 'frag_sanctum', pos: v(-1.6, Y + 1.8, -193.3) });
    R.hint(-15, Y, -196.6, 3, 'Thorns bloom on the pool. Strike down on them to bounce across.');

    // ------------------------------------------------------------ S2 · the bell-warden's courtyard (boss)
    const CX = 12, CZ = -222;
    // square island with a sealed hole in its heart
    const H = 14, hole = 2.2;
    const deck = (x0: number, x1: number, z0: number, z1: number) =>
      stonePlatform(W, (x0 + x1) / 2, Y, (z0 + z1) / 2, x1 - x0, z1 - z0, 2.5, { collide: { safe: true }, mat: 'stoneDark', trim: null });
    deck(CX - H, CX + H, CZ - H, CZ - hole);
    deck(CX - H, CX + H, CZ + hole, CZ + H);
    deck(CX - H, CX - hole, CZ - hole, CZ + hole);
    deck(CX + hole, CX + H, CZ - hole, CZ + hole);
    // inlaid meander pattern around the seal (decor)
    for (let r = 4; r <= 10; r += 3) {
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        W.box('crimson', CX + sx * r, Y + 0.01, CZ + sz * r, sz ? r * 2 : 0.25, 0.02, sx ? r * 2 : 0.25, {});
      }
    }
    R.add({ type: 'crackedFloor', id: 'sa_seal', pos: v(CX, Y - 0.4, CZ), w: hole * 2, d: hole * 2 });
    // the shaft below the seal & the ending trigger
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      W.box('rockDark', CX + dx * (hole + 0.5), Y - 12, CZ + dz * (hole + 0.5), dx ? 1 : hole * 2 + 2, 22, dz ? 1 : hole * 2 + 2, { collide: { walkable: false } });
    }
    R.add({ type: 'trigger', id: 'sa_ending', pos: v(CX, Y - 10, CZ), half: v(hole, 2, hole), event: 'ending', once: false });
    stonePlatform(W, CX, Y - 22, CZ, 8, 8, 1, { collide: { safe: true } });
    R.hint(CX, Y, CZ, 3.4, 'A seal of cracked stone. Something heavy could break it.', 'bellStrike');
    R.hint(CX, Y, CZ, 3.4, 'Leap above the seal and press {special} to fall like a bell.', undefined, 'bellStrike');

    // moat of cinnabar around the island
    const moat = crimsonPool(56, 56);
    moat.position.set(CX, Y - 1.5, CZ);
    ctx.object(moat);
    // hazard volume under the moat, leaving the seal's shaft clear
    const moatY = Y - 3;
    const mz = (id: string, x0: number, x1: number, z0: number, z1: number) =>
      R.add({ type: 'hazardZone', id, pos: v((x0 + x1) / 2, moatY, (z0 + z1) / 2), half: v((x1 - x0) / 2, 1.2, (z1 - z0) / 2), damage: 1, kind: 'pool' });
    mz('sa_moat_n', CX - 28, CX + 28, CZ - 28, CZ - hole - 0.3);
    mz('sa_moat_s', CX - 28, CX + 28, CZ + hole + 0.3, CZ + 28);
    mz('sa_moat_w', CX - 28, CX - hole - 0.3, CZ - hole - 0.3, CZ + hole + 0.3);
    mz('sa_moat_e', CX + hole + 0.3, CX + 28, CZ - hole - 0.3, CZ + hole + 0.3);
    // bridge from the approach
    stonePlatform(W, CX - H - 3.5, Y, CZ, 7, 4.4, 2.5, { collide: { safe: true }, mat: 'stoneDark' });
    balustrade(W, CX - H - 3.5, Y, CZ - 2.2, 7);
    balustrade(W, CX - H - 1.1, Y, CZ + 2.2, 2.2); // south side left open where the shrine path joins
    stonePlatform(W, -6, Y, -216, 6, 6, 2, { collide: { safe: true }, mat: 'stoneDark' });
    stonePlatform(W, -6, Y, -220.5, 3.2, 4, 2, { collide: { safe: true }, mat: 'stoneDark' });
    R.add({ type: 'gate', id: 'gate_boss_w', pos: v(CX - H - 0.4, Y, CZ), yaw: Math.PI / 2, width: 4.4, height: 4.5, kind: 'barrier' });
    R.enemy('tollingAbbot', CX + 4, Y + 0.1, CZ, -Math.PI / 2, 'boss_abbot', 'arena_abbot');
    R.add({ type: 'arena', id: 'arena_abbot', pos: v(CX, Y + 4, CZ), half: v(H - 0.6, 5, H - 0.6), gates: ['gate_boss_w'], waves: [['boss_abbot']], music: 'boss', boss: 'boss_abbot' });
    R.add({ type: 'ability', id: 'altar_bell', pos: v(CX, Y, CZ + 9), yaw: Math.PI, ability: 'bellStrike', arena: 'arena_abbot' });
    // the hall of the bell on the far side (scenery) with the great bell's frame
    templeHall(W, CX + H + 7, Y - 3, CZ, 6, 5, { podium: 1, colH: 8, roof: 'roofRed', doubleRoof: true, collide: false, lanterns: true, steps: false });
    templeBell(W, CX + H + 7, Y + 11, CZ, 2.4);
    for (const [x, z] of [[CX - H + 1, CZ - H + 1], [CX + H - 1, CZ - H + 1], [CX - H + 1, CZ + H - 1], [CX + H - 1, CZ + H - 1]]) {
      column(W, x, Y, z, 9, 0.6, { mat: 'stoneDark' });
      hangingLantern(W, x, Y + 9, z, 0.3, 0.9);
      stoneLantern(W, x + Math.sign(CX - x) * 2.2, Y, z + Math.sign(CZ - z) * 2.2, 1.6);
    }
    hangingLantern(W, CX, Y + 16, CZ, 4, 1.8);

    // ------------------------------------------------------------ dressing
    sageStatue(ctx.place(CX, 0, CZ - 36, 0), 0, Y - 6, 0, 3.6, { eyesGlow: true, collide: false, broken: true });
    for (let i = 0; i < 10; i++) stalactite(W, -30 + i * 7, 48 + (i % 3) * 4, -190 - (i % 4) * 12, 16 + (i % 3) * 6, 2.2, 410 + i);
    boulder(W, -38, Y + 1, -192, 5, 420, { mat: 'rockDark', squash: 1.3 });
    boulder(W, -40, Y + 1, -203, 6, 421, { mat: 'rockDark', squash: 1.3 });
    deadTree(W, -26, Y, -206.5, 5, 422, false);

    return {
      spawns: R.spawns,
      cameraZones: [
        { box: new Box3(v(CX - H, Y - 1, CZ - H), v(CX + H, Y + 12, CZ + H)), zone: { distance: 1.3, pitch: 0.42, height: 0.4 } },
        { box: new Box3(v(CX - hole, Y - 24, CZ - hole), v(CX + hole, Y - 1, CZ + hole)), zone: { distance: 0.7, pitch: 1.2 } },
      ],
      points: { bossCenter: v(CX, Y, CZ) },
      rooms: [
        { id: 'sa_well', name: 'Well Floor', min: [-39.5, -203], max: [-28.5, -192], y: Y },
        { id: 'sa_approach', name: 'Crimson Approach', min: [-29, -206], max: [-3, -195.7], y: Y },
        { id: 'sa_shrine', name: 'Crimson Shrine', min: [-9, -219], max: [-3, -201], y: Y },
        { id: 'sa_lotus', name: 'Thorn Pool', min: [-16, -195.7], max: [0, -190.7], y: Y },
        { id: 'sa_court', name: 'Bell-Warden’s Court', min: [CX - H - 7, CZ - H], max: [CX + H, CZ + H], y: Y },
      ],
    };
  },
};

export const _v = Vector3;
export const _c = Color;
