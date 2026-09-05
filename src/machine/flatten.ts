// Tree -> flat world-space parts. Separated from the renderer component so the
// pose/scale composition invariant is testable in node (and fast-refresh safe).
import * as THREE from 'three'
import type { MachinePart } from './generate'

export interface WorldPose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  /** Decomposed per pose: a rotated child under an anisotropic ancestor gets a
   *  DIFFERENT world scale than the primary — reusing the primary's scale
   *  rendered 90°-posed rods at wildly wrong proportions. */
  scale: THREE.Vector3
}

export interface FlatPart {
  part: MachinePart
  pos: THREE.Vector3
  quat: THREE.Quaternion
  scale: THREE.Vector3
  /** World-space pose set (index 0 = primary). Convulsions pick among these;
   *  alternates are composed against the parent's PRIMARY world transform, so
   *  a convulsing parent does not drag its subtree — parts reconfigure
   *  independently, which is the dissociated Gantz-Graf read we want. */
  poses: WorldPose[]
}

const _euler = new THREE.Euler()

/** Walk the tree accumulating transforms -> flat world-space parts (structural only). */
export function flatten(root: MachinePart): FlatPart[] {
  const out: FlatPart[] = []
  const localOf = (
    position: readonly number[],
    rotation: readonly number[],
    scale: readonly number[],
  ) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(position[0], position[1], position[2]),
      new THREE.Quaternion().setFromEuler(_euler.set(rotation[0], rotation[1], rotation[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2]),
    )
  const walk = (part: MachinePart, parentWorld: THREE.Matrix4) => {
    const world = parentWorld.clone().multiply(localOf(part.position, part.rotation, part.scale))
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    world.decompose(pos, quat, scale)
    const poses: WorldPose[] = [{ pos, quat, scale }]
    if (part.poses) {
      for (let k = 1; k < part.poses.length; k++) {
        const alt = part.poses[k]
        const w = parentWorld.clone().multiply(localOf(alt.position, alt.rotation, part.scale))
        // Fresh vectors per pose — decompose into a shared scratch would alias
        // every pose to the last decomposition.
        const p = new THREE.Vector3()
        const q = new THREE.Quaternion()
        const s = new THREE.Vector3()
        w.decompose(p, q, s)
        poses.push({ pos: p, quat: q, scale: s })
      }
    }
    out.push({ part, pos, quat, scale, poses })
    // Children compose against the PRIMARY transform (see FlatPart.poses).
    for (const c of part.children) walk(c, world)
  }
  walk(root, new THREE.Matrix4())
  return out
}
