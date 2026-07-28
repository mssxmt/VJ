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

  it('uses a half-open bin range so adjacent bands share no bin', () => {
    // binHz = 48000/1024 = 46.875. Band boundary at BAND_DEFS[0].toHz = 52 Hz
    // -> boundary bin = floor(52 / 46.875) = 1. With half-open [from, to),
    // bin 1 belongs to the UPPER band only.
    const freq = new Float32Array(512).fill(0)
    freq[1] = 1
    expect(bandLevel(freq, 48000, 1024, 20, 52)).toBe(0) // lower band: bin 1 excluded
    expect(bandLevel(freq, 48000, 1024, 52, 136)).toBeGreaterThan(0) // upper band: bin 1 included
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
