import { describe, it, expect } from 'vitest'
import { generateMachine, generateOrganism, countParts, type MachineConfig } from './generate'

const config: MachineConfig = {
  seed: 42, pattern: 'machine', complexity: 0.6, partCount: 40, symmetry: 2, scaleSpread: 0.5,
}

const organismConfig: MachineConfig = {
  seed: 42, pattern: 'organism', complexity: 0.6, partCount: 40, symmetry: 2, scaleSpread: 0.5,
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
  it('every part has valid reactivity band', () => {
    const walk = (p: ReturnType<typeof generateOrganism>): void => {
      expect(['low', 'mid', 'high']).toContain(p.reactivity.band)
      p.children.forEach(walk)
    }
    walk(generateOrganism(organismConfig))
  })
  it('root is a nucleus', () => {
    expect(generateOrganism(organismConfig).type).toBe('nucleus')
  })
  it('includes exactly one membrane shell when partCount > 1', () => {
    const countMembranes = (p: ReturnType<typeof generateOrganism>): number =>
      (p.type === 'membrane' ? 1 : 0) + p.children.reduce((n, c) => n + countMembranes(c), 0)
    expect(countMembranes(generateOrganism(organismConfig))).toBe(1)
    expect(countMembranes(generateOrganism({ ...organismConfig, partCount: 4 }))).toBe(1)
  })
  it('omits the membrane when partCount === 1', () => {
    const root = generateOrganism({ ...organismConfig, partCount: 1 })
    expect(root.type).toBe('nucleus')
    expect(root.children).toHaveLength(0)
  })
  it('only uses organism part types', () => {
    const allowed = new Set(['nucleus', 'blob', 'bulb', 'stalk', 'tendril', 'membrane'])
    const walk = (p: ReturnType<typeof generateOrganism>): void => {
      expect(allowed.has(p.type)).toBe(true)
      p.children.forEach(walk)
    }
    walk(generateOrganism(organismConfig))
  })
})
