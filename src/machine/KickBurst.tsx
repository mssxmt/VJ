// Kick-band energy release. On a low-band onset (kick) the machine discharges
// energy via three independently toggleable effects:
//  - rings      : expanding shockwave tori (sharp, geometric)
//  - particles  : points flung outward and decaying (debris/spark burst)
//  - flash      : a bright central glow sphere that pops and fades
// All additive + toneMapped-off so they read as light, not solid geometry.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { audioFrame } from '../audio/frame'
import { KICK_BAND } from '../audio/bands'
import { effectiveValue } from '../control/store'

// Kick = spectral-flux onset where the low band dominates.
const KICK_LOW_GATE = 0.11
const MIN_INTERVAL = 0.07

const RING_COUNT = 6
const RING_GEO = new THREE.TorusGeometry(1, 0.035, 8, 56)

const PARTICLE_COUNT = 240
const PARTICLE_GEO = new THREE.BufferGeometry()
PARTICLE_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3))

const FLASH_GEO = new THREE.SphereGeometry(1, 16, 12)

interface RingState {
  energy: number
  scale: number
  quat: THREE.Quaternion
}

interface Particle {
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
}

export function KickBurst() {
  const ringMeshes = useRef<THREE.Mesh[]>([])
  const lastKick = useRef(0)
  const nextRing = useRef(0)

  const pointsRef = useRef<THREE.Points>(null!)
  const flashRef = useRef<THREE.Mesh>(null!)
  const flashMatRef = useRef<THREE.MeshBasicMaterial>(null!)
  const pointsMatRef = useRef<THREE.PointsMaterial>(null!)

  const rings = useMemo<RingState[]>(() => {
    const Z = new THREE.Vector3(0, 0, 1)
    return Array.from({ length: RING_COUNT }, () => {
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      return { energy: 0, scale: 0.4, quat: new THREE.Quaternion().setFromUnitVectors(Z, axis) }
    })
  }, [])

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
      })),
    [],
  )
  const nextParticle = useRef(0)
  const particleEnergy = useRef(0)

  const flashEnergy = useRef(0)

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const wantRings = effectiveValue('effects.kickRings') > 0.5
    const wantParticles = effectiveValue('effects.kickParticles') > 0.5
    const wantFlash = effectiveValue('effects.kickFlash') > 0.5
    const low = audioFrame.bands[KICK_BAND]
    const kick = audioFrame.onset && low > KICK_LOW_GATE && t - lastKick.current > MIN_INTERVAL
    if (kick) {
      lastKick.current = t
      const strength = 0.55 + Math.min(1, low) * 0.6

      if (wantRings) {
        const s = rings[nextRing.current]
        s.energy = strength
        s.scale = 0.4
        nextRing.current = (nextRing.current + 1) % RING_COUNT
      }
      if (wantParticles) {
        // Fl outward in random directions, faster on harder kicks.
        const burst = Math.round(20 + strength * 26)
        const speed = 2 + strength * 3
        for (let i = 0; i < burst; i++) {
          const p = particles[nextParticle.current]
          p.pos.set(0, 0, 0)
          p.vel
            .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .normalize()
            .multiplyScalar(speed * (0.5 + Math.random()))
          p.life = 0.5 + Math.random() * 0.5
          nextParticle.current = (nextParticle.current + 1) % PARTICLE_COUNT
        }
        particleEnergy.current = Math.max(particleEnergy.current, strength)
      }
      if (wantFlash) {
        flashEnergy.current = Math.max(flashEnergy.current, strength)
      }
    }

    // Rings: energy decays frame-rate independently; a ring is only shown when
    // the rings toggle is on AND it still has energy, so disabling mid-flight
    // hides in-progress rings too.
    const ringDecay = Math.pow(0.9, delta * 60)
    for (let i = 0; i < rings.length; i++) {
      const s = rings[i]
      const m = ringMeshes.current[i]
      if (!m) continue
      s.energy *= ringDecay
      if (wantRings && s.energy > 0.02) {
        s.scale += delta * (6 + s.scale * 3.5)
        m.visible = true
        m.scale.setScalar(s.scale)
        m.quaternion.copy(s.quat)
        ;(m.material as THREE.MeshBasicMaterial).opacity = s.energy
      } else if (m.visible) {
        m.visible = false
      }
    }

    // Particles: integrate alive ones, compact them to the front of the
    // position buffer, and constrain the draw range so dead / never-spawned
    // points are never rendered. Drag + energy decay are frame-rate independent.
    if (pointsRef.current) {
      const attr = PARTICLE_GEO.getAttribute('position') as THREE.BufferAttribute
      const drag = Math.pow(0.94, delta * 60)
      let alive = 0
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        if (p.life > 0) {
          p.vel.multiplyScalar(drag)
          p.pos.addScaledVector(p.vel, delta)
          p.life -= delta
          attr.setXYZ(alive, p.pos.x, p.pos.y, p.pos.z)
          alive++
        }
      }
      attr.needsUpdate = true
      PARTICLE_GEO.setDrawRange(0, alive)
      particleEnergy.current *= Math.pow(0.92, delta * 60)
      pointsRef.current.visible = wantParticles && alive > 0
      if (pointsMatRef.current) pointsMatRef.current.opacity = Math.min(1, particleEnergy.current)
    }

    // Flash: pop + fade (frame-rate independent).
    if (flashRef.current && flashMatRef.current) {
      flashEnergy.current *= Math.pow(0.86, delta * 60)
      const e = flashEnergy.current
      flashRef.current.visible = wantFlash && e > 0.02
      if (wantFlash && e > 0.02) {
        const sc = 1 + (1 - Math.min(1, e)) * 4
        flashRef.current.scale.setScalar(sc)
        flashMatRef.current.opacity = e * 0.8
      }
    }
  })

  return (
    <group>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) ringMeshes.current[i] = m
          }}
          geometry={RING_GEO}
          visible={false}
        >
          <meshBasicMaterial
            color={new THREE.Color('#aef0ff')}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      <points ref={pointsRef} geometry={PARTICLE_GEO} visible={false}>
        <pointsMaterial
          ref={pointsMatRef}
          color={new THREE.Color('#cfeaff')}
          size={0.09}
          sizeAttenuation
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>

      <mesh ref={flashRef} geometry={FLASH_GEO} visible={false}>
        <meshBasicMaterial
          ref={flashMatRef}
          color={new THREE.Color('#eaf6ff')}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
