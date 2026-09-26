import { ButtonId, InputState } from './InputState';
import { Settings, TouchButtonId, layoutFor, DEFAULT_LAYOUT } from '../save/Settings';
import { ICONS } from '../ui/icons';

interface BtnState {
  id: TouchButtonId;
  el: HTMLDivElement;
  cx: number;
  cy: number;
  r: number;
  visible: boolean;
  pressedBy: Set<number>;
}

type Role =
  | { kind: 'stick'; ox: number; oy: number }
  | { kind: 'look'; lx: number; ly: number }
  | { kind: 'button'; id: TouchButtonId }
  | { kind: 'edit'; id: TouchButtonId; dx: number; dy: number }
  | { kind: 'none' };

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type SpecialMode = 'heal' | 'flare' | 'bell' | 'none';

const ORDER: TouchButtonId[] = ['jump', 'attack', 'dash', 'special', 'interact', 'lock'];
const LABELS: Record<TouchButtonId, string> = {
  jump: 'Jump', attack: 'Strike', dash: 'Dash', special: 'Moon', interact: 'Talk', lock: 'Focus',
};

/**
 * Touch-first controls: floating analog stick on the left, camera drag on the
 * right, and a thumb-arc of action buttons. All pointers are tracked on one
 * layer so any combination (move + jump + attack + look) works simultaneously.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private buttons = new Map<TouchButtonId, BtnState>();
  private topBtns: HTMLDivElement[] = [];
  private roles = new Map<number, Role>();
  private stickPointer = -1;
  private stickCx = 0;
  private stickCy = 0;
  private stickR = 60;
  private unit = 70;
  private W = 0;
  private H = 0;
  insets: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  editMode = false;
  selectedEdit: TouchButtonId | null = null;
  onLayoutEdited?: (id: TouchButtonId, x: number, y: number) => void;
  onEditSelect?: (id: TouchButtonId) => void;
  onTopButton?: (b: 'pause' | 'map') => void;
  enabled = true;
  private interactVisible = false;
  private chargeEl: HTMLDivElement | null = null;
  private lastStick = { x: 0, y: 0 };

  constructor(private input: InputState, private settings: Settings, parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'moyue-touch';
    this.root.className = 'moyue-touch';
    parent.appendChild(this.root);

    this.stickBase = document.createElement('div');
    this.stickBase.className = 'mt-stick-base';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'mt-stick-knob';
    this.root.append(this.stickBase, this.stickKnob);

    for (const id of ORDER) {
      const el = document.createElement('div');
      el.className = `mt-btn mt-${id}`;
      el.dataset.b = id;
      el.innerHTML = `<div class="mt-ring"></div>${ICONS[id] ?? ''}<span class="mt-label">${LABELS[id]}</span>`;
      if (id === 'attack') {
        this.chargeEl = document.createElement('div');
        this.chargeEl.className = 'mt-charge';
        el.appendChild(this.chargeEl);
      }
      this.root.appendChild(el);
      this.buttons.set(id, { id, el, cx: 0, cy: 0, r: 30, visible: id !== 'interact', pressedBy: new Set() });
    }
    for (const b of ['pause', 'map'] as const) {
      const el = document.createElement('div');
      el.className = `mt-top mt-top-${b}`;
      el.dataset.b = b;
      el.innerHTML = ICONS[b] ?? '';
      this.root.appendChild(el);
      this.topBtns.push(el);
    }

    this.root.addEventListener('pointerdown', this.onDown, { passive: false });
    this.root.addEventListener('pointermove', this.onMove, { passive: false });
    this.root.addEventListener('pointerup', this.onUp, { passive: false });
    this.root.addEventListener('pointercancel', this.onUp, { passive: false });
    this.root.addEventListener('lostpointercapture', this.onUp as EventListener);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 250));
    this.layout();
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.layout();
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (!v) this.releaseAll();
  }

  releaseAll(): void {
    for (const [id] of this.roles) this.endPointer(id);
    this.roles.clear();
    this.input.releaseAll('touch');
    this.stickPointer = -1;
    this.hideStick();
  }

  /** Measure safe-area insets via CSS env() (with optional debug override). */
  measureInsets(): SafeInsets {
    const override = (window as unknown as { __MOYUE_SAFE__?: SafeInsets }).__MOYUE_SAFE__;
    if (override) return (this.insets = { ...override });
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    this.insets = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    probe.remove();
    return this.insets;
  }

  layout(): void {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    const ins = this.measureInsets();
    const s = this.settings;
    // Base unit scales with the short screen edge; tablets get physically similar sizes.
    const short = Math.min(this.W, this.H);
    this.unit = Math.max(46, Math.min(88, short * 0.125)) * s.buttonScale;
    const u = this.unit;
    const rightEdge = this.W - Math.max(ins.right, 8);
    const bottomEdge = this.H - Math.max(ins.bottom, 6);
    for (const b of this.buttons.values()) {
      const l = layoutFor(s, b.id);
      const d = l.s * u;
      b.r = d / 2;
      let cx = rightEdge - l.x * u;
      let cy = bottomEdge - l.y * u;
      // keep inside the safe rectangle
      cx = Math.min(rightEdge - b.r, Math.max(ins.left + b.r + 4, cx));
      cy = Math.min(bottomEdge - b.r, Math.max(ins.top + b.r + 4, cy));
      b.cx = cx;
      b.cy = cy;
      b.el.style.width = b.el.style.height = `${d}px`;
      b.el.style.transform = `translate(${cx - b.r}px, ${cy - b.r}px)`;
      b.el.style.opacity = `${s.buttonOpacity}`;
      const show = this.editMode || (b.id === 'interact' ? this.interactVisible : b.visible);
      b.el.style.display = show ? '' : 'none';
      b.el.classList.toggle('mt-editing', this.editMode && this.selectedEdit === b.id);
    }
    // Top buttons (pause, map) in the top-right safe corner.
    const tsz = Math.max(40, u * 0.62);
    this.topBtns.forEach((el, i) => {
      el.style.width = el.style.height = `${tsz}px`;
      const x = this.W - Math.max(ins.right, 10) - tsz - i * (tsz + 10) - 6;
      const y = Math.max(ins.top, 8) + 6;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.opacity = `${Math.min(1, s.buttonOpacity + 0.1)}`;
    });
    this.stickR = u * 0.95;
    const bd = this.stickR * 2;
    this.stickBase.style.width = this.stickBase.style.height = `${bd}px`;
    const kd = u * 0.9;
    this.stickKnob.style.width = this.stickKnob.style.height = `${kd}px`;
    if (!s.floatingStick || this.stickPointer < 0) this.placeStickRest();
  }

  private stickRestPos(): { x: number; y: number } {
    const ins = this.insets;
    return {
      x: Math.max(ins.left, 8) + this.stickR + this.unit * 0.55,
      y: this.H - Math.max(ins.bottom, 6) - this.stickR - this.unit * 0.45,
    };
  }

  private placeStickRest(): void {
    const p = this.stickRestPos();
    this.stickCx = p.x;
    this.stickCy = p.y;
    this.drawStick(p.x, p.y, p.x, p.y, true);
  }

  private hideStick(): void {
    this.placeStickRest();
  }

  private drawStick(bx: number, by: number, kx: number, ky: number, idle: boolean): void {
    const r = this.stickR;
    const kr = parseFloat(this.stickKnob.style.width) / 2 || 30;
    this.stickBase.style.transform = `translate(${bx - r}px, ${by - r}px)`;
    this.stickKnob.style.transform = `translate(${kx - kr}px, ${ky - kr}px)`;
    this.stickBase.classList.toggle('mt-idle', idle);
    this.stickKnob.classList.toggle('mt-idle', idle);
    const o = this.settings.buttonOpacity;
    this.stickBase.style.opacity = `${idle ? o * 0.55 : o}`;
    this.stickKnob.style.opacity = `${idle ? o * 0.6 : Math.min(1, o + 0.15)}`;
  }

  /** Per-frame contextual state. */
  setContext(ctx: { interact: string | null; special: SpecialMode; charge: number; lockVisible: boolean; dash: boolean }): void {
    const vis = ctx.interact !== null;
    if (vis !== this.interactVisible) {
      this.interactVisible = vis;
      const b = this.buttons.get('interact')!;
      b.el.style.display = vis || this.editMode ? '' : 'none';
      b.el.classList.toggle('mt-appear', vis);
    }
    if (vis) {
      const lbl = this.buttons.get('interact')!.el.querySelector('.mt-label');
      if (lbl && lbl.textContent !== ctx.interact) lbl.textContent = ctx.interact;
    }
    const sp = this.buttons.get('special')!;
    if (sp.el.dataset.mode !== ctx.special) {
      sp.el.dataset.mode = ctx.special;
      const lbl = sp.el.querySelector('.mt-label');
      if (lbl) lbl.textContent = ctx.special === 'bell' ? 'Bell' : ctx.special === 'flare' ? 'Flare' : 'Heal';
    }
    const dash = this.buttons.get('dash')!;
    if (dash.visible !== ctx.dash) {
      dash.visible = ctx.dash;
      dash.el.style.display = ctx.dash || this.editMode ? '' : 'none';
    }
    const lock = this.buttons.get('lock')!;
    if (lock.visible !== ctx.lockVisible) {
      lock.visible = ctx.lockVisible;
      lock.el.style.display = ctx.lockVisible || this.editMode ? '' : 'none';
    }
    if (this.chargeEl) {
      const c = Math.max(0, Math.min(1, ctx.charge));
      this.chargeEl.style.opacity = c > 0 ? '1' : '0';
      this.chargeEl.style.setProperty('--charge', `${c * 360}deg`);
      this.chargeEl.classList.toggle('mt-charged', c >= 1);
    }
  }

  private hitButton(x: number, y: number, exclude?: TouchButtonId): BtnState | null {
    let best: BtnState | null = null;
    let bestD = Infinity;
    for (const b of this.buttons.values()) {
      if (b.id === exclude) continue;
      const shown = this.editMode || (b.id === 'interact' ? this.interactVisible : b.visible);
      if (!shown) continue;
      const d = Math.hypot(x - b.cx, y - b.cy);
      // generous hit area: 20% larger than the visual
      if (d <= b.r * 1.2 && d / b.r < bestD) {
        best = b;
        bestD = d / b.r;
      }
    }
    return best;
  }

  private buttonToInput(id: TouchButtonId): ButtonId {
    return id;
  }

  private pressBtn(b: BtnState, pointer: number): void {
    b.pressedBy.add(pointer);
    b.el.classList.add('mt-pressed');
    this.input.press('touch', this.buttonToInput(b.id));
    if (this.settings.haptics && navigator.vibrate) {
      try {
        navigator.vibrate(6);
      } catch {
        /* ignore */
      }
    }
  }

  private releaseBtn(b: BtnState, pointer: number): void {
    b.pressedBy.delete(pointer);
    if (b.pressedBy.size === 0) {
      b.el.classList.remove('mt-pressed');
      this.input.release('touch', this.buttonToInput(b.id));
    }
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    const top = (e.target as HTMLElement).closest?.('.mt-top') as HTMLElement | null;
    if (top && !this.editMode) {
      this.onTopButton?.(top.dataset.b as 'pause' | 'map');
      this.roles.set(e.pointerId, { kind: 'none' });
      return;
    }
    const b = this.hitButton(x, y);
    if (this.editMode) {
      if (b) {
        this.selectedEdit = b.id;
        this.onEditSelect?.(b.id);
        this.roles.set(e.pointerId, { kind: 'edit', id: b.id, dx: x - b.cx, dy: y - b.cy });
        this.layout();
      } else this.roles.set(e.pointerId, { kind: 'none' });
      return;
    }
    if (b) {
      this.roles.set(e.pointerId, { kind: 'button', id: b.id });
      this.pressBtn(b, e.pointerId);
      return;
    }
    const leftZone = x < this.W * 0.45;
    if (leftZone && this.stickPointer < 0) {
      this.stickPointer = e.pointerId;
      if (this.settings.floatingStick) {
        // Clamp base so the whole stick stays on screen.
        const ins = this.insets;
        this.stickCx = Math.max(ins.left + this.stickR + 4, Math.min(this.W * 0.45, x));
        this.stickCy = Math.max(ins.top + this.stickR + 4, Math.min(this.H - Math.max(ins.bottom, 4) - this.stickR, y));
      } else {
        const p = this.stickRestPos();
        this.stickCx = p.x;
        this.stickCy = p.y;
      }
      this.roles.set(e.pointerId, { kind: 'stick', ox: x, oy: y });
      this.updateStick(x, y);
      return;
    }
    this.roles.set(e.pointerId, { kind: 'look', lx: x, ly: y });
  };

  private updateStick(x: number, y: number): void {
    let dx = x - this.stickCx;
    let dy = y - this.stickCy;
    let d = Math.hypot(dx, dy);
    const R = this.stickR;
    if (d > R) {
      // Base follows the thumb so direction is never lost at the edge.
      const over = d - R;
      this.stickCx += (dx / d) * over;
      this.stickCy += (dy / d) * over;
      const ins = this.insets;
      this.stickCx = Math.max(ins.left + 4, Math.min(this.W * 0.6, this.stickCx));
      this.stickCy = Math.max(ins.top + 4, Math.min(this.H, this.stickCy));
      dx = x - this.stickCx;
      dy = y - this.stickCy;
      d = Math.hypot(dx, dy);
    }
    const mag = Math.min(1, d / R);
    const dz = this.settings.stickDeadzone;
    let out = mag <= dz ? 0 : (mag - dz) / (1 - dz);
    out = Math.min(1, out * this.settings.stickSensitivity);
    const nx = d > 1e-3 ? dx / d : 0;
    const ny = d > 1e-3 ? dy / d : 0;
    this.lastStick.x = nx * out;
    this.lastStick.y = -ny * out;
    this.input.setMove('touch', this.lastStick.x, this.lastStick.y);
    const kx = this.stickCx + nx * Math.min(d, R);
    const ky = this.stickCy + ny * Math.min(d, R);
    this.drawStick(this.stickCx, this.stickCy, kx, ky, false);
  }

  private onMove = (e: PointerEvent) => {
    const role = this.roles.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    switch (role.kind) {
      case 'stick':
        this.updateStick(x, y);
        break;
      case 'look': {
        const dx = x - role.lx, dy = y - role.ly;
        role.lx = x;
        role.ly = y;
        const k = 0.0058 * this.settings.cameraSensitivity;
        this.input.addLook(-dx * k, (this.settings.invertY ? -1 : 1) * dy * k * 0.8);
        break;
      }
      case 'button': {
        if (!this.settings.slideBetweenButtons) break;
        const cur = this.buttons.get(role.id)!;
        const d = Math.hypot(x - cur.cx, y - cur.cy);
        if (d > cur.r * 1.25) {
          const nb = this.hitButton(x, y, role.id);
          if (nb) {
            this.releaseBtn(cur, e.pointerId);
            this.pressBtn(nb, e.pointerId);
            role.id = nb.id;
          }
        }
        break;
      }
      case 'edit': {
        const u = this.unit;
        const ins = this.insets;
        const rightEdge = this.W - Math.max(ins.right, 8);
        const bottomEdge = this.H - Math.max(ins.bottom, 6);
        const nx = (rightEdge - (x - role.dx)) / u;
        const ny = (bottomEdge - (y - role.dy)) / u;
        const cur = layoutFor(this.settings, role.id);
        this.settings.layout[role.id] = { x: Math.max(0.3, nx), y: Math.max(0.3, ny), s: cur.s };
        this.layout();
        this.onLayoutEdited?.(role.id, nx, ny);
        break;
      }
    }
  };

  private onUp = (e: PointerEvent) => {
    this.endPointer(e.pointerId);
  };

  private endPointer(id: number): void {
    const role = this.roles.get(id);
    if (!role) return;
    this.roles.delete(id);
    if (role.kind === 'stick') {
      this.stickPointer = -1;
      this.input.setMove('touch', 0, 0);
      this.hideStick();
    } else if (role.kind === 'button') {
      const b = this.buttons.get(role.id);
      if (b) this.releaseBtn(b, id);
    }
  }

  setEditMode(on: boolean): void {
    this.editMode = on;
    this.selectedEdit = on ? 'jump' : null;
    this.releaseAll();
    this.root.classList.toggle('mt-edit', on);
    this.layout();
  }

  resetLayout(): void {
    this.settings.layout = {};
    this.layout();
  }

  setButtonSize(id: TouchButtonId, s: number): void {
    const cur = layoutFor(this.settings, id);
    this.settings.layout[id] = { x: cur.x, y: cur.y, s: Math.max(0.5, Math.min(2.2, s)) };
    this.layout();
  }

  /** For tests & diagnostics: current screen rects of every control. */
  debugRects(): Record<string, { x: number; y: number; r: number; visible: boolean }> {
    const out: Record<string, { x: number; y: number; r: number; visible: boolean }> = {};
    for (const b of this.buttons.values()) {
      out[b.id] = { x: b.cx, y: b.cy, r: b.r, visible: b.el.style.display !== 'none' };
    }
    const st = this.stickRestPos();
    out.stick = { x: st.x, y: st.y, r: this.stickR, visible: true };
    this.topBtns.forEach((el) => {
      const r = el.getBoundingClientRect();
      out[`top_${el.dataset.b}`] = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2, visible: true };
    });
    return out;
  }

  static defaultLayout = DEFAULT_LAYOUT;
}
