import {
  AdditiveBlending, BoxGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry,
  Sprite, Vector3, Quaternion, Euler,
} from 'three';
import { Entity } from './Entity';
import { ferryTarget, newFerry } from '../world/ferry';
import type { Game } from '../game/Game';
import { Damageable, HitInfo, HitResult, Hurtbox } from '../combat/Combat';
import { Collider } from '../physics/Collider';
import { buildFragment, buildRelic, buildWeng, buildXun, buildJadeBead, NpcView } from '../art/characters/NpcModels';
import { characterMaterial, glowSpriteMaterial, worldMaterials } from '../art/materials';
import { steleTexture, talismanTexture } from '../art/textures';
import { urnGeometry } from '../art/geo/props';
import { thornLotusGeometry } from '../art/geo/nature';
import { AbilityId, AbilityInfo } from '../player/Abilities';
import { Env } from '../core/env';
import { mergeRigParts } from '../art/characters/merge';
import { hashString } from '../core/rng';
import { damp } from '../core/math';

const _v = new Vector3();

function near(game: Game, p: Vector3, r: number, dy = 2): boolean {
  const pp = game.player.position;
  return Math.hypot(pp.x - p.x, pp.z - p.z) < r && Math.abs(pp.y - p.y) < dy;
}

// ------------------------------------------------------------------ Shrine
/** Incense shrine: rest to heal, set respawn, save and reset the world. */
export class Shrine extends Entity {
  lit = false;
  private glow: Sprite | null = null;
  private smokeT = 0;
  readonly yaw: number;

  constructor(game: Game, id: string, region: string, pos: Vector3, yaw: number, public name: string) {
    super(game, id, region);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.yaw = yaw;
    this.interactRadius = 2.4;
    this.sleepDistance = 60;
    if (!Env.headless) {
      this.glow = new Sprite(glowSpriteMaterial(new Color(1.2, 0.7, 0.3), 0.3));
      this.glow.scale.setScalar(2.4);
      const censer = new Vector3(0, 0.95, 0.35).applyAxisAngle(new Vector3(0, 1, 0), yaw).add(pos);
      this.glow.position.copy(censer).sub(pos);
      this.root.add(this.glow);
      this.root.position.copy(pos);
      game.world.addToRegion(region, this.root, this.position);
    }
  }

  get standPoint(): Vector3 {
    return new Vector3(Math.sin(this.yaw) * 2.2, 0.4, Math.cos(this.yaw) * 2.2).add(this.position);
  }

  fixedUpdate(dt: number): void {
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.lit && !Env.headless) {
      this.smokeT = 0.35;
      const p = new Vector3(0, 1.1, 0.35).applyAxisAngle(new Vector3(0, 1, 0), this.yaw).add(this.position);
      this.game.fx.burst(p, { count: 1, color: new Color(0.9, 0.85, 0.8), speed: 0.3, dir: new Vector3(0, 1, 0), spread: 0.2, life: 2.2, size: 0.45, gravity: -0.35, drag: 0.5, additive: false });
      this.game.fx.burst(p, { count: 1, color: new Color(1.6, 0.8, 0.3), speed: 0.5, dir: new Vector3(0, 1, 0), spread: 0.5, life: 0.8, size: 0.05, gravity: -1 });
    }
  }

  render(dt: number, _a: number, t: number): void {
    if (this.glow) {
      const target = this.lit ? 1 : 0.25;
      const m = this.glow.material;
      m.opacity = damp(m.opacity, target * (0.85 + Math.sin(t * 7) * 0.1), 4, dt);
    }
  }

  interactPrompt(): string | null {
    return near(this.game, this.position, this.interactRadius + 0.6) ? 'Rest' : null;
  }

  interact(): void {
    this.game.restAtShrine(this);
  }
}

