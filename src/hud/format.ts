// Pure formatting for the HUD readouts. No DOM / three imports so the whole
// module stays unit-testable in node. Vocabulary is deliberately app-native
// (SEED / PRT / SYM / BND) — never the reference image's TRK/LOCK strings.

/** 'SEED 0847' — zero-padded, clamped to the machine.seed range. */
export function formatSeed(seed: number): string {
  const s = Math.max(0, Math.min(9999, Math.round(seed)))
  return `SEED ${String(s).padStart(4, '0')}`
}

export function formatPattern(isOrganism: boolean): string {
  return isOrganism ? 'ORG' : 'MCH'
}

/** 'PRT 07' — tracked-part identifier. */
export function formatPartLabel(id: number): string {
  return `PRT ${String(Math.max(0, Math.round(id))).padStart(2, '0')}`
}

/** 'D2.42' — real camera distance. Depth instead of X/Y keeps the readout honest
 *  about what the app actually measures (screen coords would be decoration).
 *  Two decimals on purpose: the tail digit churns with the orbit and scatter,
 *  which is what makes the instrument read as live. */
export function formatDistance(d: number): string {
  return `D${Math.max(0, d).toFixed(2)}`
}

/** 'mm:ss' elapsed, rolling to 'h:mm:ss' above an hour (sets run long). */
export function formatTimecode(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds))
  const m = Math.floor(t / 60) % 60
  const s = t % 60
  const h = Math.floor(t / 3600)
  const ms = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h > 0 ? `${h}:${ms}` : ms
}

export function formatRms(rms: number): string {
  return `RMS ${Math.min(1, Math.max(0, rms)).toFixed(3)}`
}

/** 'AZ 143.2 · EL +12.4' — real camera bearing around the object. autoRotate
 *  keeps the azimuth moving every frame, so this line churns even in silence. */
export function formatAzEl(azDeg: number, elDeg: number): string {
  const az = ((azDeg % 360) + 360) % 360
  const el = Math.max(-90, Math.min(90, elDeg))
  const sign = el < 0 ? '-' : '+'
  return `AZ ${az.toFixed(1)} · EL ${sign}${Math.abs(el).toFixed(1)}`
}

/** 'T 01:02.4' session clock with tenths, rolling to 'T h:mm:ss.d'. The tenths
 *  digit ticks 10x/s — the guaranteed always-moving readout. */
export function formatClock(seconds: number): string {
  const t = Math.max(0, seconds)
  const tenth = Math.floor((t % 1) * 10)
  const whole = Math.floor(t)
  const m = Math.floor(whole / 60) % 60
  const s = whole % 60
  const h = Math.floor(whole / 3600)
  const ms = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenth}`
  return h > 0 ? `T ${h}:${ms}` : `T ${ms}`
}

/** Quantize band levels to integer bar steps so the meter draws crisp rows.
 *  Writes into `out` when given — the HUD calls this every frame. */
export function bandBarLevels(bands: readonly number[], steps: number, out: number[] = []): number[] {
  out.length = bands.length
  for (let i = 0; i < bands.length; i++) {
    out[i] = Math.round(Math.min(1, Math.max(0, bands[i])) * steps)
  }
  return out
}

/** Left slice of a label revealed by the acquire type-in progress (0..1). */
export function typeSlice(text: string, progress: number): string {
  const p = Math.min(1, Math.max(0, progress))
  return text.slice(0, Math.round(text.length * p))
}
