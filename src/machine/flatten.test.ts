import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { flatten } from './flatten'
import { generateMachine, generateOrganism, type MachineConfig, type MachinePart } from './generate'

const config: MachineConfig = {
  seed: 42, pattern: 'machine', complexity: 0.6, partCount: 40, symmetry: 2, scaleSpread: 0.5,
}

function localOf(
  pos: readonly number[],
  rot: readonly number[],
  scl: readonly number[],
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scl[0], scl[1], scl[2]),
  )
}

/** Independent reference: the world matrix ABOVE each part (parent chain of
 *  primary placements). */
function parentWorlds(root: MachinePart): Map<number, THREE.Matrix4> {
  const map = new Map<number, THREE.Matrix4>()
  const walk = (part: MachinePart, parentWorld: THREE.Matrix4): void => {
    map.set(part.id, parentWorld.clone())
    const world = parentWorld.clone().multiply(localOf(part.position, part.rotation, part.scale))
    for (const c of part.children) walk(c, world)
  }
  walk(root, new THREE.Matrix4())
  return map
}

describe('flatten pose composition', () => {
  it('every pose (pos, quat, scale) recomposes to parentWorld · localOf(pose)', () => {
    const root = generateMachine(config)
    const parents = parentWorlds(root)
    const flat = flatten(root)
    const actual = new THREE.Matrix4()
    for (const fp of flat) {
      const parentWorld = parents.get(fp.part.id)!
      const localPoses = fp.part.poses ?? [
        { position: fp.part.position, rotation: fp.part.rotation },
      ]
      expect(fp.poses).toHaveLength(localPoses.length)
      for (let k = 0; k < localPoses.length; k++) {
        const expected = parentWorld
          .clone()
          .multiply(localOf(localPoses[k].position, localPoses[k].rotation, fp.part.scale))
        actual.compose(fp.poses[k].pos, fp.poses[k].quat, fp.poses[k].scale)
        for (let e = 0; e < 16; e++) {
          expect(actual.elements[e]).toBeCloseTo(expected.elements[e], 6)
        }
      }
    }
  })

  it('alternate poses under anisotropic ancestors get their OWN world scale', () => {
    // The bug this pins down: rendering alternates with the primary's world
    // scale put 90°-swapped rods at wildly wrong proportions.
    let divergentFound = false
    for (let seed = 1; seed <= 20 && !divergentFound; seed++) {
      for (const fp of flatten(generateMachine({ ...config, seed }))) {
        for (let k = 1; k < fp.poses.length; k++) {
          const d = fp.poses[k].scale.clone().sub(fp.poses[0].scale)
          if (d.length() > 1e-6) {
            divergentFound = true
            break
          }
        }
      }
    }
    expect(divergentFound).toBe(true)
  })
})

describe('full affine matrices (organism shear)', () => {
  const organismConfig: MachineConfig = { ...config, pattern: 'organism' }

  it('every pose matrix equals parentWorld · localOf(pose) for machine AND organism', () => {
    for (const tree of [generateMachine(config), generateOrganism(organismConfig)]) {
      const parents = parentWorlds(tree)
      for (const fp of flatten(tree)) {
        const parentWorld = parents.get(fp.part.id)!
        const localPoses = fp.part.poses ?? [
          { position: fp.part.position, rotation: fp.part.rotation },
        ]
        expect(fp.matrix.elements).toHaveLength(16)
        for (let k = 0; k < localPoses.length; k++) {
          const expected = parentWorld
            .clone()
            .multiply(localOf(localPoses[k].position, localPoses[k].rotation, fp.part.scale))
          const actual = fp.poses[k].matrix
          for (let e = 0; e < 16; e++) {
            expect(actual.elements[e]).toBeCloseTo(expected.elements[e], 6)
          }
        }
      }
    }
  })

  it('organism parts actually shear — TRS recomposition loses the world matrix', () => {
    // Why WorldPose carries the full matrix: organism children sit at
    // continuous rotations under anisotropic stalks/tendrils, and decompose
    // drops that shear (machine parts are 90°-stepped, hence unaffected).
    const flat = flatten(generateOrganism(organismConfig))
    const trs = new THREE.Matrix4()
    let sheared = 0
    for (const fp of flat) {
      trs.compose(fp.pos, fp.quat, fp.scale)
      if (trs.elements.some((v, e) => Math.abs(v - fp.matrix.elements[e]) > 1e-6)) sheared++
    }
    expect(sheared).toBeGreaterThan(0)
  })
})
