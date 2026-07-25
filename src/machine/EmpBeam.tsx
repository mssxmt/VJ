// High-band electromagnetic pulse beam. Reacts to the high band: glows
// continuously with highs and spikes on high-band transients, extending
// vertically (up + down) from the machine center. Additive + toneMapped-off
// so it reads as energy/light, not solid geometry.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { audioFrame } from '../audio/frame'
import { effectiveValue } from '../control/store'

// High-band transient gate + refractory.
const HIGH_GATE = 0.18
const MIN_INTERVAL = 0.06
const MAX_LEN = 22 // full beam length (half up, half down)

// Unit-height thin open cylinder; scaled along Y to extend the beam.
const BEAM_GEO = new THREE.CylinderGeometry(0.05, 0.05, 1, 14, 1, true)

export function EmpBeam() {
  const beamRef = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)
  const energy = useRef(0)
  const lastPulse = useRef(0)

  useFrame((state, delta) => {
    const want = effectiveValue('effects.empBeam') > 0.5
    const e = energy.current
    const t = state.clock.elapsedTime
    const high = audioFrame.high

    // Continuous high-band glow + a discrete spike on high-band transients.
    let next = e * Math.pow(0.86, delta * 60) // frame-rate independent decay
    next = Math.max(next, Math.pow(high, 1.4) * 0.7)
    if (audioFrame.onset && high > HIGH_GATE && t - lastPulse.current > MIN_INTERVAL) {
      lastPulse.current = t
      next = Math.max(next, 0.55 + Math.min(1, high) * 0.6)
    }
    energy.current = next

    const m = beamRef.current
    const mat = matRef.current
    if (!m || !mat) return
    const on = want && next > 0.02
    m.visible = on
    if (on) {
      // Length scales with energy -> beam extends up+down with high intensity.
      m.scale.set(1 + next * 0.6, next * MAX_LEN, 1 + next * 0.6)
      mat.opacity = next
    }
  })

  return (
    <mesh ref={beamRef} geometry={BEAM_GEO} visible={false}>
      <meshBasicMaterial
        ref={matRef}
        color={new THREE.Color('#bfeaff')}
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
