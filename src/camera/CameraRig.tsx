// Camera rig: manual orbit controls plus AUTO hard cuts on audio onsets
// and onset-driven positional shake. Punch-in scales the camera radius
// every frame (both AUTO and manual) so a held punch pushes in continuously.
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { effectiveValue } from '../control/store'
import { audioFrame } from '../audio/frame'
import { createRng } from '../lib/random'

const rng = createRng(Date.now() % 100000)

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null!)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const lastCut = useRef(0)
  // Un-punched base radius: set on AUTO cuts (random) or tracks camera.distance
  // in manual mode. The punch factor scales this every frame after update().
  const baseRadius = useRef(effectiveValue('camera.distance'))

  useFrame((state) => {
    const auto = effectiveValue('auto.master') > 0.5 && effectiveValue('auto.camera') > 0.5
    const baseDist = effectiveValue('camera.distance')
    const t = state.clock.elapsedTime
    const p = audioFrame.punch * effectiveValue('punch.strength')

    controls.current.autoRotate = true
    controls.current.autoRotateSpeed = effectiveValue('camera.orbitSpeed') * 10

    if (auto && audioFrame.onset && t - lastCut.current > 0.35) {
      // Hard cut to a new pose on onset (un-punched base radius).
      lastCut.current = t
      baseRadius.current = baseDist * (0.7 + rng() * 0.6)
      const theta = rng() * Math.PI * 2
      const phi = 0.3 + rng() * 1.2
      camera.position.setFromSphericalCoords(baseRadius.current, phi, theta)
      camera.lookAt(0, 0, 0)
    } else if (!auto) {
      // Manual: camera.distance is authoritative for the un-punched radius.
      baseRadius.current = baseDist
    }

    // FOV widens with punch (compounds with fisheye for a push-in feel).
    camera.fov = effectiveValue('camera.fov') + p * 55
    camera.updateProjectionMatrix()

    controls.current.update()

    // Scale the radius AFTER update so a held punch pushes in continuously in
    // BOTH modes (auto between cuts, manual) — not only on the cut frame.
    const targetRadius = baseRadius.current * (1 - p * 0.9)
    const r = camera.position.length()
    if (r > 1e-6) camera.position.multiplyScalar(targetRadius / r)

    // Audio shake (both modes, scaled by param)
    const shake = effectiveValue('camera.shake') * audioFrame.onsetEnv * 0.15
    camera.position.x += (rng() - 0.5) * shake
    camera.position.y += (rng() - 0.5) * shake
  })

  return <OrbitControls ref={controls} enableDamping makeDefault />
}
