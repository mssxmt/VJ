// AUTO mode modulators: LFO drift + audio-driven pushes written into the
// per-frame modulation map, plus periodic machine regeneration on onsets.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { lfoValue } from './lfo'
import { modulation, effectiveValue, useParamStore } from './store'
import { audioFrame } from '../audio/frame'
import { getParam } from './params'

/** Onsets accumulate; every N onsets the machine regenerates (seed change). */
const ONSETS_PER_REGEN = 16

export function AutoPilot() {
  const onsetCount = useRef(0)

  useFrame((state) => {
    const master = effectiveValue('auto.master') > 0.5
    if (!master) {
      modulation.clear()
      return
    }
    const t = state.clock.elapsedTime

    if (effectiveValue('auto.effects') > 0.5) {
      // Slow LFO drift + audio push on effect intensities (modulation is in param units)
      modulation.set('effects.glitch', lfoValue('sine', t, 0.05) * 0.3 + audioFrame.onsetEnv * 0.3)
      modulation.set('effects.chroma', lfoValue('sine', t, 0.07, 0.3) * 0.2)
      modulation.set(
        'effects.pixelate',
        Math.max(0, lfoValue('square', t, 0.02)) * audioFrame.onsetEnv * 0.5,
      )
      const bloomDef = getParam('effects.bloom')
      modulation.set(
        'effects.bloom',
        lfoValue('sine', t, 0.03) * 0.3 * (bloomDef.max - bloomDef.min) * 0.2,
      )
    }

    if (effectiveValue('auto.machine') > 0.5 && audioFrame.onset) {
      onsetCount.current++
      if (onsetCount.current >= ONSETS_PER_REGEN) {
        onsetCount.current = 0
        // Structural change: new seed via base value (not modulation) so UI reflects it
        const s = useParamStore.getState()
        s.setParam('machine.seed', Math.floor(Math.random() * 9999))
      }
    }
  })
  return null
}
