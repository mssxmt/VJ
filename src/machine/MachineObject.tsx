// Brushed-up v1 machine renderer. Keeps v1's generateMachine (dramatic,
// seed-driven tree) but flattens the tree into world-space parts so the
// destructive reactivity can scatter each part along its OWN random escape
// direction — a real "disassembly / debris scatter", not a uniform radial
// enlargement. Core stays anchored as the center parts fly from.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { generateMachine, type MachinePart, type MachineConfig } from './generate'
import { createRng, range } from '../lib/random'
import { audioFrame } from '../audio/frame'
import { useParamStore, effectiveValue } from '../control/store'

const GEOMETRIES: Record<string, THREE.BufferGeometry> = {
  core: new THREE.BoxGeometry(1, 1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  pipe: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  fin: new THREE.BoxGeometry(1, 0.6, 0.05),
  antenna: new THREE.ConeGeometry(0.3, 1, 6),
  ring: new THREE.TorusGeometry(0.5, 0.08, 8, 20),
  greeble: new THREE.BoxGeometry(0.3, 0.3, 0.3),
  spike: new THREE.ConeGeometry(0.16, 1, 4), // sharp 4-sided pyramid thorn
}

const COL_MAIN = new THREE.Color('#b8bcc4')
const COL_ACCENT = new THREE.Color('#5a5e66')
const EMIT_MAIN = new THREE.Color('#cfe8ff')
const EMIT_ACCENT = new THREE.Color('#fff0c0')
const ACCENT_TYPES = new Set(['pipe', 'ring', 'greeble'])

interface FlatPart {
  part: MachinePart
  pos: THREE.Vector3
  quat: THREE.Quaternion
  scale: THREE.Vector3
}

/** Per-(copy, part) scatter params — unique across the whole machine. */
interface Scatter {
  escape: THREE.Vector3
  sensitivity: number
  decay: number
  speed: number
  /** Temporal lag (frames) so parts react at staggered times, not in unison. */
  lag: number
}

/** History length for the per-part lagged audio reads (~0.47s at 60fps). */
const HIST = 28

const _euler = new THREE.Euler()

/** Walk the tree accumulating transforms -> flat world-space parts (structural only). */
function flatten(root: MachinePart): FlatPart[] {
  const out: FlatPart[] = []
  const walk = (part: MachinePart, parentWorld: THREE.Matrix4) => {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(part.position[0], part.position[1], part.position[2]),
      new THREE.Quaternion().setFromEuler(
        _euler.set(part.rotation[0], part.rotation[1], part.rotation[2]),
      ),
      new THREE.Vector3(part.scale[0], part.scale[1], part.scale[2]),
    )
    const world = parentWorld.clone().multiply(local)
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    world.decompose(pos, quat, scale)
    out.push({ part, pos, quat, scale })
    for (const c of part.children) walk(c, world)
  }
  walk(root, new THREE.Matrix4())
  return out
}

/** Build a unique scatter profile per (copy, part) so every mesh — including
 *  across symmetry copies — moves independently. Core stays anchored. */
function buildScatter(copies: number, flat: FlatPart[]): Scatter[] {
  const arr: Scatter[] = []
  for (let c = 0; c < copies; c++) {
    for (let p = 0; p < flat.length; p++) {
      const isCore = flat[p].part.type === 'core'
      const r = createRng((((c + 1) * 73856093) ^ (flat[p].part.id * 2654435761)) >>> 0)
      arr.push({
        escape: new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize(),
        sensitivity: isCore ? 0 : 0.6 + r() * 1.3,
        decay: 0.82 + r() * 0.14,
        speed: isCore ? 0 : 0.5 + r() * 1.5,
        lag: isCore ? 0 : Math.floor(r() * HIST),
      })
    }
  }
  return arr
}

