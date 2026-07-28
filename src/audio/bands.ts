// Single source of truth for the frequency-band split.
// Log-spaced over 20 Hz–16 kHz into 7 bands (sub … air). Consumers use
// indices, never the count or the Hz ranges directly.

export const BAND_DEFS = [
  { fromHz: 20, toHz: 54 }, // 0 sub
  { fromHz: 54, toHz: 144 }, // 1 bass
  { fromHz: 144, toHz: 386 }, // 2 low-mid
  { fromHz: 386, toHz: 1036 }, // 3 mid
  { fromHz: 1036, toHz: 2778 }, // 4 high-mid
  { fromHz: 2778, toHz: 7454 }, // 5 presence
  { fromHz: 7454, toHz: 16000 }, // 6 air
] as const

export const BAND_COUNT = BAND_DEFS.length

/** Semantic alias: the lowest band (kick / sub). */
export const KICK_BAND = 0

/** Semantic alias: the top band (air / brilliance). */
export const HIGH_BAND = BAND_COUNT - 1
