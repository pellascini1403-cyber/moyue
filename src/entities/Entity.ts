import { Object3D, Vector3 } from 'three';
import type { Game } from '../game/Game';

/** Base class for every live object in the world. */
export abstract class Entity {
  alive = true;
  /** Far-away entities sleep (no AI/physics) to save CPU. */
  awake = true;
  readonly root: Object3D;
  readonly position = new Vector3();
  readonly prevPosition = new Vector3();
  /** Distance from the player at which the entity sleeps. */
  sleepDistance = 70;

  constructor(public game: Game, public id: string, public regionId: string, root?: Object3D) {
    this.root = root ?? new Object3D();
  }

  /** Fixed 60 Hz gameplay step. */
  abstract fixedUpdate(dt: number): void;

  /** Per-render-frame visual update; alpha = interpolation factor. */
  render(_dt: number, _alpha: number, _t: number): void {
    this.root.position.lerpVectors(this.prevPosition, this.position, _alpha);
  }

  /** Called when the player rests at a shrine or respawns. */
  reset(): void {}

  /** Interaction prompt when the player is near (null = none). */
  interactPrompt(): string | null {
    return null;
  }
  interactRadius = 0;
  interact(): void {}

  dispose(): void {
    this.root.removeFromParent();
  }
}
