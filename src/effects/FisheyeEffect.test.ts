import { describe, it, expect } from 'vitest'
import { barrelUv } from './FisheyeEffect'

describe('barrelUv', () => {
  it('is identity at intensity 0', () => {
    expect(barrelUv([0.3, 0.7], 0)).toEqual([0.3, 0.7])
  })
  it('leaves the center fixed', () => {
    expect(barrelUv([0.5, 0.5], 1)).toEqual([0.5, 0.5])
  })
  it('pushes off-center points outward for intensity > 0', () => {
    const [u] = barrelUv([1, 0.5], 0.5)
    expect(u).toBeGreaterThan(1)
  })
})
