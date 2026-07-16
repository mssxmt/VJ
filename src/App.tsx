import { Canvas, useFrame } from '@react-three/fiber'
import { MachineObject } from './machine/MachineObject'
import { KickBurst } from './machine/KickBurst'
import { Effects } from './effects/Effects'
import { CameraRig } from './camera/CameraRig'
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
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 10, 5]} intensity={2} />
        <pointLight position={[-5, -5, -5]} intensity={0.5} />
        <AudioUpdater />
        <MachineObject />
        <KickBurst />
        <CameraRig />
        <AutoPilot />
        <Effects />
      </Canvas>
      <Panel />
    </>
  )
}