// ------------------------------------------------------------------ Stele
export class Stele extends Entity {
  constructor(game: Game, id: string, region: string, pos: Vector3, yaw: number, public loreId: string) {
    super(game, id, region);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.interactRadius = 2.2;
    if (!Env.headless) {
      const tex = steleTexture(hashString(loreId) % 1000);
      const face = new Mesh(new PlaneGeometry(0.9, 2.0), new MeshBasicMaterial({ map: tex, color: new Color(0.9, 0.9, 0.9), fog: true }));
      face.position.set(0, 1.75, 0.185);
      const g = new Group();
      g.add(face);
      g.rotation.y = yaw;
      g.position.copy(pos);
      this.root.add(g);
      game.world.addToRegion(region, this.root, this.position);
      const halo = new Sprite(glowSpriteMaterial(new Color(0.5, 0.45, 0.3), 0.25));
      halo.scale.setScalar(2.4);
      halo.position.set(pos.x, pos.y + 1.7, pos.z);
      this.root.add(halo);
    }
  }
  fixedUpdate(): void {}
  render(): void {}
  interactPrompt(): string | null {
    return near(this.game, this.position, this.interactRadius + 0.3) ? 'Read' : null;
  }
  interact(): void {
    this.game.readStele(this.loreId);
  }
}

// ------------------------------------------------------------------ Ability altar
export class AbilityAltar extends Entity {
  taken = false;
  sealed = false;
  private relic: ReturnType<typeof buildRelic> | null = null;
  private pedestal: Group | null = null;

  constructor(game: Game, id: string, region: string, pos: Vector3, public yaw: number, public ability: AbilityId, public arena?: string) {
    super(game, id, region);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.interactRadius = 2;
    if (!Env.headless) {
      const mats = worldMaterials();
      this.pedestal = new Group();
      const base = new Mesh(new CylinderGeometry(0.7, 0.9, 0.9, 8), mats.stoneDark);
      base.position.y = 0.45;
      this.pedestal.add(base);
      const top = new Mesh(new CylinderGeometry(0.8, 0.7, 0.15, 8), mats.gold);
      top.position.y = 0.95;
      this.pedestal.add(top);
      this.pedestal.position.copy(pos);
      mergeRigParts(this.pedestal);
      this.root.add(this.pedestal);
      this.relic = buildRelic(ability === 'bellStrike' ? new Color(1.6, 1.2, 0.6) : new Color(0.9, 1.5, 1.3));
      this.relic.root.position.set(pos.x, pos.y + 1.9, pos.z);
      this.root.add(this.relic.root);
      game.world.addToRegion(region, this.root, this.position);
    }
    game.physics.add(Collider.cylinder(pos.clone().add(new Vector3(0, 0.5, 0)), 0.8, 0.5, { walkable: true, safe: true }));
  }

  syncFromSave(): void {
    this.taken = !!this.game.progress.abilities[this.ability];
    if (this.relic) this.relic.root.visible = !this.taken;
  }

  fixedUpdate(): void {}

  render(dt: number, _a: number, t: number): void {
    if (!this.relic || this.taken) return;
    const r = this.relic.root;
    r.position.y = this.position.y + 1.9 + Math.sin(t * 1.8) * 0.12;
    r.rotation.y += dt * 0.8;
    r.rotation.z = Math.sin(t * 1.1) * 0.2;
    this.relic.glow.material.opacity = this.sealed ? 0.25 : 0.9 + Math.sin(t * 3) * 0.1;
  }

  interactPrompt(): string | null {
    if (this.taken || this.sealed) return null;
    return near(this.game, this.position, this.interactRadius + 0.8) ? 'Take' : null;
  }

  interact(): void {
    if (this.taken || this.sealed) return;
    this.taken = true;
    if (this.relic) this.relic.root.visible = false;
    this.game.grantAbility(this.ability, this.position.clone().add(new Vector3(0, 1.9, 0)));
  }

  describe(): string {
    return AbilityInfo[this.ability].name;
  }
}

// ------------------------------------------------------------------ Pickups
export class FragmentPickup extends Entity {
  private view: ReturnType<typeof buildFragment> | null = null;
  constructor(game: Game, id: string, region: string, pos: Vector3) {
    super(game, id, region);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    if (!Env.headless) {
      this.view = buildFragment();
      this.root.add(this.view.root);
      this.root.position.copy(pos);
      game.world.addToRegion(region, this.root, this.position);
    }
  }
  syncFromSave(): void {
    if (this.game.progress.fragments.includes(this.id)) {
      this.alive = false;
      this.root.visible = false;
    }
  }
  fixedUpdate(): void {
    if (!this.alive) return;
    if (near(this.game, this.position, 1.0, 1.6)) {
      this.alive = false;
      this.root.visible = false;
      this.game.collectFragment(this.id, this.position);
    }
  }
  render(dt: number, _a: number, t: number): void {
    if (!this.view) return;
    this.view.root.rotation.y += dt * 1.5;
    this.view.root.position.y = Math.sin(t * 2) * 0.12;
  }
}

