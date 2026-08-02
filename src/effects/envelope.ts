// Frame-rate-independent exponential approach for the punch-in envelope.
// `attack`/`release` are time-constants in seconds (0 = instant snap).
export function advancePunch(
  current: number,
  target: number,
  attack: number,
  release: number,
  dt: number,
): number {
  const tc = target > current ? attack : release
  if (tc <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tc))
}
