import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { generateMachine, type MachinePart, type MachineConfig } from './generate'
import { audioFrame } from '../audio/frame'
import { useParamStore, effectiveValue } from '../control/store'

const GEOMETRIES: Record<string, THREE.BufferGeometry> = {
  core: new THREE.BoxGeometry(1, 1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  pipe: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  fin: new THREE.BoxGeometry(1, 0.6, 0.05),
  antenna: new THREE.ConeGeometry(0.3, 1, 4),
  ring: new THREE.TorusGeometry(0.5, 0.08, 6, 16),
  greeble: new THREE.BoxGeometry(0.3, 0.3, 0.3),
}

function Part({ part }: { part: MachinePart }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(() => {
    const r = part.reactivity
    const level = audioFrame[r.band]
    const reactivity = effectiveValue('machine.reactivity')
    const punch = 1 + audioFrame.onsetEnv * r.punch * 0.6 * reactivity
    mesh.current.scale.set(part.scale[0] * punch, part.scale[1] * punch, part.scale[2] * punch)
    mesh.current.rotation.z = part.rotation[2] + audioFrame.time * r.spin * level * reactivity
    mat.current.emissiveIntensity = level * r.flash * 3 * reactivity
  })
  return (
    <group position={part.position} rotation={part.rotation}>
      <mesh ref={mesh} geometry={GEOMETRIES[part.type]} scale={part.scale as [number, number, number]}>
        <meshStandardMaterial
          ref={mat}
          color="#b8bcc4"
          metalness={0.9}
          roughness={0.25}
          emissive="#ffffff"
          emissiveIntensity={0}
          flatShading
        />
      </mesh>
      {part.children.map((c) => (
        <Part key={c.id} part={c} />
      ))}
    </group>
  )
}

export function MachineObject() {
  // Structural params come from the reactive store (regeneration on change is intended)
  const values = useParamStore((s) => s.values)
  const config: MachineConfig = {
    seed: values['machine.seed'],
    complexity: values['machine.complexity'],
    partCount: Math.round(values['machine.partCount']),
    symmetry: Math.round(values['machine.symmetry']),
    scaleSpread: values['machine.scaleSpread'],
  }
  const root = useMemo(
    () => generateMachine(config),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is rebuilt each render; regenerate only on structural value changes
    [config.seed, config.complexity, config.partCount, config.symmetry, config.scaleSpread],
  )
  const copies = Array.from({ length: config.symmetry }, (_, i) => (i / config.symmetry) * Math.PI * 2)
  return (
    <group>
      {copies.map((angle) => (
        <group key={angle} rotation={[0, angle, 0]}>
          <Part part={root} />
        </group>
      ))}
    </group>
  )
}