/** Jade bead that flies to the player once released. */
export class JadeBead extends Entity {
  private vel = new Vector3();
  private mesh: Mesh | null = null;
  private age = 0;
  constructor(game: Game, pos: Vector3, public amount: number) {
    super(game, `jade_${Math.random().toString(36).slice(2)}`, game.region?.def.id ?? '');
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.vel.set((Math.random() - 0.5) * 5, 4 + Math.random() * 3, (Math.random() - 0.5) * 5);
    if (!Env.headless) {
      this.mesh = buildJadeBead();
      this.root.add(this.mesh);
      this.root.position.copy(pos);
      game.scene.add(this.root);
    }
    this.sleepDistance = 1e9;
  }
  fixedUpdate(dt: number): void {
    this.age += dt;
    const pp = this.game.player.position;
    _v.set(pp.x, pp.y + 0.6, pp.z).sub(this.position);
    const d = _v.length();
    if (this.age > 0.45) {
      this.vel.lerp(_v.normalize().multiplyScalar(14), Math.min(1, dt * 8));
    } else this.vel.y -= 16 * dt;
    this.position.addScaledVector(this.vel, dt);
    if (d < 0.5 || this.age > 3) {
      this.alive = false;
      this.dispose();
      this.game.addJade(this.amount);
    }
  }
  render(dt: number, alpha: number): void {
    super.render(dt, alpha, 0);
    if (this.mesh) this.mesh.rotation.y += dt * 8;
  }
}

// ------------------------------------------------------------------ Urn (breakable)
export class Urn extends Entity implements Damageable {
  readonly damageableId: string;
  pogoable = true;
  givesMoonlight = false;
  private hb: Hurtbox[];
  private mesh: Mesh | null = null;
  private collider: Collider;
  broken = false;
  constructor(game: Game, id: string, region: string, pos: Vector3, public jade: number) {
    super(game, id, region);
    this.damageableId = id;
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.hb = [{ center: pos.clone().add(new Vector3(0, 0.4, 0)), radius: 0.4 }];
    this.collider = game.physics.add(Collider.cylinder(pos.clone().add(new Vector3(0, 0.4, 0)), 0.32, 0.4, { walkable: true, camera: false }));
    if (!Env.headless) {
      this.mesh = new Mesh(urnGeometry(), characterMaterial({ color: 0x6a4a3a, roughness: 0.8 }, { color: new Color(0xffa060), power: 2.5, strength: 0.25 }));
      this.mesh.scale.setScalar(1.05);
      this.mesh.position.copy(pos);
      this.mesh.rotation.y = hashString(id);
      this.root.add(this.mesh);
      game.world.addToRegion(region, this.root, this.position);
    }
  }
  syncFromSave(): void {
    if (this.game.isConsumed(this.id)) this.breakNow(false);
  }
  canBeHit(): boolean {
    return !this.broken;
  }
  hurtboxes(): Hurtbox[] {
    return this.hb;
  }
  takeHit(hit: HitInfo): HitResult {
    if (this.broken) return 'ignored';
    this.breakNow(true, hit);
    return 'kill';
  }
  private breakNow(fx: boolean, hit?: HitInfo): void {
    this.broken = true;
    this.collider.enabled = false;
    if (this.mesh) this.mesh.visible = false;
    if (fx) {
      this.game.consume(this.id);
      this.game.sfx('urn', this.position);
      this.game.fx.burst(this.position.clone().add(new Vector3(0, 0.4, 0)), { count: 16, color: 0x6a4a3a, speed: 5, dir: hit?.dir, spread: 0.7, life: 0.8, size: 0.14, gravity: 14, additive: false });
      this.game.spawnJade(this.position.clone().add(new Vector3(0, 0.5, 0)), this.jade);
    }
  }
  fixedUpdate(): void {}
  render(): void {}
}

