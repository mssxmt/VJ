import { describe, it, expect, beforeEach } from 'vitest'
import { useParamStore, modulation, effectiveValue, resetParams } from './store'

describe('param store', () => {
  beforeEach(() => {
    resetParams()
    modulation.clear()
  })
  it('initializes with defaults', () => {
    expect(useParamStore.getState().values['effects.glitch']).toBe(0.3)
  })
  it('setParam clamps to range', () => {
    useParamStore.getState().setParam('effects.glitch', 99)
    expect(useParamStore.getState().values['effects.glitch']).toBe(1)
  })
  it('effectiveValue = base + modulation, clamped to range', () => {
    useParamStore.getState().setParam('effects.glitch', 0.5)
    modulation.set('effects.glitch', 0.3)
    expect(effectiveValue('effects.glitch')).toBeCloseTo(0.8)
    modulation.set('effects.glitch', 5)
    expect(effectiveValue('effects.glitch')).toBe(1) // clamped to max
  })
})
