import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import { wrapEffect } from '@react-three/postprocessing'

// Pure radial (barrel) distortion used by the shader and unit-tested directly.
export function barrelUv([u, v]: [number, number], intensity: number): [number, number] {
  const dx = u - 0.5
  const dy = v - 0.5
  const r2 = dx * dx + dy * dy
  const k = 1 + intensity * r2
  return [0.5 + dx * k, 0.5 + dy * k]
}

const fragmentShader = /* glsl */ `
uniform float intensity;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - vec2(0.5);
  float r2 = dot(d, d);
  vec2 duv = vec2(0.5) + d * (1.0 + intensity * r2);
  outputColor = texture2D(inputBuffer, clamp(duv, 0.0, 1.0));
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
