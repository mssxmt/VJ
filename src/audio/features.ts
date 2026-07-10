// Pure audio feature extraction. No DOM / Web Audio / three / React imports.

/** RMS of time-domain samples in [-1, 1]. */
export function computeRms(timeData: Float32Array): number {
  let sum = 0
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
  return Math.sqrt(sum / timeData.length)
}

/** Average normalized magnitude over a frequency band. */
export function bandLevel(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  fromHz: number,
  toHz: number,
): number {
  const binHz = sampleRate / fftSize
  const from = Math.max(0, Math.floor(fromHz / binHz))
  const to = Math.min(freqData.length - 1, Math.ceil(toHz / binHz))
  if (to < from) return 0
  let sum = 0
  for (let i = from; i <= to; i++) sum += freqData[i]
  return sum / (to - from + 1)
}

export interface FluxResult {
  onset: boolean
  /** Raw positive spectral flux this frame. */
  flux: number
}

/**
 * Onset detector via positive spectral flux with an adaptive threshold
 * (mean + sensitivity * stddev over a sliding history window).
 * A refractory period prevents machine-gun retriggers.
 */
export class SpectralFlux {
  private prev: Float32Array
  private history: number[] = []
  private cooldown = 0
  constructor(
    bins: number,
    private historySize = 43, // ~0.7s at 60fps
    private refractoryFrames = 6,
  ) {
    this.prev = new Float32Array(bins)
  }

  update(freqData: Float32Array, sensitivity: number): FluxResult {
    let flux = 0
    for (let i = 0; i < freqData.length; i++) {
      const d = freqData[i] - this.prev[i]
      if (d > 0) flux += d
      this.prev[i] = freqData[i]
    }
    const mean = this.history.reduce((a, b) => a + b, 0) / (this.history.length || 1)
    const variance =
      this.history.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (this.history.length || 1)
    const threshold = mean + sensitivity * Math.sqrt(variance)
    const enough = this.history.length >= 10
    const onset = enough && this.cooldown === 0 && flux > threshold && flux > 0.01
    this.history.push(flux)
    if (this.history.length > this.historySize) this.history.shift()
    if (onset) this.cooldown = this.refractoryFrames
    else if (this.cooldown > 0) this.cooldown--
    return { onset, flux }
  }
}
