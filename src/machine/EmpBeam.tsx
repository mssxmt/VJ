// High-band electromagnetic pulse beam. Reacts to the high band: extends
// vertically (up + down) from the machine center on high energy/transients,
// then FADES out at full length (does not retract). Center-bright gradient,
// electrical flicker, and sparking particles along the shaft. Additive +
// toneMapped-off so it reads as energy/light.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { audioFrame } from '../audio/frame'
import { effectiveValue } from '../control/store'
import { machineOrientation } from './orientation'

const HIGH_FLOOR = 0.09 // absolute floor below which highs can't fire
const HIGH_REL = 1.7 // high must exceed this x its recent average (rising edge)
const MIN_INTERVAL = 0.06
const MAX_LEN = 200 // long enough to extend well off-screen
const BEAM_COLOR = new THREE.Color('#bfeaff')

// Unit-height thin open cylinder. Vertex colors bake a center-bright gradient
// (bright core, fading toward the tips) so it reads as a beam, not a rod.
const BEAM_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.07, 0.07, 1, 14, 24, true)
  const pos = g.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const yn = pos.getY(i) / 0.5 // [-1, 1] along the unit height
    const t = Math.max(0, 1 - Math.abs(yn)) // 1 at center, 0 at tips
    const b = Math.pow(t, 1.6) * 0.95 + 0.05 // tips not fully black
    colors[i * 3] = BEAM_COLOR.r * b
    colors[i * 3 + 1] = BEAM_COLOR.g * b
    colors[i * 3 + 2] = BEAM_COLOR.b * b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
})()

// Sparking particles along the beam shaft.
const SPARK_COUNT = 180
const SPARK_GEO = new THREE.BufferGeometry()
SPARK_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3))

interface Spark {
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
}

export function EmpBeam() {
  const beamRef = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)
  const pointsRef = useRef<THREE.Points>(null!)
  const pointsMatRef = useRef<THREE.PointsMaterial>(null!)

  const energy = useRef(0)
  const length = useRef(0)
  const burstWidth = useRef(0)
  const lastPulse = useRef(0)
  const sparkEnergy = useRef(0)
  const nextSpark = useRef(0)
  // Slow average of the high band — the baseline for rising-edge detection so
  // the beam fires on high-band transients (hi-hats etc.) without needing the
  // broadband spectral-flux onset (which narrow-band highs often don't trip).
  const highBase = useRef(0)
  // Latch: a sustained high-band event fires once per rising edge, not every
  // MIN_INTERVAL while it stays above the baseline.
  const highAboveBaseline = useRef(false)
  // Orient group: the beam shaft follows the machine's tumble (not world-fixed).
  const orientRef = useRef<THREE.Group>(null!)

  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: SPARK_COUNT }, () => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
      })),
    [],
  )

  useFrame((state, delta) => {
    const want = effectiveValue('effects.empBeam') > 0.5
    const t = state.clock.elapsedTime
    const high = audioFrame.high

    // Follow the machine's tumble so the beam is "up/down" relative to the
    // machine, not world-fixed.
    if (orientRef.current) orientRef.current.quaternion.copy(machineOrientation.quaternion)

    // Energy (opacity driver): continuous high-band glow + transient spike.
    let next = energy.current * Math.pow(0.86, delta * 60)
    next = Math.max(next, Math.pow(high, 1.4) * 0.7)
    // Track a slow average of the high band for rising-edge detection.
    const baseA = 1 - Math.pow(0.965, delta * 60)
    highBase.current += (high - highBase.current) * baseA
    // Fire only on the false->true threshold crossing (latched) so a sustained
    // high-band event fires once per rising edge, not every MIN_INTERVAL.
    const aboveBaseline = high > HIGH_FLOOR && high > highBase.current * HIGH_REL
    const highRise = aboveBaseline && !highAboveBaseline.current
    highAboveBaseline.current = aboveBaseline
    const globalHit = audioFrame.onset && high > HIGH_FLOOR
    const pulse = (highRise || globalHit) && t - lastPulse.current > MIN_INTERVAL
    if (pulse) {
      lastPulse.current = t
      const strength = 0.55 + Math.min(1, high) * 0.6
      next = Math.max(next, strength)

      // Spawn sparks along the visible shaft. Use the post-growth length so the
      // first pulse (length still ~0) distributes along the beam, not at center.
      const postGrowthLength = length.current + (MAX_LEN - length.current) * Math.min(1, delta * 26)
      const halfLen = postGrowthLength / 2
      const burst = Math.round(16 + strength * 22)
      for (let i = 0; i < burst; i++) {
        const s = sparks[nextSpark.current]
        s.pos.set((Math.random() - 0.5) * 0.25, (Math.random() * 2 - 1) * halfLen, (Math.random() - 0.5) * 0.25)
        s.vel.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2)
        s.life = 0.2 + Math.random() * 0.35
        nextSpark.current = (nextSpark.current + 1) % SPARK_COUNT
      }
      sparkEnergy.current = Math.max(sparkEnergy.current, strength)
      // Flash thick on the firing moment; decays back to the steady width.
      burstWidth.current = Math.max(burstWidth.current, 4.5)
    }
    energy.current = next
    // Burst width eases back to 0 (frame-rate independent).
    burstWidth.current *= Math.pow(0.82, delta * 60)

    // Length: extend toward MAX_LEN while alive; collapse only once faded
    // (opacity ~0 then), so the beam FADES at full length instead of retracting.
    const targetLen = next > 0.02 ? MAX_LEN : 0
    length.current += (targetLen - length.current) * Math.min(1, delta * 26)

    // Beam: full-length, gradient, electrical flicker, fade via opacity.
    const m = beamRef.current
    const mat = matRef.current
    if (m && mat) {
      const on = want && next > 0.02 && length.current > 0.1
      m.visible = on
      if (on) {
        const flicker = 0.82 + 0.18 * Math.sin(t * 53) * Math.cos(t * 37)
        // Steady width from energy + a momentary thick burst on fire.
        const r = 1 + next * 0.5 + burstWidth.current
        m.scale.set(r, length.current, r)
        mat.opacity = next * flicker
      }
    }

    // Sparks: integrate alive ones, compact to the front, constrain draw range.
    if (pointsRef.current && pointsMatRef.current) {
      const attr = SPARK_GEO.getAttribute('position') as THREE.BufferAttribute
      let alive = 0
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i]
        if (s.life > 0) {
          s.pos.addScaledVector(s.vel, delta)
          s.life -= delta
          attr.setXYZ(alive, s.pos.x, s.pos.y, s.pos.z)
          alive++
        }
      }
      attr.needsUpdate = true
      SPARK_GEO.setDrawRange(0, alive)
      sparkEnergy.current *= Math.pow(0.9, delta * 60)
      pointsRef.current.visible = want && alive > 0
      pointsMatRef.current.opacity = Math.min(1, sparkEnergy.current)
    }
  })

  return (
    <group ref={orientRef}>
      <mesh ref={beamRef} geometry={BEAM_GEO} visible={false}>
        <meshBasicMaterial
          ref={matRef}
          color={0xffffff}
          vertexColors
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <points ref={pointsRef} geometry={SPARK_GEO} visible={false}>
        <pointsMaterial
          ref={pointsMatRef}
          color={BEAM_COLOR}
          size={0.08}
          sizeAttenuation
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  )
}
