import { Box3, Color, Quaternion, Scene, Vector3 } from 'three';
import { Renderer } from '../fx/Renderer';
import { CameraRig } from '../camera/CameraRig';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { World, BuiltRegion } from '../world/World';
import { InputState, newStepInput, StepInput } from '../input/InputState';
import { KeyboardMouse } from '../input/KeyboardMouse';
import { GamepadInput } from '../input/Gamepad';
import { TouchControls, SpecialMode } from '../input/TouchControls';
import { Settings, TouchButtonId, loadSettings, saveSettings } from '../save/Settings';
import { Player } from '../player/Player';
import { Effects } from '../fx/Effects';
import { EventBus } from '../core/events';
import { Damageable, HitInfo, HitResult } from '../combat/Combat';
import { ActiveAttack } from '../player/PlayerController';
import { Entity } from '../entities/Entity';
import { Collider } from '../physics/Collider';
import { RegionDef, SpawnDef } from '../world/Region';
import { Env } from '../core/env';
import { Hud } from '../ui/Hud';
import { Menus, MenuHost, MapRoom } from '../ui/Menus';
import { SaveData, SaveSystem, newSave, maxHealthFor, maxMoonlightFor } from '../save/SaveSystem';
import { AbilityId, AbilityInfo } from '../player/Abilities';
import { Enemy } from '../enemies/Enemy';
import { Shrine, AbilityAltar, FragmentPickup, JadeBead, Urn, Npc, Gate, Lever, BreakWall, MovingPlatform, ThornLotus, Projectile, Stele } from '../entities/Interactables';
import { spawnEnemy } from '../enemies/registry';
import { DIALOGUE, LORE, NPCS, SHOP, REGION_TEXT, ENDING_TEXT, DialogueLine } from '../story/lore';
import { h } from '../ui/dom';

export const STEP = 1 / 60;

export interface GameEvents extends Record<string, unknown> {
  playerHealed: { health: number };
  playerDamaged: { health: number };
  regionEnter: { id: string; name: string; hanzi: string; subtitle: string };
  enemyKilled: { id: string; kind: string };
  abilityGained: { id: string };
  saved: { shrine: string };
}

export interface AudioLike {
  sfx(name: string, pos?: Vector3, vol?: number): void;
  stop(name: string): void;
  update(dt: number, listener: Vector3, forward: Vector3): void;
  setMusic(id: string): void;
  setAmbience(id: string): void;
  unlock(): void;
  setVolumes(master: number, music: number, sfx: number, amb: number): void;
  duck(on: boolean): void;
  ui(kind: 'move' | 'select' | 'back'): void;
}

const noAudio: AudioLike = { sfx() {}, stop() {}, update() {}, setMusic() {}, setAmbience() {}, unlock() {}, setVolumes() {}, duck() {}, ui() {} };

const _q = new Quaternion();
const _f = new Vector3();

export type GameMode = 'loading' | 'title' | 'play' | 'pause' | 'dialogue' | 'cutscene' | 'dead' | 'ending';

interface ArenaState {
  def: Extract<SpawnDef, { type: 'arena' }>;
  region: string;
  box: Box3;
  active: boolean;
  wave: number;
  enemies: Enemy[];
  boss: Enemy | null;
}

interface HintState {
  def: Extract<SpawnDef, { type: 'hint' }>;
}

interface TriggerState {
  def: Extract<SpawnDef, { type: 'trigger' }>;
  box: Box3;
  fired: boolean;
  inside: boolean;
}

/**
 * Central hub: fixed-step loop, rendering, input, world, entities, progression
 * and the whole game flow (title → descent → death/rest → ending).
 */
export class Game implements MenuHost {
  readonly scene = new Scene();
  readonly physics = new PhysicsWorld();
  readonly renderer: Renderer;
  readonly cam: CameraRig;
  readonly world: World;
  readonly input = new InputState();
  readonly kbm: KeyboardMouse;
  readonly pad: GamepadInput;
  readonly touch: TouchControls;
  settings: Settings;
  readonly fx: Effects;
  readonly events = new EventBus<GameEvents>();
  audio: AudioLike = noAudio;
  player!: Player;
  readonly entities: Entity[] = [];
  readonly damageables: Damageable[] = [];
  readonly hud: Hud;
  readonly menus: Menus;
  progress: SaveData = newSave('shrine_threshold');
  mode: GameMode = 'loading';
  time = 0;
  realTime = 0;
  private acc = 0;
  private hitstopT = 0;
  timeScale = 1;
  private slowmo = { t: 0, scale: 1 };
  private last = 0;
  private step: StepInput = newStepInput();
  killY = -200;
  region: BuiltRegion | null = null;
  readonly ui: HTMLElement;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;
  private running = false;
  readonly shrines = new Map<string, Shrine>();
  readonly gates = new Map<string, Gate>();
  readonly altars: AbilityAltar[] = [];
  private arenas: ArenaState[] = [];
  private hints: HintState[] = [];
  private triggers: TriggerState[] = [];
  private curtain: HTMLDivElement;
  private deathText: HTMLDivElement;
  private rotateEl: HTMLDivElement;
  private interactTarget: Entity | null = null;
  private deadTimer = 0;
  private visitTimer = 0;
  private titleOrbit = 0;
  private cutscene: { t: number; dur: number; update: (t: number, dt: number) => void; done: () => void } | null = null;
  private bossEnemy: Enemy | null = null;
  private bossName = '';
  private pendingSave = false;
  /** Seconds of play since boot (for play time). */
  private sessionPlay = 0;
  private musicOverride: string | null = null;
  readonly defs: RegionDef[];

