import { describe, it, expect } from 'vitest'
import {
  formatSeed,
  formatPattern,
  formatPartLabel,
  formatDistance,
  formatTimecode,
  formatRms,
  bandBarLevels,
  typeSlice,
} from './format'

describe('formatSeed', () => {
  it('zero-pads to 4 digits', () => {
    expect(formatSeed(847)).toBe('SEED 0847')
    expect(formatSeed(1)).toBe('SEED 0001')
  })
  it('clamps to the seed range', () => {
    expect(formatSeed(-5)).toBe('SEED 0000')
    expect(formatSeed(123456)).toBe('SEED 9999')
  })
})

describe('formatPattern', () => {
  it('maps pattern flag to app vocabulary', () => {
    expect(formatPattern(false)).toBe('MCH')
    expect(formatPattern(true)).toBe('ORG')
  })
})

describe('formatPartLabel', () => {
  it('zero-pads to 2 digits', () => {
    expect(formatPartLabel(7)).toBe('PRT 07')
    expect(formatPartLabel(42)).toBe('PRT 42')
  })
})

describe('formatDistance', () => {
  it('renders one decimal with D prefix', () => {
    expect(formatDistance(2.41)).toBe('D2.4')
    expect(formatDistance(11)).toBe('D11.0')
  })
  it('never goes negative', () => {
    expect(formatDistance(-3)).toBe('D0.0')
  })
})

describe('formatTimecode', () => {
  it('renders mm:ss', () => {
    expect(formatTimecode(0)).toBe('00:00')
    expect(formatTimecode(62)).toBe('01:02')
    expect(formatTimecode(600)).toBe('10:00')
  })
  it('rolls over to h:mm:ss above an hour', () => {
    expect(formatTimecode(3599)).toBe('59:59')
    expect(formatTimecode(3600)).toBe('1:00:00')
    expect(formatTimecode(3600 + 62)).toBe('1:01:02')
    expect(formatTimecode(360000)).toBe('100:00:00')
  })
})

describe('formatRms', () => {
  it('renders two decimals clamped to 0..1', () => {
    expect(formatRms(0.312)).toBe('RMS 0.31')
    expect(formatRms(1.7)).toBe('RMS 1.00')
    expect(formatRms(-0.2)).toBe('RMS 0.00')
  })
})

describe('bandBarLevels', () => {
  it('quantizes levels to integer steps', () => {
    expect(bandBarLevels([0, 0.5, 1], 8)).toEqual([0, 4, 8])
  })
  it('clamps out-of-range levels', () => {
    expect(bandBarLevels([-1, 2], 8)).toEqual([0, 8])
  })
  it('reuses the out array (per-frame call site)', () => {
    const out: number[] = []
    expect(bandBarLevels([0.5], 8, out)).toBe(out)
    expect(out).toEqual([4])
    bandBarLevels([1, 0], 8, out)
    expect(out).toEqual([8, 0])
  })
})

describe('typeSlice', () => {
  it('reveals the left slice by progress', () => {
    expect(typeSlice('PRT 07', 0)).toBe('')
    expect(typeSlice('PRT 07', 0.5)).toBe('PRT')
    expect(typeSlice('PRT 07', 1)).toBe('PRT 07')
  })
  it('clamps progress outside 0..1', () => {
    expect(typeSlice('AB', -1)).toBe('')
    expect(typeSlice('AB', 2)).toBe('AB')
  })
})
