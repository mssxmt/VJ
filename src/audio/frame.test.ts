import { describe, it, expect } from 'vitest'
import { audioFrame, decayFrame } from './frame'
import { BAND_COUNT } from './bands'

describe('audioFrame', () => {
  it('decays every band toward zero and clears onset', () => {
    for (let i = 0; i < BAND_COUNT; i++) audioFrame.bands[i] = 1
    audioFrame.onset = true
    decayFrame(audioFrame, 0.5)
    for (let i = 0; i < BAND_COUNT; i++) expect(audioFrame.bands[i]).toBeLessThan(1)
    expect(audioFrame.onset).toBe(false)
  })

  it('has BAND_COUNT band slots', () => {
    expect(audioFrame.bands.length).toBe(BAND_COUNT)
  })

  it('exposes punch starting at 0 and decayFrame leaves it untouched', () => {
    expect(audioFrame.punch).toBe(0)
    const f = { ...audioFrame, punch: 0.7 }
    decayFrame(f, 0.5)
    expect(f.punch).toBe(0.7) // punch is user-driven, not audio-decayed
  })
})
