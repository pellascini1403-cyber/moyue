import { h, clear } from './dom';
import { Settings, TouchButtonId, Quality, layoutFor } from '../save/Settings';
import { AbilityInfo, AbilityId, Abilities } from '../player/Abilities';
import { LORE } from '../story/lore';
import { DialogueLine } from '../story/lore';

export interface MapRoom {
  id: string;
  name: string;
  min: [number, number];
  max: [number, number];
  y: number;
  visited: boolean;
  region: string;
}

export interface MenuHost {
  hasSave(): boolean;
  saveSummary(): string | null;
  newGame(): void;
  continueGame(): void;
  resume(): void;
  quitToTitle(): void;
  settings: Settings;
  applySettings(): void;
  setTouchEdit(on: boolean): void;
  touchSelected(): TouchButtonId | null;
  setButtonSize(id: TouchButtonId, s: number): void;
  resetLayout(): void;
  journal(): { abilities: Abilities; fragments: number; jade: number; lore: string[]; maxHealth: number; deaths: number; playTime: number; vessels: number };
  mapData(): { rooms: MapRoom[]; player: [number, number] | null; shrines: { x: number; z: number; name: string; active: boolean }[]; regionNames: Record<string, string> };
  isTouch(): boolean;
  eraseSave(): void;
  audioUnlock(): void;
  uiSound(kind: 'move' | 'select' | 'back'): void;
}

type Screen = 'none' | 'title' | 'pause' | 'settings' | 'journal' | 'map' | 'dialogue' | 'shop' | 'ending' | 'layout' | 'confirm';

/** All full-screen menus, dialogue boxes and overlays. */
export class Menus {
  readonly root: HTMLDivElement;
  screen: Screen = 'none';
  private back: Screen = 'none';
  private dialogueLines: DialogueLine[] = [];
  private dialogueIdx = 0;
  private dialogueDone: (() => void) | null = null;
  private typeTimer = 0;
  private typed = 0;
  private dialogueText: HTMLDivElement | null = null;
  private dialogueCaret: HTMLDivElement | null = null;
  private settingsTab: 'controls' | 'camera' | 'audio' | 'graphics' = 'controls';
  onScreenChange?: (s: Screen) => void;

  constructor(parent: HTMLElement, private host: MenuHost) {
    this.root = h('div', { class: 'moyue-menus' });
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  private set(s: Screen): void {
    this.screen = s;
    this.root.className = `moyue-menus moyue-screen-${s}`;
    this.onScreenChange?.(s);
  }

  hide(): void {
    clear(this.root);
    this.set('none');
  }

  get blocking(): boolean {
    return this.screen !== 'none';
  }

  private panel(title: string, hanzi: string, ...children: (Node | null)[]): HTMLDivElement {
    return h('div', { class: 'moyue-panel' },
      h('div', { class: 'moyue-panel-head' }, h('span', { class: 'moyue-panel-hanzi', text: hanzi }), h('span', { class: 'moyue-panel-title', text: title })),
      ...children,
    );
  }

  private btn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    return h('button', {
      class: `moyue-btn ${cls}`,
      onclick: (e: Event) => {
        e.stopPropagation();
        this.host.audioUnlock();
        this.host.uiSound('select');
        fn();
      },
    }, label);
  }

  // ------------------------------------------------------------------ title
  showTitle(): void {
    clear(this.root);
    this.set('title');
    const summary = this.host.saveSummary();
    const menu = h('div', { class: 'moyue-title-menu' });
    if (this.host.hasSave()) menu.appendChild(this.btn('Continue', () => this.host.continueGame(), 'primary'));
    menu.appendChild(this.btn(this.host.hasSave() ? 'New Descent' : 'Begin the Descent', () => {
      if (this.host.hasSave()) this.confirm('Begin anew? Your current journey will be lost.', () => this.host.newGame(), () => this.showTitle());
      else this.host.newGame();
    }, this.host.hasSave() ? '' : 'primary'));
    menu.appendChild(this.btn('Settings', () => this.showSettings('title')));
    const title = h('div', { class: 'moyue-title' },
      h('div', { class: 'moyue-title-mark', text: '墨月' }),
      h('div', { class: 'moyue-title-name', text: 'MÒYUÈ' }),
      h('div', { class: 'moyue-title-sub', text: 'The Eternal Descent' }),
      menu,
      summary ? h('div', { class: 'moyue-title-save', text: summary }) : null,
      h('div', { class: 'moyue-title-foot', text: this.host.isTouch() ? 'Best played in landscape · headphones recommended' : 'WASD move · Space jump · J / click strike · K / Shift dash · L heal · E interact · Esc pause' }),
    );
    this.root.appendChild(title);
    this.focusFirst();
  }

