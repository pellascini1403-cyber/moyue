export type ButtonId = 'jump' | 'attack' | 'dash' | 'special' | 'interact' | 'lock' | 'pause' | 'map';
export const BUTTONS: ButtonId[] = ['jump', 'attack', 'dash', 'special', 'interact', 'lock', 'pause', 'map'];

type SourceId = 'kb' | 'mouse' | 'pad' | 'touch';

export interface StepInput {
  moveX: number; // right
  moveY: number; // forward
  pressed: Record<ButtonId, boolean>;
  held: Record<ButtonId, boolean>;
}

function rec(v: boolean): Record<ButtonId, boolean> {
  return { jump: v, attack: v, dash: v, special: v, interact: v, lock: v, pause: v, map: v };
}

/**
 * Aggregates every input source. Button presses are queued so a tap is never
 * lost between render frames and fixed simulation steps, and never counted twice.
 */
export class InputState {
  private held: Record<SourceId, Record<ButtonId, boolean>> = {
    kb: rec(false), mouse: rec(false), pad: rec(false), touch: rec(false),
  };
  private queued = rec(false);
  private moves: Record<SourceId, { x: number; y: number }> = {
    kb: { x: 0, y: 0 }, mouse: { x: 0, y: 0 }, pad: { x: 0, y: 0 }, touch: { x: 0, y: 0 },
  };
  /** Accumulated camera look delta (radians) since last consumed. */
  lookX = 0;
  lookY = 0;
  /** Continuous look rate from a stick (radians/sec). */
  lookRateX = 0;
  lookRateY = 0;
  lastSource: SourceId = 'kb';
  /** Set by UI when a menu has focus; gameplay then sees no input. */
  blocked = false;

  press(src: SourceId, b: ButtonId): void {
    if (!this.held[src][b]) this.queued[b] = true;
    this.held[src][b] = true;
    this.lastSource = src;
  }
  release(src: SourceId, b: ButtonId): void {
    this.held[src][b] = false;
  }
  setHeld(src: SourceId, b: ButtonId, down: boolean): void {
    if (down) this.press(src, b);
    else this.release(src, b);
  }
  setMove(src: SourceId, x: number, y: number): void {
    this.moves[src].x = x;
    this.moves[src].y = y;
    if (x !== 0 || y !== 0) this.lastSource = src;
  }
  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }
  releaseAll(src?: SourceId): void {
    const srcs: SourceId[] = src ? [src] : ['kb', 'mouse', 'pad', 'touch'];
    for (const s of srcs) {
      this.held[s] = rec(false);
      this.moves[s] = { x: 0, y: 0 };
    }
  }

  isHeld(b: ButtonId): boolean {
    return this.held.kb[b] || this.held.mouse[b] || this.held.pad[b] || this.held.touch[b];
  }

  /** Consume queued presses for one fixed step. */
  step(out: StepInput): StepInput {
    let mx = 0, my = 0;
    for (const s of ['kb', 'pad', 'touch', 'mouse'] as SourceId[]) {
      mx += this.moves[s].x;
      my += this.moves[s].y;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    out.moveX = this.blocked ? 0 : mx;
    out.moveY = this.blocked ? 0 : my;
    for (const b of Object.keys(this.queued) as ButtonId[]) {
      out.pressed[b] = !this.blocked && this.queued[b];
      out.held[b] = !this.blocked && (this.isHeld(b) || this.queued[b]);
      this.queued[b] = false;
    }
    return out;
  }

  /** Drop queued presses (e.g. when closing a menu so the tap doesn't leak into gameplay). */
  flush(): void {
    this.queued = rec(false);
    this.lookX = 0;
    this.lookY = 0;
  }

  consumeLook(): { x: number; y: number } {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }
}

export function newStepInput(): StepInput {
  return { moveX: 0, moveY: 0, pressed: rec(false), held: rec(false) };
}
