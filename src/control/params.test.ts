import { describe, it, expect } from 'vitest'
import { PARAMS, getParam, clamp01ToRange, rangeTo01 } from './params'

describe('parameter registry', () => {
  it('has unique ids', () => {
    const ids = PARAMS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('defaults are within range', () => {
    for (const p of PARAMS) {
      expect(p.default).toBeGreaterThanOrEqual(p.min)
      expect(p.default).toBeLessThanOrEqual(p.max)
    }
  })
  it('getParam returns def or throws for unknown id', () => {
    expect(getParam('machine.seed').id).toBe('machine.seed')
    expect(() => getParam('nope')).toThrow()
  })
  it('maps normalized 0-1 values to param range and back', () => {
    const p = getParam('effects.glitch')
    expect(clamp01ToRange(p, 0)).toBe(p.min)
    expect(clamp01ToRange(p, 1)).toBe(p.max)
    expect(rangeTo01(p, p.min)).toBe(0)
    expect(rangeTo01(p, p.max)).toBe(1)
  })
})
