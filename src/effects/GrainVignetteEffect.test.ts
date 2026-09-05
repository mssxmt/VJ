import { describe, it, expect } from 'vitest'
import { vignetteFactor } from './GrainVignetteEffect'

describe('vignetteFactor', () => {
  it('is identity at amount 0', () => {
    expect(vignetteFactor([0, 0], 0)).toBe(1)
    expect(vignetteFactor([0.9, 0.1], 0)).toBe(1)
  })
  it('leaves the center untouched at any amount', () => {
    expect(vignetteFactor([0.5, 0.5], 1)).toBe(1)
  })
  it('darkens the corner by the full amount', () => {
    expect(vignetteFactor([0, 0], 0.4)).toBeCloseTo(0.6)
  })
  it('falls off monotonically from center to corner', () => {
    const mid = vignetteFactor([0.25, 0.25], 0.5)
    const corner = vignetteFactor([0, 0], 0.5)
    expect(mid).toBeLessThanOrEqual(1)
    expect(corner).toBeLessThan(mid)
  })
})
