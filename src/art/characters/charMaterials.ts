import {
  AdditiveBlending, BackSide, Color, DoubleSide, IUniform, Material, Mesh, MeshBasicMaterial, Object3D, ShaderMaterial,
  BufferGeometry,
} from 'three';
import { WorldUniforms, patchShaderChunks } from '../materials';

/** Inverted-hull ink outline (vertices pushed along normals, back faces only). */
export function outlineMaterial(width = 0.018, color = 0x05060a): MeshBasicMaterial {
  patchShaderChunks();
  const m = new MeshBasicMaterial({ color, side: BackSide, fog: true });
  const w = { value: width };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = w;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
  };
  m.customProgramCacheKey = () => 'outline';
  (m.userData as { width: IUniform<number> }).width = w;
  return m;
}

/** Translucent iridescent membrane (cicada wings). */
export function wingMaterial(tint = new Color(0.55, 0.85, 0.8)): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTint: { value: tint },
      uTime: WorldUniforms.uTime,
      uGlow: { value: 0 },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uTint; uniform float uTime; uniform float uGlow;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        // vein pattern
        float veins = smoothstep(0.93, 1.0, abs(sin(vUv.x * 18.0 + vUv.y * 3.0))) + smoothstep(0.95, 1.0, abs(sin(vUv.y * 9.0)));
        vec3 irid = 0.5 + 0.5 * cos(6.2831 * (f * 1.2 + vec3(0.0, 0.33, 0.67)) + uTime * 0.3);
        vec3 col = mix(uTint, irid, 0.45) * (0.35 + f * 0.9) + veins * vec3(0.05, 0.08, 0.07);
        col += uGlow * vec3(0.6, 1.2, 1.0);
        float a = 0.22 + f * 0.45 + veins * 0.5 + uGlow * 0.3;
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        gl_FragColor = vec4(col, a * edge);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** Additive energy material (blade glow, spirit flames). */
export function energyMaterial(color: Color, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: true });
}

/** Add outline hulls for every mesh under `root` that is flagged `userData.outline`. */
export function addOutlines(root: Object3D, mat: Material): Mesh[] {
  const hulls: Mesh[] = [];
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.userData.outline) meshes.push(m);
  });
  for (const m of meshes) {
    const h = new Mesh(m.geometry as BufferGeometry, mat);
    h.name = `${m.name}_outline`;
    h.userData.isOutline = true;
    h.castShadow = false;
    m.add(h);
    hulls.push(h);
  }
  return hulls;
}
