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
      const bloomDef = getParam('effects.bloom')
      modulation.set(
        'effects.bloom',
        lfoValue('sine', t, 0.03) * 0.3 * (bloomDef.max - bloomDef.min) * 0.2,
      )
      // Stretch glitch: violent vertical/horizontal elongation snapping on
      // onsets, alternating axis via the square LFO phase.
      modulation.set('effects.stretchV', audioFrame.onsetEnv * Math.max(0, lfoValue('square', t, 0.5)) * 0.9)
      modulation.set('effects.stretchH', audioFrame.onsetEnv * Math.max(0, lfoValue('square', t, 0.5, 0.5)) * 0.9)
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

    if (effectiveValue('auto.camera') > 0.5) {
      // AUTO tumble: LFO-driven object spin on all three axes so the machine
      // rotates continuously for hands-off viewing (offsets manual spin base).
      modulation.set('machine.spinX', lfoValue('sine', t, 0.07) * 0.5)
      modulation.set('machine.spinY', lfoValue('sine', t, 0.05, 0.25) * 0.6)
      modulation.set('machine.spinZ', lfoValue('sine', t, 0.09, 0.6) * 0.3)
    }
  })
  return null
}
