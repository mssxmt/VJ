import { createRng, pick, range } from '../lib/random'
import { BAND_COUNT } from '../audio/bands'

export type PartType =
  | 'core'
  | 'box'
  | 'pipe'
  | 'fin'
  | 'antenna'
  | 'ring'
  | 'greeble'
  | 'spike'
  | 'bolt'
  | 'cable'
  | 'vent'
  | 'strut'
  // organism part types — smooth fluid-metal masses and flowing tendrils
  | 'nucleus'
  | 'blob'
  | 'bulb'
  | 'stalk'
  | 'tendril'

/** Live switch between the two rendered object patterns. */
export type Pattern = 'machine' | 'organism'

/** Frequency-band index into BAND_DEFS (see src/audio/bands.ts). */
export type Band = number

export interface Reactivity {
  band: Band
  /** Scale punch amount on onset (0..1). */
  punch: number
  /** Continuous rotation speed driven by band level. */
  spin: number
  /** Emissive flash amount driven by band level. */
  flash: number
}

/** One alternate placement in the parent's local frame (for convulsions). */
export interface PartPose {
  position: [number, number, number]
  rotation: [number, number, number]
}

export interface MachinePart {
  id: number
  type: PartType
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  reactivity: Reactivity
  children: MachinePart[]
  /** Alternate local poses (index 0 = the original placement). Convulsions
   *  snap between these at runtime. Absent on the anchored root. */
  poses?: PartPose[]
}

export interface MachineConfig {
  seed: number
  pattern: Pattern
  complexity: number   // 0..1: tree depth / clustering
  partCount: number    // total parts (before symmetry mirroring at render time)
  symmetry: number     // 1..8: radial copies applied by the renderer
  scaleSpread: number  // 0..1: variance of part sizes
}

const CHILD_TYPES: readonly PartType[] = [
  'box',
  'pipe',
  'fin',
  'antenna',
  'ring',
  'greeble',
  'spike',
  'spike',
  'bolt',
  'bolt',
  'cable',
  'vent',
  'strut',
]

// Organism children: flowing tubes (stalk/tendril) dominate for a liquid-metal
// strand look; small blobs/bulbs cluster as droplets. No large wrapping shell —
// nothing cyst-like.
const ORGANISM_CHILD_TYPES: readonly PartType[] = [
  'stalk',
  'stalk',
  'tendril',
  'tendril',
  'blob',
  'blob',
  'bulb',
]

export function countParts(root: MachinePart): number {
  return 1 + root.children.reduce((n, c) => n + countParts(c), 0)
}

// --- Convulsion poses -------------------------------------------------------
// A tier/flush assembly grammar was tried here and reverted: across the seed
// space it collapsed into boxy container-trains, losing the alien (使徒-like)
// silhouettes of this generator. Convulsions instead derive alternates from
// each part's ORIGINAL pose by quantized mutations, so the reconfiguration
// language survives without constraining the shapes.

const HALF_PI = Math.PI / 2

/** Signed-permutation offsets: 90°/180° rotations of the local offset about a
 *  principal axis. They preserve the offset length in the PARENT'S LOCAL frame
 *  only — anisotropic ancestor scales can stretch it in world space, which is
 *  accepted: the constellation rearranges without collapsing to the origin. */
export const POS_MUTATIONS: readonly ((p: readonly number[]) => [number, number, number])[] = [
  (p) => [p[0], -p[2], p[1]], // 90° about X
  (p) => [p[2], p[1], -p[0]], // 90° about Y
  (p) => [-p[1], p[0], p[2]], // 90° about Z
  (p) => [-p[0], p[1], -p[2]], // 180° about Y
  (p) => [-p[0], -p[1], p[2]], // 180° about Z
  (p) => [p[0], -p[1], -p[2]], // 180° about X
]

/** Attach 3 quantized alternate poses to every non-root part, deterministic
 *  per (seed, part id). Pure post-pass over the generated tree. */
export function addConvulsionPoses(root: MachinePart, seed: number): void {
  const walk = (part: MachinePart, isRoot: boolean): void => {
    if (!isRoot) {
      const rng = createRng((((Math.floor(seed) + 1) * 2654435761) ^ (part.id * 40503)) >>> 0)
      const poses: PartPose[] = [
        {
          position: [part.position[0], part.position[1], part.position[2]],
          rotation: [part.rotation[0], part.rotation[1], part.rotation[2]],
        },
      ]
      const isDup = (pose: PartPose): boolean =>
        poses.some(
          (q) =>
            q.position[0] === pose.position[0] &&
            q.position[1] === pose.position[1] &&
            q.position[2] === pose.position[2] &&
            q.rotation[0] === pose.rotation[0] &&
            q.rotation[1] === pose.rotation[1] &&
            q.rotation[2] === pose.rotation[2],
        )
      for (let k = 0; k < 3; k++) {
        // Bounded retry keeps alternates distinct (a duplicate pose would make
        // a convulsion switch read as a dropped beat) while staying seeded.
        for (let attempt = 0; attempt < 8; attempt++) {
          const position = pick(rng, POS_MUTATIONS)(part.position)
          const rotation: [number, number, number] = [
            part.rotation[0],
            part.rotation[1],
            part.rotation[2],
          ]
          // One 90°-multiple snap on one axis: stays on the machine's rotation
          // lattice, instantly readable as a reconfiguration.
          rotation[Math.floor(rng() * 3)] += (1 + Math.floor(rng() * 3)) * HALF_PI
          const pose: PartPose = { position, rotation }
          if (attempt < 7 && isDup(pose)) continue
          poses.push(pose)
          break
        }
      }
      part.poses = poses
    }
    for (const c of part.children) walk(c, false)
  }
  walk(root, true)
}

