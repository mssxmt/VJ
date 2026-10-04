// Audio-reactive postprocessing chain. Effect parameters are driven per-frame
// from the param store (base + AUTO modulation) and the shared audio frame.
//
// Pass layout matters: @react-three/postprocessing merges consecutive
// non-CONVOLUTION children into one EffectPass and gives CONVOLUTION effects
// (ChromaticAberration) a pass of their own, so this order yields
//   [Bloom, Fisheye, ToneMapping] | [CA] | [Hud, Glitch, Scanline, GrainVignette]
// - the HUD sits after AGX so its colors are authored exactly, and shares the
//   last pass with Glitch/Scanline/Grain so it degrades with the image
//   (Glitch's uv distortion applies pass-wide). It must NOT share a pass with
//   Fisheye, whose mainUv would warp it.
// - CA before the HUD: fringing the readout text was considered and dropped —
//   crisp instrument text over a degraded image reads better than degrading
//   everything equally.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Glitch,
  Scanline,
  ToneMapping,
} from '@react-three/postprocessing'
import { GlitchMode, ToneMappingMode } from 'postprocessing'
import type {
  BloomEffect,
  ChromaticAberrationEffect,
  GlitchEffect,
  ScanlineEffect,
} from 'postprocessing'
import { effectiveValue } from '../control/store'
import { audioFrame } from '../audio/frame'
import { HIGH_BAND } from '../audio/bands'
import { FisheyeEffect } from './FisheyeEffect'
import { GrainVignetteEffect } from './GrainVignetteEffect'
import { HudOverlayEffect } from './HudOverlayEffect'

/** Loosely typed wrapEffect handle: the uniforms Map is the stable surface. */
type UniformsRef = { uniforms: Map<string, { value: number }> }

export function Effects() {
  const bloom = useRef<BloomEffect>(null)
  const chroma = useRef<ChromaticAberrationEffect>(null)
  const glitch = useRef<GlitchEffect>(null)
  const scan = useRef<ScanlineEffect>(null)
  const fisheye = useRef<UniformsRef>(null)
  const grain = useRef<UniformsRef>(null)
  const hud = useRef<UniformsRef>(null)

  useFrame((state) => {
    const g = effectiveValue('effects.glitch')
    if (bloom.current) {
      bloom.current.intensity = effectiveValue('effects.bloom') * (1 + audioFrame.bands[HIGH_BAND])
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
    if (scan.current) scan.current.blendMode.opacity.value = effectiveValue('effects.scanline')
    // Barrel distortion rides the punch envelope; the mainUv displacement is
    // identity at 0, so a quiet frame costs nothing extra.
    if (fisheye.current) {
      fisheye.current.uniforms.get('intensity')!.value =
        audioFrame.punch * effectiveValue('punch.warp')
    }
    if (grain.current) {
      grain.current.uniforms.get('grain')!.value = effectiveValue('effects.grain')
      grain.current.uniforms.get('vignette')!.value = effectiveValue('effects.vignette')
      // Wrapped on the CPU: the EffectPass-injected `time` grows unbounded and
      // erodes the grain hash precision over a long set.
      grain.current.uniforms.get('gvTime')!.value = state.clock.elapsedTime % 64
    }
    if (hud.current) {
      hud.current.uniforms.get('opacity')!.value =
        effectiveValue('hud.visible') > 0.5 ? effectiveValue('hud.opacity') : 0
    }
  })

  // wrapEffect memoizes constructor args via JSON.stringify(props): if this
  // component ever gains state/subscriptions that re-render it, wrap the
  // children in useMemo or every render recreates the effects (shader
  // recompile hitch).
  return (
    <EffectComposer>
      <Bloom ref={bloom} luminanceThreshold={0.4} mipmapBlur intensity={0.7} />
      <FisheyeEffect ref={fisheye as never} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <ChromaticAberration ref={chroma} />
      <HudOverlayEffect ref={hud as never} />
      <Glitch ref={glitch} mode={GlitchMode.DISABLED} />
      <Scanline ref={scan} density={1.5} />
      <GrainVignetteEffect ref={grain as never} />
    </EffectComposer>
  )
}
