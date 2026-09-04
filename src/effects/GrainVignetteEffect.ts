import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import { wrapEffect } from '@react-three/postprocessing'

// Pure radial vignette falloff, mirrored by the shader and unit-tested directly.
// smoothstep(0.15, 1.0, r2*2): center plateau stays clean, corners reach the
// full amount.
export function vignetteFactor([u, v]: [number, number], amount: number): number {
  const dx = u - 0.5
  const dy = v - 0.5
  const r2 = (dx * dx + dy * dy) * 2
  const t = Math.min(1, Math.max(0, (r2 - 0.15) / (1 - 0.15)))
  const s = t * t * (3 - 2 * t)
  return 1 - amount * s
}

// One merged pass instead of separate Vignette + Noise effects: both read only
// inputColor, so splitting them buys nothing but per-effect overhead.
// `resolution` is injected by EffectPass; time arrives as our own gvTime
// uniform, wrapped on the CPU, because the injected `time` grows unbounded.
// Grain runs post-AGX on display-referred values: the coefficient is small on
// purpose (0.10 — "film grain you notice when you look"), weighted toward the
// shadows, and the result is clamped at 0 — negative excursions on pure black
// would reach the sRGB OETF's pow() and go NaN (driver-dependent flicker).
const fragmentShader = /* glsl */ `
uniform float grain;
uniform float vignette;
uniform float gvTime;

float gvHash(const in vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  vec2 d = uv - vec2(0.5);
  c *= 1.0 - vignette * smoothstep(0.15, 1.0, dot(d, d) * 2.0);
  // mod() bounds the hash argument: raw 4K pixel coords push float32 sin()
  // precision and the pattern degrades into banding.
  vec2 p = mod(uv * resolution, 1024.0) + fract(gvTime * vec2(61.7, 41.3)) * 331.0;
  float n = gvHash(p) - 0.5;
  float lum = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  c += n * grain * 0.10 * mix(0.6, 0.2, lum);
  outputColor = vec4(max(c, 0.0), inputColor.a);
}
`

class GrainVignetteEffectImpl extends Effect {
  constructor({ grain = 0, vignette = 0 } = {}) {
    super('GrainVignetteEffect', fragmentShader, {
      uniforms: new Map([
        ['grain', new Uniform(grain)],
        ['vignette', new Uniform(vignette)],
        ['gvTime', new Uniform(0)],
      ]),
    })
  }
}

// grain/vignette/gvTime uniforms driven per-frame via ref.uniforms
// (FisheyeEffect pattern).
export const GrainVignetteEffect = wrapEffect(GrainVignetteEffectImpl as never)