  constructor(readonly container: HTMLElement, regionDefs: RegionDef[]) {
    this.defs = regionDefs;
    this.settings = loadSettings();
    this.renderer = new Renderer(container);
    this.renderer.setQuality(this.settings.quality);
    this.cam = new CameraRig(window.innerWidth / window.innerHeight);
    this.world = new World(this.scene, this.physics, this.renderer);
    this.world.viewScale = this.renderer.profile.viewScale;
    this.fx = new Effects(this.scene);
    this.fx.onLight = (p, c, i, d, dur) => this.world.lightPool.flash(p, c, i, d, dur);
    this.ui = h('div', { id: 'moyue-ui' });
    container.appendChild(this.ui);
    this.hud = new Hud(this.ui);
    this.kbm = new KeyboardMouse(this.input, this.renderer.canvas);
    this.pad = new GamepadInput(this.input);
    this.touch = new TouchControls(this.input, this.settings, this.ui);
    this.touch.onTopButton = (b) => (b === 'pause' ? this.pause() : this.openMap());
    this.menus = new Menus(this.ui, this);
    this.curtain = h('div', { class: 'moyue-curtain' });
    this.deathText = h('div', { class: 'moyue-death-text', text: '墨' });
    this.rotateEl = h('div', { class: 'moyue-rotate enabled' },
      h('div', { class: 'moyue-rotate-icon', text: '⟳' }),
      h('div', { text: 'Turn your device sideways to descend.' }),
      h('button', { class: 'moyue-btn', onclick: () => this.rotateEl.classList.remove('enabled') }, 'Play in portrait anyway'));
    this.ui.append(this.curtain, this.deathText, this.rotateEl);
    this.applySettings();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.pause();
    });
    this.onResize();
    this.touch.setVisible(false);
    this.hud.setVisible(false);
  }

  // ======================================================================= settings / menu host
  applySettings(): void {
    const s = this.settings;
    this.cam.distanceMul = s.cameraDistance;
    this.cam.autoRecenter = s.autoCamera;
    this.cam.shakeScale = s.screenShake;
    this.kbm.sensitivity = 0.0032 * s.cameraSensitivity;
    this.kbm.invertY = s.invertY;
    this.pad.invertY = s.invertY;
    this.pad.lookSpeed = 3.2 * s.cameraSensitivity;
    this.touch.applySettings(s);
    if (this.renderer.quality !== s.quality) {
      this.renderer.setQuality(s.quality);
      this.world.lightPool.setCount(this.renderer.profile.lights);
      this.onResize();
    }
    this.world.viewScale = this.renderer.profile.viewScale;
    this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume, s.ambienceVolume);
    saveSettings(s);
  }
  hasSave(): boolean {
    return SaveSystem.exists();
  }
  saveSummary(): string | null {
    const r = SaveSystem.load();
    if (!r.data) return r.status === 'corrupt' ? 'Your save could not be read and was set aside.' : null;
    const d = r.data;
    const shrine = d.shrine.replace('shrine_', '').replace(/_/g, ' ');
    const mins = Math.floor(d.playTime / 60);
    return `Last rest: ${shrine} · ${Math.floor(mins / 60)}h ${mins % 60}m · ${Object.values(d.abilities).filter(Boolean).length} techniques`;
  }
  setTouchEdit(on: boolean): void {
    this.touch.setVisible(on);
    this.touch.setEditMode(on);
    if (!on) this.touch.setVisible(this.mode === 'play');
  }
  touchSelected(): TouchButtonId | null {
    return this.touch.selectedEdit;
  }
  setButtonSize(id: TouchButtonId, s: number): void {
    this.touch.setButtonSize(id, s);
    saveSettings(this.settings);
  }
  resetLayout(): void {
    this.touch.resetLayout();
    saveSettings(this.settings);
  }
  isTouch(): boolean {
    return Env.touch;
  }
  eraseSave(): void {
    SaveSystem.erase();
    this.hud.toast('Save erased', '', 'info');
  }
  audioUnlock(): void {
    this.audio.unlock();
  }
  uiSound(kind: 'move' | 'select' | 'back'): void {
    this.audio.ui(kind);
  }
  journal() {
    const p = this.progress;
    return {
      abilities: p.abilities, fragments: p.fragments.length, jade: p.jade, lore: p.loreRead, maxHealth: maxHealthFor(p),
      deaths: p.deaths, playTime: p.playTime, vessels: p.moonVessels,
    };
  }
  mapData() {
    const rooms: MapRoom[] = [];
    for (const r of this.world.regions) {
      for (const room of r.content.rooms) {
        rooms.push({ ...room, visited: this.progress.visitedRooms.includes(room.id), region: r.def.id });
      }
    }
    const shrines = [...this.shrines.values()].filter((s) => this.flag(`shrine:${s.id}`)).map((s) => ({ x: s.position.x, z: s.position.z, name: s.name, active: s.id === this.progress.shrine }));
    const regionNames: Record<string, string> = {};
    for (const r of this.world.regions) regionNames[r.def.id] = r.def.name;
    const pp = this.player?.position;
    return { rooms, player: pp ? ([pp.x, pp.z] as [number, number]) : null, shrines, regionNames };
  }

  onResize(): void {
    const w = window.innerWidth, h2 = window.innerHeight;
    this.renderer.resize(w, h2);
    this.cam.setAspect(w / h2);
    this.fx.setPixelRatio(this.renderer.pixelRatio);
  }

  // ======================================================================= loading
  async load(onProgress?: (p: number, label: string) => void): Promise<void> {
    this.world.setParticleScale(this.renderer.profile.particles);
    await this.world.build(this.defs, onProgress);
    this.player = new Player(this);
    for (const r of this.world.regions) this.spawnRegion(r);
    // compile every shader behind the loading screen: without this the first
    // frame of play froze for seconds while materials compiled on first sight
    onProgress?.(0.99, 'Grinding ink…');
    await this.precompileShaders();
    this.mode = 'title';
  }

  private async precompileShaders(): Promise<void> {
    const hidden: { visible: boolean }[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      await this.renderer.gl.compileAsync(this.scene, this.cam.camera);
    } catch {
      /* compilation happens lazily instead */
    }
    for (const o of hidden) o.visible = false;
  }

  private spawnRegion(r: BuiltRegion): void {
    const rid = r.def.id;
    for (const s of r.content.spawns) {
      switch (s.type) {
        case 'enemy': {
          const arena = s.arena ? r.content.spawns.find((x) => x.type === 'arena' && x.id === s.arena) as Extract<SpawnDef, { type: 'arena' }> | undefined : undefined;
          if (arena && arena.boss === s.id) {
            // bosses are present from the start, waiting in stillness
            const b = spawnEnemy(this, s.kind, s.id, rid, s.pos, s.yaw ?? 0);
            b.dormant = b.startsDormant = true;
            b.permanentDeath = true;
            b.arenaId = arena.id;
            b.leash = 40;
            if (s.kind === 'tollingAbbot') (b as unknown as { arenaCenter: Vector3 }).arenaCenter.set(arena.pos.x, s.pos.y, arena.pos.z);
            this.addEntity(b);
            break;
          }
          if (s.arena) break; // spawned by the arena
          const e = spawnEnemy(this, s.kind, s.id, rid, s.pos, s.yaw ?? 0);
          if (s.leash) e.leash = s.leash;
          this.addEntity(e);
          break;
        }
        case 'shrine': {
          const sh = new Shrine(this, s.id, rid, s.pos, s.yaw, s.name);
          this.shrines.set(s.id, sh);
          this.addEntity(sh);
          break;
        }
        case 'stele':
          this.addEntity(new Stele(this, s.id, rid, s.pos, s.yaw, s.loreId));
          break;
        case 'ability': {
          const a = new AbilityAltar(this, s.id, rid, s.pos, s.yaw, s.ability, s.arena);
          this.altars.push(a);
          this.addEntity(a);
          break;
        }
        case 'fragment':
          this.addEntity(new FragmentPickup(this, s.id, rid, s.pos));
          break;
        case 'urn':
          this.addEntity(new Urn(this, s.id, rid, s.pos, s.jade));
          break;
        case 'npc':
          this.addEntity(new Npc(this, s.id, rid, s.pos, s.yaw, s.npc));
          break;
        case 'gate': {
          const g = new Gate(this, s.id, rid, s.pos, s.yaw, s.width, s.height, s.kind);
          this.gates.set(s.id, g);
          this.addEntity(g);
          break;
        }
        case 'lever':
          this.addEntity(new Lever(this, s.id, rid, s.pos, s.yaw, s.gate));
          break;
        case 'breakWall':
          this.addEntity(new BreakWall(this, s.id, rid, s.pos, s.yaw, s.w, s.h, s.d));
          break;
        case 'crackedFloor':
          this.addEntity(new BreakWall(this, s.id, rid, s.pos, 0, s.w, 0.8, s.d, true));
          break;
        case 'platform':
          this.addEntity(new MovingPlatform(this, s.id, rid, s.path, s.w, s.d, s.speed, s.pause, s.style, s.trigger));
          break;
        case 'thornLotus':
          this.addEntity(new ThornLotus(this, s.id, rid, s.pos, s.scale));
          break;
        case 'hazardZone':
          this.physics.add(Collider.box(s.pos, s.half, undefined, {
            hazard: s.damage, walkable: s.kind !== 'abyss', camera: false, safe: false, tag: s.kind === 'abyss' ? 'abyss' : s.kind,
          }));
          break;
        case 'arena':
          this.arenas.push({ def: s, region: rid, box: new Box3(s.pos.clone().sub(s.half), s.pos.clone().add(s.half)), active: false, wave: 0, enemies: [], boss: null });
          break;
        case 'hint':
          this.hints.push({ def: s });
          break;
        case 'trigger':
          this.triggers.push({ def: s, box: new Box3(s.pos.clone().sub(s.half), s.pos.clone().add(s.half)), fired: false, inside: false });
          break;
        case 'jade':
          break;
        case 'bell':
          break;
      }
    }
  }

  addEntity(e: Entity): void {
    this.entities.push(e);
    const d = e as unknown as Damageable;
    if (typeof d.takeHit === 'function' && typeof d.hurtboxes === 'function') this.damageables.push(d);
  }

  private removeDead(): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e.alive && (e instanceof Projectile || e instanceof JadeBead)) this.entities.splice(i, 1);
    }
  }

  /** Apply persistent progress to world objects (gates, pickups, altars...). */
  private syncWorldFromSave(): void {
    for (const e of this.entities) {
      (e as unknown as { syncFromSave?: () => void }).syncFromSave?.();
    }
    for (const [id, g] of this.gates) {
      if (g.kind === 'barrier') g.setOpen(true, true);
      else g.setOpen(!!this.flag(`gate:${id}`), true);
    }
    for (const sh of this.shrines.values()) sh.lit = !!this.flag(`shrine:${sh.id}`);
    for (const a of this.arenas) {
      a.active = false;
      a.wave = 0;
      for (const e of a.enemies) e.dispose();
      a.enemies = [];
    }
    for (const alt of this.altars) {
      alt.sealed = !!alt.arena && !this.flag(`arena:${alt.arena}`);
    }
    // bosses / elites stay defeated
    for (const e of this.entities) {
      if (e instanceof Enemy && this.flag(`slain:${e.id}`)) {
        e.permanentDeath = true;
        e.dead = true;
        e.alive = false;
        e.root.visible = false;
      }
    }
    this.player.ctrl.abilities = { ...this.progress.abilities };
    this.player.maxHealth = maxHealthFor(this.progress);
    this.player.maxMoonlight = maxMoonlightFor(this.progress);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      try {
        this.frame(now);
      } catch (e) {
        console.error(e);
      }
    };
    requestAnimationFrame(frame);
  }

  // ======================================================================= flow
  showTitle(): void {
    this.mode = 'title';
    this.touch.setVisible(false);
    this.hud.setVisible(false);
    this.hud.boss(null);
    this.player.setVisible(false);
    this.menus.showTitle();
    this.audio.setMusic('title');
    this.audio.setAmbience('cave');
    this.curtain.classList.remove('on');
    const vista = this.world.byId('threshold')?.content.points.titleCam;
    if (vista) this.region = this.world.byId('threshold') ?? null;
  }

  newGame(): void {
    SaveSystem.erase();
    this.progress = newSave('shrine_threshold');
    this.syncWorldFromSave();
    for (const e of this.entities) if (e instanceof Enemy) e.reset();
    this.menus.hide();
    this.player.health = this.player.maxHealth;
    this.player.moonlight = 0;
    const start = this.world.byId('threshold')?.content.points.start ?? new Vector3();
    this.spawnPlayer(start, this.world.byId('threshold')?.content.points.startYaw?.x ?? 0);
    this.playOpening();
  }

  /** Development/test entry: start playing immediately (no title/opening). */
  debugStart(o: { spawn?: [number, number, number]; abilities?: import('../player/Abilities').Abilities; god?: boolean }): void {
    this.progress = newSave('shrine_threshold');
    this.setFlag('intro_done', true);
    this.setFlag('seen:threshold', true);
    if (o.abilities) this.progress.abilities = { ...o.abilities };
    this.syncWorldFromSave();
    for (const e of this.entities) if (e instanceof Enemy) e.reset();
    this.player.health = this.player.maxHealth;
    this.god = !!o.god;
    const pts = this.world.byId('threshold')?.content.points;
    const pos = o.spawn && o.spawn.every((n) => Number.isFinite(n)) ? new Vector3(...o.spawn) : pts?.start ?? new Vector3();
    this.spawnPlayer(pos, pts?.startYaw?.x ?? 0);
    this.beginPlay();
  }
  god = false;

  continueGame(): void {
    const r = SaveSystem.load();
    if (!r.data) {
      this.newGame();
      return;
    }
    this.progress = r.data;
    this.syncWorldFromSave();
    for (const e of this.entities) if (e instanceof Enemy) e.reset();
    this.menus.hide();
    this.player.health = this.player.maxHealth;
    this.player.moonlight = 0;
    const sh = this.shrines.get(this.progress.shrine) ?? [...this.shrines.values()][0];
    this.spawnPlayer(sh ? sh.standPoint : new Vector3(), sh ? sh.yaw : 0);
    this.beginPlay();
    if (r.status === 'recovered') this.hud.toast('Save restored from backup', 'The latest save was damaged.', 'info');
    this.fadeIn(1.2);
  }

  private beginPlay(): void {
    this.mode = 'play';
    this.menus.hide();
    this.player.setVisible(true);
    this.hud.setVisible(true);
    this.touch.setVisible(true);
    this.touch.root.classList.toggle('mt-hide-desktop', !Env.touch);
    this.input.blocked = false;
    this.input.flush();
    this.player.ctrl.locked = false;
    this.audio.duck(false);
    const r = this.world.regionAt(this.player.position);
    if (r) this.onRegionChanged(r);
  }

  resume(): void {
    if (this.mode !== 'pause') return;
    this.menus.hide();
    this.mode = 'play';
    this.touch.setVisible(true);
    this.input.blocked = false;
    this.input.flush();
    this.audio.duck(false);
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.touch.setVisible(false);
    this.input.blocked = true;
    this.input.releaseAll();
    this.kbm.exitPointerLock();
    this.menus.showPause();
    this.audio.duck(true);
  }

  openMap(): void {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.touch.setVisible(false);
    this.input.blocked = true;
    this.input.releaseAll();
    this.menus.showMap('none');
    this.audio.duck(true);
  }

  quitToTitle(): void {
    this.menus.hide();
    this.hud.boss(null);
    this.bossEnemy = null;
    this.showTitle();
  }

  spawnPlayer(pos: Vector3, yaw = 0): void {
    const c = this.player.ctrl;
    c.body.teleport(pos);
    c.resetMotion();
    c.facing = yaw;
    c.body.lastSafe.copy(pos);
    c.body.hasSafe = true;
    this.player.prevPos.copy(pos);
    this.player.anim?.resetDynamics();
    this.cam.cinematic = null;
    this.cam.snapTo({ position: pos, velocity: c.velocity, grounded: true, facing: yaw }, yaw + Math.PI);
    this.region = this.world.regionAt(pos);
    this.killY = this.region?.def.killY ?? -200;
  }

  /** Opening: waking in the jade tomb. Short, skippable by moving. */
  private playOpening(): void {
    this.mode = 'cutscene';
    this.player.setVisible(true);
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.player.ctrl.locked = true;
    this.curtain.classList.add('on');
    const pts = this.world.byId('threshold')!.content.points;
    const p = this.player.position.clone();
    const camStart = pts.openCam ?? p.clone().add(new Vector3(0, 1.5, 3));
    this.cam.cinematic = { pos: camStart.clone(), look: p.clone().add(new Vector3(0, 0.6, 0)), lambda: 1000 };
    this.audio.setMusic('opening');
    this.audio.setAmbience('cave');
    setTimeout(() => this.curtain.classList.remove('on'), 400);
    // end behind the player's shoulder, pulled in so the tomb walls never swallow the camera
    const head = p.clone().add(new Vector3(0, 1.1, 0));
    const back = new Vector3(Math.sin(this.player.ctrl.facing + Math.PI) * 5.5, 1.3, Math.cos(this.player.ctrl.facing + Math.PI) * 5.5);
    const reach = back.length();
    back.divideScalar(reach);
    const target = head.clone().addScaledVector(back, Math.max(1.4, this.physics.sphereCast(head, back, 0.35, reach) - 0.25));
    this.cutscene = {
      t: 0,
      dur: 5.2,
      update: (t) => {
        const k = Math.min(1, t / 5);
        const e = k * k * (3 - 2 * k);
        this.cam.cinematic = { pos: camStart.clone().lerp(target, e), look: p.clone().add(new Vector3(0, 0.6 + e * 0.3, 0)), lambda: 6 };
        if (t > 1.4 && t < 1.5) {
          this.sfx('awaken', p);
          this.fx.burst(p.clone().add(new Vector3(0, 0.6, 0)), { count: 30, color: new Color(0.7, 1.5, 1.2), speed: 2.2, spread: 1, life: 1.4, size: 0.1, gravity: -0.6 });
          this.fx.ring(p.clone().add(new Vector3(0, 0.1, 0)), 3, new Color(0.6, 1.3, 1.1), 1.2, 0.6);
        }
        if (t > 2.4 && t < 2.45) {
          const R = REGION_TEXT.threshold;
          this.hud.setVisible(true);
          this.hud.regionTitle(R.name, R.hanzi, R.subtitle);
          this.setFlag('seen:threshold', true);
        }
      },
      done: () => {
        this.setFlag('intro_done', true);
        // hand over to the orbit camera (it inherits yaw/distance from the cinematic pose)
        this.cam.cinematic = null;
        this.beginPlay();
      },
    };
  }

  // ======================================================================= loop
  private frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = STEP;
    dt = Math.min(dt, 0.1);
    this.realTime += dt;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.pad.poll(dt);
    this.handleMenuInput();
    // slow motion
    if (this.slowmo.t > 0) {
      this.slowmo.t -= dt;
      this.timeScale = this.slowmo.scale;
      if (this.slowmo.t <= 0) this.timeScale = 1;
    }
    const simulating = this.mode === 'play' || this.mode === 'cutscene' || this.mode === 'dead';
    let alpha = 1;
    if (simulating && this.player) {
      if (this.cutscene) {
        this.cutscene.t += dt;
        this.cutscene.update(this.cutscene.t, dt);
        const skip = this.cutscene.t > 1.5 && (Math.hypot(this.step.moveX, this.step.moveY) > 0.5 || this.input.isHeld('jump'));
        if (this.cutscene.t >= this.cutscene.dur || skip) {
          const c = this.cutscene;
          this.cutscene = null;
          c.done();
        }
      }
      if (this.hitstopT > 0) {
        this.hitstopT -= dt;
      } else {
        this.acc += dt * this.timeScale;
        let steps = 0;
        while (this.acc >= STEP && steps < 5) {
          this.input.step(this.step);
          this.fixedStep(STEP, this.step);
          this.acc -= STEP;
          steps++;
        }
        if (steps >= 5) this.acc = 0;
      }
      alpha = Math.min(1, this.acc / STEP);
    } else if (this.mode === 'title') {
      this.titleCamera(dt);
    }
    this.renderFrame(dt, alpha);
    this.menus.update(dt);
    if (this.renderer.adapt(dt)) this.fx.setPixelRatio(this.renderer.pixelRatio);
    if (this.pendingSave) {
      this.pendingSave = false;
      this.writeSave();
    }
  }

  private handleMenuInput(): void {
    // keyboard/gamepad pause & map outside of the fixed step
    if (this.mode === 'play') {
      if (this.input.isHeld('pause') && !this.pausedLatch) {
        this.pausedLatch = true;
        this.pause();
        return;
      }
      if (this.input.isHeld('map') && !this.mapLatch) {
        this.mapLatch = true;
        this.openMap();
        return;
      }
    }
    if (!this.input.isHeld('pause')) this.pausedLatch = false;
    if (!this.input.isHeld('map')) this.mapLatch = false;
  }
  private pausedLatch = false;
  private mapLatch = false;

  private titleCamera(dt: number): void {
    this.titleOrbit += dt * 0.035;
    const pts = this.world.byId('threshold')?.content.points;
    const center = pts?.titleLook ?? new Vector3(0, 60, -80);
    const base = pts?.titleCam ?? new Vector3(0, 100, 0);
    const r = 6;
    const pos = base.clone().add(new Vector3(Math.sin(this.titleOrbit) * r, Math.sin(this.titleOrbit * 0.7) * 1.5, Math.cos(this.titleOrbit) * r * 0.5));
    this.cam.cinematic = { pos, look: center, lambda: 2 };
  }

  protected fixedStep(dt: number, step: StepInput): void {
    this.time += dt;
    if (this.mode === 'play') {
      this.sessionPlay += dt;
      this.progress.playTime += dt;
    }
    if (this.mode === 'play' && step.pressed.lock) this.toggleLock();
    if (this.mode === 'play' && step.pressed.interact && this.interactTarget) {
      this.player.anim?.onInteract();
      this.interactTarget.interact();
    }
    this.player.fixedUpdate(dt, step);
    const pp = this.player.position;
    for (const e of this.entities) {
      if (!e.alive) continue;
      e.prevPosition.copy(e.position);
      const d = e.position.distanceTo(pp);
      e.awake = d < e.sleepDistance || e.sleepDistance <= 0;
      if (e.awake) e.fixedUpdate(dt);
    }
    this.removeDead();
    if (this.mode === 'play' || this.mode === 'dead') {
      this.updateInteract();
      this.updateArenas();
      this.updateTriggers();
      this.updateHints();
      this.updateCameraZones();
      this.updateVisited(dt);
      this.updateDeath(dt);
    }
    // lock target validity
    if (this.player.lockTarget && (!this.player.lockTarget.canBeHit() || this.player.lockTarget.hurtboxes()[0].center.distanceTo(pp) > 16)) {
      this.player.lockTarget = null;
    }
  }

  private renderFrame(dt: number, alpha: number): void {
    const t = this.realTime;
    if (this.player) {
      const look = this.input.consumeLook();
      const visualDt = dt * (this.mode === 'play' || this.mode === 'dead' || this.mode === 'cutscene' ? this.timeScale : 1);
      if (this.mode !== 'title') this.player.render(this.hitstopT > 0 ? 0 : visualDt, alpha, t);
      const pos = this.player.view ? this.player.view.root.position : this.player.position;
      const lt = this.player.lockTarget;
      this.cam.lockTarget = lt && lt.canBeHit() ? lt.hurtboxes()[0]?.center ?? null : null;
      this.cam.combat = this.mode === 'play' && this.enemyNear(pos, 4) ? 1 : 0;
      const camTarget = this.mode === 'title' ? (this.world.byId('threshold')?.content.points.titleLook ?? pos) : pos;
      this.cam.update(dt, { position: camTarget, velocity: this.player.ctrl.velocity, grounded: this.player.ctrl.grounded, facing: this.player.ctrl.facing }, this.mode === 'play' ? look : { x: 0, y: 0 }, this.physics, false);
      for (const e of this.entities) if (e.alive && (e.awake || e instanceof Gate)) e.render(this.hitstopT > 0 ? 0 : visualDt, alpha, t);
      const focus = this.mode === 'title' ? this.cam.camera.position : pos;
      this.world.lightPool.flashTimeScale = this.hitstopT > 0 ? 0.2 : this.timeScale;
      const changed = this.world.update(dt, t, focus, this.cam.camera.position, this.renderer.pixelRatio);
      if (changed && this.mode !== 'title') this.onRegionChanged(changed);
      this.cam.camera.getWorldDirection(_f);
      this.audio.update(dt, this.cam.camera.position, _f);
      if (this.mode === 'play') this.updateTouchContext();
      this.hud.update(dt, {
        health: this.player.health, maxHealth: this.player.maxHealth, moonlight: this.player.moonlight, maxMoonlight: this.player.maxMoonlight,
        jade: this.progress.jade, healCost: this.player.ctrl.tuning.healCost, fps: this.fps, showFps: this.settings.showFps,
      });
      if (this.bossEnemy) {
        if (this.bossEnemy.dead) this.hud.boss(null);
        else this.hud.boss(this.bossName, this.bossEnemy.health / this.bossEnemy.stats.health);
      }
    }
    this.cam.camera.getWorldQuaternion(_q);
    this.fx.update(this.hitstopT > 0 ? dt * 0.2 : dt * this.timeScale, _q, this.cam.camera.position);
    this.renderer.flash = Math.max(0, this.renderer.flash - dt * 3);
    this.renderer.damage = Math.max(0, this.renderer.damage - dt * 1.2);
    this.renderer.render(this.scene, this.cam.camera, dt);
  }

  protected onRegionChanged(r: BuiltRegion): void {
    this.region = r;
    this.killY = r.def.killY;
    this.events.emit('regionEnter', { id: r.def.id, name: r.def.name, hanzi: r.def.hanzi, subtitle: r.def.subtitle });
    if (!this.musicOverride) this.audio.setMusic(r.def.atmosphere.music);
    this.audio.setAmbience(r.def.atmosphere.ambience);
    if (this.mode === 'play' && !this.flag(`seen:${r.def.id}`)) {
      this.setFlag(`seen:${r.def.id}`, true);
      this.hud.regionTitle(r.def.name, r.def.hanzi, r.def.subtitle);
      this.sfx('regionChime');
    }
  }

  private updateTouchContext(): void {
    const c = this.player.ctrl;
    const ab = c.abilities;
    let special: SpecialMode = 'heal';
    if (!c.grounded && ab.bellStrike) special = 'bell';
    else if (ab.lanternFlare) special = 'flare';
    const label = this.interactTarget?.interactPrompt() ?? null;
    this.touch.setContext({
      interact: label,
      special,
      charge: c.charging ? Math.min(1, c.chargeT / c.tuning.chargeTime) : 0,
      lockVisible: true,
      dash: ab.dash,
    });
    if (!Env.touch || this.input.lastSource !== 'touch') {
      this.hud.prompt(label ? `${label}  [E]` : null);
    } else this.hud.prompt(null);
  }

  // ======================================================================= interaction
  private updateInteract(): void {
    let best: Entity | null = null;
    let bestD = Infinity;
    const pp = this.player.position;
    if (!this.player.dead && this.player.ctrl.grounded) {
      for (const e of this.entities) {
        if (!e.alive || e.interactRadius <= 0) continue;
        const d = Math.hypot(e.position.x - pp.x, e.position.z - pp.z);
        if (d > e.interactRadius + 1.5) continue;
        if (!e.interactPrompt()) continue;
        if (d < bestD) {
          best = e;
          bestD = d;
        }
      }
    }
    this.interactTarget = best;
  }

  private toggleLock(): void {
    if (this.player.lockTarget) {
      this.player.lockTarget = null;
      return;
    }
    const pp = this.player.position;
    let best: Damageable | null = null;
    let bestD = 14;
    const f = this.cam.basis();
    for (const d of this.damageables) {
      if (!(d instanceof Enemy) || !d.canBeHit()) continue;
      const c = d.hurtboxes()[0].center;
      const dist = c.distanceTo(pp);
      // prefer targets in front of the camera
      const dx = c.x - pp.x, dz = c.z - pp.z;
      const inFront = (dx * f.fx + dz * f.fz) / Math.max(1e-3, Math.hypot(dx, dz));
      const score = dist - inFront * 4;
      if (dist < 14 && score < bestD) {
        best = d;
        bestD = score;
      }
    }
    this.player.lockTarget = best;
    if (best) this.sfx('lockOn');
  }

  // ======================================================================= progression API
  flag(k: string): boolean | number | string | undefined {
    return this.progress.flags[k];
  }
  setFlag(k: string, v: boolean | number | string): void {
    this.progress.flags[k] = v;
  }
  consume(id: string): void {
    if (!this.progress.consumed.includes(id)) this.progress.consumed.push(id);
    this.pendingSave = true;
  }
  isConsumed(id: string): boolean {
    return this.progress.consumed.includes(id);
  }
  writeSave(): void {
    if (this.mode === 'title' || this.mode === 'loading') return;
    SaveSystem.write(this.progress);
  }

  restAtShrine(sh: Shrine): void {
    if (this.player.dead) return;
    const first = !this.flag(`shrine:${sh.id}`);
    this.setFlag(`shrine:${sh.id}`, true);
    sh.lit = true;
    this.progress.shrine = sh.id;
    this.player.health = this.player.maxHealth;
    this.player.ctrl.resetMotion();
    this.player.ctrl.setState('heal');
    this.player.ctrl.healTimer = -99;
    this.resetEnemies();
    this.writeSave();
    this.renderer.flash = 0.25;
    this.sfx('shrine', sh.position);
    this.fx.ring(sh.position.clone().add(new Vector3(0, 0.4, 0)), 5, new Color(1.4, 0.9, 0.5), 1.2, 0.7);
    this.fx.burst(sh.position.clone().add(new Vector3(0, 1.2, 0)), { count: 40, color: new Color(1.6, 1.0, 0.5), speed: 3, spread: 1, life: 1.2, size: 0.1, gravity: -1 });
    this.hud.toast(first ? `${sh.name} kindled` : 'Rested', 'Lanterns restored · progress saved', 'save', '香');
    this.events.emit('saved', { shrine: sh.id });
    setTimeout(() => {
      if (this.player.ctrl.state === 'heal') this.player.ctrl.setState('idle');
    }, 900);
  }

  private resetEnemies(): void {
    for (const e of this.entities) {
      if (e instanceof Enemy) e.reset();
      if (e instanceof MovingPlatform) e.reset();
    }
    for (const a of this.arenas) {
      if (a.active) this.endArena(a, false);
    }
  }

  readStele(loreId: string): void {
    const L = LORE[loreId];
    if (!L) return;
    if (!this.progress.loreRead.includes(loreId)) {
      this.progress.loreRead.push(loreId);
      this.pendingSave = true;
    }
    this.openDialogue([{ speaker: `${L.hanzi} · ${L.title}`, text: L.text.join(' ') }]);
  }

  grantAbility(id: AbilityId, at: Vector3): void {
    this.progress.abilities[id] = true;
    this.player.ctrl.abilities[id] = true;
    this.player.anim?.onAbility();
    const info = AbilityInfo[id];
    this.sfx('ability', at);
    this.hitstop(0.12);
    this.renderer.flash = 0.6;
    this.shake(0.4);
    this.fx.ring(at, 6, new Color(1.2, 1.6, 1.4), 1, 0.8);
    this.fx.burst(at, { count: 60, color: new Color(1.2, 1.7, 1.5), speed: 6, spread: 1, life: 1.2, size: 0.12, gravity: 0 });
    this.fx.motes(at, 30, new Color(1.3, 1.7, 1.5));
    this.hud.toast(info.name, info.how, 'ability', info.hanzi);
    this.events.emit('abilityGained', { id });
    this.writeSave();
  }

  collectFragment(id: string, at: Vector3): void {
    if (!this.progress.fragments.includes(id)) this.progress.fragments.push(id);
    const n = this.progress.fragments.length;
    this.sfx('fragment', at);
    this.fx.burst(at, { count: 30, color: new Color(1.6, 1.6, 1.3), speed: 4, spread: 1, life: 0.9, size: 0.1, gravity: 0 });
    if (n % 3 === 0) {
      this.player.maxHealth = maxHealthFor(this.progress);
      this.player.health = this.player.maxHealth;
      this.hud.toast('A new lantern kindles', `Moon fragments united · ${this.player.maxHealth} lanterns of life`, 'ability', '月');
    } else {
      this.hud.toast('Moon Fragment', `${n % 3} of 3 gathered`, 'item', '魄');
    }
    this.writeSave();
  }

  spawnJade(at: Vector3, amount: number): void {
    const beads = Math.min(8, Math.max(1, Math.round(amount / 3)));
    let left = amount;
    for (let i = 0; i < beads; i++) {
      const a = i === beads - 1 ? left : Math.floor(amount / beads);
      left -= a;
      if (a > 0) this.addEntity(new JadeBead(this, at, a));
    }
  }

  addJade(n: number): void {
    this.progress.jade += n;
    this.sfx('jade', undefined, 0.6);
  }

  openGate(id: string, persist: boolean): void {
    const g = this.gates.get(id);
    if (persist) {
      this.setFlag(`gate:${id}`, true);
      this.pendingSave = true;
    }
    if (g && !g.open) {
      g.setOpen(true);
      this.sfx(g.kind === 'portcullis' ? 'gateOpen' : 'sealBreak', g.position);
      this.shake(0.2);
    }
  }

  // ======================================================================= dialogue & NPCs
  openDialogue(lines: DialogueLine[], done?: () => void): void {
    this.mode = 'dialogue';
    this.touch.setVisible(false);
    this.input.blocked = true;
    this.input.releaseAll();
    this.player.ctrl.resetMotion();
    this.hud.prompt(null);
    this.menus.showDialogue(lines, () => {
      this.mode = 'play';
      this.touch.setVisible(true);
      this.input.blocked = false;
      this.input.flush();
      done?.();
    });
  }

  talkTo(npc: string, ent: Npc): void {
    const f = (k: string) => !!this.flag(k);
    const set = (k: string) => this.setFlag(k, true);
    const npcDef = NPCS[npc];
    void npcDef;
    void ent;
    if (npc === 'weng') {
      if (!f('talk:wengFirst')) {
        set('talk:wengFirst');
        this.openDialogue(DIALOGUE.wengFirst);
      } else if (this.progress.abilities.doubleJump && !this.progress.abilities.lanternFlare) {
        this.openDialogue(DIALOGUE.wengFlare, () => this.grantAbility('lanternFlare', ent.position.clone().add(new Vector3(0, 1.6, 0))));
      } else if (this.progress.abilities.lanternFlare && !f('talk:wengAfterFlare')) {
        set('talk:wengAfterFlare');
        this.openDialogue(DIALOGUE.wengAfterFlare);
      } else if (this.progress.abilities.dash && !f('talk:wengAfterDash')) {
        set('talk:wengAfterDash');
        this.openDialogue(DIALOGUE.wengAfterDash);
      } else {
        this.openDialogue(DIALOGUE.wengShop, () => this.openShop());
      }
    } else if (npc === 'xun') {
      const region = ent.regionId;
      if (region === 'threshold') {
        if (!f('talk:xunFirst')) {
          set('talk:xunFirst');
          this.openDialogue(DIALOGUE.xunFirst);
        } else this.openDialogue(DIALOGUE.xunIdle);
      } else if (region === 'mistfall') {
        if (!f('talk:xunMist')) {
          set('talk:xunMist');
          this.openDialogue(DIALOGUE.xunMist);
        } else this.openDialogue(DIALOGUE.xunMistIdle);
      } else {
        this.openDialogue(this.flag('slain:boss_abbot') ? DIALOGUE.xunEnd : DIALOGUE.xunSanctum);
      }
    }
    this.pendingSave = true;
  }

  private openShop(): void {
    this.mode = 'dialogue';
    this.touch.setVisible(false);
    this.input.blocked = true;
    const items = SHOP.map((s) => ({ ...s, sold: this.isConsumed(s.id) }));
    const close = () => {
      this.menus.hide();
      this.mode = 'play';
      this.touch.setVisible(true);
      this.input.blocked = false;
      this.input.flush();
    };
    const buy = (id: string) => {
      const item = SHOP.find((s) => s.id === id);
      if (!item || this.isConsumed(id) || this.progress.jade < item.cost) return;
      this.progress.jade -= item.cost;
      this.consume(id);
      if (id === 'fragment_shop') this.collectFragment(id, this.player.position.clone().add(new Vector3(0, 1, 0)));
      if (id === 'vessel_shop') {
        this.progress.moonVessels++;
        this.player.maxMoonlight = maxMoonlightFor(this.progress);
        this.hud.toast('Moonlight Vessel', 'You can hold more moonlight', 'item', '杯');
      }
      this.sfx('buy');
      this.writeSave();
      this.menus.showShop(SHOP.map((s) => ({ ...s, sold: this.isConsumed(s.id) })), this.progress.jade, buy, close);
    };
    this.menus.showShop(items, this.progress.jade, buy, close);
  }

  // ======================================================================= arenas, triggers, hints, zones
  private updateArenas(): void {
    const pp = this.player.position;
    for (const a of this.arenas) {
      const cleared = !!this.flag(`arena:${a.def.id}`);
      if (!a.active) {
        if (cleared || this.player.dead) continue;
        if (a.box.containsPoint(pp)) this.startArena(a);
        continue;
      }
      if (this.player.dead) continue;
      // the arena is sealed, so this only happens on a teleport/debug spawn: abandon the fight
      if (a.box.distanceToPoint(pp) > 30) {
        this.endArena(a, false);
        continue;
      }
      const alive = a.enemies.filter((e) => !e.dead);
      if (alive.length === 0) {
        a.wave++;
        if (a.wave < a.def.waves.length) this.spawnWave(a);
        else this.endArena(a, true);
      }
    }
  }

  private startArena(a: ArenaState): void {
    a.active = true;
    a.wave = 0;
    for (const g of a.def.gates) this.gates.get(g)?.setOpen(false);
    this.sfx('arenaStart', a.def.pos);
    this.shake(0.25);
    if (a.def.music) {
      this.musicOverride = a.def.music;
      this.audio.setMusic(a.def.music);
    }
    this.spawnWave(a);
  }

  private spawnWave(a: ArenaState): void {
    const region = this.world.byId(a.region);
    if (!region) return;
    const ids = a.def.waves[a.wave];
    a.enemies = [];
    for (const id of ids) {
      const s = region.content.spawns.find((x) => x.type === 'enemy' && x.id === id) as Extract<SpawnDef, { type: 'enemy' }> | undefined;
      if (!s) continue;
      const waiting = this.entities.find((x) => x instanceof Enemy && x.id === id && x.dormant) as Enemy | undefined;
      if (waiting) {
        waiting.dormant = false;
        waiting.aware = true;
        this.bossEnemy = waiting;
        this.bossName = s.kind === 'censerWarden' ? 'Censer Warden' : 'The Tolling Abbot';
        a.enemies.push(waiting);
        this.sfx('bossAwaken', waiting.position);
        this.shake(0.5);
        continue;
      }
      const e = spawnEnemy(this, s.kind, `${s.id}`, a.region, s.pos, s.yaw ?? 0);
      e.spawnedByArena = true;
      e.arenaId = a.def.id;
      e.aware = true;
      e.leash = 40;
      if (s.kind === 'tollingAbbot') (e as unknown as { arenaCenter: Vector3 }).arenaCenter.set(a.def.pos.x, s.pos.y, a.def.pos.z);
      if (s.kind === 'censerWarden' || s.kind === 'tollingAbbot') {
        e.permanentDeath = true;
        this.bossEnemy = e;
        this.bossName = s.kind === 'censerWarden' ? 'Censer Warden' : 'The Tolling Abbot';
      }
      this.addEntity(e);
      a.enemies.push(e);
      this.fx.burst(s.pos.clone().add(new Vector3(0, 0.6, 0)), { count: 20, color: 0x08090c, speed: 3, spread: 1, life: 0.7, size: 0.3, gravity: -2, additive: false });
    }
  }

  private endArena(a: ArenaState, won: boolean): void {
    a.active = false;
    for (const g of a.def.gates) this.gates.get(g)?.setOpen(true);
    this.musicOverride = null;
    if (this.region) this.audio.setMusic(this.region.def.atmosphere.music);
    if (won) {
      this.setFlag(`arena:${a.def.id}`, true);
      for (const alt of this.altars) if (alt.arena === a.def.id) alt.sealed = false;
      this.sfx('arenaClear', a.def.pos);
      if (a.def.boss) this.setFlag(`slain:${a.def.boss}`, true);
      this.writeSave();
    } else {
      for (const e of a.enemies) {
        if (e.startsDormant) {
          e.reset();
          continue;
        }
        e.alive = false;
        e.dead = true;
        e.root.visible = false;
      }
    }
    a.enemies = [];
    if (this.bossEnemy && (won || !a.active)) {
      this.bossEnemy = null;
      this.hud.boss(null);
    }
  }

  private updateTriggers(): void {
    const pp = this.player.position;
    for (const tr of this.triggers) {
      const inside = tr.box.containsPoint(pp);
      if (inside && !tr.inside && !(tr.def.once && (tr.fired || this.flag(`trig:${tr.def.id}`)))) {
        tr.fired = true;
        if (tr.def.once) this.setFlag(`trig:${tr.def.id}`, true);
        this.onTrigger(tr.def.event, tr.def);
      }
      tr.inside = inside;
    }
  }

  protected onTrigger(event: string, _def: Extract<SpawnDef, { type: 'trigger' }>): void {
    if (event === 'ending') {
      if (this.flag('ending_seen')) {
        // the seal is already broken: the well returns you to the shrine
        const sh = this.shrines.get('shrine_sanctum');
        if (sh) {
          this.curtain.classList.add('on');
          this.respawnAt(sh.standPoint, sh.yaw, false);
          setTimeout(() => this.curtain.classList.remove('on'), 500);
        }
      } else this.playEnding();
    }
    else if (event.startsWith('text:')) this.hud.toast(event.slice(5), '', 'info');
  }

  private hintText(t: string): string {
    const touch = Env.touch && this.input.lastSource !== 'kb' && this.input.lastSource !== 'pad';
    const pad = this.input.lastSource === 'pad';
    const map: Record<string, string> = touch
      ? { move: 'the left thumb', look: 'drag on the right', jump: '<b>JUMP</b>', attack: '<b>STRIKE</b>', dash: '<b>DASH</b>', special: '<b>MOON</b>', interact: '<b>the lantern button</b>', lock: '<b>FOCUS</b>' }
      : pad
        ? { move: 'the left stick', look: 'the right stick', jump: '<b>A</b>', attack: '<b>X</b>', dash: '<b>B</b>', special: '<b>Y</b>', interact: '<b>RB</b>', lock: '<b>LB</b>' }
        : { move: '<b>WASD</b>', look: 'the mouse', jump: '<b>Space</b>', attack: '<b>J</b> / <b>click</b>', dash: '<b>K</b> / <b>Shift</b>', special: '<b>L</b>', interact: '<b>E</b>', lock: '<b>Tab</b>' };
    return t.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? k);
  }

  private updateHints(): void {
    if (!this.settings.showHints) {
      this.hud.hint(null);
      return;
    }
    const pp = this.player.position;
    let text: string | null = null;
    let best = Infinity;
    for (const hs of this.hints) {
      const d = hs.def;
      const dist = Math.hypot(pp.x - d.pos.x, pp.z - d.pos.z);
      if (dist > d.radius || Math.abs(pp.y - d.pos.y) > 6) continue;
      if (d.requires && this.progress.abilities[d.requires]) continue;
      if (d.when && !this.progress.abilities[d.when]) continue;
      if (dist < best) {
        best = dist;
        text = this.hintText(d.text);
      }
    }
    this.hud.hint(text);
  }

  private updateCameraZones(): void {
    const pp = this.player.position;
    let zone = null;
    const r = this.region;
    if (r) for (const z of r.content.cameraZones) if (z.box.containsPoint(pp)) zone = z.zone;
    this.cam.zone = zone;
  }

  private updateVisited(dt: number): void {
    this.visitTimer -= dt;
    if (this.visitTimer > 0) return;
    this.visitTimer = 0.5;
    const pp = this.player.position;
    for (const r of this.world.regions) {
      for (const room of r.content.rooms) {
        if (pp.x >= room.min[0] && pp.x <= room.max[0] && pp.z >= room.min[1] && pp.z <= room.max[1] && Math.abs(pp.y - room.y) < 25) {
          if (!this.progress.visitedRooms.includes(room.id)) this.progress.visitedRooms.push(room.id);
        }
      }
    }
  }

  // ======================================================================= death
  private updateDeath(dt: number): void {
    if (!this.player.dead) return;
    if (this.mode !== 'dead') {
      this.mode = 'dead';
      this.deadTimer = 0;
      this.progress.deaths++;
      this.slowmo = { t: 1.0, scale: 0.35 };
      this.renderer.damage = 1;
      this.touch.setVisible(false);
      this.sfx('death', this.player.position);
      this.deathText.classList.add('on');
      this.hud.boss(null);
    }
    this.deadTimer += dt;
    if (this.deadTimer > 1.4) this.curtain.classList.add('on');
    if (this.deadTimer > 2.3) this.respawnAfterDeath();
  }

  private respawnAfterDeath(): void {
    this.deathText.classList.remove('on');
    const sh = this.shrines.get(this.progress.shrine) ?? [...this.shrines.values()][0];
    this.resetEnemies();
    this.bossEnemy = null;
    this.player.health = this.player.maxHealth;
    this.player.moonlight = 0;
    this.player.lockTarget = null;
    this.spawnPlayer(sh ? sh.standPoint : new Vector3(), sh ? sh.yaw : 0);
    this.fx.clear();
    this.mode = 'play';
    this.timeScale = 1;
    this.slowmo.t = 0;
    this.touch.setVisible(true);
    this.input.flush();
    this.pendingSave = true;
    this.musicOverride = null;
    this.fadeIn(0.8);
    const r = this.world.regionAt(this.player.position);
    if (r) this.onRegionChanged(r);
  }

  private fadeIn(delay: number): void {
    this.curtain.classList.add('on');
    setTimeout(() => this.curtain.classList.remove('on'), delay * 1000);
  }

  // ======================================================================= ending
  playEnding(): void {
    if (this.flag('ending_seen')) return;
    this.setFlag('ending_seen', true);
    this.writeSave();
    this.mode = 'ending';
    this.touch.setVisible(false);
    this.hud.setVisible(false);
    this.input.blocked = true;
    this.audio.setMusic('ending');
    this.curtain.classList.add('on');
    const p = this.progress;
    const mins = Math.floor(p.playTime / 60);
    const stats = `${Math.floor(mins / 60)}h ${mins % 60}m · ${p.fragments.length} moon fragments · ${p.loreRead.length} steles read · ${p.deaths} returns to the incense`;
    setTimeout(() => {
      this.menus.showEnding(ENDING_TEXT, stats, () => {
        this.menus.hide();
        this.hud.setVisible(true);
        const sh = this.shrines.get('shrine_sanctum') ?? this.shrines.get(this.progress.shrine);
        if (sh) {
          this.progress.shrine = sh.id;
          this.spawnPlayer(sh.standPoint, sh.yaw);
        }
        this.curtain.classList.remove('on');
        this.beginPlay();
        this.writeSave();
      });
    }, 1400);
  }

  // ======================================================================= combat services
  sfx(name: string, pos?: Vector3, vol = 1): void {
    this.audio.sfx(name, pos, vol);
  }
  stopSfx(name: string): void {
    this.audio.stop(name);
  }
  hitstop(seconds: number): void {
    this.hitstopT = Math.max(this.hitstopT, seconds);
  }
  shake(amount: number): void {
    this.cam.addTrauma(amount);
  }
  slowMotion(scale: number, seconds: number): void {
    this.slowmo = { t: seconds, scale };
  }

  playerAttackFx(a: ActiveAttack, player: Player): void {
    const p = player.position;
    const yaw = player.ctrl.facing;
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    // arcs take the colour of the flaming spearhead
    const jade = new Color(1.6, 0.95, 0.5);
    const center = p.clone().add(new Vector3(0, 0.45, 0));
    switch (a.kind) {
      case 'slash1':
        this.fx.slash(center.clone().addScaledVector(fwd, 0.1), fwd, new Vector3(0.15, 1, 0).normalize(), a.range, 2.3, jade, false);
        break;
      case 'airSlash': {
        // the overhead cut runs diagonally: high on the left, down to the right
        const side = new Vector3(fwd.z, 0, -fwd.x);
        const n = new Vector3(0, 1, 0).addScaledVector(side, -0.9).normalize();
        this.fx.slash(center.clone().add(new Vector3(0, 0.2, 0)), fwd, n, a.range, 2.4, jade, true);
        break;
      }
      case 'slash2':
        this.fx.slash(center.clone().addScaledVector(fwd, 0.1), fwd, new Vector3(-0.2, 1, 0).normalize(), a.range, 2.3, jade, true);
        break;
      case 'slash3': {
        const side = new Vector3(fwd.z, 0, -fwd.x);
        this.fx.slash(center.clone().add(new Vector3(0, 0.1, 0)), fwd, side, a.range + 0.1, 1.2, new Color(1.8, 1.0, 0.45), false, 0.2, 0.3);
        break;
      }
      case 'downSlash': {
        const side = new Vector3(fwd.z, 0, -fwd.x);
        this.fx.slash(p.clone().add(new Vector3(0, 0.1, 0)), new Vector3(0, -1, 0), side, a.range * 0.9, 2.4, jade, false);
        break;
      }
      case 'upSlash': {
        const side = new Vector3(fwd.z, 0, -fwd.x);
        this.fx.slash(p.clone().add(new Vector3(0, 0.9, 0)), new Vector3(0, 1, 0), side, a.range * 0.9, 2.4, jade, true);
        break;
      }
      case 'spin':
        this.fx.slash(center, fwd, new Vector3(0, 1, 0), a.range, Math.PI * 2 - 0.2, new Color(1.2, 1.7, 1.5), false, 0.35, 0.5);
        this.fx.ring(p.clone().add(new Vector3(0, 0.3, 0)), a.range * 1.1, jade, 0.4, 0.6);
        break;
      default:
        break;
    }
  }

  onPlayerHit(target: Damageable, hit: HitInfo, res: HitResult, a: ActiveAttack): void {
    const heavy = a.kind === 'slash3' || a.kind === 'spin' || a.kind === 'slam';
    if (res === 'blocked') {
      this.sfx('clang', hit.point);
      this.fx.burst(hit.point, { count: 14, color: new Color(2, 1.5, 0.8), speed: 6, life: 0.25, size: 0.07, gravity: 8 });
      this.fx.flash(hit.point, 1.2, new Color(1.6, 1.3, 0.8));
      this.hitstop(0.05);
      this.shake(0.15);
      return;
    }
    const isEnemy = target instanceof Enemy;
    if (isEnemy) this.sfx(res === 'kill' ? 'kill' : heavy ? 'hitHeavy' : 'hit', hit.point);
    this.fx.flash(hit.point, heavy ? 1.8 : 1.3, new Color(1.6, 1.8, 1.7));
    if (isEnemy) {
      this.fx.burst(hit.point, { count: heavy ? 18 : 10, color: 0x0a0b10, speed: 5, dir: hit.dir, spread: 0.6, life: 0.5, size: 0.2, gravity: 9, additive: false });
      this.fx.burst(hit.point, { count: 8, color: new Color(1.2, 1.9, 1.6), speed: 7, dir: hit.dir, spread: 0.7, life: 0.2, size: 0.06, gravity: 2 });
    }
    if (target.givesMoonlight) this.fx.motes(hit.point, 3, new Color(1.2, 1.2, 1.5));
    this.hitstop(res === 'kill' ? 0.085 : heavy ? 0.065 : 0.045);
    this.shake(res === 'kill' ? 0.28 : heavy ? 0.2 : 0.1);
    this.vibrate(res === 'kill' ? 25 : 12);
  }

  vibrate(ms: number): void {
    if (!this.settings.haptics || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }

  /** Enemy damage to the player. Returns true if applied. */
  damagePlayer(amount: number, from: Vector3): boolean {
    const pl = this.player;
    if (this.mode !== 'play' && this.mode !== 'dead') return false;
    if (!pl.damage(amount, from.x, from.z)) return false;
    this.hitstop(0.12);
    this.shake(0.45);
    this.renderer.damage = 0.9;
    this.sfx('hurt', pl.position);
    this.vibrate(40);
    this.fx.burst(pl.position.clone().add(new Vector3(0, 0.6, 0)), { count: 16, color: new Color(1.8, 0.3, 0.2), speed: 5, spread: 1, life: 0.4, size: 0.08, gravity: 6 });
    this.fx.burst(pl.position.clone().add(new Vector3(0, 0.6, 0)), { count: 10, color: 0x08090c, speed: 4, spread: 1, life: 0.6, size: 0.2, gravity: 8, additive: false });
    this.events.emit('playerDamaged', { health: pl.health });
    return true;
  }

  /** Is a living enemy within `r` metres (horizontally, and roughly at the same level)? */
  private enemyNear(p: Vector3, r: number): boolean {
    for (const e of this.entities) {
      if (!(e instanceof Enemy) || !e.canBeHit()) continue;
      const dx = e.position.x - p.x, dz = e.position.z - p.z;
      if (dx * dx + dz * dz < r * r && Math.abs(e.position.y - p.y) < 2.5) return true;
    }
    return false;
  }

  onEnemyKilled(e: Enemy): void {
    if (e.stats.jade > 0 && e.alive) this.spawnJade(e.position.clone().add(new Vector3(0, 0.5, 0)), e.stats.jade);
    this.events.emit('enemyKilled', { id: e.id, kind: e.kind });
    if (e === this.bossEnemy) {
      this.slowMotion(0.25, 1.6);
      this.renderer.flash = 0.8;
      this.shake(0.8);
      this.sfx('bossDeath', e.position);
      this.setFlag(`slain:${e.id}`, true);
      this.pendingSave = true;
    }
  }

  spawnEnemyProjectile(pos: Vector3, vel: Vector3, damage: number): void {
    this.addEntity(new Projectile(this, pos, vel, damage, false, 0.28));
    this.sfx('spit', pos);
  }

  spawnFlare(pos: Vector3, dir: Vector3): void {
    this.addEntity(new Projectile(this, pos, dir.clone().multiplyScalar(19), 2.5, true, 0.4));
    this.sfx('flare', pos);
    this.fx.flash(pos, 1.6, new Color(1.6, 1.0, 0.4));
  }

  onSlamImpact(pos: Vector3): void {
    // shatter cracked floors below
    const g = this.player.ctrl.body.groundCollider;
    if (g && g.tag === 'crackedFloor' && g.owner instanceof BreakWall) {
      g.owner.shatter(true);
      this.player.ctrl.body.grounded = false;
    }
    for (const e of this.entities) {
      if (e instanceof BreakWall && !e.broken && e.floor && e.position.distanceTo(pos) < 3.5) e.shatter(true);
    }
    // bells ring
    this.events.emit('enemyKilled', { id: 'slam', kind: 'slam' });
  }

  isAbyss(c: Collider): boolean {
    return c.tag === 'abyss';
  }

  /** Hazard contact: damage + return to the last safe ground. */
  hazardHit(damage: number, fell = false): void {
    const pl = this.player;
    if (pl.dead || this.mode !== 'play') return;
    if (!fell && pl.ctrl.invulnerable) return;
    pl.health = Math.max(0, pl.health - damage);
    this.renderer.damage = 0.8;
    this.shake(0.3);
    this.sfx('hurt', pl.position);
    this.events.emit('playerDamaged', { health: pl.health });
    if (pl.health <= 0) {
      pl.ctrl.kill();
      pl.deathTimer = 0;
      return;
    }
    this.curtain.classList.add('on');
    const safe = pl.ctrl.body.hasSafe ? pl.ctrl.body.lastSafe.clone() : pl.position.clone();
    this.respawnAt(safe, pl.ctrl.facing, true);
    setTimeout(() => this.curtain.classList.remove('on'), 250);
  }

  respawnAt(p: Vector3, yaw: number, hazard: boolean): void {
    const c = this.player.ctrl;
    c.body.teleport(p.clone().add(new Vector3(0, 0.05, 0)));
    c.resetMotion();
    c.facing = yaw;
    c.iframes = hazard ? 1.0 : 0;
    this.player.prevPos.copy(c.body.position);
    this.player.anim?.resetDynamics();
  }

  debugInfo(): Record<string, unknown> {
    const c = this.player?.ctrl;
    return {
      mode: this.mode,
      fps: Math.round(this.fps),
      pos: c ? c.position.toArray().map((v) => +v.toFixed(2)) : null,
      state: c?.state,
      grounded: c?.grounded,
      region: this.region?.def.id,
      health: this.player?.health,
      moonlight: this.player?.moonlight,
      renderScale: this.renderer.renderScale,
      render: this.renderer.info(),
      world: this.world.stats(),
      entities: this.entities.length,
    };
  }
}
