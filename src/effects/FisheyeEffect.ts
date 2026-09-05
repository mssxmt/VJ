import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import { wrapEffect } from '@react-three/postprocessing'

// Pure radial (barrel) distortion used by the shader and unit-tested directly.
// Clamped like the shader so the mirror never asserts values the GPU can't
// produce.
export function barrelUv([u, v]: [number, number], intensity: number): [number, number] {
  const dx = u - 0.5
  const dy = v - 0.5
  const k = 1 + intensity * (dx * dx + dy * dy)
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
  return [clamp01(0.5 + dx * k), clamp01(0.5 + dy * k)]
}

// mainUv (not a mainImage inputBuffer re-sample): inside a merged EffectPass,
// texture2D(inputBuffer, duv) reads the pass's ORIGINAL input and silently
// discards everything effects before this one accumulated — Bloom's screen
// blend was being erased. mainUv displaces the coordinate for the whole pass
// instead, so the bloomed image warps coherently. Identity at intensity 0.
const fragmentShader = /* glsl */ `
uniform float intensity;
void mainUv(inout vec2 uv) {
  vec2 d = uv - vec2(0.5);
  uv = clamp(vec2(0.5) + d * (1.0 + intensity * dot(d, d)), 0.0, 1.0);
}
`

class FisheyeEffectImpl extends Effect {
  constructor({ intensity = 0 } = {}) {
    super('FisheyeEffect', fragmentShader, {
      uniforms: new Map([['intensity', new Uniform(intensity)]]),
    })
  }
}

// intensity uniform read/write: ref.current.uniforms.get('intensity').value
export const FisheyeEffect = wrapEffect(FisheyeEffectImpl as never)
