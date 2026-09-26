import { ButtonId, InputState } from './InputState';

// Standard mapping indices
const MAP: [number, ButtonId][] = [
  [0, 'jump'], // A / Cross
  [2, 'attack'], // X / Square
  [1, 'dash'], // B / Circle
  [7, 'dash'], // RT
  [3, 'special'], // Y / Triangle
  [5, 'interact'], // RB
  [4, 'lock'], // LB
  [10, 'lock'], // L3
  [9, 'pause'], // Start
  [8, 'map'], // Select
];

export class GamepadInput {
  deadzone = 0.18;
  lookSpeed = 3.2; // rad/s at full tilt
  invertY = false;
  private prev = new Map<ButtonId, boolean>();

  constructor(private input: InputState) {}

  poll(dt: number): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < this.deadzone ? 0 : (v - Math.sign(v) * this.deadzone) / (1 - this.deadzone));
    const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0);
    this.input.setMove('pad', lx, -ly);
    const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0);
    if (rx || ry) {
      this.input.addLook(-rx * this.lookSpeed * dt, (this.invertY ? -1 : 1) * ry * this.lookSpeed * 0.7 * dt);
      this.input.lastSource;
    }
    const now = new Map<ButtonId, boolean>();
    for (const [i, b] of MAP) {
      const pressed = !!pad.buttons[i]?.pressed;
      now.set(b, (now.get(b) ?? false) || pressed);
    }
    for (const [b, down] of now) {
      if (down !== (this.prev.get(b) ?? false)) this.input.setHeld('pad', b, down);
    }
    this.prev = now;
  }
}
