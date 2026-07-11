import { describe, it, expect } from 'vitest'
import { computeRms, bandLevel, SpectralFlux } from './features'

describe('computeRms', () => {
  it('is 0 for silence and ~0.707 for a full-scale sine', () => {
    expect(computeRms(new Float32Array(1024))).toBe(0)
    const sine = new Float32Array(1024)
    for (let i = 0; i < sine.length; i++) sine[i] = Math.sin((i / sine.length) * Math.PI * 2 * 8)
    expect(computeRms(sine)).toBeCloseTo(Math.SQRT1_2, 2)
  })
})

describe('bandLevel', () => {
  // freqData is normalized magnitudes [0,1] per bin; binHz = sampleRate / fftSize
  it('averages only the bins inside the Hz range', () => {
    const freq = new Float32Array(512).fill(0)
    freq[10] = 1 // with binHz ~46.9 (48000/1024), bin 10 ≈ 469 Hz
    const level = bandLevel(freq, 48000, 1024, 400, 600)
    expect(level).toBeGreaterThan(0)
    expect(bandLevel(freq, 48000, 1024, 5000, 10000)).toBe(0)
  })
})

describe('SpectralFlux', () => {
  it('fires an onset on a sudden spectral jump, not on steady state', () => {
    const flux = new SpectralFlux(64)
    const quiet = new Float32Array(64).fill(0.05)
    const loud = new Float32Array(64).fill(0.9)
    // establish steady baseline
    for (let i = 0; i < 30; i++) expect(flux.update(quiet, 1.5).onset).toBe(false)
    // sudden jump -> onset
    expect(flux.update(loud, 1.5).onset).toBe(true)
    // sustained loud is not a new onset
    expect(flux.update(loud, 1.5).onset).toBe(false)
  })
})
