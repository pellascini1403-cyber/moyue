import { ButtonId, InputState } from './InputState';

const KEYMAP: Record<string, ButtonId> = {
  Space: 'jump',
  KeyJ: 'attack',
  KeyK: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyL: 'special',
  KeyQ: 'special',
  KeyE: 'interact',
  KeyF: 'interact',
  KeyR: 'lock',
  Tab: 'lock',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'map',
};

/** Keyboard + mouse. WASD/arrows move, mouse (pointer lock) or drag looks. */
export class KeyboardMouse {
  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  sensitivity = 0.0032;
  invertY = false;
  enabled = true;

  constructor(private input: InputState, private canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      input.releaseAll('kb');
      input.releaseAll('mouse');
    });
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    const b = KEYMAP[e.code];
    if (b) {
      e.preventDefault();
      if (!e.repeat) this.input.press('kb', b);
    }
    this.keys.add(e.code);
    this.updateMove();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const b = KEYMAP[e.code];
    this.keys.delete(e.code);
    if (b) {
      // only release if no other key maps to the same button
      const still = [...this.keys].some((k) => KEYMAP[k] === b);
      if (!still) this.input.release('kb', b);
    }
    this.updateMove();
  };
  private updateMove() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    this.input.setMove('kb', x / len, y / len);
  }
  private onMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (e.button === 0) this.input.press('mouse', 'attack');
    if (e.button === 2) this.input.press('mouse', 'dash');
    if (e.button === 1) this.input.press('mouse', 'lock');
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
      try {
        const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
      } catch {
        /* pointer lock unsupported */
      }
    }
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.input.release('mouse', 'attack');
    if (e.button === 2) this.input.release('mouse', 'dash');
    if (e.button === 1) this.input.release('mouse', 'lock');
    this.dragging = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    const locked = document.pointerLockElement === this.canvas;
    let dx = 0, dy = 0;
    if (locked) {
      dx = e.movementX;
      dy = e.movementY;
    } else if (this.dragging) {
      dx = e.clientX - this.lastX;
      dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    } else return;
    this.input.addLook(-dx * this.sensitivity, (this.invertY ? -1 : 1) * dy * this.sensitivity);
  };

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
