// Shared mutable audio frame. No DOM / three / React imports.

/** Mutable per-frame audio features. Read directly inside useFrame — never via React state. */
export interface AudioFrame {
  rms: number
  low: number
  mid: number
  high: number
  onset: boolean
  /** Envelope that spikes to 1 on onset then decays; drives punch animations. */
  onsetEnv: number
  time: number
}

export const audioFrame: AudioFrame = {
  rms: 0,
  low: 0,
  mid: 0,
  high: 0,
  onset: false,
  onsetEnv: 0,
  time: 0,
}

/** Apply exponential decay used when no fresh analysis data is available. */
export function decayFrame(f: AudioFrame, factor: number): void {
  f.low *= factor
  f.mid *= factor
  f.high *= factor
  f.rms *= factor
  f.onsetEnv *= factor
  f.onset = false
}
