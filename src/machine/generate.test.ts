import { describe, it, expect } from 'vitest'
import {
  generateMachine,
  generateOrganism,
  addConvulsionPoses,
  countParts,
  POS_MUTATIONS,
  type MachineConfig,
  type MachinePart,
} from './generate'
import { BAND_COUNT } from '../audio/bands'

const config: MachineConfig = {
  seed: 42, pattern: 'machine', complexity: 0.6, partCount: 40, symmetry: 2, scaleSpread: 0.5,
}

const organismConfig: MachineConfig = {
  seed: 42, pattern: 'organism', complexity: 0.6, partCount: 40, symmetry: 2, scaleSpread: 0.5,
}

const flatParts = (root: MachinePart): MachinePart[] => {
  const out: MachinePart[] = []
  const walk = (p: MachinePart): void => {
    out.push(p)
    p.children.forEach(walk)
  }
  walk(root)
  return out
}

describe('generateMachine', () => {
  it('is deterministic: same config -> identical tree', () => {
    expect(generateMachine(config)).toEqual(generateMachine(config))
  })
  it('different seeds -> different trees', () => {
    expect(generateMachine(config)).not.toEqual(generateMachine({ ...config, seed: 43 }))
  })
  it('respects partCount (symmetry copies excluded)', () => {
    expect(countParts(generateMachine(config))).toBe(40)
    expect(countParts(generateMachine({ ...config, partCount: 8 }))).toBe(8)
  })
  it('every part has a valid band index', () => {
    const walk = (p: ReturnType<typeof generateMachine>): void => {
      expect(p.reactivity.band).toBeGreaterThanOrEqual(0)
      expect(p.reactivity.band).toBeLessThan(BAND_COUNT)
      p.children.forEach(walk)
    }
    walk(generateMachine(config))
  })
})

describe('addConvulsionPoses', () => {
  it('gives every non-root part 4 poses and leaves the root anchored', () => {
    const root = generateMachine(config)
    expect(root.poses).toBeUndefined()
    for (const p of flatParts(root)) {
      if (p === root) continue
      expect(p.poses).toHaveLength(4)
    }
  })
  it('keeps the original placement as pose 0', () => {
    const root = generateMachine(config)
    for (const p of flatParts(root)) {
      if (!p.poses) continue
      expect(p.poses[0].position).toEqual(p.position)
      expect(p.poses[0].rotation).toEqual(p.rotation)
    }
  })
  it('is deterministic per seed', () => {
    expect(generateMachine(config)).toEqual(generateMachine(config))
    const a = generateMachine(config)
    const b = generateMachine({ ...config })
    expect(flatParts(a).map((p) => p.poses)).toEqual(flatParts(b).map((p) => p.poses))
  })
  it('mutates positions as signed permutations (offset length preserved in the parent local frame)', () => {
    const root = generateMachine(config)
    for (const p of flatParts(root)) {
      if (!p.poses) continue
      const base = p.poses[0].position.map(Math.abs).sort((x, y) => x - y)
      for (const pose of p.poses) {
        const abs = pose.position.map(Math.abs).sort((x, y) => x - y)
        for (let i = 0; i < 3; i++) expect(abs[i]).toBeCloseTo(base[i], 9)
      }
    }
  })
  it('mutates rotations by 90° multiples on exactly one axis per alternate', () => {
    const root = generateMachine(config)
    for (const p of flatParts(root)) {
      if (!p.poses) continue
      for (let k = 1; k < p.poses.length; k++) {
        let changed = 0
        for (let axis = 0; axis < 3; axis++) {
          const delta = p.poses[k].rotation[axis] - p.poses[0].rotation[axis]
          if (Math.abs(delta) > 1e-9) {
            changed++
            const steps = delta / (Math.PI / 2)
            expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9)
          }
        }
        expect(changed).toBe(1)
      }
    }
  })
  it('keeps the 3 alternates distinct from each other and from pose 0', () => {
    const root = generateMachine(config)
    for (const p of flatParts(root)) {
      if (!p.poses) continue
      const keys = p.poses.map((q) => [...q.position, ...q.rotation].join(','))
      expect(new Set(keys).size).toBe(p.poses.length)
    }
  })
  it('every POS_MUTATIONS entry is a proper rotation (det +1, orthonormal)', () => {
    // The abs-multiset invariant would also pass under reflections; pin down
    // that these are true rotations of the offset, not mirrorings.
    for (const mut of POS_MUTATIONS) {
      const cols = [mut([1, 0, 0]), mut([0, 1, 0]), mut([0, 0, 1])]
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
      for (let i = 0; i < 3; i++) {
        expect(dot(cols[i], cols[i])).toBeCloseTo(1, 12)
        for (let j = i + 1; j < 3; j++) expect(dot(cols[i], cols[j])).toBeCloseTo(0, 12)
      }
      const det =
        cols[0][0] * (cols[1][1] * cols[2][2] - cols[1][2] * cols[2][1]) -
        cols[1][0] * (cols[0][1] * cols[2][2] - cols[0][2] * cols[2][1]) +
        cols[2][0] * (cols[0][1] * cols[1][2] - cols[0][2] * cols[1][1])
      expect(det).toBeCloseTo(1, 12)
    }
  })
  it('does not touch organism trees (only called by the machine path)', () => {
    const root = generateOrganism(organismConfig)
    for (const p of flatParts(root)) expect(p.poses).toBeUndefined()
  })
  it('can be applied standalone to any tree deterministically', () => {
    const a = generateOrganism(organismConfig)
    const b = generateOrganism(organismConfig)
    addConvulsionPoses(a, 7)
    addConvulsionPoses(b, 7)
    expect(flatParts(a).map((p) => p.poses)).toEqual(flatParts(b).map((p) => p.poses))
  })
})

describe('generateOrganism', () => {
  it('is deterministic: same config -> identical tree', () => {
    expect(generateOrganism(organismConfig)).toEqual(generateOrganism(organismConfig))
  })
  it('different seeds -> different trees', () => {
    expect(generateOrganism(organismConfig)).not.toEqual(generateOrganism({ ...organismConfig, seed: 43 }))
  })
  it('respects partCount (symmetry copies excluded)', () => {
    expect(countParts(generateOrganism(organismConfig))).toBe(40)
    expect(countParts(generateOrganism({ ...organismConfig, partCount: 8 }))).toBe(8)
  })
  it('every part has a valid band index', () => {
    const walk = (p: ReturnType<typeof generateOrganism>): void => {
      expect(p.reactivity.band).toBeGreaterThanOrEqual(0)
      expect(p.reactivity.band).toBeLessThan(BAND_COUNT)
      p.children.forEach(walk)
    }
    walk(generateOrganism(organismConfig))
  })
  it('root is a nucleus', () => {
    expect(generateOrganism(organismConfig).type).toBe('nucleus')
  })
  it('omits large cyst-like parts (no membrane) and uses only organism types', () => {
    const allowed = new Set(['nucleus', 'blob', 'bulb', 'stalk', 'tendril'])
    const walk = (p: ReturnType<typeof generateOrganism>): void => {
      expect(allowed.has(p.type)).toBe(true)
      p.children.forEach(walk)
    }
    walk(generateOrganism(organismConfig))
  })
})