// ------------------------------------------------------------------ NPC
export class Npc extends Entity {
  private view: NpcView | null = null;
  private talkT = 0;
  constructor(game: Game, id: string, region: string, pos: Vector3, public yaw: number, public npc: string) {
    super(game, id, region);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.interactRadius = 2.3;
    if (!Env.headless) {
      this.view = npc === 'weng' ? buildWeng() : buildXun();
      this.root.add(this.view.root);
      this.root.position.copy(pos);
      this.view.root.rotation.y = yaw;
      game.world.addToRegion(region, this.root, this.position);
    }
    game.physics.add(Collider.cylinder(pos.clone().add(new Vector3(0, 0.6, 0)), 0.4, 0.6, { walkable: false, camera: false }));
  }
  fixedUpdate(dt: number): void {
    this.talkT = Math.max(0, this.talkT - dt);
  }
  render(dt: number, _a: number, t: number): void {
    const v = this.view;
    if (!v) return;
    // idle breathing + turn head toward the player when close
    v.body.scale.y = 1 + Math.sin(t * 1.8 + this.yaw) * 0.012;
    const pp = this.game.player.position;
    const d = Math.hypot(pp.x - this.position.x, pp.z - this.position.z);
    const want = d < 6 ? Math.atan2(pp.x - this.position.x, pp.z - this.position.z) - this.yaw : Math.sin(t * 0.3) * 0.3;
    let delta = want;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    v.head.rotation.y = damp(v.head.rotation.y, Math.max(-1, Math.min(1, delta)), 4, dt);
    v.head.rotation.x = Math.sin(t * 1.3) * 0.04 + (this.talkT > 0 ? Math.sin(t * 12) * 0.05 : 0);
  }
  interactPrompt(): string | null {
    return near(this.game, this.position, this.interactRadius + 0.4) ? 'Talk' : null;
  }
  interact(): void {
    this.talkT = 3;
    this.game.talkTo(this.npc, this);
  }
}

