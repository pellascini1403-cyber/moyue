import { Rng } from '../core/rng';

/** Pentatonic modes (semitones above the tonic). */
const MODES = {
  gong: [0, 2, 4, 7, 9],
  shang: [0, 2, 5, 7, 10],
  jue: [0, 3, 5, 8, 10],
  zhi: [0, 2, 5, 7, 9],
  yu: [0, 3, 5, 7, 10],
} as const;
type Mode = keyof typeof MODES;

interface TrackDef {
  mode: Mode;
  root: number; // Hz of the tonic in the pluck register
  tempo: number;
  drone: { gain: number; fifth: boolean; tritone?: boolean; dark?: boolean } | null;
  pluck: number; // phrase density 0..1
  flute: number;
  bowed: number;
  bells: number; // bells per minute
  drums: 'none' | 'heartbeat' | 'battle' | 'boss' | 'wood';
  seed: number;
  gain: number;
}

const TRACKS: Record<string, TrackDef> = {
  title: { mode: 'yu', root: 220, tempo: 52, drone: { gain: 0.16, fifth: true }, pluck: 0.55, flute: 0.25, bowed: 0, bells: 1.5, drums: 'none', seed: 1, gain: 0.9 },
  opening: { mode: 'yu', root: 220, tempo: 46, drone: { gain: 0.18, fifth: true }, pluck: 0.3, flute: 0, bowed: 0, bells: 3, drums: 'none', seed: 2, gain: 0.9 },
  threshold: { mode: 'yu', root: 293.7, tempo: 56, drone: { gain: 0.14, fifth: true }, pluck: 0.6, flute: 0.3, bowed: 0, bells: 1, drums: 'none', seed: 3, gain: 0.85 },
  terraces: { mode: 'gong', root: 261.6, tempo: 64, drone: { gain: 0.1, fifth: true }, pluck: 0.85, flute: 0.5, bowed: 0, bells: 0.8, drums: 'wood', seed: 4, gain: 0.85 },
  mistfall: { mode: 'zhi', root: 392, tempo: 50, drone: { gain: 0.12, fifth: true }, pluck: 0.7, flute: 0.6, bowed: 0, bells: 0.6, drums: 'none', seed: 5, gain: 0.8 },
  sanctum: { mode: 'jue', root: 164.8, tempo: 60, drone: { gain: 0.18, fifth: false, tritone: true, dark: true }, pluck: 0.3, flute: 0, bowed: 0.55, bells: 1.2, drums: 'heartbeat', seed: 6, gain: 0.9 },
  battle: { mode: 'shang', root: 293.7, tempo: 112, drone: { gain: 0.1, fifth: true, dark: true }, pluck: 0.9, flute: 0, bowed: 0.5, bells: 0, drums: 'battle', seed: 7, gain: 0.9 },
  boss: { mode: 'jue', root: 164.8, tempo: 128, drone: { gain: 0.16, fifth: false, tritone: true, dark: true }, pluck: 0.8, flute: 0, bowed: 0.8, bells: 3, drums: 'boss', seed: 8, gain: 0.95 },
  ending: { mode: 'gong', root: 349.2, tempo: 58, drone: { gain: 0.14, fifth: true }, pluck: 0.5, flute: 0.8, bowed: 0, bells: 2, drums: 'none', seed: 9, gain: 0.9 },
};

interface Voice {
  next: number;
  phrase: number[]; // remaining notes (degree indices)
  last: number;
}

class Track {
  readonly out: GainNode;
  private rng: Rng;
  private beat: number;
  private pluck: Voice;
  private flute: Voice;
  private bowed: Voice;
  private drumNext = 0;
  private drumStep = 0;
  private bellNext = 0;
  private drones: { stop: (t: number) => void }[] = [];
  private stopped = false;

