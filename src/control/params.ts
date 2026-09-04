export type ParamGroup = 'machine' | 'effects' | 'camera' | 'audio' | 'auto' | 'punch' | 'hud'

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

/** Upper bound of simultaneously tracked HUD parts. hud.targets ranges over it
 *  and src/hud preallocates against it; it lives here (not in src/hud) so this
 *  registry keeps zero three/DOM imports. */
export const MAX_TRACKED = 8

export const PARAMS: readonly ParamDef[] = [
  // machine
  { id: 'machine.pattern', label: 'Pattern', group: 'machine', min: 0, max: 1, default: 0, step: 1, toggle: true },
  { id: 'machine.seed', label: 'Seed', group: 'machine', min: 0, max: 9999, default: 1, step: 1 },
  { id: 'machine.complexity', label: 'Complexity', group: 'machine', min: 0, max: 1, default: 0.6 },
  { id: 'machine.partCount', label: 'Parts', group: 'machine', min: 4, max: 120, default: 40, step: 1 },
  { id: 'machine.symmetry', label: 'Symmetry', group: 'machine', min: 1, max: 8, default: 2, step: 1 },
  { id: 'machine.scaleSpread', label: 'Scale Spread', group: 'machine', min: 0, max: 1, default: 0.5 },
  { id: 'machine.reactivity', label: 'Reactivity', group: 'machine', min: 0, max: 2, default: 1 },
  { id: 'machine.spinX', label: 'Spin X (tilt)', group: 'machine', min: -1, max: 1, default: 0 },
  { id: 'machine.spinY', label: 'Spin Y (pan)', group: 'machine', min: -1, max: 1, default: 0 },
  { id: 'machine.spinZ', label: 'Spin Z (roll)', group: 'machine', min: -1, max: 1, default: 0 },
  // effects
  { id: 'effects.glitch', label: 'Glitch', group: 'effects', min: 0, max: 1, default: 0.3 },
  { id: 'effects.bloom', label: 'Bloom', group: 'effects', min: 0, max: 3, default: 0.7 },
  { id: 'effects.chroma', label: 'Chromatic Ab.', group: 'effects', min: 0, max: 1, default: 0.15 },
  { id: 'effects.grain', label: 'Grain', group: 'effects', min: 0, max: 1, default: 0.15 },
  { id: 'effects.vignette', label: 'Vignette', group: 'effects', min: 0, max: 1, default: 0.35 },
  { id: 'effects.scanline', label: 'Scanline', group: 'effects', min: 0, max: 1, default: 0.12 },
  // kick-band energy release — combine any of these
  { id: 'effects.kickRings', label: 'Kick Rings', group: 'effects', min: 0, max: 1, default: 1, toggle: true },
  { id: 'effects.kickParticles', label: 'Kick Particles', group: 'effects', min: 0, max: 1, default: 0, toggle: true },
  { id: 'effects.kickFlash', label: 'Kick Flash', group: 'effects', min: 0, max: 1, default: 1, toggle: true },
  { id: 'effects.empBeam', label: 'EMP Beam', group: 'effects', min: 0, max: 1, default: 1, toggle: true },
  // whole-object stretch glitch (violent vertical / horizontal elongation)
  { id: 'effects.stretchV', label: 'Stretch V', group: 'effects', min: 0, max: 1, default: 0 },
  { id: 'effects.stretchH', label: 'Stretch H', group: 'effects', min: 0, max: 1, default: 0 },
  // punch-in (hold zoom + fisheye)
  { id: 'punch.trigger', label: 'Punch', group: 'punch', min: 0, max: 1, default: 0 },
  { id: 'punch.strength', label: 'Punch Strength', group: 'punch', min: 0, max: 1, default: 1.0 },
  { id: 'punch.warp', label: 'Fisheye Warp', group: 'punch', min: 0, max: 1, default: 0.9 },
  { id: 'punch.attack', label: 'Punch Attack', group: 'punch', min: 0, max: 1, default: 0.08 },
  { id: 'punch.release', label: 'Punch Release', group: 'punch', min: 0, max: 1, default: 0.5 },
  // camera
  { id: 'camera.distance', label: 'Distance', group: 'camera', min: 2, max: 30, default: 11 },
  { id: 'camera.orbitSpeed', label: 'Orbit Speed', group: 'camera', min: -2, max: 2, default: 0.1 },
  { id: 'camera.shake', label: 'Shake', group: 'camera', min: 0, max: 1, default: 0.3 },
  { id: 'camera.fov', label: 'FOV', group: 'camera', min: 20, max: 120, default: 50, step: 1 },
  // audio
  { id: 'audio.gain', label: 'Input Gain', group: 'audio', min: 0, max: 4, default: 1 },
  { id: 'audio.onsetSense', label: 'Onset Sens.', group: 'audio', min: 0.5, max: 4, default: 1.5 },
  // hud (in-canvas measurement overlay — burned into recordings by design)
  { id: 'hud.visible', label: 'HUD', group: 'hud', min: 0, max: 1, default: 1, toggle: true },
  { id: 'hud.opacity', label: 'HUD Opacity', group: 'hud', min: 0, max: 1, default: 0.8 },
  { id: 'hud.targets', label: 'HUD Targets', group: 'hud', min: 0, max: MAX_TRACKED, default: 5, step: 1 },
  { id: 'hud.recBurnIn', label: 'REC Burn-in', group: 'hud', min: 0, max: 1, default: 1, toggle: true },
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

/** Non-throwing lookup for ids from persisted external state (MIDI mappings
 *  can reference params removed in a later app version). */
export function findParam(id: string): ParamDef | undefined {
  return byId.get(id)
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
