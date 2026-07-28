// Single source of truth for the frequency-band split.
// Log-spaced over 20 Hz–16 kHz into 7 bands via one geometric ratio
// (r = (16000/20)^(1/7) ≈ 2.609), so every interval has the same ratio.
// Consumers use indices, never the count or the Hz ranges directly.

export const BAND_DEFS = [
  { fromHz: 20, toHz: 52 }, // 0 sub
  { fromHz: 52, toHz: 136 }, // 1 bass
  { fromHz: 136, toHz: 355 }, // 2 low-mid
  { fromHz: 355, toHz: 926 }, // 3 mid
  { fromHz: 926, toHz: 2415 }, // 4 high-mid
  { fromHz: 2415, toHz: 6302 }, // 5 presence
  { fromHz: 6302, toHz: 16000 }, // 6 air
] as const

export const BAND_COUNT = BAND_DEFS.length

/** Semantic alias: the lowest band (kick / sub). */
export const KICK_BAND = 0

/** Semantic alias: the top band (air / brilliance). */
export const HIGH_BAND = BAND_COUNT - 1
