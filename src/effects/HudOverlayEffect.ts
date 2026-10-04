import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import { wrapEffect } from '@react-three/postprocessing'
import { hudSurface } from '../hud/hudCanvas'

// Composites the HUD canvas over the tonemapped image. Lives in the effect
// chain (not the DOM) so canvas.captureStream recordings contain the HUD.
// The texture comes from the module singleton rather than a prop: wrapEffect
// keys its args memo on JSON.stringify(props), which would serialize a
// THREE.Texture.
const fragmentShader = /* glsl */ `
uniform sampler2D hudMap;
uniform float opacity;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (opacity <= 0.0) {
    outputColor = inputColor;
    return;
  }
  vec4 hud = texture2D(hudMap, uv);
  float a = hud.a * opacity;
  outputColor = vec4(mix(inputColor.rgb, hud.rgb, a), inputColor.a);
}
`

class HudOverlayEffectImpl extends Effect {
  constructor() {
    super('HudOverlayEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['hudMap', new Uniform(hudSurface().texture)],
        ['opacity', new Uniform(0)],
      ]),
    })
  }
}

// opacity uniform driven per-frame via ref.uniforms (FisheyeEffect pattern).
export const HudOverlayEffect = wrapEffect(HudOverlayEffectImpl as never)
