// Tracking-bracket lifecycle: idle → acquiring (staggered type-in) → locked →
// fading → idle. Pure state machine mutated in place so the per-frame path
// allocates nothing; all timing inputs arrive as dt seconds.

export type SlotPhase = 'idle' | 'acquiring' | 'locked' | 'fading'

export interface SlotState {
  phase: SlotPhase
  /** Acquire type-in / bracket-converge progress 0..1. */
  progress: number
  /** Draw opacity 0..1. */
  alpha: number
  /** Seconds the slot's band has stayed below QUIET_LEVEL. */
  quietFor: number
  /** Stagger delay (s) remaining before an acquiring slot starts animating. */
  delay: number
}

/** Band level below which a slot counts as quiet. */
export const QUIET_LEVEL = 0.06
/** Seconds of continuous quiet before a locked slot starts fading. */
export const QUIET_HOLD = 2.2
/** Seconds for the acquire type-in animation. */
export const ACQUIRE_TIME = 0.45
/** Band level that wakes an idle/fading slot (above QUIET_LEVEL to avoid
 *  flicker at the fade threshold). */
const WAKE_LEVEL = QUIET_LEVEL * 2

export function createSlot(): SlotState {
  return { phase: 'idle', progress: 0, alpha: 0, quietFor: 0, delay: 0 }
}

/** Force re-acquisition (reseed / pattern switch), staggered by `delay` seconds. */
export function triggerAcquire(s: SlotState, delay: number): void {
  s.phase = 'acquiring'
  s.progress = 0
  s.alpha = 0
  s.quietFor = 0
  s.delay = delay
}

// Positional args, not an options object: this runs once per slot per frame
// and an object literal would allocate on the hot path.
export function advanceSlot(s: SlotState, bandLevel: number, onsetEnv: number, dt: number): void {
  const active = bandLevel > WAKE_LEVEL || onsetEnv > 0.5
  switch (s.phase) {
    case 'idle':
      if (active) triggerAcquire(s, 0)
      break
    case 'acquiring':
      if (s.delay > 0) {
        s.delay = Math.max(0, s.delay - dt)
        break
      }
      s.progress = Math.min(1, s.progress + dt / ACQUIRE_TIME)
      s.alpha = s.progress
      if (s.progress >= 1) s.phase = 'locked'
      break
    case 'locked':
      s.alpha = Math.min(1, s.alpha + dt * 4)
      if (bandLevel < QUIET_LEVEL) {
        s.quietFor += dt
        if (s.quietFor > QUIET_HOLD) s.phase = 'fading'
      } else {
        s.quietFor = 0
      }
      break
    case 'fading':
      if (active) {
        triggerAcquire(s, 0)
        break
      }
      // Frame-rate independent decay (house pattern).
      s.alpha *= Math.pow(0.9, dt * 60)
      if (s.alpha < 0.02) {
        s.phase = 'idle'
        s.alpha = 0
        s.progress = 0
        s.quietFor = 0
      }
      break
  }
}

/** Peripheral telemetry opacity: never fully dark (a dead screen would read as
 *  a technical failure on stage), breathing up toward 1 with the music. */
export function telemetryAlpha(rms: number, onsetEnv: number): number {
  return Math.min(1, 0.3 + rms * 1.6 + onsetEnv * 0.25)
}
