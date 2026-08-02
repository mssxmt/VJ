import { describe, it, expect } from 'vitest'
import { advancePunch } from './envelope'

describe('advancePunch', () => {
  it('snaps instantly when the relevant time-constant is 0', () => {
    expect(advancePunch(0, 1, 0, 0.5, 0.016)).toBe(1) // attack 0 -> instant rise
    expect(advancePunch(1, 0, 0.5, 0, 0.016)).toBe(0) // release 0 -> instant fall
  })
  it('moves partway toward target with a positive time-constant', () => {
    const r = advancePunch(0, 1, 0.3, 0.5, 0.016)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })
  it('converges to target over many frames', () => {
    let v = 0
    for (let i = 0; i < 1000; i++) v = advancePunch(v, 1, 0.2, 0.2, 0.016)
    expect(v).toBeGreaterThan(0.99)
  })
  it('is frame-rate independent (same end value for different dt sums)', () => {
    const big = advancePunch(0, 1, 0.3, 0.3, 0.1)
    let acc = 0
    for (let i = 0; i < 10; i++) acc = advancePunch(acc, 1, 0.3, 0.3, 0.01)
    expect(acc).toBeCloseTo(big, 2)
  })
})
