import { Canvas, useFrame } from '@react-three/fiber'
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