// ------------------------------------------------------------------ Gates & levers
export class Gate extends Entity {
  open = false;
  private collider: Collider;
  private mesh: Group | null = null;
  private openAmt = 0;
  private closedY: number;
  constructor(game: Game, id: string, region: string, pos: Vector3, public yaw: number, public width: number, public height: number, public kind: 'portcullis' | 'sealDoor' | 'barrier') {
    super(game, id, region);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.closedY = pos.y + height / 2;
    const q = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
    this.collider = game.physics.addDynamic(Collider.box(new Vector3(pos.x, this.closedY, pos.z), new Vector3(width / 2, height / 2, 0.3), q, { walkable: false, tag: 'gate' }));
    this.sleepDistance = 1e9;
    if (!Env.headless) {
      this.mesh = new Group();
      const mats = worldMaterials();
      if (kind === 'portcullis') {
        const n = Math.max(3, Math.round(width / 0.45));
        for (let i = 0; i <= n; i++) {
          const bar = new Mesh(new CylinderGeometry(0.06, 0.06, height, 6), mats.chain);
          bar.position.set(-width / 2 + (i / n) * width, 0, 0);
          this.mesh.add(bar);
        }
        for (const y of [-height * 0.3, height * 0.1, height * 0.42]) {
          const cross = new Mesh(new BoxGeometry(width, 0.12, 0.12), mats.chain);
          cross.position.y = y;
          this.mesh.add(cross);
        }
      } else if (kind === 'sealDoor') {
        const door = new Mesh(new BoxGeometry(width, height, 0.25), mats.woodDark);
        this.mesh.add(door);
        const tal = new Mesh(new PlaneGeometry(0.35, 1.4), new MeshBasicMaterial({ map: talismanTexture(), side: DoubleSide }));
        tal.position.set(0, 0.2, 0.14);
        this.mesh.add(tal);
        const ring = new Mesh(new CylinderGeometry(width * 0.25, width * 0.25, 0.05, 20), mats.gold);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, -0.1, 0.13);
        this.mesh.add(ring);
      } else {
        const mat = new MeshBasicMaterial({ color: new Color(1.4, 0.35, 0.2), transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
        const wall = new Mesh(new PlaneGeometry(width, height), mat);
        this.mesh.add(wall);
        for (let i = 0; i < 3; i++) {
          const tal = new Mesh(new PlaneGeometry(0.3, 1.1), new MeshBasicMaterial({ map: talismanTexture(), side: DoubleSide, transparent: true }));
          tal.position.set(-width / 3 + (i * width) / 3, 0.2, 0.02);
          this.mesh.add(tal);
        }
      }
      if (kind === 'portcullis') mergeRigParts(this.mesh);
      this.mesh.position.set(pos.x, this.closedY, pos.z);
      this.mesh.rotation.y = yaw;
      this.root.add(this.mesh);
      game.world.addToRegion(region, this.root, this.position);
    }
    if (kind === 'barrier') this.setOpen(true, true);
  }

  setOpen(open: boolean, instant = false): void {
    this.open = open;
    if (instant) this.openAmt = open ? 1 : 0;
    this.collider.enabled = !open;
    if (this.kind === 'barrier' && this.mesh) this.mesh.visible = !open || !instant;
  }

  fixedUpdate(dt: number): void {
    const target = this.open ? 1 : 0;
    this.openAmt = damp(this.openAmt, target, this.kind === 'portcullis' ? 3 : 5, dt);
    // collider follows closed state immediately for safety when opening; when closing, only once mostly shut
    if (!this.open && this.openAmt < 0.3) this.collider.enabled = true;
  }

  render(dt: number, _a: number, t: number): void {
    if (!this.mesh) return;
    if (this.kind === 'portcullis') {
      this.mesh.position.y = this.closedY + this.openAmt * (this.height - 0.2);
    } else if (this.kind === 'sealDoor') {
      this.mesh.position.y = this.closedY - this.openAmt * (this.height + 0.3);
    } else {
      this.mesh.visible = this.openAmt < 0.98;
      this.mesh.scale.y = 1 - this.openAmt;
      const mat = (this.mesh.children[0] as Mesh).material as MeshBasicMaterial;
      mat.opacity = (0.35 + Math.sin(t * 6) * 0.1) * (1 - this.openAmt);
    }
  }
}

export class Lever extends Entity implements Damageable {
  readonly damageableId: string;
  pogoable = false;
  givesMoonlight = false;
  pulled = false;
  private hb: Hurtbox[];
  private handle: Group | null = null;
  constructor(game: Game, id: string, region: string, pos: Vector3, public yaw: number, public gate: string) {
    super(game, id, region);
    this.damageableId = id;
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.hb = [{ center: pos.clone().add(new Vector3(0, 0.8, 0)), radius: 0.45 }];
    if (!Env.headless) {
      const mats = worldMaterials();
      const base = new Mesh(new BoxGeometry(0.6, 0.4, 0.6), mats.stoneDark);
      base.position.set(pos.x, pos.y + 0.2, pos.z);
      this.root.add(base);
      this.handle = new Group();
      this.handle.position.set(pos.x, pos.y + 0.4, pos.z);
      this.handle.rotation.y = yaw;
      const stick = new Mesh(new CylinderGeometry(0.05, 0.05, 1.0, 6), mats.bronze);
      stick.position.y = 0.5;
      this.handle.add(stick);
      const knob = new Mesh(new CylinderGeometry(0.12, 0.12, 0.2, 8), mats.gold);
      knob.position.y = 1.0;
      this.handle.add(knob);
      this.handle.rotation.x = 0.5;
      this.root.add(this.handle);
      game.world.addToRegion(region, this.root, this.position);
    }
  }
  syncFromSave(): void {
    this.pulled = !!this.game.flag(`gate:${this.gate}`);
    if (this.handle) this.handle.rotation.x = this.pulled ? -0.5 : 0.5;
  }
  canBeHit(): boolean {
    return !this.pulled;
  }
  hurtboxes(): Hurtbox[] {
    return this.hb;
  }
  takeHit(): HitResult {
    if (this.pulled) return 'ignored';
    this.pulled = true;
    this.game.sfx('lever', this.position);
    this.game.openGate(this.gate, true);
    return 'hit';
  }
  fixedUpdate(): void {}
  render(dt: number): void {
    if (this.handle) this.handle.rotation.x = damp(this.handle.rotation.x, this.pulled ? -0.5 : 0.5, 10, dt);
  }
}

// ------------------------------------------------------------------ Breakable wall / cracked floor
export class BreakWall extends Entity implements Damageable {
  readonly damageableId: string;
  pogoable = false;
  givesMoonlight = false;
  hp = 3;
  broken = false;
  private hb: Hurtbox[];
  private collider: Collider;
  private mesh: Mesh | null = null;
  constructor(game: Game, id: string, region: string, pos: Vector3, yaw: number, w: number, h: number, d: number, public floor = false) {
    super(game, id, region);
    this.damageableId = id;
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    const q = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
    this.collider = game.physics.add(Collider.box(pos.clone(), new Vector3(w / 2, h / 2, d / 2), q, { walkable: floor, tag: floor ? 'crackedFloor' : 'breakWall', safe: false }));
    this.collider.owner = this;
    this.hb = floor ? [] : [{ center: pos.clone(), radius: Math.max(w, h) * 0.45 }];
    if (!Env.headless) {
      const mats = worldMaterials();
      this.mesh = new Mesh(new BoxGeometry(w, h, d), floor ? mats.stoneDark : mats.stone);
      this.mesh.position.copy(pos);
      this.mesh.rotation.y = yaw;
      this.root.add(this.mesh);
      // crack lines as a hint
      const crackMat = new MeshBasicMaterial({ color: new Color(0.02, 0.02, 0.03) });
      for (let i = 0; i < 5; i++) {
        const c = new Mesh(new BoxGeometry(floor ? w * 0.8 : 0.04, floor ? 0.02 : h * 0.6, floor ? 0.05 : 0.02), crackMat);
        c.position.set((i - 2) * w * 0.15, floor ? h / 2 + 0.005 : (i % 2 - 0.5) * h * 0.2, floor ? (i - 2) * d * 0.15 : d / 2 + 0.01);
        c.rotation.set(0, floor ? i * 0.7 : 0, floor ? 0 : (i - 2) * 0.35);
        this.mesh.add(c);
      }
      mergeRigParts(this.mesh);
      game.world.addToRegion(region, this.root, this.position);
    }
  }
  syncFromSave(): void {
    if (this.game.isConsumed(this.id)) this.shatter(false);
  }
  canBeHit(): boolean {
    return !this.broken && !this.floor;
  }
  hurtboxes(): Hurtbox[] {
    return this.hb;
  }
  takeHit(hit: HitInfo): HitResult {
    if (this.broken || this.floor) return 'ignored';
    this.hp -= hit.damage >= 2 ? 3 : 1;
    this.game.sfx('rockHit', this.position);
    this.game.fx.burst(hit.point, { count: 10, color: 0x7a7a80, speed: 4, dir: hit.dir.clone().negate(), spread: 0.6, life: 0.6, size: 0.14, gravity: 12, additive: false });
    if (this.hp <= 0) {
      this.shatter(true);
      return 'kill';
    }
    return 'hit';
  }
  shatter(fx: boolean): void {
    this.broken = true;
    this.collider.enabled = false;
    if (this.mesh) this.mesh.visible = false;
    if (fx) {
      this.game.consume(this.id);
      this.game.sfx('crumble', this.position);
      this.game.shake(0.35);
      this.game.fx.burst(this.position, { count: 40, color: 0x6a6a70, speed: 7, spread: 1, life: 1.2, size: 0.3, gravity: 14, additive: false });
    }
  }
  fixedUpdate(): void {}
  render(): void {}
}

// ------------------------------------------------------------------ Moving platform
export class MovingPlatform extends Entity {
  readonly collider: Collider;
  private t = 0;
  private dir = 1;
  private pauseT = 0;
  private seg = 0;
  private lengths: number[] = [];
  private total = 0;
  private mesh: Group | null = null;
  private ridden = 0;
  private prevCenter = new Vector3();
  private ferry = newFerry();

