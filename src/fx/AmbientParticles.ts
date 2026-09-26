import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, Vector3 } from 'three';
import { dotTexture } from '../art/textures';
import { Rng } from '../core/rng';

export type AmbientKind = 'dust' | 'embers' | 'fireflies' | 'spores' | 'ash';

export interface AmbientSpec {
  kind: AmbientKind;
  color: number;
  count: number;
  size: number;
  /** Box extents around the camera. */
  extent: number;
  speed: number;
  opacity: number;
}

/**
 * Camera-following particle field: positions wrap inside a box centred on the
 * camera, animated entirely on the GPU (one draw call, zero CPU per frame).
 */
export class AmbientParticles {
  readonly points: Points;
  private mat: ShaderMaterial;
  private spec: AmbientSpec;
  private target = 1;
  private level = 0;

  constructor(spec: AmbientSpec, scale = 1) {
    this.spec = spec;
    const n = Math.max(8, Math.round(spec.count * scale));
    const rng = new Rng(spec.count * 7 + spec.kind.length);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.next();
      pos[i * 3 + 1] = rng.next();
      pos[i * 3 + 2] = rng.next();
      seed[i * 2] = rng.next();
      seed[i * 2 + 1] = rng.next();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(seed, 2));
    const kindId = { dust: 0, embers: 1, fireflies: 2, spores: 3, ash: 4 }[spec.kind];
    this.mat = new ShaderMaterial({
      uniforms: {
        uMap: { value: dotTexture() },
        uTime: { value: 0 },
        uCenter: { value: new Vector3() },
        uExtent: { value: spec.extent },
        uColor: { value: new Color(spec.color) },
        uSize: { value: spec.size },
        uSpeed: { value: spec.speed },
        uOpacity: { value: spec.opacity },
        uKind: { value: kindId },
        uPixelRatio: { value: 1 },
      },
      vertexShader: `
        attribute vec2 aSeed;
        uniform float uTime; uniform vec3 uCenter; uniform float uExtent; uniform float uSize; uniform float uSpeed;
        uniform float uKind; uniform float uPixelRatio;
        varying float vAlpha; varying float vTw;
        void main(){
          vec3 p = position;
          float t = uTime * uSpeed;
          vec3 drift;
          if (uKind < 0.5) drift = vec3(sin(t*0.3 + aSeed.x*20.0)*0.02, -0.01 - aSeed.y*0.01, cos(t*0.25 + aSeed.y*17.0)*0.02) * t;
          else if (uKind < 1.5) drift = vec3(sin(t*0.8 + aSeed.x*30.0)*0.03, 0.05 + aSeed.y*0.05, cos(t*0.7+aSeed.y*9.0)*0.03) * t;
          else if (uKind < 2.5) drift = vec3(sin(t*0.5 + aSeed.x*40.0)*0.8, sin(t*0.4+aSeed.y*20.0)*0.5, cos(t*0.45+aSeed.x*11.0)*0.8) * 0.06;
          else if (uKind < 3.5) drift = vec3(sin(t*0.2+aSeed.x*6.0)*0.01, 0.012 + aSeed.x*0.01, cos(t*0.2)*0.01) * t;
          else drift = vec3(0.01, -0.03 - aSeed.y*0.02, 0.005) * t;
          // position in a box around the centre
          vec3 wp = uCenter + (fract(p + drift - uCenter / (uExtent * 2.0)) - 0.5) * uExtent * 2.0;
          vec4 mv = modelViewMatrix * vec4(wp, 1.0);
          float d = -mv.z;
          vTw = uKind > 1.5 && uKind < 2.5 ? (0.5 + 0.5 * sin(uTime * (1.5 + aSeed.y * 3.0) + aSeed.x * 50.0)) : 1.0;
          vec3 fromC = abs(wp - uCenter) / uExtent;
          float edge = 1.0 - smoothstep(0.7, 1.0, max(fromC.x, max(fromC.y, fromC.z)));
          vAlpha = edge * smoothstep(0.3, 2.0, d);
          gl_PointSize = uSize * (0.6 + aSeed.y * 0.8) * uPixelRatio * (300.0 / max(d, 0.5));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
        varying float vAlpha; varying float vTw;
        void main(){
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(uColor * vTw, a * vAlpha * uOpacity * vTw);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
  }

  set visibleTarget(v: number) {
    this.target = v;
  }

  update(t: number, dt: number, center: Vector3, pixelRatio: number): void {
    this.level += (this.target - this.level) * Math.min(1, dt * 1.5);
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uCenter.value.copy(center);
    u.uPixelRatio.value = pixelRatio;
    u.uOpacity.value = this.spec.opacity * this.level;
    this.points.visible = this.level > 0.01;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
