import {
  BufferGeometry, Camera, Color, Float32BufferAttribute, HalfFloatType, LinearFilter,
  Mesh, NoToneMapping, OrthographicCamera, PCFSoftShadowMap, RGBAFormat, Scene, ShaderMaterial, SRGBColorSpace,
  UnsignedByteType, Vector2, WebGLRenderer, WebGLRenderTarget, Vector3,
} from 'three';
import { Quality } from '../save/Settings';

const FS_VERT = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export interface GradeParams {
  lift: Color;
  gain: Color;
  saturation: number;
  vignette: number;
  bloomStrength: number;
  bloomThreshold: number;
  exposure: number;
}

export function defaultGrade(): GradeParams {
  return {
    lift: new Color(0.0, 0.004, 0.012),
    gain: new Color(1, 1, 1),
    saturation: 1.0,
    vignette: 0.45,
    bloomStrength: 0.85,
    bloomThreshold: 0.82,
    exposure: 1.0,
  };
}

interface QualityProfile {
  maxPixelRatio: number;
  bloom: boolean;
  bloomLevels: number;
  shadows: boolean;
  lights: number;
  particles: number;
  hdr: boolean;
}

const PROFILES: Record<Exclude<Quality, 'auto'>, QualityProfile> = {
  low: { maxPixelRatio: 1, bloom: false, bloomLevels: 0, shadows: false, lights: 3, particles: 0.45, hdr: false },
  medium: { maxPixelRatio: 1.5, bloom: true, bloomLevels: 1, shadows: false, lights: 5, particles: 0.75, hdr: true },
  high: { maxPixelRatio: 2, bloom: true, bloomLevels: 2, shadows: true, lights: 7, particles: 1, hdr: true },
};

/**
 * WebGL renderer + a compact post chain (bright-pass → blur pyramid → composite
 * with ACES tone mapping, grading, vignette and grain), with adaptive resolution.
 */
export class Renderer {
  readonly gl: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private sceneRT!: WebGLRenderTarget;
  private brightRT!: WebGLRenderTarget;
  private blurA: WebGLRenderTarget[] = [];
  private blurB: WebGLRenderTarget[] = [];
  private quad: Mesh;
  private orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postScene = new Scene();
  private brightMat: ShaderMaterial;
  private blurMat: ShaderMaterial;
  private compositeMat: ShaderMaterial;
  grade = defaultGrade();
  quality: Quality = 'auto';
  profile: QualityProfile = PROFILES.medium;
  /** 0.5..1 dynamic resolution scale on top of the pixel ratio cap. */
  renderScale = 1;
  private frameTimes: number[] = [];
  private adaptTimer = 0;
  flash = 0; // white flash amount
  damage = 0; // red vignette/desaturation
  fade = 0; // 0 = visible, 1 = black
  private time = 0;
  width = 1;
  height = 1;
  readonly supportsHalfFloat: boolean;