  constructor(private ctx: AudioContext, private def: TrackDef, dest: AudioNode, reverb: AudioNode, private noise: AudioBuffer) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(dest);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    this.out.connect(send);
    send.connect(reverb);
    this.rng = new Rng(def.seed * 7919 + Math.floor(Math.random() * 1000));
    this.beat = 60 / def.tempo;
    const now = ctx.currentTime + 0.1;
    this.pluck = { next: now + this.beat * 2, phrase: [], last: 5 };
    this.flute = { next: now + this.beat * 8, phrase: [], last: 5 };
    this.bowed = { next: now + this.beat * 4, phrase: [], last: 3 };
    this.drumNext = now + this.beat;
    this.bellNext = now + 2 + this.rng.range(0, 6);
    if (def.drone) this.startDrone(now);
  }

  fadeIn(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(this.def.gain, t + 2.5);
  }

  fadeOut(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    for (const d of this.drones) d.stop(t + 2.4);
    this.stopped = true;
    setTimeout(() => this.out.disconnect(), 3000);
  }

  private freq(degree: number): number {
    const m = MODES[this.def.mode];
    const oct = Math.floor(degree / m.length);
    const idx = ((degree % m.length) + m.length) % m.length;
    return this.def.root * Math.pow(2, oct + m[idx] / 12);
  }

  private startDrone(t: number): void {
    const c = this.ctx;
    const d = this.def.drone!;
    const base = this.def.root / 4;
    const ratios = [1, d.fifth ? 1.5 : 1, d.tritone ? Math.pow(2, 6 / 12) : 2, 2.003];
    for (const [i, r] of ratios.entries()) {
      const o = c.createOscillator();
      o.type = d.dark && i === 0 ? 'sawtooth' : 'sine';
      o.frequency.value = base * r * (1 + (i - 1.5) * 0.0015);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = d.dark ? 260 : 600;
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(d.gain / (i + 1.2), t + 4);
      // slow breathing LFO
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lg = c.createGain();
      lg.gain.value = d.gain / (i + 1.2) * 0.5;
      lfo.connect(lg);
      lg.connect(g.gain);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.out);
      o.start(t);
      lfo.start(t);
      this.drones.push({
        stop: (at: number) => {
          try {
            o.stop(at);
            lfo.stop(at);
          } catch {
            /* already stopped */
          }
        },
      });
    }
  }

  private makePhrase(v: Voice, minLen: number, maxLen: number, low: number, high: number): void {
    const n = this.rng.int(minLen, maxLen);
    let d = v.last;
    for (let i = 0; i < n; i++) {
      const step = this.rng.pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
      d = Math.max(low, Math.min(high, d + step));
      v.phrase.push(d);
    }
    // cadence toward the tonic or fifth-ish degree
    v.phrase.push(this.rng.chance(0.6) ? Math.round(d / 5) * 5 : d);
    v.last = d;
  }

  update(): void {
    if (this.stopped) return;
    const horizon = this.ctx.currentTime + 0.3;
    const b = this.beat;
    const def = this.def;
    // plucked zither
    while (def.pluck > 0 && this.pluck.next < horizon) {
      if (!this.pluck.phrase.length) {
        if (this.rng.chance(1 - def.pluck * 0.7)) {
          this.pluck.next += b * this.rng.pick([2, 3, 4]);
          continue;
        }
        this.makePhrase(this.pluck, 3, 7, 0, 11);
      }
      const deg = this.pluck.phrase.shift()!;
      this.pluckNote(this.pluck.next, this.freq(deg), def.drums === 'boss' || def.drums === 'battle' ? 0.9 : 1.8);
      if (this.rng.chance(0.18)) this.pluckNote(this.pluck.next, this.freq(deg - 5), 2.2, 0.5);
      this.pluck.next += b * this.rng.pick(def.tempo > 100 ? [0.5, 0.5, 1] : [0.5, 1, 1, 1.5, 2]);
    }
    // bamboo flute
    while (def.flute > 0 && this.flute.next < horizon) {
      if (!this.flute.phrase.length) {
        if (this.rng.chance(1 - def.flute * 0.6)) {
          this.flute.next += b * this.rng.pick([4, 6, 8]);
          continue;
        }
        this.makePhrase(this.flute, 2, 5, 5, 13);
      }
      const deg = this.flute.phrase.shift()!;
      const dur = b * this.rng.pick([1.5, 2, 3, 4]);
      this.fluteNote(this.flute.next, this.freq(deg), dur);
      this.flute.next += dur;
    }
    // bowed string
    while (def.bowed > 0 && this.bowed.next < horizon) {
      if (!this.bowed.phrase.length) {
        if (this.rng.chance(1 - def.bowed * 0.6)) {
          this.bowed.next += b * this.rng.pick([2, 4]);
          continue;
        }
        this.makePhrase(this.bowed, 2, 4, -2, 7);
      }
      const deg = this.bowed.phrase.shift()!;
      const dur = b * (def.tempo > 100 ? this.rng.pick([1, 2]) : this.rng.pick([2, 3, 4]));
      this.bowedNote(this.bowed.next, this.freq(deg) / 2, dur);
      this.bowed.next += dur;
    }
    // percussion
    while (def.drums !== 'none' && this.drumNext < horizon) {
      const s = this.drumStep++;
      const t = this.drumNext;
      switch (def.drums) {
        case 'heartbeat':
          if (s % 4 === 0) this.drum(t, 60, 0.5);
          if (s % 4 === 1) this.drum(t, 52, 0.3);
          break;
        case 'wood':
          if (s % 2 === 0 && this.rng.chance(0.55)) this.woodblock(t, s % 8 === 0 ? 900 : 1300, 0.12);
          break;
        case 'battle':
          if (s % 4 === 0) this.drum(t, 70, 0.8);
          if (s % 4 === 2) this.drum(t, 90, 0.4);
          if (s % 2 === 1) this.woodblock(t, 1600, 0.08);
          if (s % 16 === 15) this.cymbal(t, 0.25);
          break;
        case 'boss':
          if (s % 2 === 0) this.drum(t, 62, 0.9);
          if (s % 4 === 3) this.drum(t, 95, 0.5);
          if (s % 8 === 6) this.drum(t, 80, 0.6);
          if (s % 16 === 0) this.cymbal(t, 0.35);
          break;
      }
      this.drumNext += b / 2;
    }
    // temple bells
    if (def.bells > 0 && this.bellNext < horizon) {
      this.templeBell(this.bellNext, this.freq(this.rng.pick([0, 5, -5])) / 2, 0.14);
      this.bellNext += (60 / def.bells) * this.rng.range(0.6, 1.4);
    }
  }

  // ---------------------------------------------------------------- instruments
  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private pluckNote(t: number, f: number, decay: number, vel = 1): void {
    const c = this.ctx;
    const g = c.createGain();
    this.env(g, t, 0.004, 0.22 * vel, decay);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 7, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + decay * 0.6);
    lp.connect(g);
    g.connect(this.out);
    const slide = this.rng.chance(0.2);
    for (const [r, a] of [[1, 1], [2, 0.45], [3, 0.2], [4.01, 0.1]] as const) {
      const o = c.createOscillator();
      o.type = r === 1 ? 'triangle' : 'sine';
      if (slide) {
        o.frequency.setValueAtTime(f * r * 0.94, t);
        o.frequency.exponentialRampToValueAtTime(f * r, t + 0.07);
      } else o.frequency.setValueAtTime(f * r, t);
      const pg = c.createGain();
      pg.gain.value = a;
      o.connect(pg);
      pg.connect(lp);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
    // finger noise
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 3;
    bp.Q.value = 2;
    const ng = c.createGain();
    this.env(ng, t, 0.001, 0.05 * vel, 0.03);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.out);
    src.start(t, Math.random(), 0.06);
  }

  private fluteNote(t: number, f: number, dur: number): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.18);
    g.gain.setValueAtTime(0.09, t + Math.max(0.2, dur - 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    g.connect(this.out);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const g2 = c.createGain();
    g2.gain.value = 0.12;
    const vib = c.createOscillator();
    vib.frequency.value = 5.2;
    const vg = c.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.6, dur * 0.5));
    vib.connect(vg);
    vg.connect(o.frequency);
    vg.connect(o2.frequency);
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    // breath
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const bg = c.createGain();
    bg.gain.value = 0.25;
    src.connect(bp);
    bp.connect(bg);
    bg.connect(g);
    for (const n of [o, o2, vib]) {
      n.start(t);
      n.stop(t + dur + 0.2);
    }
    src.start(t, Math.random(), dur + 0.2);
  }

  private bowedNote(t: number, f: number, dur: number): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
    g.gain.setValueAtTime(0.07, t + Math.max(0.15, dur - 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    lp.Q.value = 2;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    const vib = c.createOscillator();
    vib.frequency.value = 6;
    const vg = c.createGain();
    vg.gain.value = f * 0.01;
    vib.connect(vg);
    vg.connect(o.frequency);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.out);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.15);
    vib.stop(t + dur + 0.15);
  }

  private drum(t: number, f: number, v: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.25);
    const g = c.createGain();
    this.env(g, t, 0.003, 0.5 * v, 0.35);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.45);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = c.createGain();
    this.env(ng, t, 0.002, 0.18 * v, 0.08);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.out);
    src.start(t, Math.random(), 0.12);
  }

  private woodblock(t: number, f: number, v: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    this.env(g, t, 0.001, v, 0.06);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  private cymbal(t: number, v: number): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    const g = c.createGain();
    this.env(g, t, 0.005, v * 0.3, 1.4);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.out);
    src.start(t, Math.random(), 1.5);
  }

  private templeBell(t: number, f: number, v: number): void {
    const c = this.ctx;
    for (const [i, r] of [1, 2.01, 2.43, 3.03, 4.1].entries()) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * r;
      const g = c.createGain();
      this.env(g, t, 0.003, v / (1 + i), 5 / (1 + i * 0.5));
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 6);
    }
  }
}

