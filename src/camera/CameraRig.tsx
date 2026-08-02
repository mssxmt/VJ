// Camera rig: manual orbit controls plus AUTO hard cuts on audio onsets
// and onset-driven positional shake.
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { effectiveValue } from '../control/store'
import { audioFrame } from '../audio/frame'
import { createRng } from '../lib/random'

const rng = createRng(Date.now() % 100000)
// Reusable offset vector (avoid per-frame allocation).
const _offset = new THREE.Vector3()

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null!)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const lastCut = useRef(0)

  useFrame((state) => {
    const auto = effectiveValue('auto.master') > 0.5 && effectiveValue('auto.camera') > 0.5
    // Punch-in: push in (shorter distance) + widen fov while held.
    const p = audioFrame.punch * effectiveValue('punch.strength')
    const dist = effectiveValue('camera.distance') * (1 - p * 0.6)
    const t = state.clock.elapsedTime

    camera.fov = effectiveValue('camera.fov') + p * 40
    camera.updateProjectionMatrix()
    controls.current.autoRotate = true
    controls.current.autoRotateSpeed = effectiveValue('camera.orbitSpeed') * 10

    if (auto && audioFrame.onset && t - lastCut.current > 0.35) {
      // Hard cut to a new pose on onset
      lastCut.current = t
      const theta = rng() * Math.PI * 2
      const phi = 0.3 + rng() * 1.2
      camera.position.setFromSphericalCoords(dist * (0.7 + rng() * 0.6), phi, theta)
      camera.lookAt(0, 0, 0)
    } else if (!auto) {
      // Manual mode: make camera.distance authoritative by dollying the orbit
      // radius to the param value each frame (mouse-wheel dolly is overridden
      // so the Distance slider / MIDI actually moves the camera).
      const target = controls.current.target
      _offset.subVectors(camera.position, target)
      if (_offset.lengthSq() > 1e-6) {
        _offset.normalize().multiplyScalar(dist)
        camera.position.copy(target).add(_offset)
      }
    }

    // Audio shake (both modes, scaled by param)
    const shake = effectiveValue('camera.shake') * audioFrame.onsetEnv * 0.15
    camera.position.x += (rng() - 0.5) * shake
    camera.position.y += (rng() - 0.5) * shake

    controls.current.update()
  })

  return <OrbitControls ref={controls} enableDamping makeDefault />
}
