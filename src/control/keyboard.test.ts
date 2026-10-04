import { describe, it, expect, beforeEach } from 'vitest'
import { handleKey } from './keyboard'
import { useParamStore, resetParams } from './store'

describe('handleKey', () => {
  beforeEach(() => resetParams())
  it('space toggles AUTO', () => {
    handleKey(' ')
    expect(useParamStore.getState().values['auto.master']).toBe(1)
    handleKey(' ')
    expect(useParamStore.getState().values['auto.master']).toBe(0)
  })
  it('r regenerates the machine (seed changes)', () => {
    const before = useParamStore.getState().values['machine.seed']
    handleKey('r')
    expect(useParamStore.getState().values['machine.seed']).not.toBe(before)
  })
  it('g toggles glitch between 0 and default', () => {
    handleKey('g')
    expect(useParamStore.getState().values['effects.glitch']).toBe(0)
    handleKey('g')
    expect(useParamStore.getState().values['effects.glitch']).toBeGreaterThan(0)
  })
  it('t toggles the HUD between 0 and default', () => {
    handleKey('t')
    expect(useParamStore.getState().values['hud.visible']).toBe(0)
    handleKey('t')
    expect(useParamStore.getState().values['hud.visible']).toBe(1)
  })
  it('returns handled flag', () => {
    expect(handleKey('r')).toBe(true)
    expect(handleKey('!')).toBe(false)
  })
})
