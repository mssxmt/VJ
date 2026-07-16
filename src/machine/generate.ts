import { createRng, pick, range } from '../lib/random'

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
export type Band = 'low' | 'mid' | 'high'

export interface Reactivity {
  band: Band
  /** Scale punch amount on onset (0..1). */
  punch: number
  /** Continuous rotation speed driven by band level. */
  spin: number
  /** Emissive flash amount driven by band level. */
  flash: number
}

export interface MachinePart {
  id: number
  type: PartType
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  reactivity: Reactivity
  children: MachinePart[]
}

export interface MachineConfig {
  seed: number
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
const BANDS: readonly Band[] = ['low', 'mid', 'high']

export function countParts(root: MachinePart): number {
  return 1 + root.children.reduce((n, c) => n + countParts(c), 0)
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
      band: pick(rng, BANDS),
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
  return root
}
