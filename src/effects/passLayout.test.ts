import { describe, it, expect } from 'vitest'
import {
  BloomEffect,
  ChromaticAberrationEffect,
  GlitchEffect,
  ToneMappingEffect,
  EffectAttribute,
} from 'postprocessing'

// Guards the pass split Effects.tsx depends on. @react-three/postprocessing
// merges consecutive non-CONVOLUTION children into one EffectPass and gives a
// CONVOLUTION effect a pass of its own, so the declared child order
//   Bloom, Fisheye, ToneMapping, CA, Hud, Glitch, Scanline, GrainVignette
// only yields [Bloom,Fisheye,AGX] | [CA] | [Hud,Glitch,Scanline,Grain] while
// these attributes hold. If a postprocessing upgrade changes them, Fisheye's
// mainUv could silently land in the HUD's pass (HUD warps on punch) or the
// composer could throw on two merged CONVOLUTION effects — re-audit the chain
// order in Effects.tsx before fixing this test.
describe('postprocessing pass-layout invariants', () => {
  it('ChromaticAberration is CONVOLUTION (forces its own pass)', () => {
    const e = new ChromaticAberrationEffect()
    expect(e.getAttributes() & EffectAttribute.CONVOLUTION).toBeTruthy()
  })
  it('Bloom, Glitch and ToneMapping carry no attributes (stay mergeable)', () => {
    expect(new BloomEffect().getAttributes()).toBe(EffectAttribute.NONE)
    expect(new GlitchEffect().getAttributes()).toBe(EffectAttribute.NONE)
    expect(new ToneMappingEffect().getAttributes()).toBe(EffectAttribute.NONE)
  })
})
