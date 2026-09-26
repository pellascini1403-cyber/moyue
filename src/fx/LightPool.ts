import { PointLight, Scene, Vector3 } from 'three';
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
 */
export class LightPool {
  private slots: Slot[] = [];
  anchors: LightAnchor[] = [];
  private scored: { a: LightAnchor; s: number }[] = [];
  /** Converts authored lantern strength to physical intensity. */
  intensityScale = 5;

  constructor(private scene: Scene, count: number) {
    this.setCount(count);
  }

  setCount(count: number): void {
    for (const s of this.slots) this.scene.remove(s.light);
    this.slots = [];
    for (let i = 0; i < count; i++) {
      const l = new PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.slots.push({ light: l, anchor: null, level: 0 });
    }
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
    const n = this.slots.length;
    const wanted = new Set<LightAnchor>();
    for (let i = 0; i < Math.min(n, this.scored.length); i++) wanted.add(this.scored[i].a);
    // keep slots whose anchor is still wanted, free others
    const free: Slot[] = [];
    for (const s of this.slots) {
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
