import { describe, it, expect } from 'vitest'
import { generateMachine, countParts, type MachineConfig } from './generate'

const config: MachineConfig = {
  seed: 42, complexity: 0.6, partCount: 40, symmetry: 2, scaleSpread: 0.5,
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
  it('every part has valid reactivity band', () => {
    const walk = (p: ReturnType<typeof generateMachine>): void => {
      expect(['low', 'mid', 'high']).toContain(p.reactivity.band)
      p.children.forEach(walk)
    }
    walk(generateMachine(config))
  })
})
