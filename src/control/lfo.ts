export type LfoShape = 'sine' | 'square' | 'saw'

/** Value in [-1, 1] for the given shape at time t (seconds) and rate (Hz). */
export function lfoValue(shape: LfoShape, t: number, rateHz: number, phase = 0): number {
  const x = (t * rateHz + phase) % 1
  switch (shape) {
    case 'sine':
      return Math.sin(x * Math.PI * 2)
    case 'square':
      return x < 0.5 ? 1 : -1
    case 'saw':
      return x * 2 - 1
  }
}
