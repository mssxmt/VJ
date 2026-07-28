// Shared mutable audio frame. No DOM / three / React imports.

import { BAND_COUNT } from './bands'

/** Mutable per-frame audio features. Read directly inside useFrame — never via React state. */
export interface AudioFrame {
  rms: number
  /** Per-band levels (length BAND_COUNT), smoothed fast-attack/slow-release. */
  bands: number[]
  onset: boolean
  /** Envelope that spikes to 1 on onset then decays; drives punch animations. */
  onsetEnv: number
  time: number
}

export const audioFrame: AudioFrame = {
  rms: 0,
  bands: new Array<number>(BAND_COUNT).fill(0),
  onset: false,
  onsetEnv: 0,
  time: 0,
}

/** Apply exponential decay used when no fresh analysis data is available. */
export function decayFrame(f: AudioFrame, factor: number): void {
  const b = f.bands
  for (let i = 0; i < b.length; i++) b[i] *= factor
  f.rms *= factor
  f.onsetEnv *= factor
  f.onset = false
}
