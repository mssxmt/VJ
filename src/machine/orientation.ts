// Shared mutable machine orientation. MachineObject writes its root (tumble)
// quaternion here each frame; other world-space effects (e.g. the EMP beam)
// read it so they follow the machine's facing instead of being world-fixed.
import * as THREE from 'three'

export const machineOrientation = {
  quaternion: new THREE.Quaternion(),
}
