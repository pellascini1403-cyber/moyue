import { ShaderMaterial, UniformsLib, UniformsUtils } from 'three';

/**
 * Give a custom ShaderMaterial the scene fog (distance fog; the height fog
 * chunks are only active for materials that opt in). The shaders must include
 * `#include <fog_pars_vertex>` / `#include <fog_vertex>` (needs `mvPosition`)
 * and `#include <fog_pars_fragment>` / `#include <fog_fragment>`.
 */
export function withFog(m: ShaderMaterial): ShaderMaterial {
  m.uniforms = UniformsUtils.merge([UniformsLib.fog, {}]);
  m.fog = true;
  return m;
}

export function fogUniforms(): Record<string, { value: unknown }> {
  return UniformsUtils.clone(UniformsLib.fog) as Record<string, { value: unknown }>;
}
