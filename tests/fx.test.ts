import { describe, expect, it } from 'vitest';
import { Color, InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from 'three';
import { LightPool } from '../src/fx/LightPool';
import { Effects } from '../src/fx/Effects';
import { CameraRig } from '../src/camera/CameraRig';
import { PLAYER_DIMS } from '../src/player/playerDims';
import { floorWorld } from './helpers';

const lantern = (x: number) => ({ pos: new Vector3(x, 2, 0), color: new Color(1, 0.6, 0.3), intensity: 3, distance: 10, flicker: 0, phase: 0 });

describe('light pool flash', () => {
  it('borrows a slot, peaks, fades out and hands the slot back', () => {
    const scene = new Scene();
    const pool = new LightPool(scene, 2);
    pool.anchors = [lantern(0)];
    const lights = () => scene.children.map((c) => (c as unknown as { intensity: number }).intensity);
    for (let i = 0; i < 30; i++) pool.update(new Vector3(), i / 60, 1 / 60);
    pool.flash(new Vector3(5, 1, 0), new Color(0.6, 0.5, 1), 2, 4, 0.3);
    let peak = 0;
    for (let i = 0; i < 6; i++) {
      pool.update(new Vector3(), 0.5 + i / 60, 1 / 60);
      peak = Math.max(peak, ...lights());
    }
    // the lantern keeps its slot; the flash is at least as bright as the lantern
    expect(peak).toBeGreaterThanOrEqual(3 * pool.intensityScale * 0.99);
    expect(lights().filter((v) => v > 0).length).toBe(2);
    for (let i = 0; i < 20; i++) pool.update(new Vector3(), 1 + i / 60, 1 / 60);
    // 0.43 s later the flash is over: only the lantern is lit
    expect(lights().filter((v) => v > 0).length).toBe(1);
    // and a second lantern can use the freed slot
    pool.anchors.push(lantern(3));
    for (let i = 0; i < 60; i++) pool.update(new Vector3(), 2 + i / 60, 1 / 60);
    expect(lights().filter((v) => v > 0).length).toBe(2);
  });

  it('slows with slow motion', () => {
    const scene = new Scene();
    const pool = new LightPool(scene, 1);
    pool.flashTimeScale = 0.25;
    pool.flash(new Vector3(), new Color(1, 1, 1), 2, 4, 0.3);
    for (let i = 0; i < 30; i++) pool.update(new Vector3(), i / 60, 1 / 60);
    const l = scene.children[0] as unknown as { intensity: number };
    expect(l.intensity).toBeGreaterThan(0);
  });
});

describe('enemy defeat effect', () => {
  it('lights up, scales with size, and is gone after about a second', () => {
    const fx = new Effects(new Scene());
    const calls: number[][] = [];
    fx.onLight = (_p, _c, i, d, dur) => calls.push([i, d, dur]);
    fx.defeat(new Vector3(0, 1, 0), 1);
    fx.defeat(new Vector3(0, 1, 0), 2);
    expect(calls.length).toBe(2);
    expect(calls[1][0]).toBeCloseTo(calls[0][0] * 2);
    expect(calls[0][2]).toBeLessThan(0.5);
    const streaks = fx.group.children.find((c) => c instanceof InstancedMesh) as InstancedMesh;
    const lit = () => {
      const m = new Matrix4();
      let n = 0;
      for (let i = 0; i < streaks.count; i++) {
        streaks.getMatrixAt(i, m);
        if (Math.abs(m.determinant()) > 1e-12) n++;
      }
      return n;
    };
    const cam = new Vector3(0, 3, 6);
    const q = new Quaternion();
    fx.update(1 / 60, q, cam);
    expect(lit()).toBeGreaterThan(20);
    for (let i = 0; i < 70; i++) fx.update(1 / 60, q, cam);
    expect(lit()).toBe(0);
  });
});

describe('combat camera framing', () => {
  /** Height at which the line from the camera to a small enemy 1.5 m ahead crosses the player. */
  function sightHeight(combat: number): { pitch: number; y: number } {
    const world = floorWorld();
    const rig = new CameraRig(16 / 9);
    const target = { position: new Vector3(0, 0, 0), velocity: new Vector3(), grounded: true, facing: Math.PI };
    rig.snapTo(target, 0);
    rig.combat = combat;
    for (let i = 0; i < 360; i++) rig.update(1 / 60, target, { x: 0, y: 0 }, world, false);
    const cam = rig.camera.position;
    const h = Math.hypot(cam.x, cam.z);
    // camera yaw 0 sits on +z; "ahead" of the player is -z
    const enemy = new Vector3(0, 0.3, -1.5);
    const y = cam.y + (enemy.y - cam.y) * (h / (h + 1.5));
    return { pitch: rig.pitch, y };
  }
  const maskTop = PLAYER_DIMS.neckY + PLAYER_DIMS.maskCenterY + PLAYER_DIMS.maskHalfH;

  it('exploring: the usual low view (a small enemy right in front would sit behind the mask)', () => {
    const r = sightHeight(0);
    expect(r.pitch).toBeCloseTo(0.3, 2);
    expect(r.y).toBeLessThan(maskTop);
  });
  it('fighting: the view clears the mask', () => {
    const r = sightHeight(1);
    expect(r.pitch).toBeGreaterThan(0.44);
    expect(r.y).toBeGreaterThan(maskTop);
  });
});
