import {
  Color, DoubleSide, Material, MeshBasicMaterial, MeshStandardMaterial, MeshStandardMaterialParameters,
  ShaderChunk, AdditiveBlending, SpriteMaterial, NormalBlending, MeshLambertMaterial, IUniform,
} from 'three';
import {
  stoneTexture, rockTexture, woodTexture, roofTexture, carvedTexture, mossTexture, lanternTexture,
  glowTexture, talismanTexture,
} from './textures';

/** Shared uniforms for the custom height fog (updated per region). */
export const WorldUniforms = {
  uFogHeight: { value: 0 } as IUniform<number>,
  uFogHeightFalloff: { value: 30 } as IUniform<number>,
  uFogHeightDensity: { value: 0.03 } as IUniform<number>,
  uFogLowColor: { value: new Color(0x0b1622) } as IUniform<Color>,
  uTime: { value: 0 } as IUniform<number>,
};

let chunksPatched = false;
/** Replace three's fog chunks with distance + height fog (guarded by MOYUE_HFOG). */
export function patchShaderChunks(): void {
  if (chunksPatched) return;
  chunksPatched = true;
  ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef MOYUE_HFOG
    varying vec3 vFogWorldPos;
  #endif
#endif`;
  ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef MOYUE_HFOG
    vec4 moyueFogWP = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      moyueFogWP = instanceMatrix * moyueFogWP;
    #endif
    vFogWorldPos = ( modelMatrix * moyueFogWP ).xyz;
  #endif
#endif`;
  ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  #ifdef MOYUE_HFOG
    varying vec3 vFogWorldPos;
    uniform float uFogHeight;
    uniform float uFogHeightFalloff;
    uniform float uFogHeightDensity;
    uniform vec3 uFogLowColor;
  #endif
#endif`;
  ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 moyueFogCol = fogColor;
  #ifdef MOYUE_HFOG
    float moyueH = clamp( ( uFogHeight - vFogWorldPos.y ) / max( uFogHeightFalloff, 0.001 ), 0.0, 1.0 );
    float moyueHF = moyueH * ( 1.0 - exp( - vFogDepth * uFogHeightDensity ) );
    fogFactor = max( fogFactor, moyueHF );
    moyueFogCol = mix( fogColor, uFogLowColor, moyueH );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, moyueFogCol, fogFactor );
#endif`;
}

