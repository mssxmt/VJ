import { useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MachineObject } from './machine/MachineObject'
import { KickBurst } from './machine/KickBurst'
import { EmpBeam } from './machine/EmpBeam'
import { Punch } from './effects/Punch'
import { Effects } from './effects/Effects'
import { CameraRig } from './camera/CameraRig'
import { HudLayer } from './hud/HudLayer'
import { AutoPilot } from './control/auto'
import { Panel } from './ui/Panel'
import { audioEngine } from './audio/engine'

function AudioUpdater() {
  // Run audio analysis once per frame before consumers read audioFrame
  useFrame((state) => audioEngine.update(state.clock.elapsedTime))
  return null
}

function StudioEnv() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    // Dark chrome is unreadable without something to reflect. RoomEnvironment
    // ships inside three (no network fetch, unlike drei's HDRI presets).
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const rt = pmrem.fromScene(room, 0.04)
    // The room's own geometries/materials are baked into the PMREM — free them
    // immediately instead of holding the whole helper scene alive.
    room.dispose()
    const prevIntensity = scene.environmentIntensity
    scene.environment = rt.texture
    scene.environmentIntensity = 0.45
    return () => {
      scene.environment = null
      scene.environmentIntensity = prevIntensity
      rt.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

export default function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 2, 8], fov: 50 }} gl={{ antialias: true }}>
        <color attach="background" args={['#000000']} />
        {/* Levels compensate for AGX tone mapping in the effect chain, which
            compresses roughly a stop harder than the previous untonemapped output. */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={3.5} />
        <pointLight position={[-5, -5, -5]} intensity={1} />
        <AudioUpdater />
        <StudioEnv />
        <MachineObject />
        <KickBurst />
        <EmpBeam />
        <Punch />
        <CameraRig />
        <AutoPilot />
        <Effects />
        {/* Last on purpose: its useFrame must see this frame's camera pose. */}
        <HudLayer />
      </Canvas>
      <Panel />
    </>
  )
}
