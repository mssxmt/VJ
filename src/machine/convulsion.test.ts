import { describe, it, expect } from 'vitest'
import {
  createConvulsionClock,
  shouldConvulse,
  convulsePoses,
  CONVULSE_REFRACTORY,
} from './convulsion'

describe('shouldConvulse', () => {
  it('fires on an onset and stamps the clock', () => {
    const clock = createConvulsionClock()
    expect(shouldConvulse(clock, 1.0, true)).toBe(true)
    expect(clock.count).toBe(1)
  })
  it('never fires without an onset', () => {
    const clock = createConvulsionClock()
    expect(shouldConvulse(clock, 1.0, false)).toBe(false)
    expect(clock.count).toBe(0)
  })
  it('rejects onsets inside the refractory window, accepts after it', () => {
    const clock = createConvulsionClock()
    expect(shouldConvulse(clock, 1.0, true)).toBe(true)
    expect(shouldConvulse(clock, 1.0 + CONVULSE_REFRACTORY * 0.5, true)).toBe(false)
    expect(shouldConvulse(clock, 1.0 + CONVULSE_REFRACTORY + 0.01, true)).toBe(true)
    expect(clock.count).toBe(2)
  })
})

describe('convulsePoses', () => {
  const counts = () => new Uint8Array([1, 4, 4, 4]) // index 0 = fixed root

  it('is deterministic for the same event seed', () => {
    const a = new Uint8Array(8)
    const b = new Uint8Array(8)
    convulsePoses(a, counts(), 2, 1, 123)
    convulsePoses(b, counts(), 2, 1, 123)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
  it('switches every eligible part at probability 1, to a DIFFERENT pose', () => {
    const idx = new Uint8Array(8)
    const n = convulsePoses(idx, counts(), 2, 1, 7)
    expect(n).toBe(6) // 3 eligible parts x 2 copies
    for (let c = 0; c < 2; c++)
      for (let p = 1; p < 4; p++) {
        const v = idx[c * 4 + p]
        expect(v).toBeGreaterThan(0)
        expect(v).toBeLessThan(4)
      }
  })
  it('switches nothing at probability 0', () => {
    const idx = new Uint8Array(8)
    expect(convulsePoses(idx, counts(), 2, 0, 7)).toBe(0)
    expect(Array.from(idx)).toEqual(new Array(8).fill(0))
  })
  it('never touches fixed parts (pose count 1)', () => {
    const idx = new Uint8Array(8)
    convulsePoses(idx, counts(), 2, 1, 99)
    expect(idx[0]).toBe(0)
    expect(idx[4]).toBe(0)
  })
  it('always lands on a different pose than the current one', () => {
    const c = new Uint8Array([4])
    for (let seed = 0; seed < 50; seed++) {
      const idx = new Uint8Array([2])
      if (convulsePoses(idx, c, 1, 1, seed) === 1) expect(idx[0]).not.toBe(2)
    }
  })
  it('biases displaced parts toward reforming to pose 0 (loose distribution)', () => {
    const c = new Uint8Array([4])
    let reformed = 0
    const RUNS = 400
    for (let seed = 0; seed < RUNS; seed++) {
      const idx = new Uint8Array([2])
      convulsePoses(idx, c, 1, 1, seed)
      if (idx[0] === 0) reformed++
    }
    // REFORM_BIAS 0.4 plus a 1-in-3 uniform fallback to 0: expect roughly
    // 0.4 + 0.6/3 = 0.6 — assert a loose window, not exact draws.
    expect(reformed / RUNS).toBeGreaterThan(0.4)
    expect(reformed / RUNS).toBeLessThan(0.8)
  })
  it('halves the switch rate for damped (has-children) parts', () => {
    const n = 64
    const counts = new Uint8Array(n).fill(4)
    const damp = new Uint8Array(n).fill(1)
    let undamped = 0
    let damped = 0
    for (let seed = 0; seed < 40; seed++) {
      undamped += convulsePoses(new Uint8Array(n), counts, 1, 0.8, seed)
      damped += convulsePoses(new Uint8Array(n), counts, 1, 0.8, seed, damp)
    }
    expect(damped).toBeGreaterThan(0)
    expect(damped).toBeLessThan(undamped)
  })
})