  // ------------------------------------------------------------------ pause
  showPause(): void {
    clear(this.root);
    this.set('pause');
    const p = this.panel('Stillness', '静',
      h('div', { class: 'moyue-menu-list' },
        this.btn('Resume', () => this.host.resume(), 'primary'),
        this.btn('Map', () => this.showMap('pause')),
        this.btn('Journal', () => this.showJournal()),
        this.btn('Settings', () => this.showSettings('pause')),
        this.btn('Quit to Title', () => this.confirm('Return to the title? Progress is kept from your last shrine rest.', () => this.host.quitToTitle(), () => this.showPause())),
      ),
    );
    this.root.appendChild(h('div', { class: 'moyue-overlay' }, p));
    this.focusFirst();
  }

  confirm(msg: string, yes: () => void, no: () => void): void {
    clear(this.root);
    this.set('confirm');
    this.root.appendChild(h('div', { class: 'moyue-overlay' }, this.panel('Are you certain?', '问',
      h('p', { class: 'moyue-confirm-text', text: msg }),
      h('div', { class: 'moyue-row' }, this.btn('Yes', yes, 'primary'), this.btn('No', no)),
    )));
    this.focusFirst();
  }

  // ------------------------------------------------------------------ settings
  showSettings(from: Screen): void {
    this.back = from === 'settings' ? this.back : from;
    clear(this.root);
    this.set('settings');
    const s = this.host.settings;
    const apply = () => this.host.applySettings();
    const slider = (label: string, value: number, min: number, max: number, step: number, fn: (v: number) => void, fmt = (v: number) => v.toFixed(2)) => {
      const out = h('span', { class: 'moyue-val', text: fmt(value) });
      const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        out.textContent = fmt(v);
        fn(v);
        apply();
      });
      return h('label', { class: 'moyue-setting' }, h('span', { class: 'moyue-label', text: label }), input, out);
    };
    const toggle = (label: string, value: boolean, fn: (v: boolean) => void) => {
      const input = h('input', { type: 'checkbox', 'aria-label': label });
      input.checked = value;
      input.addEventListener('change', () => {
        fn(input.checked);
        apply();
      });
      return h('label', { class: 'moyue-setting moyue-toggle' }, h('span', { class: 'moyue-label', text: label }), input, h('span', { class: 'moyue-switch' }));
    };
    const tabs = h('div', { class: 'moyue-tabs' });
    const body = h('div', { class: 'moyue-settings-body' });
    const tabNames: [typeof this.settingsTab, string][] = [['controls', 'Controls'], ['camera', 'Camera'], ['audio', 'Audio'], ['graphics', 'Graphics']];
    for (const [id, label] of tabNames) {
      tabs.appendChild(h('button', {
        class: `moyue-tab${this.settingsTab === id ? ' active' : ''}`,
        onclick: () => {
          this.settingsTab = id;
          this.host.uiSound('move');
          this.showSettings('settings');
        },
      }, label));
    }
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    if (this.settingsTab === 'controls') {
      body.append(
        slider('Stick dead zone', s.stickDeadzone, 0, 0.4, 0.01, (v) => (s.stickDeadzone = v), pct),
        slider('Stick sensitivity', s.stickSensitivity, 0.5, 2, 0.05, (v) => (s.stickSensitivity = v), (v) => `${v.toFixed(2)}×`),
        toggle('Floating stick (appears under thumb)', s.floatingStick, (v) => (s.floatingStick = v)),
        slider('Button size', s.buttonScale, 0.7, 1.5, 0.05, (v) => (s.buttonScale = v), (v) => `${v.toFixed(2)}×`),
        slider('Button opacity', s.buttonOpacity, 0.2, 1, 0.05, (v) => (s.buttonOpacity = v), pct),
        toggle('Slide thumb between buttons', s.slideBetweenButtons, (v) => (s.slideBetweenButtons = v)),
        toggle('Vibration (Android)', s.haptics, (v) => (s.haptics = v)),
        toggle('Show hints', s.showHints, (v) => (s.showHints = v)),
        h('div', { class: 'moyue-row' },
          this.btn('Edit button layout', () => this.showLayoutEditor()),
          this.btn('Reset layout', () => {
            this.host.resetLayout();
            apply();
          }),
        ),
      );
    } else if (this.settingsTab === 'camera') {
      body.append(
        slider('Camera sensitivity', s.cameraSensitivity, 0.3, 2.5, 0.05, (v) => (s.cameraSensitivity = v), (v) => `${v.toFixed(2)}×`),
        slider('Camera distance', s.cameraDistance, 0.75, 1.35, 0.05, (v) => (s.cameraDistance = v), (v) => `${v.toFixed(2)}×`),
        toggle('Invert vertical look', s.invertY, (v) => (s.invertY = v)),
        toggle('Auto-follow camera', s.autoCamera, (v) => (s.autoCamera = v)),
        slider('Screen shake', s.screenShake, 0, 1.5, 0.05, (v) => (s.screenShake = v), pct),
      );
    } else if (this.settingsTab === 'audio') {
      body.append(
        slider('Master', s.masterVolume, 0, 1, 0.01, (v) => (s.masterVolume = v), pct),
        slider('Music', s.musicVolume, 0, 1, 0.01, (v) => (s.musicVolume = v), pct),
        slider('Effects', s.sfxVolume, 0, 1, 0.01, (v) => (s.sfxVolume = v), pct),
        slider('Ambience', s.ambienceVolume, 0, 1, 0.01, (v) => (s.ambienceVolume = v), pct),
      );
    } else {
      const q = h('div', { class: 'moyue-row moyue-quality' });
      for (const [id, label] of [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as [Quality, string][]) {
        q.appendChild(h('button', {
          class: `moyue-chip${s.quality === id ? ' active' : ''}`,
          onclick: () => {
            s.quality = id;
            apply();
            this.showSettings('settings');
          },
        }, label));
      }
      body.append(
        h('div', { class: 'moyue-setting' }, h('span', { class: 'moyue-label', text: 'Quality' }), q),
        h('p', { class: 'moyue-note', text: 'Auto lowers resolution when the frame rate drops. Low disables bloom and reduces particles and lights.' }),
        toggle('Show frame rate', s.showFps, (v) => (s.showFps = v)),
        h('div', { class: 'moyue-row' }, this.btn('Erase save data', () => this.confirm('Erase all progress permanently?', () => {
          this.host.eraseSave();
          this.showSettings('settings');
        }, () => this.showSettings('settings')), 'danger')),
      );
    }
    const p = this.panel('Settings', '设', tabs, body, h('div', { class: 'moyue-row moyue-foot' }, this.btn('Back', () => this.goBack(), 'primary')));
    p.classList.add('moyue-panel-wide');
    this.root.appendChild(h('div', { class: 'moyue-overlay' }, p));
  }

  private goBack(): void {
    this.host.uiSound('back');
    if (this.back === 'title') this.showTitle();
    else if (this.back === 'pause') this.showPause();
    else this.host.resume();
  }

  showLayoutEditor(): void {
    clear(this.root);
    this.set('layout');
    this.host.setTouchEdit(true);
    const sizeOut = h('span', { class: 'moyue-val' });
    const size = h('input', { type: 'range', min: 0.6, max: 2, step: 0.05, value: 1, 'aria-label': 'Button size' });
    const refresh = () => {
      const id = this.host.touchSelected();
      if (!id) return;
      const l = layoutFor(this.host.settings, id);
      size.value = String(l.s);
      sizeOut.textContent = `${id} · ${l.s.toFixed(2)}`;
    };
    size.addEventListener('input', () => {
      const id = this.host.touchSelected();
      if (id) this.host.setButtonSize(id, parseFloat(size.value));
      refresh();
    });
    const bar = h('div', { class: 'moyue-layout-bar' },
      h('span', { class: 'moyue-note', text: 'Drag buttons to move them. Select one to resize.' }),
      h('label', { class: 'moyue-setting' }, size, sizeOut),
      this.btn('Reset', () => {
        this.host.resetLayout();
        refresh();
      }),
      this.btn('Done', () => {
        this.host.setTouchEdit(false);
        this.host.applySettings();
        this.showSettings('settings');
      }, 'primary'),
    );
    this.root.appendChild(bar);
    const iv = setInterval(() => {
      if (this.screen !== 'layout') clearInterval(iv);
      else refresh();
    }, 250);
    refresh();
  }

  // ------------------------------------------------------------------ journal
  showJournal(): void {
    clear(this.root);
    this.set('journal');
    const j = this.host.journal();
    const abil = h('div', { class: 'moyue-abilities' });
    for (const id of Object.keys(AbilityInfo) as AbilityId[]) {
      const info = AbilityInfo[id];
      const has = j.abilities[id];
      abil.appendChild(h('div', { class: `moyue-ability${has ? ' has' : ''}` },
        h('div', { class: 'moyue-ability-hanzi', text: has ? info.hanzi : '？' }),
        h('div', { class: 'moyue-ability-text' },
          h('div', { class: 'moyue-ability-name', text: has ? info.name : 'Undiscovered' }),
          h('div', { class: 'moyue-ability-desc', text: has ? `${info.desc} ${info.how}` : 'Something in the deep still waits for you.' }),
        ),
      ));
    }
    const lore = h('div', { class: 'moyue-lore-list' });
    if (!j.lore.length) lore.appendChild(h('p', { class: 'moyue-note', text: 'Read the stone steles you find to record them here.' }));
    for (const id of j.lore) {
      const L = LORE[id];
      if (!L) continue;
      lore.appendChild(h('details', { class: 'moyue-lore' }, h('summary', {}, `${L.hanzi} · ${L.title}`), h('div', { class: 'moyue-lore-text' }, ...L.text.map((t) => h('p', { text: t })))));
    }
    const mins = Math.floor(j.playTime / 60);
    const stats = h('div', { class: 'moyue-stats' },
      h('div', {}, h('b', { text: String(j.maxHealth) }), ' lanterns of life'),
      h('div', {}, h('b', { text: `${j.fragments % 3}/3` }), ' moon fragments toward the next'),
      h('div', {}, h('b', { text: String(j.jade) }), ' jade'),
      h('div', {}, h('b', { text: String(j.vessels) }), ' moonlight vessels'),
      h('div', {}, h('b', { text: `${Math.floor(mins / 60)}h ${mins % 60}m` }), ' descending'),
    );
    const p = this.panel('Journal', '志', stats, h('h3', { text: 'Techniques' }), abil, h('h3', { text: 'Steles' }), lore,
      h('div', { class: 'moyue-row moyue-foot' }, this.btn('Back', () => this.showPause(), 'primary')));
    p.classList.add('moyue-panel-wide', 'moyue-scroll');
    this.root.appendChild(h('div', { class: 'moyue-overlay' }, p));
  }

  // ------------------------------------------------------------------ map
  showMap(from: Screen): void {
    this.back = from;
    clear(this.root);
    this.set('map');
    const data = this.host.mapData();
    const canvas = h('canvas', { class: 'moyue-map-canvas' });
    const p = this.panel('Map of the Descent', '图', canvas,
      h('div', { class: 'moyue-row moyue-foot' }, this.btn('Back', () => (from === 'pause' ? this.showPause() : this.host.resume()), 'primary')));
    p.classList.add('moyue-panel-wide');
    this.root.appendChild(h('div', { class: 'moyue-overlay' }, p));
    requestAnimationFrame(() => drawMap(canvas, data));
  }

  // ------------------------------------------------------------------ dialogue
  showDialogue(lines: DialogueLine[], done: () => void, portrait = ''): void {
    clear(this.root);
    this.set('dialogue');
    this.dialogueLines = lines;
    this.dialogueIdx = 0;
    this.dialogueDone = done;
    this.dialogueText = h('div', { class: 'moyue-dialogue-text' });
    this.dialogueCaret = h('div', { class: 'moyue-dialogue-caret', text: '▼' });
    const box = h('div', { class: 'moyue-dialogue', onclick: () => this.advanceDialogue() },
      h('div', { class: 'moyue-dialogue-name' }),
      this.dialogueText,
      this.dialogueCaret,
    );
    if (portrait) box.dataset.portrait = portrait;
    this.root.appendChild(box);
    this.renderLine();
  }

  private renderLine(): void {
    const line = this.dialogueLines[this.dialogueIdx];
    if (!line || !this.dialogueText) return;
    const nameEl = this.root.querySelector('.moyue-dialogue-name');
    if (nameEl) nameEl.textContent = line.speaker;
    this.typed = 0;
    this.typeTimer = 0;
    this.dialogueText.textContent = '';
    this.dialogueCaret?.classList.remove('show');
  }

  advanceDialogue(): void {
    if (this.screen !== 'dialogue') return;
    const line = this.dialogueLines[this.dialogueIdx];
    if (line && this.typed < line.text.length) {
      this.typed = line.text.length;
      if (this.dialogueText) this.dialogueText.textContent = line.text;
      this.dialogueCaret?.classList.add('show');
      return;
    }
    this.host.uiSound('move');
    this.dialogueIdx++;
    if (this.dialogueIdx >= this.dialogueLines.length) {
      const d = this.dialogueDone;
      this.hide();
      d?.();
      return;
    }
    this.renderLine();
  }

  update(dt: number): void {
    if (this.screen === 'dialogue' && this.dialogueText) {
      const line = this.dialogueLines[this.dialogueIdx];
      if (line && this.typed < line.text.length) {
        this.typeTimer += dt;
        const n = Math.min(line.text.length, Math.floor(this.typeTimer * 55));
        if (n !== this.typed) {
          this.typed = n;
          this.dialogueText.textContent = line.text.slice(0, n);
          if (n >= line.text.length) this.dialogueCaret?.classList.add('show');
        }
      }
    }
  }

  // ------------------------------------------------------------------ shop
  showShop(items: { id: string; name: string; desc: string; cost: number; sold: boolean }[], jade: number, buy: (id: string) => void, close: () => void): void {
    clear(this.root);
    this.set('shop');
    const list = h('div', { class: 'moyue-shop' });
    for (const it of items) {
      list.appendChild(h('div', { class: `moyue-shop-item${it.sold ? ' sold' : ''}` },
        h('div', { class: 'moyue-shop-text' }, h('div', { class: 'moyue-shop-name', text: it.name }), h('div', { class: 'moyue-shop-desc', text: it.desc })),
        it.sold ? h('span', { class: 'moyue-note', text: 'Traded' }) : this.btn(`${it.cost} jade`, () => buy(it.id), jade >= it.cost ? 'primary' : 'disabled'),
      ));
    }
    const p = this.panel('Lantern-Keeper’s Wares', '市', h('div', { class: 'moyue-note', text: `You carry ${jade} jade.` }), list,
      h('div', { class: 'moyue-row moyue-foot' }, this.btn('Leave', close, 'primary')));
    this.root.appendChild(h('div', { class: 'moyue-overlay' }, p));
    this.focusFirst();
  }

  // ------------------------------------------------------------------ ending
  showEnding(lines: string[], stats: string, done: () => void): void {
    clear(this.root);
    this.set('ending');
    const box = h('div', { class: 'moyue-ending' });
    lines.forEach((l, i) => {
      const p = h('p', { text: l });
      p.style.animationDelay = `${1 + i * 2.6}s`;
      box.appendChild(p);
    });
    const tail = h('div', { class: 'moyue-ending-tail' },
      h('div', { class: 'moyue-title-mark small', text: '墨月' }),
      h('div', { class: 'moyue-note', text: 'Mòyuè — The Eternal Descent · vertical slice' }),
      h('div', { class: 'moyue-note', text: stats }),
      this.btn('Continue exploring', done, 'primary'),
    );
    tail.style.animationDelay = `${1.5 + lines.length * 2.6}s`;
    box.appendChild(tail);
    this.root.appendChild(h('div', { class: 'moyue-overlay moyue-overlay-dark' }, box));
  }

  // ------------------------------------------------------------------ keyboard navigation
  private focusFirst(): void {
    requestAnimationFrame(() => {
      const b = this.root.querySelector<HTMLButtonElement>('.moyue-btn.primary') ?? this.root.querySelector<HTMLButtonElement>('.moyue-btn');
      if (b && !this.host.isTouch()) b.focus();
    });
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.screen === 'none') return;
    if (this.screen === 'dialogue') {
      if (['Space', 'Enter', 'KeyE', 'KeyJ', 'KeyF'].includes(e.code)) {
        e.preventDefault();
        this.advanceDialogue();
      }
      return;
    }
    const btns = [...this.root.querySelectorAll<HTMLElement>('button, input')];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
      if ((document.activeElement as HTMLElement)?.tagName === 'INPUT' && e.code === 'ArrowRight') return;
      e.preventDefault();
      btns[(i + 1) % btns.length]?.focus();
      this.host.uiSound('move');
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
      if ((document.activeElement as HTMLElement)?.tagName === 'INPUT' && e.code === 'ArrowLeft') return;
      e.preventDefault();
      btns[(i - 1 + btns.length) % btns.length]?.focus();
      this.host.uiSound('move');
    } else if (e.code === 'Escape') {
      e.preventDefault();
      if (this.screen === 'pause') this.host.resume();
      else if (this.screen === 'settings') this.goBack();
      else if (this.screen === 'journal' || this.screen === 'map') {
        if (this.back === 'pause' || this.screen === 'journal') this.showPause();
        else this.host.resume();
      }
    }
  };

  /** Gamepad / external "confirm" and "back" for dialogue. */
  confirmPressed(): void {
    if (this.screen === 'dialogue') this.advanceDialogue();
  }
}

