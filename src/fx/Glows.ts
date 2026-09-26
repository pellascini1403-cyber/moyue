import {
  AdditiveBlending, Color, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Mesh,
  ShaderMaterial, Vector3,
} from 'three';
import { glowTexture } from '../art/textures';
import { WorldUniforms } from '../art/materials';
import { GlowSpec } from '../world/BuildContext';

/**
 * All halo glows of a region in a single instanced draw call. Quads are
 * billboarded in the vertex shader; soft flicker per instance.
 */
export function buildGlows(glows: GlowSpec[]): Mesh | null {
  if (!glows.length) return null;
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const n = glows.length;
  const off = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n * 2);
  const center = new Vector3();
  glows.forEach((gl, i) => {
    off.set([gl.pos.x, gl.pos.y, gl.pos.z], i * 3);
    col.set([gl.color.r, gl.color.g, gl.color.b], i * 3);
    size.set([gl.size, gl.flicker], i * 2);
    center.add(gl.pos);
  });
  g.setAttribute('iOffset', new InstancedBufferAttribute(off, 3));
  g.setAttribute('iColor', new InstancedBufferAttribute(col, 3));
  g.setAttribute('iSize', new InstancedBufferAttribute(size, 2));
  g.instanceCount = n;
  // generous bounds for culling
  center.divideScalar(n);
  let r = 0;
  for (const gl of glows) r = Math.max(r, gl.pos.distanceTo(center) + gl.size);
  g.boundingSphere = { center, radius: r } as never;
  const m = new ShaderMaterial({
    uniforms: { uMap: { value: glowTexture() }, uTime: WorldUniforms.uTime, uIntensity: { value: 1 } },
    vertexShader: `
      attribute vec3 iOffset; attribute vec3 iColor; attribute vec2 iSize;
      uniform float uTime; varying vec2 vUv; varying vec3 vColor; varying float vFade;
      void main(){
        vUv = uv;
        float fl = 1.0 + iSize.y * (sin(uTime * 7.0 + iOffset.x * 3.1) * 0.6 + sin(uTime * 13.0 + iOffset.z) * 0.4);
        vColor = iColor * fl;
        vec4 mv = viewMatrix * vec4(iOffset, 1.0);
        float s = iSize.x;
        mv.xy += position.xy * s;
        // fade halos that are very close to the camera (avoid screen-filling blobs)
        vFade = smoothstep(0.5, 3.0, -mv.z) * (1.0 - smoothstep(180.0, 320.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uIntensity; varying vec2 vUv; varying vec3 vColor; varying float vFade;
      void main(){
        float a = texture2D(uMap, vUv).a;
        gl_FragColor = vec4(vColor * a * uIntensity * vFade, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(g, m);
  mesh.renderOrder = 10;
  mesh.name = 'glows';
  return mesh;
}

export function glowColor(hex: number): Color {
  return new Color(hex);
}
