import { Vector3 } from 'three';
import type { AudioLike } from '../game/Game';
import { MusicDirector } from './Music';

type Ctx = AudioContext;

const _d = new Vector3();

/**
 * Procedural WebAudio engine: every sound is synthesised at runtime (no audio
 * files). Buses: music / sfx / ambience → master → compressor. A generated
 * cave impulse response provides reverb. Positional sounds use distance
 * attenuation and stereo panning relative to the camera.
 */
export class AudioEngine implements AudioLike {
  ctx: Ctx | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private pink!: AudioBuffer;
  private listener = new Vector3();
  private right = new Vector3(1, 0, 0);
  private vol = { master: 0.85, music: 0.65, sfx: 0.9, amb: 0.75 };
  private voices = 0;
  private lastPlay = new Map<string, number>();
  private held = new Map<string, { stop: () => void }>();
  music: MusicDirector | null = null;
  private pendingMusic = 'title';
  private pendingAmb = 'cave';
  private ducked = false;

  constructor() {
    const unlock = () => this.unlock();
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
      window.addEventListener('touchend', unlock, { passive: true });
    }
  }

  /** Create/resume the context (must happen inside a user gesture on iOS). */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private build(): void {
    const c = this.ctx!;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.connect(comp);
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.ambBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    // generated cave impulse
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.6);
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0.42;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    // noise sources
    const n = c.sampleRate * 2;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.pink = c.createBuffer(1, n, c.sampleRate);
    const p = this.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    this.applyVolumes();
    this.music = new MusicDirector(c, this.musicBus, this.ambBus, this.reverbSend, this.noise, this.pink);
    this.music.setMusic(this.pendingMusic);
    this.music.setAmbience(this.pendingAmb);
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections + diffuse tail
        const early = i < c.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early) * (ch ? 0.95 : 1);
      }
    }
    return buf;
  }

  setVolumes(master: number, music: number, sfx: number, amb: number): void {
    this.vol = { master, music, sfx, amb };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master * (this.ducked ? 0.45 : 1), t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.amb * 0.6, t, 0.2);
  }

  duck(on: boolean): void {
    this.ducked = on;
    this.applyVolumes();
  }

  setMusic(id: string): void {
    this.pendingMusic = id;
    this.music?.setMusic(id);
  }

  setAmbience(id: string): void {
    this.pendingAmb = id;
    this.music?.setAmbience(id);
  }

  update(dt: number, listener: Vector3, forward: Vector3): void {
    this.listener.copy(listener);
    this.right.set(-forward.z, 0, forward.x).normalize();
    this.music?.update(dt);
  }

  stop(name: string): void {
    const h = this.held.get(name);
    if (h) {
      h.stop();
      this.held.delete(name);
    }
  }

  ui(kind: 'move' | 'select' | 'back'): void {
    this.sfx(kind === 'move' ? 'uiMove' : kind === 'select' ? 'uiSelect' : 'uiBack');
  }

  // ------------------------------------------------------------------ building blocks
  private out(pos?: Vector3, vol = 1, reverb = 0.25): { node: GainNode; gain: number } | null {
    const c = this.ctx!;
    let g = vol;
    let pan = 0;
    if (pos) {
      _d.subVectors(pos, this.listener);
      const dist = _d.length();
      g *= 1 / (1 + Math.max(0, dist - 3) / 7);
      if (g < 0.02) return null;
      pan = Math.max(-0.85, Math.min(0.85, _d.normalize().dot(this.right)));
    }
    const gain = c.createGain();
    gain.gain.value = g;
    const panner = c.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);
    panner.connect(this.sfxBus);
    if (reverb > 0) {
      const send = c.createGain();
      send.gain.value = reverb;
      panner.connect(send);
      send.connect(this.reverbSend);
    }
    return { node: gain, gain: g };
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005, pink = false): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = pink ? this.pink : this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, peak, dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5, dur + attack + 0.05);
    this.track(src);
  }

  private tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.004): OscillatorNode {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    this.track(o);
    return o;
  }

  /** Inharmonic bell/gong: partial ratios with individual decays. */
  private bell(dest: AudioNode, t: number, f: number, dur: number, peak: number, ratios = [1, 2.0, 2.76, 3.9, 5.4, 6.8]): void {
    ratios.forEach((r, i) => {
      this.tone(dest, t, 'sine', f * r * (1 + (Math.random() - 0.5) * 0.004), f * r, dur / (1 + i * 0.6), peak / (1 + i * 0.9), 0.002);
    });
  }

  private track(n: AudioScheduledSourceNode): void {
    this.voices++;
    n.onended = () => {
      this.voices--;
    };
  }

  /** Play a named effect. Rate-limited per name; capped total voices. */
  sfx(name: string, pos?: Vector3, vol = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx;
    const now = c.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    const minGap = name === 'step' ? 0.06 : name === 'jade' ? 0.04 : 0.02;
    if (now - last < minGap) return;
    if (this.voices > 90 && name !== 'hurt' && name !== 'death') return;
    this.lastPlay.set(name, now);
    const t = now + 0.005;
    const r = () => 0.92 + Math.random() * 0.16;
    const o = (v = 1, rev = 0.25) => this.out(pos, vol * v, rev);
    let x: ReturnType<typeof o>;
    switch (name) {
      // ---------------------------------------------------------- player
      case 'slash':
        if (!(x = o(0.7, 0.2))) return;
        this.noiseBurst(x.node, t, 0.13, 'bandpass', 4200 * r(), 900, 1.4, 0.9);
        this.tone(x.node, t + 0.01, 'sine', 3100 * r(), 2600, 0.12, 0.08);
        break;
      case 'slashHeavy':
        if (!(x = o(0.85, 0.3))) return;
        this.noiseBurst(x.node, t, 0.2, 'bandpass', 3000 * r(), 500, 1.2, 1.0);
        this.tone(x.node, t + 0.02, 'sine', 2300, 1800, 0.2, 0.1);
        break;
      case 'spin':
        if (!(x = o(0.9, 0.35))) return;
        this.noiseBurst(x.node, t, 0.4, 'bandpass', 900, 5000, 1.1, 0.9, 0.05);
        this.bell(x.node, t + 0.05, 1320, 0.8, 0.08);
        break;
      case 'hit':
        if (!(x = o(0.9, 0.15))) return;
        this.tone(x.node, t, 'sine', 160 * r(), 55, 0.12, 0.8);
        this.noiseBurst(x.node, t, 0.07, 'highpass', 2500, 1200, 0.7, 0.6);
        this.noiseBurst(x.node, t, 0.16, 'lowpass', 900, 200, 0.8, 0.4);
        break;
      case 'hitHeavy':
      case 'kill':
        if (!(x = o(1, 0.3))) return;
        this.tone(x.node, t, 'sine', 120 * r(), 38, 0.22, 1.0);
        this.noiseBurst(x.node, t, 0.1, 'highpass', 2000, 900, 0.7, 0.7);
        this.noiseBurst(x.node, t + 0.02, 0.35, 'lowpass', 1400, 150, 0.8, 0.6);
        if (name === 'kill') this.bell(x.node, t + 0.03, 780 * r(), 0.9, 0.06);
        break;
      case 'clang':
        if (!(x = o(0.8, 0.4))) return;
        this.bell(x.node, t, 690 * r(), 0.6, 0.25, [1, 1.93, 3.1, 4.6]);
        this.noiseBurst(x.node, t, 0.05, 'highpass', 5000, 3000, 0.7, 0.5);
        break;
      case 'jump':
        if (!(x = o(0.45, 0.1))) return;
        this.noiseBurst(x.node, t, 0.12, 'bandpass', 500, 1600, 1.2, 0.5, 0.01);
        break;
      case 'wingbeat':
        if (!(x = o(0.6, 0.15))) return;
        for (let i = 0; i < 3; i++) this.noiseBurst(x.node, t + i * 0.035, 0.05, 'bandpass', 1200 + i * 300, 700, 1.6, 0.6, 0.004);
        this.tone(x.node, t, 'sine', 1760, 2350, 0.18, 0.05);
        break;
      case 'walljump':
        if (!(x = o(0.6, 0.15))) return;
        this.noiseBurst(x.node, t, 0.04, 'bandpass', 2400, 1600, 2, 0.6);
        this.noiseBurst(x.node, t + 0.02, 0.12, 'bandpass', 600, 1800, 1, 0.4, 0.01);
        break;
      case 'land':
        if (!(x = o(0.35 + vol * 0.3, 0.1))) return;
        this.tone(x.node, t, 'sine', 110, 55, 0.08, 0.5);
        this.noiseBurst(x.node, t, 0.1, 'lowpass', 2200, 600, 0.6, 0.35);
        break;
      case 'landHeavy':
        if (!(x = o(0.9, 0.3))) return;
        this.tone(x.node, t, 'sine', 90, 35, 0.2, 0.9);
        this.noiseBurst(x.node, t, 0.3, 'lowpass', 1800, 200, 0.6, 0.6);
        break;
      case 'step':
        if (!(x = o(0.18, 0.05))) return;
        this.noiseBurst(x.node, t, 0.03, 'bandpass', 1700 * r() * r(), 1100, 1.8, 0.5, 0.002);
        break;
      case 'dash':
        if (!(x = o(0.7, 0.25))) return;
        this.noiseBurst(x.node, t, 0.22, 'bandpass', 380, 3600, 1.3, 0.8, 0.01);
        this.tone(x.node, t + 0.02, 'sine', 1568, 2093, 0.25, 0.05);
        break;
      case 'cling':
        if (!(x = o(0.4, 0.1))) return;
        this.noiseBurst(x.node, t, 0.06, 'bandpass', 3000, 2000, 2, 0.5);
        break;
      case 'pogo':
        if (!(x = o(0.7, 0.2))) return;
        this.tone(x.node, t, 'triangle', 620, 880, 0.12, 0.4);
        this.noiseBurst(x.node, t, 0.04, 'bandpass', 3000, 2000, 1.5, 0.5);
        break;
      case 'chargeReady':
        if (!(x = o(0.6, 0.4))) return;
        this.bell(x.node, t, 1046, 1.1, 0.12);
        this.bell(x.node, t + 0.06, 1568, 1.0, 0.08);
        break;
      case 'healStart': {
        if (!(x = o(0.5, 0.5))) return;
        const g = x.node;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, t);
        osc.frequency.linearRampToValueAtTime(660, t + 0.85);
        const gg = this.ctx.createGain();
        gg.gain.setValueAtTime(0.0001, t);
        gg.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(gg);
        gg.connect(g);
        osc.start(t);
        osc.stop(t + 1);
        this.track(osc);
        this.held.set('healStart', { stop: () => gg.gain.setTargetAtTime(0.0001, this.ctx!.currentTime, 0.03) });
        break;
      }
      case 'heal':
        if (!(x = o(0.7, 0.6))) return;
        this.bell(x.node, t, 880, 1.6, 0.15);
        this.bell(x.node, t + 0.08, 1320, 1.4, 0.1);
        this.bell(x.node, t + 0.16, 1760, 1.2, 0.07);
        break;
      case 'flare':
        if (!(x = o(0.8, 0.3))) return;
        this.noiseBurst(x.node, t, 0.35, 'bandpass', 300, 1600, 0.8, 0.9, 0.02, true);
        this.tone(x.node, t, 'sawtooth', 220, 440, 0.15, 0.06);
        break;
      case 'flareHit':
        if (!(x = o(0.8, 0.3))) return;
        this.noiseBurst(x.node, t, 0.3, 'lowpass', 2400, 300, 0.7, 0.8, 0.002, true);
        break;
      case 'slamStart':
        if (!(x = o(0.6, 0.2))) return;
        this.noiseBurst(x.node, t, 0.2, 'bandpass', 2400, 400, 1, 0.6, 0.01);
        break;
      case 'slam':
        if (!(x = o(1, 0.6))) return;
        this.tone(x.node, t, 'sine', 80, 32, 0.5, 1.0);
        this.bell(x.node, t, 196, 2.8, 0.35, [1, 2.02, 2.74, 3.51, 4.7]);
        this.noiseBurst(x.node, t, 0.5, 'lowpass', 1600, 120, 0.7, 0.7, 0.002, true);
        break;
      case 'hurt':
        if (!(x = o(1, 0.3))) return;
        this.tone(x.node, t, 'sawtooth', 180, 60, 0.25, 0.25);
        this.tone(x.node, t, 'sine', 90, 40, 0.3, 0.9);
        this.noiseBurst(x.node, t, 0.18, 'bandpass', 1400, 400, 0.8, 0.8);
        break;
      case 'death':
        if (!(x = o(1, 0.8))) return;
        this.tone(x.node, t, 'sine', 440, 110, 1.6, 0.25, 0.01);
        this.tone(x.node, t, 'sine', 466, 104, 1.6, 0.18, 0.01);
        this.bell(x.node, t + 0.2, 147, 3.5, 0.3);
        break;
      case 'awaken':
        if (!(x = o(0.8, 0.8))) return;
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.bell(x!.node, t + i * 0.14, f, 2.5, 0.08));
        this.noiseBurst(x.node, t, 1.2, 'bandpass', 800, 6000, 1, 0.2, 0.3);
        break;
      // ---------------------------------------------------------- world
      case 'jade':
        if (!(x = o(0.35, 0.3))) return;
        this.bell(x.node, t, [1568, 1760, 2093, 2349, 2637][Math.floor(Math.random() * 5)], 0.5, 0.12, [1, 2.7, 4.1]);
        break;
      case 'fragment':
        if (!(x = o(0.8, 0.7))) return;
        [880, 1109, 1318, 1760].forEach((f, i) => this.bell(x!.node, t + i * 0.09, f, 1.6, 0.12));
        break;
      case 'ability':
        if (!(x = o(1, 0.8))) return;
        this.bell(x.node, t, 110, 5, 0.45, [1, 1.5, 2.0, 2.52, 3.0, 4.2]);
        [440, 554, 659, 880].forEach((f, i) => this.bell(x!.node, t + 0.25 + i * 0.12, f, 2.4, 0.1));
        break;
      case 'shrine':
        if (!(x = o(0.9, 0.7))) return;
        // singing bowl: close partial pairs that beat slowly
        [[294, 296.5], [812, 815], [1532, 1536]].forEach(([a, b], i) => {
          this.tone(x!.node, t, 'sine', a, a, 4 - i, 0.18 / (i + 1), 0.02);
          this.tone(x!.node, t, 'sine', b, b, 4 - i, 0.14 / (i + 1), 0.02);
        });
        break;
      case 'regionChime':
        if (!(x = o(0.6, 0.8))) return;
        this.bell(x.node, t, 392, 3.5, 0.18);
        this.bell(x.node, t + 0.4, 587, 3, 0.12);
        break;
      case 'urn':
        if (!(x = o(0.8, 0.2))) return;
        this.noiseBurst(x.node, t, 0.25, 'bandpass', 2600, 800, 0.9, 0.8);
        for (let i = 0; i < 4; i++) this.tone(x.node, t + i * 0.03, 'triangle', 900 + Math.random() * 1200, 600, 0.08, 0.12);
        break;
      case 'lever':
        if (!(x = o(0.8, 0.3))) return;
        this.tone(x.node, t, 'square', 180, 120, 0.1, 0.12);
        this.bell(x.node, t, 520, 0.5, 0.15, [1, 2.3, 3.7]);
        break;
      case 'gateOpen':
        if (!(x = o(0.9, 0.5))) return;
        this.noiseBurst(x.node, t, 2.2, 'lowpass', 400, 200, 3, 0.5, 0.2, true);
        for (let i = 0; i < 10; i++) this.noiseBurst(x.node, t + i * 0.2, 0.05, 'bandpass', 1800, 1500, 4, 0.3);
        break;
      case 'sealBreak':
        if (!(x = o(0.9, 0.6))) return;
        this.noiseBurst(x.node, t, 0.8, 'highpass', 800, 4000, 0.7, 0.4, 0.01);
        this.bell(x.node, t, 330, 2, 0.15);
        break;
      case 'crumble':
      case 'rockHit':
        if (!(x = o(name === 'crumble' ? 1 : 0.6, 0.4))) return;
        this.tone(x.node, t, 'sine', 70, 35, 0.4, 0.7);
        this.noiseBurst(x.node, t, name === 'crumble' ? 1 : 0.25, 'lowpass', 1400, 150, 0.6, 0.8, 0.002, true);
        break;
      case 'arenaStart':
        if (!(x = o(1, 0.6))) return;
        this.tone(x.node, t, 'sine', 70, 40, 0.6, 0.9);
        this.bell(x.node, t + 0.05, 131, 3, 0.3, [1, 1.47, 2.1, 2.9, 3.8]);
        break;
      case 'arenaClear':
        if (!(x = o(0.9, 0.7))) return;
        [392, 494, 587, 784].forEach((f, i) => this.bell(x!.node, t + i * 0.1, f, 2.2, 0.12));
        break;
      case 'lockOn':
        if (!(x = o(0.4, 0.1))) return;
        this.tone(x.node, t, 'sine', 1318, 1760, 0.08, 0.1);
        break;
      case 'buy':
        if (!(x = o(0.6, 0.3))) return;
        this.bell(x.node, t, 1046, 0.8, 0.12);
        this.bell(x.node, t + 0.08, 1318, 0.8, 0.1);
        break;
      case 'uiMove':
        if (!(x = o(0.3, 0.05))) return;
        this.noiseBurst(x.node, t, 0.025, 'bandpass', 2400, 2000, 3, 0.5, 0.001);
        break;
      case 'uiSelect':
        if (!(x = o(0.45, 0.2))) return;
        this.tone(x.node, t, 'triangle', 660, 660, 0.08, 0.25);
        this.bell(x.node, t + 0.02, 1320, 0.5, 0.06);
        break;
      case 'uiBack':
        if (!(x = o(0.35, 0.1))) return;
        this.tone(x.node, t, 'triangle', 440, 330, 0.08, 0.2);
        break;
      // ---------------------------------------------------------- enemies
      case 'miteAlert':
      case 'miteWindup':
        if (!(x = o(0.5, 0.15))) return;
        for (let i = 0; i < (name === 'miteAlert' ? 5 : 9); i++) {
          this.tone(x.node, t + i * 0.035, 'square', (name === 'miteAlert' ? 900 : 700 + i * 90) * r(), 500, 0.025, 0.05);
        }
        break;
      case 'miteLunge':
        if (!(x = o(0.6, 0.15))) return;
        this.noiseBurst(x.node, t, 0.2, 'highpass', 3000, 6000, 0.8, 0.4, 0.01);
        break;
      case 'wispAlert':
        if (!(x = o(0.4, 0.5))) return;
        this.bell(x.node, t, 1760 * r(), 1, 0.06, [1, 2.4, 3.9]);
        break;
      case 'wispCharge':
        if (!(x = o(0.5, 0.4))) return;
        this.tone(x.node, t, 'sine', 600, 1400, 0.6, 0.12, 0.05);
        this.noiseBurst(x.node, t, 0.6, 'bandpass', 800, 2400, 2, 0.2, 0.1, true);
        break;
      case 'wispDive':
        if (!(x = o(0.6, 0.3))) return;
        this.noiseBurst(x.node, t, 0.4, 'bandpass', 2400, 500, 1.4, 0.6, 0.01);
        break;
      case 'spit':
        if (!(x = o(0.6, 0.3))) return;
        this.tone(x.node, t, 'sine', 300, 900, 0.08, 0.3);
        this.noiseBurst(x.node, t, 0.2, 'bandpass', 900, 2000, 1, 0.4, 0.005, true);
        break;
      case 'emberImpact':
        if (!(x = o(0.6, 0.3))) return;
        this.noiseBurst(x.node, t, 0.3, 'lowpass', 2000, 300, 0.7, 0.6, 0.002, true);
        break;
      case 'guardAlert':
        if (!(x = o(0.7, 0.3))) return;
        this.formant(x.node, t, 95, 0.35, 0.25);
        break;
      case 'guardWindup':
        if (!(x = o(0.7, 0.3))) return;
        this.formant(x.node, t, 110, 0.5, 0.25);
        this.tone(x.node, t, 'sine', 2600, 3200, 0.4, 0.04, 0.2);
        break;
      case 'guardStrike':
        if (!(x = o(0.9, 0.3))) return;
        this.noiseBurst(x.node, t, 0.25, 'bandpass', 1800, 400, 1, 0.9, 0.01);
        break;
      case 'censerWind':
      case 'censerLift':
      case 'smokeWind':
        if (!(x = o(0.8, 0.4))) return;
        for (let i = 0; i < 6; i++) this.noiseBurst(x.node, t + i * 0.1, 0.08, 'bandpass', 2600, 2200, 5, 0.25);
        this.formant(x.node, t, 70, 0.6, 0.2);
        break;
      case 'censerSwing':
        if (!(x = o(1, 0.4))) return;
        this.noiseBurst(x.node, t, 0.7, 'bandpass', 300, 1200, 1, 0.9, 0.05, true);
        break;
      case 'smoke':
        if (!(x = o(0.8, 0.5))) return;
        this.noiseBurst(x.node, t, 1.5, 'lowpass', 600, 200, 0.8, 0.5, 0.2, true);
        break;
      case 'slamBoss':
        if (!(x = o(1.2, 0.6))) return;
        this.tone(x.node, t, 'sine', 65, 28, 0.7, 1.2);
        this.noiseBurst(x.node, t, 0.8, 'lowpass', 1600, 100, 0.6, 1, 0.002, true);
        break;
      case 'bellWind':
        if (!(x = o(0.8, 0.5))) return;
        this.formant(x.node, t, 60, 0.8, 0.3);
        break;
      case 'bellToll':
        if (!(x = o(1.2, 0.9))) return;
        this.bell(x.node, t, 98, 6, 0.6, [1, 2.01, 2.43, 3.03, 4.1, 5.34, 6.9]);
        this.tone(x.node, t, 'sine', 49, 49, 4, 0.3, 0.01);
        break;
      case 'bellCrack':
        if (!(x = o(1.2, 0.7))) return;
        this.bell(x.node, t, 103, 3, 0.5, [1, 1.93, 2.61, 3.37, 4.9]);
        this.noiseBurst(x.node, t, 0.5, 'highpass', 1200, 5000, 0.6, 0.8, 0.001);
        break;
      case 'bossJump':
      case 'bossLeap':
        if (!(x = o(0.9, 0.4))) return;
        this.formant(x.node, t, 80, 0.5, 0.3);
        this.noiseBurst(x.node, t + 0.2, 0.5, 'bandpass', 300, 1200, 1, 0.5, 0.05, true);
        break;
      case 'bossCharge':
        if (!(x = o(1, 0.4))) return;
        this.formant(x.node, t, 75, 0.9, 0.35);
        break;
      case 'bossPhase':
      case 'bossAwaken':
        if (!(x = o(1.2, 0.8))) return;
        this.formant(x.node, t, 55, 1.4, 0.4);
        this.bell(x.node, t, 82, 5, 0.4, [1, 1.47, 2.1, 2.9, 3.8]);
        break;
      case 'bossDeath':
        if (!(x = o(1.3, 1))) return;
        this.bell(x.node, t, 65, 8, 0.7, [1, 1.5, 2.0, 2.52, 3.0, 4.2]);
        this.tone(x.node, t, 'sine', 55, 25, 2, 1);
        this.noiseBurst(x.node, t, 2, 'lowpass', 1200, 60, 0.5, 0.9, 0.01, true);
        break;
      default:
        break;
    }
  }

  /** Throaty creature vocal: pulse wave through two formant band-passes. */
  private formant(dest: AudioNode, t: number, f: number, dur: number, peak: number): void {
    const c = this.ctx!;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 1.2, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.04, peak, dur);
    for (const [ff, q] of [[500, 4], [1100, 6]] as const) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff;
      bp.Q.value = q;
      osc.connect(bp);
      bp.connect(g);
    }
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.1);
    this.track(osc);
  }
}
