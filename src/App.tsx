import { Canvas } from '@react-three/fiber'
import { MachineObject } from './machine/MachineObject'
import { Effects } from './effects/Effects'
import { CameraRig } from './camera/CameraRig'

export default function App() {
  return (
    <Canvas camera={{ position: [0, 2, 8], fov: 50 }} gl={{ antialias: true }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 10, 5]} intensity={2} />
      <pointLight position={[-5, -5, -5]} intensity={0.5} />
      <MachineObject />
      <CameraRig />
      <Effects />
    </Canvas>
  )
}
