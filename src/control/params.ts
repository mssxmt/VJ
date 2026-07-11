export type ParamGroup = 'machine' | 'effects' | 'camera' | 'audio' | 'auto'

export interface ParamDef {
  id: string
  label: string
  group: ParamGroup
  min: number
  max: number
  default: number
  step?: number
  /** Treated as on/off toggle in UI (min=0, max=1). */
  toggle?: boolean
}

export const PARAMS: readonly ParamDef[] = [
  // machine
  { id: 'machine.seed', label: 'Seed', group: 'machine', min: 0, max: 9999, default: 1, step: 1 },
  { id: 'machine.complexity', label: 'Complexity', group: 'machine', min: 0, max: 1, default: 0.6 },
  { id: 'machine.partCount', label: 'Parts', group: 'machine', min: 4, max: 120, default: 40, step: 1 },
  { id: 'machine.symmetry', label: 'Symmetry', group: 'machine', min: 1, max: 8, default: 2, step: 1 },
  { id: 'machine.scaleSpread', label: 'Scale Spread', group: 'machine', min: 0, max: 1, default: 0.5 },
  { id: 'machine.reactivity', label: 'Reactivity', group: 'machine', min: 0, max: 2, default: 1 },
  // effects
  { id: 'effects.glitch', label: 'Glitch', group: 'effects', min: 0, max: 1, default: 0.3 },
  { id: 'effects.bloom', label: 'Bloom', group: 'effects', min: 0, max: 3, default: 1 },
  { id: 'effects.chroma', label: 'Chromatic Ab.', group: 'effects', min: 0, max: 1, default: 0.15 },
  { id: 'effects.pixelate', label: 'Pixelate', group: 'effects', min: 0, max: 1, default: 0 },
  { id: 'effects.noise', label: 'Noise', group: 'effects', min: 0, max: 1, default: 0.1 },
  { id: 'effects.scanline', label: 'Scanline', group: 'effects', min: 0, max: 1, default: 0 },
  // camera
  { id: 'camera.distance', label: 'Distance', group: 'camera', min: 2, max: 30, default: 8 },
  { id: 'camera.orbitSpeed', label: 'Orbit Speed', group: 'camera', min: -2, max: 2, default: 0.1 },
  { id: 'camera.shake', label: 'Shake', group: 'camera', min: 0, max: 1, default: 0.3 },
  { id: 'camera.fov', label: 'FOV', group: 'camera', min: 20, max: 120, default: 50, step: 1 },
  // audio
  { id: 'audio.gain', label: 'Input Gain', group: 'audio', min: 0, max: 4, default: 1 },
  { id: 'audio.onsetSense', label: 'Onset Sens.', group: 'audio', min: 0.5, max: 4, default: 1.5 },
  // auto
  { id: 'auto.master', label: 'AUTO', group: 'auto', min: 0, max: 1, default: 0, toggle: true },
  { id: 'auto.machine', label: 'Auto Machine', group: 'auto', min: 0, max: 1, default: 1, toggle: true },
  { id: 'auto.effects', label: 'Auto Effects', group: 'auto', min: 0, max: 1, default: 1, toggle: true },
  { id: 'auto.camera', label: 'Auto Camera', group: 'auto', min: 0, max: 1, default: 1, toggle: true },
]

const byId = new Map(PARAMS.map((p) => [p.id, p]))

export function getParam(id: string): ParamDef {
  const def = byId.get(id)
  if (!def) throw new Error(`Unknown param: ${id}`)
  return def
}

/** Map a normalized [0,1] value (e.g. MIDI CC) into the param's range. */
export function clamp01ToRange(p: ParamDef, v01: number): number {
  const v = Math.min(1, Math.max(0, v01))
  const raw = p.min + v * (p.max - p.min)
  return p.step ? Math.round(raw / p.step) * p.step : raw
}

/** Map a param-range value to normalized [0,1]. */
export function rangeTo01(p: ParamDef, v: number): number {
  return (Math.min(p.max, Math.max(p.min, v)) - p.min) / (p.max - p.min)
}
