// Audio-reactive postprocessing chain. Effect parameters are driven per-frame
// from the param store (base + AUTO modulation) and the shared audio frame.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Glitch,
  Noise,
  Pixelation,
  Scanline,
} from '@react-three/postprocessing'
import { GlitchMode } from 'postprocessing'
import type {
  BloomEffect,
  ChromaticAberrationEffect,
  GlitchEffect,
  NoiseEffect,
  PixelationEffect,
  ScanlineEffect,
} from 'postprocessing'
import { effectiveValue } from '../control/store'
import { audioFrame } from '../audio/frame'

export function Effects() {
  const bloom = useRef<BloomEffect>(null)
  const chroma = useRef<ChromaticAberrationEffect>(null)
  const glitch = useRef<GlitchEffect>(null)
  const noise = useRef<NoiseEffect>(null)
  const pixel = useRef<PixelationEffect>(null)
  const scan = useRef<ScanlineEffect>(null)

  useFrame(() => {
    const g = effectiveValue('effects.glitch')
    if (bloom.current) {
      bloom.current.intensity = effectiveValue('effects.bloom') * (1 + audioFrame.high)
    }
    if (chroma.current) {
      const c = effectiveValue('effects.chroma') * (0.002 + audioFrame.onsetEnv * 0.01)
      chroma.current.offset.set(c, c * 0.6)
    }
    if (glitch.current) {
      // Fire glitch bursts on onsets, scaled by the glitch param
      glitch.current.mode =
        audioFrame.onsetEnv * g > 0.25 ? GlitchMode.CONSTANT_WILD : GlitchMode.DISABLED
    }
    if (noise.current) noise.current.blendMode.opacity.value = effectiveValue('effects.noise')
    if (pixel.current) pixel.current.granularity = effectiveValue('effects.pixelate') * 24
    if (scan.current) scan.current.blendMode.opacity.value = effectiveValue('effects.scanline')
  })

  return (
    <EffectComposer>
      <Bloom ref={bloom} luminanceThreshold={0.4} mipmapBlur intensity={1} />
      <ChromaticAberration ref={chroma} />
      <Glitch ref={glitch} mode={GlitchMode.DISABLED} />
      <Pixelation ref={pixel} granularity={0} />
      <Scanline ref={scan} density={1.5} />
      <Noise ref={noise} premultiply />
    </EffectComposer>
  )
}
