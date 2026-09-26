import {
  Color, DirectionalLight, FogExp2, Group, HemisphereLight, Scene, Vector3, Box3, Object3D,
} from 'three';
import { BuildContext, LightAnchor, Animated } from './BuildContext';
import { RegionContent, RegionDef, Atmosphere } from './Region';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { worldMaterials, WorldUniforms } from '../art/materials';
import { buildGlows } from '../fx/Glows';
import { LightPool } from '../fx/LightPool';
import { AmbientParticles } from '../fx/AmbientParticles';
import { Renderer } from '../fx/Renderer';
import { Env } from '../core/env';

export interface BuiltRegion {
  def: RegionDef;
  group: Group;
  content: RegionContent;
  lights: LightAnchor[];
  animated: Animated[];
  particles: AmbientParticles[];
  triangles: number;
  meshes: number;
  viewBounds: Box3;
}

const _c = new Color();

/** Owns every region: builds them, streams visibility and blends atmosphere. */
export class World {
  readonly regions: BuiltRegion[] = [];
  current: BuiltRegion | null = null;
  readonly hemi: HemisphereLight;
  readonly key: DirectionalLight;
  readonly fog: FogExp2;
  readonly lightPool: LightPool;
  private atm = {
    bg: new Color(), fog: new Color(), fogLow: new Color(), hemiSky: new Color(), hemiGround: new Color(), key: new Color(),
    density: 0.01, fogHeight: 0, falloff: 30, hdensity: 0.02, hemiI: 1, keyI: 1,
  };
  private keyDir = new Vector3(0.3, 1, 0.2).normalize();
  private initialized = false;
  particleScale = 1;

  constructor(private scene: Scene, private physics: PhysicsWorld, private renderer: Renderer | null) {
    this.fog = new FogExp2(0x0b1622, 0.012);
    scene.fog = this.fog;
    this.hemi = new HemisphereLight(0x4a6a90, 0x120c10, 0.9);
    scene.add(this.hemi);
    this.key = new DirectionalLight(0x9bb8e0, 1.2);
    this.key.position.set(30, 80, 20);
    this.key.castShadow = false;
    this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 120;
    this.key.shadow.bias = -0.0006;
    scene.add(this.key);
    scene.add(this.key.target);
    this.lightPool = new LightPool(scene, renderer?.profile.lights ?? 5);
  }