interface AmbDef {
  wind: number;
  water: number;
  rumble: number;
  drips: number; // per minute
  crackle: number;
  chimes: number;
  insects: number;
  distantBell: number;
}

const AMBIENCES: Record<string, AmbDef> = {
  cave: { wind: 0.5, water: 0.05, rumble: 0.25, drips: 18, crackle: 0, chimes: 0, insects: 0, distantBell: 0 },
  terraces: { wind: 0.4, water: 0.08, rumble: 0.15, drips: 6, crackle: 0.6, chimes: 5, insects: 0, distantBell: 0.5 },
  water: { wind: 0.3, water: 0.7, rumble: 0.15, drips: 26, crackle: 0, chimes: 0, insects: 8, distantBell: 0.6 },
  sanctum: { wind: 0.25, water: 0.0, rumble: 0.55, drips: 4, crackle: 0.3, chimes: 0, insects: 0, distantBell: 2 },
};

class Ambience {
  readonly out: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private next = { drip: 0, crackle: 0, chime: 0, insect: 0, bell: 0 };
  private stopped = false;
  private rng = new Rng(Math.floor(Math.random() * 1e6));

  constructor(private ctx: AudioContext, private def: AmbDef, dest: AudioNode, private reverb: AudioNode, private noise: AudioBuffer, pink: AudioBuffer) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(dest);
    const t = ctx.currentTime;
    if (def.wind > 0) this.loop(pink, 'bandpass', 380, 0.7, def.wind * 0.5, 0.07);
    if (def.water > 0) this.loop(pink, 'lowpass', 1400, 0.5, def.water * 0.6, 0.0);
    if (def.rumble > 0) this.loop(pink, 'lowpass', 90, 0.8, def.rumble * 1.4, 0.03);
    this.next = { drip: t + 1, crackle: t + 0.5, chime: t + 3, insect: t + 2, bell: t + 6 };
  }

  private loop(buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, gain: number, lfoRate: number): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(flt);
    flt.connect(g);
    g.connect(this.out);
    src.start(c.currentTime, Math.random() * 1.5);
    this.sources.push(src);
    if (lfoRate > 0) {
      const lfo = c.createOscillator();
      lfo.frequency.value = lfoRate;
      const lg = c.createGain();
      lg.gain.value = f * 0.6;
      lfo.connect(lg);
      lg.connect(flt.frequency);
      lfo.start();
      this.sources.push(lfo);
    }
  }

  fadeIn(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(1, t + 3);
  }

  fadeOut(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    for (const s of this.sources) {
      try {
        s.stop(t + 2.6);
      } catch {
        /* ignore */
      }
    }
    this.stopped = true;
    setTimeout(() => this.out.disconnect(), 3200);
  }

  private send(node: AudioNode, amount: number): void {
    const s = this.ctx.createGain();
    s.gain.value = amount;
    node.connect(s);
    s.connect(this.reverb);
  }

  update(): void {
    if (this.stopped) return;
    const c = this.ctx;
    const horizon = c.currentTime + 0.3;
    const d = this.def;
    const every = (perMin: number) => (60 / perMin) * this.rng.range(0.4, 1.6);
    if (d.drips > 0 && this.next.drip < horizon) {
      const t = this.next.drip;
      const f = this.rng.range(900, 2600);
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(this.rng.range(0.02, 0.06), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      const pan = c.createStereoPanner();
      pan.pan.value = this.rng.range(-0.9, 0.9);
      o.connect(g);
      g.connect(pan);
      pan.connect(this.out);
      this.send(pan, 1.4);
      o.start(t);
      o.stop(t + 0.15);
      this.next.drip += every(d.drips);
    }
    if (d.crackle > 0 && this.next.crackle < horizon) {
      const t = this.next.crackle;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const bp = c.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 3000;
      const g = c.createGain();
      g.gain.setValueAtTime(this.rng.range(0.005, 0.02) * d.crackle, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.out);
      src.start(t, Math.random(), 0.02);
      this.next.crackle += this.rng.range(0.03, 0.4);
    }
    if (d.chimes > 0 && this.next.chime < horizon) {
      const t = this.next.chime;
      const base = this.rng.pick([1568, 1760, 2093, 2349]);
      for (let i = 0; i < this.rng.int(2, 4); i++) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * this.rng.pick([1, 1.25, 1.5, 2]);
        const g = c.createGain();
        const tt = t + i * this.rng.range(0.08, 0.25);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.02, tt + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.5);
        o.connect(g);
        g.connect(this.out);
        this.send(g, 1);
        o.start(tt);
        o.stop(tt + 1.6);
      }
      this.next.chime += every(d.chimes);
    }
    if (d.insects > 0 && this.next.insect < horizon) {
      const t = this.next.insect;
      const f = this.rng.range(4200, 6400);
      for (let i = 0; i < this.rng.int(3, 7); i++) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = c.createGain();
        const tt = t + i * 0.06;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.008, tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.04);
        o.connect(g);
        g.connect(this.out);
        o.start(tt);
        o.stop(tt + 0.05);
      }
      this.next.insect += every(d.insects);
    }
    if (d.distantBell > 0 && this.next.bell < horizon) {
      const t = this.next.bell;
      const f = this.rng.pick([98, 110, 131]);
      for (const [i, r] of [1, 2.01, 2.43, 3.03].entries()) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * r;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.03 / (1 + i), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 6 / (1 + i * 0.4));
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700;
        o.connect(lp);
        lp.connect(g);
        g.connect(this.out);
        this.send(g, 2);
        o.start(t);
        o.stop(t + 7);
      }
      this.next.bell += every(d.distantBell);
    }
  }
}

