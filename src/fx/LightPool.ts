import { Color, PointLight, Scene, Vector3 } from 'three';
import { LightAnchor } from '../world/BuildContext';

interface Slot {
  light: PointLight;
  anchor: LightAnchor | null;
  level: number;
}

/**
 * A fixed number of real point lights, re-assigned every frame to the most
 * relevant lantern anchors near the player. Keeps shader permutations stable
 * (constant light count) and cost bounded on mobile.
 *
 * `flash` briefly borrows one slot for a momentary light (an enemy coming
 * undone); the slot returns to the lanterns when the flash has faded.
 */
export class LightPool {
  private slots: Slot[] = [];
  anchors: LightAnchor[] = [];
  private scored: { a: LightAnchor; s: number }[] = [];
  /** Converts authored lantern strength to physical intensity. */
  intensityScale = 5;
  /** Game-time rate for flashes, so they slow with slow motion like the particles they light. */
  flashTimeScale = 1;
  private borrowed: Slot | null = null;
  private fl = { color: new Color(), intensity: 0, t: 0, dur: 0 };

  constructor(private scene: Scene, count: number) {
    this.setCount(count);
  }

  setCount(count: number): void {
    for (const s of this.slots) this.scene.remove(s.light);
    this.slots = [];
    this.borrowed = null;
    for (let i = 0; i < count; i++) {
      const l = new PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.slots.push({ light: l, anchor: null, level: 0 });
    }
  }

  /**
   * A short light at `pos` (authored units, like a lantern): full strength
   * almost at once, then a quadratic fade over `dur` seconds. Takes an idle
   * slot if there is one, otherwise the dimmest.
   */
  flash(pos: Vector3, color: Color, intensity: number, distance: number, dur: number): void {
    if (this.slots.length === 0) return;
    let s = this.borrowed;
    if (!s) {
      s = this.slots.find((x) => !x.anchor) ?? this.slots.reduce((a, b) => (b.light.intensity < a.light.intensity ? b : a));
      s.anchor = null;
      s.level = 0;
      this.borrowed = s;
    }
    s.light.position.copy(pos);
    s.light.distance = distance;
    this.fl.color.copy(color);
    this.fl.intensity = intensity;
    this.fl.t = 0;
    this.fl.dur = Math.max(0.05, dur);
  }

  update(focus: Vector3, t: number, dt: number): void {
    this.scored.length = 0;
    for (const a of this.anchors) {
      const d = a.pos.distanceTo(focus);
      if (d > a.distance * 2.2 + 12) continue;
      const s = a.intensity / (1 + (d * d) / (a.distance * a.distance));
      this.scored.push({ a, s });
    }
    this.scored.sort((x, y) => y.s - x.s);
    const n = this.slots.length - (this.borrowed ? 1 : 0);
    const wanted = new Set<LightAnchor>();
    for (let i = 0; i < Math.min(n, this.scored.length); i++) wanted.add(this.scored[i].a);
    // keep slots whose anchor is still wanted, free others
    const free: Slot[] = [];
    for (const s of this.slots) {
      if (s === this.borrowed) continue;
      if (s.anchor && wanted.has(s.anchor)) wanted.delete(s.anchor);
      else free.push(s);
    }
    for (const s of free) {
      // fade out before reassigning
      if (s.anchor && s.level > 0.02) {
        s.level = Math.max(0, s.level - dt * 6);
      } else {
        const next = wanted.values().next();
        if (!next.done) {
          s.anchor = next.value;
          wanted.delete(next.value);
          s.level = 0;
          s.light.position.copy(s.anchor.pos);
          s.light.color.copy(s.anchor.color);
          s.light.distance = s.anchor.distance;
        } else {
          s.anchor = null;
          s.level = 0;
        }
      }
    }
    for (const s of this.slots) {
      if (s === this.borrowed) {
        const f = this.fl;
        f.t += dt * this.flashTimeScale;
        const k = f.t < 0.03 ? f.t / 0.03 : Math.max(0, 1 - (f.t - 0.03) / (f.dur - 0.03)) ** 2;
        s.light.color.copy(f.color);
        s.light.intensity = f.intensity * k * this.intensityScale;
        if (f.t >= f.dur) {
          // hand the slot back: it is re-assigned (fading in) on the next update
          s.light.intensity = 0;
          this.borrowed = null;
        }
        continue;
      }
      if (!s.anchor) {
        s.light.intensity = 0;
        continue;
      }
      if (!free.includes(s)) s.level = Math.min(1, s.level + dt * 4);
      const a = s.anchor;
      const fl = 1 + a.flicker * (Math.sin(t * 9.1 + a.phase) * 0.5 + Math.sin(t * 23.7 + a.phase * 2) * 0.3 + Math.sin(t * 3.3 + a.phase) * 0.2);
      s.light.intensity = a.intensity * fl * s.level * this.intensityScale;
    }
  }
}
