// Advances the punch-in envelope each frame toward the `punch.trigger` param
// (keyboard/MIDI-driven). Placed in App before CameraRig/Effects so those
// consumers read an up-to-date audioFrame.punch.
import { useFrame } from '@react-three/fiber'
import { audioFrame } from '../audio/frame'
import { advancePunch } from './envelope'
import { effectiveValue } from '../control/store'

export function Punch() {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05) // clamp like CameraRig (avoid tab-refocus jumps)
    const target = effectiveValue('punch.trigger')
    audioFrame.punch = advancePunch(
      audioFrame.punch,
      target,
      effectiveValue('punch.attack'),
      effectiveValue('punch.release'),
      dt,
    )
  })
  return null
}