function hfog(m: Material, extra?: (shader: { uniforms: Record<string, IUniform>; fragmentShader: string; vertexShader: string }) => void, key = 'hfog'): Material {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uFogHeight = WorldUniforms.uFogHeight;
    shader.uniforms.uFogHeightFalloff = WorldUniforms.uFogHeightFalloff;
    shader.uniforms.uFogHeightDensity = WorldUniforms.uFogHeightDensity;
    shader.uniforms.uFogLowColor = WorldUniforms.uFogLowColor;
    shader.vertexShader = '#define MOYUE_HFOG\n' + shader.vertexShader;
    shader.fragmentShader = '#define MOYUE_HFOG\n' + shader.fragmentShader;
    extra?.(shader);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export interface RimOptions {
  color: Color;
  power: number;
  strength: number;
}

/** Character material: standard lighting + fresnel rim so silhouettes read in the dark. */
export function characterMaterial(params: MeshStandardMaterialParameters, rim: RimOptions): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.75, metalness: 0, ...params });
  const rimColor = { value: rim.color.clone().multiplyScalar(rim.strength) };
  const rimPower = { value: rim.power };
  (m.userData as { rimColor: IUniform<Color> }).rimColor = rimColor;
  hfog(m, (shader) => {
    shader.uniforms.uRimColor = rimColor;
    shader.uniforms.uRimPower = rimPower;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float moyueRim = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), uRimPower );
        totalEmissiveRadiance += uRimColor * moyueRim;`,
      );
  }, 'rim');
  return m;
}

export type WorldMatKey =
  | 'stone' | 'stoneDark' | 'stonePale' | 'rock' | 'rockDark' | 'wood' | 'woodDark' | 'roof' | 'roofRed'
  | 'gold' | 'bronze' | 'jade' | 'plaster' | 'carved' | 'moss' | 'lanternPaper' | 'lanternWarm' | 'windowGlow'
  | 'ink' | 'talisman' | 'bone' | 'crimson' | 'foliage' | 'glowPlant' | 'cloth' | 'chain';

let lib: Record<WorldMatKey, Material> | null = null;

export function worldMaterials(): Record<WorldMatKey, Material> {
  if (lib) return lib;
  patchShaderChunks();
  const std = (p: MeshStandardMaterialParameters) =>
    hfog(new MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: true, ...p })) as MeshStandardMaterial;
  const lam = (p: ConstructorParameters<typeof MeshLambertMaterial>[0]) =>
    hfog(new MeshLambertMaterial({ vertexColors: true, ...p }), undefined, 'hfogL') as MeshLambertMaterial;
  const basic = (p: ConstructorParameters<typeof MeshBasicMaterial>[0]) =>
    hfog(new MeshBasicMaterial({ ...p }), undefined, 'hfogB') as MeshBasicMaterial;
  lib = {
    stone: std({ map: stoneTexture(), color: 0x9aa0a6 }),
    stoneDark: std({ map: stoneTexture(), color: 0x5d636b }),
    stonePale: std({ map: stoneTexture(), color: 0xc9c4b8 }),
    rock: lam({ map: rockTexture(), color: 0x7d8796 }),
    rockDark: lam({ map: rockTexture(), color: 0x3e4552 }),
    wood: std({ map: woodTexture(), color: 0x8e2a1a, roughness: 0.7 }),
    woodDark: std({ map: woodTexture(), color: 0x3b2a24, roughness: 0.8 }),
    roof: std({ map: roofTexture(), color: 0x46545a, roughness: 0.75, side: DoubleSide }),
    roofRed: std({ map: roofTexture(), color: 0x6b2a20, roughness: 0.75, side: DoubleSide }),
    gold: std({ color: 0xb58d3c, metalness: 0.65, roughness: 0.42 }),
    bronze: std({ color: 0x6d5f3e, metalness: 0.55, roughness: 0.5 }),
    jade: std({ color: 0x4f9f82, roughness: 0.35, emissive: 0x0c3a2a, emissiveIntensity: 0.6 }),
    plaster: std({ color: 0xb8b0a2, roughness: 0.95 }),
    carved: std({ map: carvedTexture(), color: 0x93a09a }),
    moss: lam({ map: mossTexture(), color: 0x6d8f6a }),
    lanternPaper: basic({ map: lanternTexture(), color: new Color(1.7, 1.25, 1.0) }),
    lanternWarm: basic({ color: new Color(2.2, 1.35, 0.6) }),
    windowGlow: basic({ color: new Color(1.9, 1.05, 0.45) }),
    ink: std({ color: 0x14161b, roughness: 0.85 }),
    talisman: basic({ map: talismanTexture(), color: new Color(0.95, 0.9, 0.8), side: DoubleSide }),
    bone: std({ color: 0xcfc6b0, roughness: 0.8 }),
    crimson: std({ color: 0x7a0f14, roughness: 0.6, emissive: 0x2a0204, emissiveIntensity: 0.6 }),
    foliage: lam({ color: 0x33523e, side: DoubleSide }),
    glowPlant: basic({ color: new Color(0.45, 1.6, 1.5) }),
    cloth: std({ color: 0x8a1c14, roughness: 0.9, side: DoubleSide }),
    chain: std({ color: 0x2b2a28, metalness: 0.6, roughness: 0.5 }),
  };
  return lib;
}

/** Additive glow sprite material (lantern halos, spirit lights). */
export function glowSpriteMaterial(color: Color, opacity = 1): SpriteMaterial {
  return new SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
}

export function transparentBasic(color: Color, opacity: number, additive = false): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
    side: DoubleSide,
    fog: true,
  });
}