export function MachineObject() {
  const values = useParamStore((s) => s.values)
  const config: MachineConfig = {
    seed: values['machine.seed'],
    complexity: values['machine.complexity'],
    partCount: Math.round(values['machine.partCount']),
    symmetry: Math.round(values['machine.symmetry']),
    scaleSpread: values['machine.scaleSpread'],
  }

  const flat = useMemo(
    () => flatten(generateMachine(config)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- regenerate only on structural value changes
    [config.seed, config.complexity, config.partCount, config.symmetry, config.scaleSpread],
  )

  // Symmetry copies with a slight per-copy break.
  const copies = useMemo(() => {
    const rng = createRng(Math.floor(config.seed * 7.3) + 1)
    return Array.from({ length: config.symmetry }, (_, i) => {
      const a = (i / config.symmetry) * Math.PI * 2
      const j = 0.06
      return {
        key: `${config.seed}-${i}`,
        rotation: [0, a + range(rng, -0.12, 0.12), range(rng, -0.08, 0.08)] as [number, number, number],
        position: [range(rng, -j, j), range(rng, -j, j), range(rng, -j, j)] as [number, number, number],
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.seed, config.symmetry])

  // Unique scatter profile per (copy, part) -> fully independent motion.
  const scatter = useMemo(() => buildScatter(copies.length, flat), [copies, flat])

  // Flat mesh/material ref store across all copies, animated by one useFrame.
  // Inline ref callbacks re-attach every render, so refs stay fresh without a
  // clearing effect (clearing would break reused meshes — see scaleSpread bug).
  const meshRefs = useRef<THREE.Mesh[]>([])
  const matRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  // Per-mesh scatter envelopes. Recreated (zeroed) when the part set changes.
  const env = useMemo(() => new Float32Array(copies.length * flat.length), [copies, flat])

  // Rolling history of audio features. Each part reads the value from `lag`
  // frames ago, so parts (and symmetry copies) react at staggered times.
  const hist = useRef(
    Array.from({ length: HIST }, () => ({ onset: 0, low: 0, mid: 0, high: 0 })),
  )
  const writeIdx = useRef(0)

  useFrame(() => {
    const reactivity = effectiveValue('machine.reactivity')

    // Record this frame's audio into the history ring buffer.
    const w = writeIdx.current
    const cur = hist.current[w]
    cur.onset = audioFrame.onsetEnv
    cur.low = audioFrame.low
    cur.mid = audioFrame.mid
    cur.high = audioFrame.high
    writeIdx.current = (w + 1) % HIST

    let idx = 0
    for (let c = 0; c < copies.length; c++) {
      for (let p = 0; p < flat.length; p++) {
        const fp = flat[p]
        const sc = scatter[idx]
        const m = meshRefs.current[idx]
        const mat = matRefs.current[idx]
        const ei = idx
        idx++
        if (!m || !sc) continue
        const r = fp.part.reactivity

        // Read this mesh's lagged audio snapshot -> staggered, independent timing.
        const snap = hist.current[(w - sc.lag + HIST) % HIST]
        const level = r.band === 'low' ? snap.low : r.band === 'mid' ? snap.mid : snap.high
        const onset = snap.onset

        // Independent per-mesh envelope: own band + own sensitivity/decay,
        // folded with its lagged onset transient.
        const target = Math.pow(level, 1.4) * sc.sensitivity
        let e = env[ei] ?? 0
        e = Math.max(e * sc.decay, target)
        e = Math.max(e, onset * sc.sensitivity * 0.7)
        env[ei] = e

        // Scatter along this mesh's own escape direction, modulated by its envelope.
        const off = e * 1.1 * reactivity * sc.speed
        m.position.copy(fp.pos).addScaledVector(sc.escape, off)
        m.quaternion.copy(fp.quat)
        const punch = 1 + e * r.punch * 0.18 * reactivity
        m.scale.set(fp.scale.x * punch, fp.scale.y * punch, fp.scale.z * punch)
        if (mat) {
          mat.emissiveIntensity = e * r.flash * 3 * reactivity
        }
      }
    }
  })

  let idx = 0
  return (
    <group>
      {copies.map((c) => (
        <group key={c.key} position={c.position} rotation={c.rotation}>
          {flat.map((fp) => {
            const accent = ACCENT_TYPES.has(fp.part.type)
            const i = idx++
            return (
              <mesh
                key={fp.part.id}
                ref={(m) => {
                  if (m) meshRefs.current[i] = m
                }}
                geometry={GEOMETRIES[fp.part.type]}
                position={fp.pos}
                quaternion={fp.quat}
                scale={fp.scale}
              >
                <meshStandardMaterial
                  ref={(m) => {
                    matRefs.current[i] = m
                  }}
                  color={accent ? COL_ACCENT : COL_MAIN}
                  metalness={0.9}
                  roughness={accent ? 0.45 : 0.26}
                  emissive={accent ? EMIT_ACCENT : EMIT_MAIN}
                  emissiveIntensity={0}
                  flatShading
                />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}
