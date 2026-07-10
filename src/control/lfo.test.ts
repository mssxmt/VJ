import { describe, it, expect } from 'vitest'
import { lfoValue } from './lfo'

describe('lfoValue', () => {
  it('sine: 0 at t=0, ~1 at quarter period', () => {
    expect(lfoValue('sine', 0, 1)).toBeCloseTo(0)
    expect(lfoValue('sine', 0.25, 1)).toBeCloseTo(1)
  })
  it('square: -1 or +1 only', () => {
    expect([-1, 1]).toContain(lfoValue('square', 0.1, 1))
    expect([-1, 1]).toContain(lfoValue('square', 0.6, 1))
  })
  it('saw ramps from -1 to 1 over a period', () => {
    expect(lfoValue('saw', 0, 1)).toBeCloseTo(-1)
    expect(lfoValue('saw', 0.999, 1)).toBeCloseTo(1, 1)
  })
})