  constructor(container: HTMLElement) {
    this.gl = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.canvas = this.gl.domElement;
    this.canvas.id = 'moyue-canvas';
    container.appendChild(this.canvas);
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.gl.setClearColor(0x05070b, 1);
    this.gl.info.autoReset = false;
    const ctx = this.gl.getContext();
    this.supportsHalfFloat = !!(ctx as WebGL2RenderingContext).getExtension?.('EXT_color_buffer_float') ||
      !!ctx.getExtension('EXT_color_buffer_half_float');

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.brightMat = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.8 } },
      vertexShader: FS_VERT,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = max(c.r, max(c.g, c.b));
          float knee = 0.35;
          float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee + 1e-4);
          float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(c * contrib, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new Vector2(1, 0) } },
      vertexShader: FS_VERT,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
          c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
          c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
          c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
          c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMat = new ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom1: { value: null },
        tBloom2: { value: null },
        uBloom: { value: 0.8 },
        uBloomLevels: { value: 1 },
        uLift: { value: new Vector3() },
        uGain: { value: new Vector3(1, 1, 1) },
        uSat: { value: 1 },
        uVignette: { value: 0.4 },
        uExposure: { value: 1 },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uDamage: { value: 0 },
        uFade: { value: 0 },
        uAspect: { value: 1 },
      },
      vertexShader: FS_VERT,
      fragmentShader: `
        uniform sampler2D tScene; uniform sampler2D tBloom1; uniform sampler2D tBloom2;
        uniform float uBloom; uniform float uBloomLevels; uniform vec3 uLift; uniform vec3 uGain; uniform float uSat;
        uniform float uVignette; uniform float uExposure; uniform float uTime; uniform float uFlash; uniform float uDamage;
        uniform float uFade; uniform float uAspect;
        varying vec2 vUv;
        vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          if (uBloomLevels > 0.5) {
            vec3 b = texture2D(tBloom1, vUv).rgb;
            if (uBloomLevels > 1.5) b = b * 0.6 + texture2D(tBloom2, vUv).rgb * 0.8;
            c += b * uBloom;
          }
          c *= uExposure;
          c = aces(c);
          // grade
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat * (1.0 - uDamage * 0.6));
          c = c * uGain + uLift * (1.0 - c);
          // vignette
          vec2 q = vUv - 0.5; q.x *= uAspect;
          float v = smoothstep(0.95, 0.25, length(q));
          c *= mix(1.0 - uVignette, 1.0, v);
          c = mix(c, vec3(0.35, 0.02, 0.02), uDamage * (1.0 - v) * 0.8);
          c = mix(c, vec3(1.0), uFlash);
          c = toSRGB(clamp(c, 0.0, 1.0));
          c += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.018;
          c *= (1.0 - uFade);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new Mesh(geo, this.brightMat);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
    this.setQuality('auto');
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.profile = { ...(q === 'auto' ? PROFILES.medium : PROFILES[q]) };
    if (!this.supportsHalfFloat) this.profile.hdr = false;
    this.gl.shadowMap.enabled = this.profile.shadows;
    this.renderScale = 1;
    this.resize(this.width, this.height);
  }

  get pixelRatio(): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.max(0.5, Math.min(dpr, this.profile.maxPixelRatio) * this.renderScale);
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    const pr = this.pixelRatio;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(this.width, this.height, false);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    const W = Math.floor(this.width * pr), H = Math.floor(this.height * pr);
    const type = this.profile.hdr ? HalfFloatType : UnsignedByteType;
    const mk = (w2: number, h2: number, depth: boolean) =>
      new WebGLRenderTarget(Math.max(1, w2), Math.max(1, h2), {
        type, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: depth, stencilBuffer: false,
      });
    this.sceneRT?.dispose();
    this.brightRT?.dispose();
    for (const t of [...this.blurA, ...this.blurB]) t.dispose();
    this.blurA = [];
    this.blurB = [];
    this.sceneRT = mk(W, H, true);
    this.brightRT = mk(W >> 2, H >> 2, false);
    for (let i = 0; i < 2; i++) {
      const d = 2 + i * 1; // 1/4, 1/8
      this.blurA.push(mk(W >> d, H >> d, false));
      this.blurB.push(mk(W >> d, H >> d, false));
    }
    this.compositeMat.uniforms.uAspect.value = this.width / this.height;
  }

  /** Feed frame time; adapts render scale in 'auto' mode. Returns true if resolution changed. */
  adapt(dt: number): boolean {
    if (this.quality !== 'auto') return false;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.adaptTimer += dt;
    if (this.adaptTimer < 2) return false;
    this.adaptTimer = 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0.016;
    let changed = false;
    if (p75 > 1 / 45 && this.renderScale > 0.55) {
      this.renderScale = Math.max(0.55, this.renderScale - 0.1);
      changed = true;
      if (this.renderScale <= 0.65 && this.profile.bloomLevels > 1) this.profile.bloomLevels = 1;
    } else if (p75 < 1 / 58 && this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale + 0.05);
      changed = true;
    }
    if (changed) this.resize(this.width, this.height);
    return changed;
  }

  render(scene: Scene, camera: Camera, dt: number): void {
    this.time += dt;
    const gl = this.gl;
    const g = this.grade;
    gl.info.reset();
    gl.toneMapping = NoToneMapping;
    gl.setRenderTarget(this.sceneRT);
    gl.clear();
    gl.render(scene, camera);

    const levels = this.profile.bloom ? this.profile.bloomLevels : 0;
    if (levels > 0) {
      this.quad.material = this.brightMat;
      this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.brightMat.uniforms.uThreshold.value = g.bloomThreshold;
      gl.setRenderTarget(this.brightRT);
      gl.render(this.postScene, this.orthoCam);
      let src = this.brightRT;
      for (let i = 0; i < levels; i++) {
        const a = this.blurA[i], b = this.blurB[i];
        this.quad.material = this.blurMat;
        this.blurMat.uniforms.tDiffuse.value = src.texture;
        this.blurMat.uniforms.uDir.value.set(1 / a.width, 0);
        gl.setRenderTarget(a);
        gl.render(this.postScene, this.orthoCam);
        this.blurMat.uniforms.tDiffuse.value = a.texture;
        this.blurMat.uniforms.uDir.value.set(0, 1 / a.height);
        gl.setRenderTarget(b);
        gl.render(this.postScene, this.orthoCam);
        // second pass widens the kernel
        this.blurMat.uniforms.tDiffuse.value = b.texture;
        this.blurMat.uniforms.uDir.value.set(2 / a.width, 0);
        gl.setRenderTarget(a);
        gl.render(this.postScene, this.orthoCam);
        this.blurMat.uniforms.tDiffuse.value = a.texture;
        this.blurMat.uniforms.uDir.value.set(0, 2 / a.height);
        gl.setRenderTarget(b);
        gl.render(this.postScene, this.orthoCam);
        src = b;
      }
    }
    const u = this.compositeMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom1.value = this.blurB[0].texture;
    u.tBloom2.value = this.blurB[1].texture;
    u.uBloom.value = g.bloomStrength;
    u.uBloomLevels.value = levels;
    u.uLift.value.set(g.lift.r, g.lift.g, g.lift.b);
    u.uGain.value.set(g.gain.r, g.gain.g, g.gain.b);
    u.uSat.value = g.saturation;
    u.uVignette.value = g.vignette;
    u.uExposure.value = g.exposure;
    u.uTime.value = this.time % 100;
    u.uFlash.value = this.flash;
    u.uDamage.value = this.damage;
    u.uFade.value = this.fade;
    this.quad.material = this.compositeMat;
    gl.setRenderTarget(null);
    gl.render(this.postScene, this.orthoCam);
  }

  info(): { calls: number; triangles: number; textures: number; geometries: number } {
    const i = this.gl.info;
    return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries };
  }
}
