// Convulsion: Gantz-Graf-style instantaneous reconfiguration. Parts snap
// between precomputed grammar-legal poses on audio onsets — quantized jumps,
// never tweens. Pure decision logic (no three imports) so the event gating and
// pose switching stay unit-testable; MachineObject applies the indices.
import { createRng } from '../lib/random'

export interface ConvulsionClock {
  /** Time (s) of the last accepted event. */
  last: number
  /** Events fired since generation — feeds the per-event RNG seed. */
  count: number
}

/** Minimum gap between events so dense onsets read as beats, not vibration. */
export const CONVULSE_REFRACTORY = 0.15

export function createConvulsionClock(): ConvulsionClock {
  return { last: -Infinity, count: 0 }
}

/** Gate onsets into discrete convulsion events with a refractory window. */
export function shouldConvulse(
  clock: ConvulsionClock,
  now: number,
  onset: boolean,
  refractory = CONVULSE_REFRACTORY,
): boolean {
  if (!onset || now - clock.last < refractory) return false
  clock.last = now
  clock.count++
  return true
}

/** Probability that a displaced part snaps HOME instead of to another
 *  alternate. Without this bias the steady state drifts to ~75% non-primary —
 *  permanent dissolution — where Gantz Graf is RE-configuration: the object
 *  keeps returning to a recognizable form between spasms. */
export const REFORM_BIAS = 0.4

/**
 * Instantly re-pose a seeded subset of parts. `poseCounts[p]` is the number of
 * precomputed poses for flat part p (1 = anchored, never switches). `damp[p]`
 * (optional) halves the switch probability — used for parts with children,
 * whose subtree would otherwise be orphaned mid-air every other beat. Mutates
 * `poseIdx` (length copies * poseCounts.length) in place and returns how many
 * meshes switched. Deterministic per eventSeed.
 */
export function convulsePoses(
  poseIdx: Uint8Array,
  poseCounts: Uint8Array,
  copies: number,
  probability: number,
  eventSeed: number,
  damp?: Uint8Array,
): number {
  if (probability <= 0) return 0
  const rng = createRng(eventSeed >>> 0)
  const n = poseCounts.length
  let switched = 0
  for (let c = 0; c < copies; c++) {
    for (let p = 0; p < n; p++) {
      const count = poseCounts[p]
      if (count <= 1) continue
      const pEff = damp && damp[p] ? probability * 0.5 : probability
      if (rng() >= pEff) continue
      const i = c * n + p
      const cur = poseIdx[i]
      if (cur !== 0 && rng() < REFORM_BIAS) {
        poseIdx[i] = 0
      } else {
        // Jump to a DIFFERENT pose — a no-op switch would read as a dropped beat.
        poseIdx[i] = (cur + 1 + Math.floor(rng() * (count - 1))) % count
      }
      switched++
    }
  }
  return switched
}