  constructor(game: Game, id: string, region: string, public path: Vector3[], public w: number, public d: number, public speed: number,
    public pause = 0.8, public style: 'lantern' | 'stone' | 'lift' = 'stone', public trigger: 'always' | 'ride' | 'ferry' = 'always') {
    super(game, id, region);
    for (let i = 0; i < path.length - 1; i++) {
      const l = path[i].distanceTo(path[i + 1]);
      this.lengths.push(l);
      this.total += l;
    }
    this.collider = game.physics.addDynamic(Collider.box(path[0].clone().add(new Vector3(0, -0.25, 0)), new Vector3(w / 2, 0.25, d / 2), undefined, { safe: false, tag: 'platform' }));
    this.position.copy(path[0]);
    this.prevPosition.copy(path[0]);
    this.prevCenter.copy(this.collider.center);
    this.sleepDistance = 90;
    if (!Env.headless) {
      const mats = worldMaterials();
      this.mesh = new Group();
      const slab = new Mesh(new BoxGeometry(w, 0.5, d), style === 'lantern' ? mats.woodDark : mats.stone);
      slab.position.y = -0.25;
      slab.receiveShadow = true;
      this.mesh.add(slab);
      const trim = new Mesh(new BoxGeometry(w + 0.1, 0.12, d + 0.1), style === 'lantern' ? mats.wood : mats.stoneDark);
      trim.position.y = -0.06;
      this.mesh.add(trim);
      if (style === 'lantern' || style === 'lift') {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const rope = new Mesh(new CylinderGeometry(0.025, 0.025, 30, 4), mats.chain);
          rope.position.set((sx * w) / 2.2, 15, (sz * d) / 2.2);
          this.mesh.add(rope);
        }
        const lampMat = new MeshBasicMaterial({ color: new Color(2, 1.1, 0.5) });
        const lamp = new Mesh(new CylinderGeometry(0.18, 0.18, 0.3, 6), lampMat);
        lamp.position.set(0, -0.7, 0);
        this.mesh.add(lamp);
        const g = new Sprite(glowSpriteMaterial(new Color(1, 0.55, 0.2), 0.8));
        g.scale.setScalar(2.4);
        g.position.copy(lamp.position);
        this.mesh.add(g);
      }
      if (style === 'lantern') {
        // a lit lantern post on the deck, so the raft reads as the way on from above
        const post = new Mesh(new CylinderGeometry(0.05, 0.06, 1.2, 6), mats.wood);
        post.position.set(w / 2 - 0.3, 0.6, -d / 2 + 0.3);
        this.mesh.add(post);
        const lantern = new Mesh(new CylinderGeometry(0.16, 0.14, 0.32, 6), new MeshBasicMaterial({ color: new Color(2.2, 1.2, 0.5) }));
        lantern.position.set(w / 2 - 0.3, 1.3, -d / 2 + 0.3);
        this.mesh.add(lantern);
        const halo = new Sprite(glowSpriteMaterial(new Color(1, 0.6, 0.25), 0.9));
        halo.scale.setScalar(1.8);
        halo.position.copy(lantern.position);
        this.mesh.add(halo);
      }
      this.mesh.position.copy(path[0]);
      this.root.add(this.mesh);
      game.world.addToRegion(region, this.root, this.position);
    }
  }

