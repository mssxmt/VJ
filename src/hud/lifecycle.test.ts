import { describe, it, expect } from 'vitest'
import {
  createSlot,
  triggerAcquire,
  advanceSlot,
  telemetryAlpha,
  ACQUIRE_TIME,
  QUIET_HOLD,
  QUIET_LEVEL,
} from './lifecycle'

const DT = 1 / 60
const ACTIVE = 0.5

function advanceFor(
  slot: ReturnType<typeof createSlot>,
  bandLevel: number,
  onsetEnv: number,
  seconds: number,
) {
  const steps = Math.ceil(seconds / DT)
  for (let i = 0; i < steps; i++) advanceSlot(slot, bandLevel, onsetEnv, DT)
}

describe('slot lifecycle', () => {
  it('starts idle and invisible', () => {
    const s = createSlot()
    expect(s.phase).toBe('idle')
    expect(s.alpha).toBe(0)
  })

  it('stays idle while the band is quiet', () => {
    const s = createSlot()
    advanceFor(s, 0, 0, 1)
    expect(s.phase).toBe('idle')
    expect(s.alpha).toBe(0)
  })

  it('wakes to acquiring when the band becomes active', () => {
    const s = createSlot()
    advanceSlot(s, ACTIVE, 0, DT)
    expect(s.phase).toBe('acquiring')
  })

  it('wakes on onset even when the band is quiet', () => {
    const s = createSlot()
    advanceSlot(s, 0, 1, DT)
    expect(s.phase).toBe('acquiring')
  })

  it('reaches locked after the acquire time', () => {
    const s = createSlot()
    triggerAcquire(s, 0)
    advanceFor(s, ACTIVE, 0, ACQUIRE_TIME + 0.1)
    expect(s.phase).toBe('locked')
    expect(s.progress).toBe(1)
  })

  it('honors the stagger delay before animating', () => {
    const s = createSlot()
    triggerAcquire(s, 0.5)
    advanceFor(s, ACTIVE, 0, 0.3)
    expect(s.progress).toBe(0)
    advanceFor(s, ACTIVE, 0, 0.5 + ACQUIRE_TIME)
    expect(s.phase).toBe('locked')
  })

  it('fades after sustained quiet, then returns to idle', () => {
    const s = createSlot()
    triggerAcquire(s, 0)
    advanceFor(s, ACTIVE, 0, ACQUIRE_TIME + 0.1)
    advanceFor(s, 0, 0, QUIET_HOLD + 0.1)
    expect(s.phase).toBe('fading')
    advanceFor(s, 0, 0, 3)
    expect(s.phase).toBe('idle')
    expect(s.alpha).toBe(0)
  })

  it('re-acquires from fading when the band comes back', () => {
    const s = createSlot()
    triggerAcquire(s, 0)
    advanceFor(s, ACTIVE, 0, ACQUIRE_TIME + 0.1)
    advanceFor(s, 0, 0, QUIET_HOLD + 0.2)
    expect(s.phase).toBe('fading')
    advanceSlot(s, ACTIVE, 0, DT)
    expect(s.phase).toBe('acquiring')
  })

  it('does not fade while the band stays above the quiet level', () => {
    const s = createSlot()
    triggerAcquire(s, 0)
    advanceFor(s, QUIET_LEVEL * 2, 0, ACQUIRE_TIME + QUIET_HOLD + 1)
    expect(s.phase).toBe('locked')
  })
})

describe('telemetryAlpha', () => {
  it('has a visible floor at silence', () => {
    expect(telemetryAlpha(0, 0)).toBeCloseTo(0.3)
  })
  it('rises with rms and caps at 1', () => {
    expect(telemetryAlpha(0.2, 0)).toBeGreaterThan(0.3)
    expect(telemetryAlpha(1, 1)).toBe(1)
  })
})