/** Crossfading generative score + ambience beds. */
export class MusicDirector {
  private track: Track | null = null;
  private trackId = '';
  private amb: Ambience | null = null;
  private ambId = '';

  constructor(private ctx: AudioContext, private musicBus: AudioNode, private ambBus: AudioNode, private reverb: AudioNode, private noise: AudioBuffer, private pink: AudioBuffer) {}

  setMusic(id: string): void {
    if (id === this.trackId) return;
    this.trackId = id;
    this.track?.fadeOut();
    const def = TRACKS[id];
    this.track = def ? new Track(this.ctx, def, this.musicBus, this.reverb, this.noise) : null;
    this.track?.fadeIn();
  }

  setAmbience(id: string): void {
    if (id === this.ambId) return;
    this.ambId = id;
    this.amb?.fadeOut();
    const def = AMBIENCES[id];
    this.amb = def ? new Ambience(this.ctx, def, this.ambBus, this.reverb, this.noise, this.pink) : null;
    this.amb?.fadeIn();
  }

  update(_dt: number): void {
    if (this.ctx.state !== 'running') return;
    this.track?.update();
    this.amb?.update();
  }
}

export const MUSIC_IDS = Object.keys(TRACKS);
export const AMBIENCE_IDS = Object.keys(AMBIENCES);