  /** Build all regions. Yields between regions so a loading bar can update. */
  async build(defs: RegionDef[], onProgress?: (p: number, label: string) => void): Promise<void> {
    const mats = worldMaterials();
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      onProgress?.(i / defs.length, def.name);
      await new Promise((r) => setTimeout(r, 0));
      const ctx = new BuildContext(this.physics, def.seed, def.id);
      const content = def.build(ctx);
      const group = new Group();
      group.name = `region:${def.id}`;
      const stats = ctx.batch.build(mats, group);
      group.add(ctx.group);
      const glows = buildGlows(ctx.glows);
      if (glows) group.add(glows);
      const particles: AmbientParticles[] = [];
      if (!Env.headless) {
        for (const spec of def.atmosphere.particles) {
          const p = new AmbientParticles(spec, this.particleScale);
          p.visibleTarget = 0;
          particles.push(p);
          this.scene.add(p.points);
        }
      }
      this.scene.add(group);
      const vb = def.bounds.clone().expandByScalar(160);
      this.regions.push({
        def, group, content, lights: ctx.lights, animated: ctx.animated, particles,
        triangles: stats.triangles, meshes: stats.meshes, viewBounds: vb,
      });
    }
    onProgress?.(1, 'ready');
    this.lightPool.anchors = this.regions.flatMap((r) => r.lights);
  }

  regionAt(p: Vector3): BuiltRegion | null {
    let best: BuiltRegion | null = null;
    let bestVol = Infinity;
    for (const r of this.regions) {
      if (r.def.always) continue;
      if (r.def.bounds.containsPoint(p)) {
        const s = r.def.bounds.getSize(new Vector3());
        const vol = s.x * s.y * s.z;
        if (vol < bestVol) {
          best = r;
          bestVol = vol;
        }
      }
    }
    return best;
  }

  byId(id: string): BuiltRegion | undefined {
    return this.regions.find((r) => r.def.id === id);
  }

  setParticleScale(s: number): void {
    this.particleScale = s;
  }

  private applyAtmosphereTarget(a: Atmosphere, dt: number, snap: boolean): void {
    const k = snap ? 1 : 1 - Math.exp(-1.3 * dt);
    const A = this.atm;
    A.bg.lerp(_c.set(a.background), k);
    A.fog.lerp(_c.set(a.fogColor), k);
    A.fogLow.lerp(_c.set(a.fogLow), k);
    A.hemiSky.lerp(_c.set(a.hemiSky), k);
    A.hemiGround.lerp(_c.set(a.hemiGround), k);
    A.key.lerp(_c.set(a.keyColor), k);
    A.density += (a.fogDensity - A.density) * k;
    A.fogHeight += (a.fogHeight - A.fogHeight) * k;
    A.falloff += (a.fogFalloff - A.falloff) * k;
    A.hdensity += (a.fogHeightDensity - A.hdensity) * k;
    A.hemiI += (a.hemiIntensity - A.hemiI) * k;
    A.keyI += (a.keyIntensity - A.keyI) * k;
    this.keyDir.lerp(new Vector3(...a.keyDir).normalize(), k);
    this.scene.background = A.bg;
    this.fog.color.copy(A.fog);
    this.fog.density = A.density;
    WorldUniforms.uFogLowColor.value.copy(A.fogLow);
    WorldUniforms.uFogHeight.value = A.fogHeight;
    WorldUniforms.uFogHeightFalloff.value = A.falloff;
    WorldUniforms.uFogHeightDensity.value = A.hdensity;
    this.hemi.color.copy(A.hemiSky);
    this.hemi.groundColor.copy(A.hemiGround);
    this.hemi.intensity = A.hemiI;
    this.key.color.copy(A.key);
    this.key.intensity = A.keyI;
    if (this.renderer && a.grade) {
      const g = this.renderer.grade;
      const t = a.grade;
      if (t.lift) g.lift.lerp(_c.setRGB(...t.lift), k);
      if (t.gain) g.gain.lerp(_c.setRGB(...t.gain), k);
      if (t.saturation !== undefined) g.saturation += (t.saturation - g.saturation) * k;
      if (t.vignette !== undefined) g.vignette += (t.vignette - g.vignette) * k;
      if (t.bloomStrength !== undefined) g.bloomStrength += (t.bloomStrength - g.bloomStrength) * k;
      if (t.bloomThreshold !== undefined) g.bloomThreshold += (t.bloomThreshold - g.bloomThreshold) * k;
      if (t.exposure !== undefined) g.exposure += (t.exposure - g.exposure) * k;
    }
  }

  update(dt: number, t: number, player: Vector3, cam: Vector3, pixelRatio: number): BuiltRegion | null {
    WorldUniforms.uTime.value = t;
    const r = this.regionAt(player) ?? this.current ?? this.regions.find((x) => !x.def.always) ?? null;
    const changed = r !== this.current;
    this.current = r;
    if (r) this.applyAtmosphereTarget(r.def.atmosphere, dt, !this.initialized);
    this.initialized = true;
    // key light follows the player so its (optional) shadow frustum stays tight
    this.key.position.copy(player).addScaledVector(this.keyDir, 60);
    this.key.target.position.copy(player);
    for (const reg of this.regions) {
      const vis = reg.def.always || reg.viewBounds.containsPoint(cam) || reg === r;
      reg.group.visible = vis;
      if (vis) for (const a of reg.animated) a.update(t, dt);
      for (const p of reg.particles) {
        p.visibleTarget = reg === r ? 1 : 0;
        p.update(t, dt, cam, pixelRatio);
      }
    }
    this.lightPool.update(player, t, dt);
    return changed ? r : null;
  }

  stats(): { triangles: number; meshes: number; lights: number } {
    let triangles = 0, meshes = 0, lights = 0;
    for (const r of this.regions) {
      triangles += r.triangles;
      meshes += r.meshes;
      lights += r.lights.length;
    }
    return { triangles, meshes, lights };
  }

  addToRegion(regionId: string, o: Object3D): void {
    const r = this.byId(regionId);
    (r ? r.group : this.scene).add(o);
  }
}