export function generateMachine(config: MachineConfig): MachinePart {
  const rng = createRng(config.seed)
  let nextId = 0
  const makePart = (type: PartType): MachinePart => ({
    id: nextId++,
    type,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    reactivity: {
      band: Math.floor(rng() * BAND_COUNT),
      punch: range(rng, 0.2, 1),
      spin: range(rng, -1, 1),
      flash: range(rng, 0, 1),
    },
    children: [],
  })

  const root = makePart('core')
  root.scale = [1.2, 1.2, 1.2]
  const all: MachinePart[] = [root]

  while (all.length < config.partCount) {
    // Higher complexity prefers attaching deeper in the tree (more clustering)
    const parent =
      rng() < config.complexity ? all[all.length - 1 - Math.floor(rng() * Math.min(5, all.length))] : root
    const part = makePart(pick(rng, CHILD_TYPES))
    const spread = 0.6 + config.complexity
    part.position = [range(rng, -spread, spread), range(rng, -spread, spread), range(rng, -spread, spread)]
    part.rotation = [
      Math.round(rng() * 4) * (Math.PI / 2), // machines look better with 90° steps
      Math.round(rng() * 4) * (Math.PI / 2),
      Math.round(rng() * 4) * (Math.PI / 2),
    ]
    const s = 1 - config.scaleSpread * rng()
    // Elongate rods/struts along one axis for a mechanical silhouette
    const elongate = part.type === 'pipe' || part.type === 'antenna' || part.type === 'spike' || part.type === 'strut'
    part.scale = elongate ? [s * 0.15, s * range(rng, 1, 3), s * 0.15] : [s, s, s]
    parent.children.push(part)
    all.push(part)
  }
  addConvulsionPoses(root, config.seed)
  return root
}

/**
 * Organic alternative to generateMachine. Returns the SAME MachinePart tree
 * shape so flatten/renderer/scatter/useFrame are reused unchanged — only the
 * types, geometry, and material set differ. Continuous rotations + tight
 * spread + flowing tubes (stalk/tendril) with small droplet blobs read as one
 * smooth fluid-metal mass, NOT a crystal/geode and not a pile of cysts.
 */
export function generateOrganism(config: MachineConfig): MachinePart {
  const rng = createRng(config.seed)
  let nextId = 0
  // Softer reactivity than the machine: gentler punch, slower spin.
  const makePart = (type: PartType): MachinePart => ({
    id: nextId++,
    type,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    reactivity: {
      band: Math.floor(rng() * BAND_COUNT),
      punch: range(rng, 0.15, 0.7),
      spin: range(rng, -0.5, 0.5),
      flash: range(rng, 0, 1),
    },
    children: [],
  })

  const root = makePart('nucleus')
  root.scale = [1.0, 1.0, 1.0]
  const all: MachinePart[] = [root]

  while (all.length < config.partCount) {
    const parent =
      rng() < config.complexity ? all[all.length - 1 - Math.floor(rng() * Math.min(5, all.length))] : root
    const part = makePart(pick(rng, ORGANISM_CHILD_TYPES))
    // Tighter spread than the machine so droplets/strands overlap into a mass.
    const spread = 0.35 + config.complexity * 0.4
    part.position = [range(rng, -spread, spread), range(rng, -spread, spread), range(rng, -spread, spread)]
    // scaleSpread controls size variance (same knob as the machine pattern).
    const variance = 1 - config.scaleSpread * rng()
    if (part.type === 'stalk' || part.type === 'tendril') {
      // Thin-elongate along Y for flowing liquid-metal strands.
      part.scale = [0.22 * variance, range(rng, 1.2, 3.0) * variance, 0.22 * variance]
    } else {
      // blob / bulb: small droplets (kept small — no big cysts).
      const s = range(rng, 0.3, 0.8) * variance
      part.scale = [s, s, s]
    }
    // Continuous rotations — no 90° facets, fully organic silhouette.
    part.rotation = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2]
    parent.children.push(part)
    all.push(part)
  }
  return root
}