  private pointAt(dist: number, out: Vector3): Vector3 {
    let d = Math.max(0, Math.min(this.total, dist));
    for (let i = 0; i < this.lengths.length; i++) {
      if (d <= this.lengths[i] || i === this.lengths.length - 1) {
        const u = this.lengths[i] > 0 ? d / this.lengths[i] : 0;
        return out.lerpVectors(this.path[i], this.path[i + 1], Math.min(1, u));
      }
      d -= this.lengths[i];
    }
    return out.copy(this.path[this.path.length - 1]);
  }

  fixedUpdate(dt: number): void {
    const pc = this.game.player.ctrl;
    const onMe = pc.grounded && pc.body.groundCollider === this.collider;
    this.ridden = onMe ? 0 : this.ridden + dt;
    if (this.trigger === 'ride' || this.trigger === 'ferry') {
      const pp = this.game.player.position;
      const target = this.trigger === 'ferry'
        ? ferryTarget(this.ferry, onMe, this.ridden, this.t, this.total, pp.distanceTo(this.path[0]), pp.distanceTo(this.path[this.path.length - 1]))
        : onMe ? this.total : this.ridden > 1.5 ? 0 : this.t;
      const step = this.speed * dt;
      if (Math.abs(target - this.t) <= step) this.t = target;
      else this.t += Math.sign(target - this.t) * step;
    } else if (this.pauseT > 0) {
      this.pauseT -= dt;
    } else {
      this.t += this.dir * this.speed * dt;
      if (this.t >= this.total) {
        this.t = this.total;
        this.dir = -1;
        this.pauseT = this.pause;
      } else if (this.t <= 0) {
        this.t = 0;
        this.dir = 1;
        this.pauseT = this.pause;
      }
    }
    this.pointAt(this.t, this.position);
    this.prevCenter.copy(this.collider.center);
    this.collider.center.set(this.position.x, this.position.y - 0.25, this.position.z);
    this.collider.velocity.subVectors(this.collider.center, this.prevCenter).divideScalar(dt);
    this.collider.updateAABB();
    void this.seg;
  }

  render(dt: number, alpha: number): void {
    if (this.mesh) this.mesh.position.lerpVectors(this.prevPosition, this.position, alpha);
  }

  reset(): void {
    this.t = 0;
    this.dir = 1;
  }
}

