import { describe, it, expect } from 'vitest'
import { audioFrame, decayFrame } from './frame'

describe('audioFrame', () => {
  it('decays band envelopes toward zero and clears onset', () => {
    audioFrame.low = 1
    audioFrame.onset = true
    decayFrame(audioFrame, 0.5)
    expect(audioFrame.low).toBeLessThan(1)
    expect(audioFrame.onset).toBe(false)
  })
})