export function drawMap(canvas: HTMLCanvasElement, data: ReturnType<MenuHost['mapData']>): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(10, rect.width * dpr);
  canvas.height = Math.max(10, rect.height * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  // parchment wash
  const grad = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
  grad.addColorStop(0, '#2a2620');
  grad.addColorStop(1, '#14120f');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const visited = data.rooms.filter((r) => r.visited);
  if (!visited.length) {
    g.fillStyle = '#b8ad96';
    g.font = '16px serif';
    g.textAlign = 'center';
    g.fillText('Nothing charted yet.', W / 2, H / 2);
    return;
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of data.rooms) {
    minX = Math.min(minX, r.min[0]);
    minZ = Math.min(minZ, r.min[1]);
    maxX = Math.max(maxX, r.max[0]);
    maxZ = Math.max(maxZ, r.max[1]);
  }
  const pad = 30;
  const s = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
  const ox = (W - (maxX - minX) * s) / 2, oz = (H - (maxZ - minZ) * s) / 2;
  const X = (x: number) => ox + (x - minX) * s;
  const Z = (z: number) => oz + (z - minZ) * s;
  const colors: Record<string, string> = { threshold: '#7fa6b8', terraces: '#d9a45a', mistfall: '#8fc4c0', sanctum: '#c0504a' };
  const ys = data.rooms.map((r) => r.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  for (const r of visited) {
    const depth = (r.y - yMin) / Math.max(1, yMax - yMin);
    g.globalAlpha = 0.55 + depth * 0.4;
    g.fillStyle = colors[r.region] ?? '#999';
    g.strokeStyle = '#e9dfc8';
    g.lineWidth = 1.2;
    const x0 = X(r.min[0]), z0 = Z(r.min[1]), w = (r.max[0] - r.min[0]) * s, d = (r.max[1] - r.min[1]) * s;
    g.beginPath();
    g.roundRect?.(x0, z0, w, d, 4);
    if (!g.roundRect) g.rect(x0, z0, w, d);
    g.globalAlpha *= 0.35;
    g.fill();
    g.globalAlpha = 0.9;
    g.stroke();
  }
  g.globalAlpha = 1;
  g.font = '12px "Cormorant Garamond", serif';
  g.fillStyle = '#e9dfc8';
  g.textAlign = 'center';
  const named = new Set<string>();
  for (const r of visited) {
    if (named.has(r.name)) continue;
    named.add(r.name);
    g.fillText(r.name, X((r.min[0] + r.max[0]) / 2), Z((r.min[1] + r.max[1]) / 2) + 4);
  }
  for (const sh of data.shrines) {
    g.fillStyle = sh.active ? '#ffcf8a' : '#8c7440';
    g.beginPath();
    g.arc(X(sh.x), Z(sh.z), 5, 0, Math.PI * 2);
    g.fill();
  }
  if (data.player) {
    const [px, pz] = data.player;
    g.fillStyle = '#6cf0c8';
    g.strokeStyle = '#000';
    g.beginPath();
    g.arc(X(px), Z(pz), 6, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // legend
  g.textAlign = 'left';
  let ly = 18;
  for (const [id, name] of Object.entries(data.regionNames)) {
    if (!visited.some((r) => r.region === id)) continue;
    g.fillStyle = colors[id] ?? '#999';
    g.fillRect(12, ly - 9, 10, 10);
    g.fillStyle = '#e9dfc8';
    g.fillText(name, 28, ly);
    ly += 16;
  }
}