// ------------------------------------------------------------------ Thorn lotus (hazard + pogo)
export class ThornLotus extends Entity {
  constructor(game: Game, id: string, region: string, pos: Vector3, scale = 1) {
    super(game, id, region);
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    game.physics.add(Collider.cylinder(pos.clone().add(new Vector3(0, 0.35 * scale, 0)), 0.55 * scale, 0.35 * scale, { hazard: 1, pogo: true, walkable: true, safe: false, camera: false, tag: 'thorns' }));
    if (!Env.headless) {
      const m = new Mesh(thornLotusGeometry(), characterMaterial({ color: 0x3a0c14, roughness: 0.5 }, { color: new Color(0xff3050), power: 2, strength: 0.8 }));
      m.scale.setScalar(scale * 1.1);
      m.position.copy(pos);
      m.rotation.y = hashString(id);
      this.root.add(m);
      const g = new Sprite(glowSpriteMaterial(new Color(0.8, 0.12, 0.2), 0.6));
      g.scale.setScalar(1.6 * scale);
      g.position.copy(pos).y += 0.4 * scale;
      this.root.add(g);
      game.world.addToRegion(region, this.root, this.position);
    }
    this.sleepDistance = 0;
  }
  fixedUpdate(): void {}
  render(): void {}
}

// ------------------------------------------------------------------ Projectile
export class Projectile extends Entity {
  private vel = new Vector3();
  private life = 3;
  private sprite: Sprite | null = null;
  private core: Mesh | null = null;
  private hitSet = new Set<unknown>();
  constructor(game: Game, pos: Vector3, vel: Vector3, public damage: number, public fromPlayer: boolean, public radius = 0.3) {
    super(game, `proj_${Math.random().toString(36).slice(2)}`, '');
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.vel.copy(vel);
    this.sleepDistance = 1e9;
    if (!Env.headless) {
      const col = fromPlayer ? new Color(1.6, 1.0, 0.45) : new Color(1.5, 0.45, 0.2);
      this.core = new Mesh(new CylinderGeometry(0.12, 0.12, 0.2, 6), new MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6) }));
      this.root.add(this.core);
      this.sprite = new Sprite(glowSpriteMaterial(col, 1));
      this.sprite.scale.setScalar(fromPlayer ? 2 : 1.4);
      this.root.add(this.sprite);
      this.root.position.copy(pos);
      game.scene.add(this.root);
    }
  }
  fixedUpdate(dt: number): void {
    this.life -= dt;
    const step = this.vel.length() * dt;
    const dir = this.vel.clone().normalize();
    const hit = this.game.physics.raycast(this.position, dir, step + this.radius * 0.5, (c) => c.camera && !c.enemyOnly && c.tag !== 'thorns');
    this.position.addScaledVector(this.vel, dt);
    if (hit || this.life <= 0) return this.explode();
    if (this.fromPlayer) {
      for (const d of this.game.damageables) {
        if (!d.canBeHit() || this.hitSet.has(d)) continue;
        for (const hb of d.hurtboxes()) {
          if (hb.center.distanceTo(this.position) < hb.radius + this.radius) {
            this.hitSet.add(d);
            const res = d.takeHit({ damage: this.damage, dir, knockback: 8, kind: 'flare', point: this.position.clone(), fromPlayer: true });
            if (res !== 'ignored') {
              this.game.sfx('flareHit', this.position);
              this.game.hitstop(0.04);
            }
            break;
          }
        }
      }
    } else {
      const pp = this.game.player.position;
      _v.set(pp.x, pp.y + 0.5, pp.z);
      if (_v.distanceTo(this.position) < this.radius + 0.4) {
        this.game.damagePlayer(this.damage, this.position.clone().addScaledVector(dir, -1));
        return this.explode();
      }
      // player can slash projectiles away
      const a = this.game.player.ctrl.attack;
      if (a && a.t >= a.activeStart && a.t <= a.activeEnd && _v.distanceTo(this.position) < 2.0) {
        this.game.sfx('clang', this.position);
        return this.explode();
      }
    }
  }
  private explode(): void {
    this.alive = false;
    this.game.fx.burst(this.position, { count: 14, color: this.fromPlayer ? new Color(1.6, 1.0, 0.4) : new Color(1.5, 0.4, 0.2), speed: 4, life: 0.4, size: 0.1, gravity: 2 });
    this.game.fx.flash(this.position, 1.4, this.fromPlayer ? new Color(1.4, 0.9, 0.4) : new Color(1.4, 0.4, 0.2));
    this.dispose();
  }
  render(dt: number, alpha: number, t: number): void {
    super.render(dt, alpha, t);
    if (this.core) this.core.rotation.set(t * 10, t * 7, 0);
  }
}

export { buildJadeBead };
