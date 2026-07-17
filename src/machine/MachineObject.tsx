// Brushed-up v1 machine renderer. Keeps v1's generateMachine (dramatic,
// seed-driven tree) but flattens the tree into world-space parts so the
// destructive reactivity can scatter each part along its OWN random escape
// direction — a real "disassembly / debris scatter", not a uniform radial
// enlargement. Core stays anchored as the center parts fly from.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { generateMachine, generateOrganism, type MachinePart, type MachineConfig, type Pattern } from './generate'
import { createRng, range } from '../lib/random'
import { audioFrame } from '../audio/frame'
import { useParamStore, effectiveValue } from '../control/store'

// --- Part geometries -------------------------------------------------------
// bolt: revolved rivet profile (head + shaft).
const BOLT_GEO = new THREE.LatheGeometry(
  [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.16, 0.0),
    new THREE.Vector2(0.16, 0.04),
    new THREE.Vector2(0.1, 0.04),
    new THREE.Vector2(0.1, 0.16),
    new THREE.Vector2(0.0, 0.16),
  ],
  12,
)
// cable: arcing tube (a wire/loop primitive).
const CABLE_GEO = new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.4, 0),
    new THREE.Vector3(0.35, -0.1, 0.15),
    new THREE.Vector3(0.3, 0.35, -0.15),
    new THREE.Vector3(-0.1, 0.45, 0.1),
    new THREE.Vector3(-0.4, 0.2, 0),
  ]),
  18,
  0.045,
  8,
  false,
)
// vent: parallel fins merged into a grille.
const VENT_GEO = (() => {
  const fins: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const f = new THREE.BoxGeometry(0.6, 0.03, 0.18)
    f.translate(0, (i - 2.5) * 0.07, 0)
    fins.push(f)
  }
  return mergeGeometries(fins)!
})()
// stalk / tendril: organic tubes along a Catmull-Rom curve (no straight lines).
const STALK_GEO = new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.5, 0),
    new THREE.Vector3(0.1, -0.2, 0.05),
    new THREE.Vector3(-0.08, 0.1, -0.05),
    new THREE.Vector3(0.05, 0.4, 0.03),
    new THREE.Vector3(0, 0.5, 0),
  ]),
  24,
  0.06,
  12,
  false,
)
const TENDRIL_GEO = new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.6, 0),
    new THREE.Vector3(0.15, -0.3, 0.1),
    new THREE.Vector3(-0.15, 0, -0.1),
    new THREE.Vector3(0.2, 0.3, 0.05),
    new THREE.Vector3(-0.1, 0.55, -0.08),
    new THREE.Vector3(0.05, 0.7, 0),
  ]),
  32,
  0.04,
  12,
  false,
)
const GEOMETRIES: Record<string, THREE.BufferGeometry> = {
  core: new THREE.BoxGeometry(1, 1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  pipe: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  fin: new THREE.BoxGeometry(1, 0.6, 0.05),
  antenna: new THREE.ConeGeometry(0.3, 1, 6),
  ring: new THREE.TorusGeometry(0.5, 0.08, 20, 48), // smoothed (higher segments)
  greeble: new THREE.BoxGeometry(0.3, 0.3, 0.3),
  spike: new THREE.ConeGeometry(0.16, 1, 4), // sharp 4-sided pyramid thorn
  bolt: BOLT_GEO,
  cable: CABLE_GEO,
  vent: VENT_GEO,
  strut: new THREE.BoxGeometry(1, 1, 1),
  // organism: all smooth, high-segment geometry (no crystalline facets).
  nucleus: new THREE.IcosahedronGeometry(1.0, 4),
  blob: new THREE.IcosahedronGeometry(0.7, 3),
  bulb: new THREE.SphereGeometry(0.35, 24, 18),
  stalk: STALK_GEO,
  tendril: TENDRIL_GEO,
  membrane: new THREE.SphereGeometry(2.0, 32, 24), // wrapping shell
}

const COL_MAIN = new THREE.Color('#b8bcc4')
const COL_ACCENT = new THREE.Color('#5a5e66')
const EMIT_MAIN = new THREE.Color('#cfe8ff')
const EMIT_ACCENT = new THREE.Color('#fff0c0')
// Organism: warm skin tones — main flesh, darker accent (stalks/tendrils),
// translucent membrane shell.
const COL_ORGANISM_MAIN = new THREE.Color('#cdb2a3')
const COL_ORGANISM_ACCENT = new THREE.Color('#9a7a6a')
const COL_ORGANISM_MEMBRANE = new THREE.Color('#b89580')
const EMIT_ORGANISM_MAIN = new THREE.Color('#ffd0a0')
const EMIT_ORGANISM_ACCENT = new THREE.Color('#ffb088')
const EMIT_ORGANISM_MEMBRANE = new THREE.Color('#ffc098')
// Rounded parts render smooth-shaded (no flatShading); the rest stays faceted.
// Organism types are all smooth — they route through the pattern=='organism'
// branch below, but adding them here keeps the fallback safe.
const SMOOTH_TYPES = new Set([
  'ring', 'cable', 'bolt',
  'nucleus', 'blob', 'bulb', 'stalk', 'tendril', 'membrane',
])
const ACCENT_TYPES = new Set(['pipe', 'ring', 'greeble', 'antenna', 'spike', 'bolt', 'cable'])
const ORGANISM_ACCENT_TYPES = new Set(['stalk', 'tendril'])

function materialProps(type: string, pattern: Pattern) {
  if (pattern === 'organism') {
    // Organism is fully smooth, warm, near-matte so bloom + emissive carry
    // the soft tissue read. Membrane is translucent so the interior blob
    // cluster shows through the wrapping shell.
    const accent = ORGANISM_ACCENT_TYPES.has(type)
    const isMembrane = type === 'membrane'
    return {
      color: isMembrane ? COL_ORGANISM_MEMBRANE : accent ? COL_ORGANISM_ACCENT : COL_ORGANISM_MAIN,
      metalness: 0.05,
      roughness: isMembrane ? 0.95 : accent ? 0.85 : 0.65,
      emissive: isMembrane ? EMIT_ORGANISM_MEMBRANE : accent ? EMIT_ORGANISM_ACCENT : EMIT_ORGANISM_MAIN,
      flatShading: false,
      transparent: isMembrane,
      opacity: isMembrane ? 0.3 : 1,
    }
  }
  const accent = ACCENT_TYPES.has(type)
  return {
    color: accent ? COL_ACCENT : COL_MAIN,
    metalness: 0.9,
    roughness: accent ? 0.45 : 0.26,
    emissive: accent ? EMIT_ACCENT : EMIT_MAIN,
    flatShading: !SMOOTH_TYPES.has(type),
    transparent: false,
    opacity: 1,
  }
}

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
 *  across symmetry copies — moves independently. Root (core / nucleus) stays
 *  anchored as the center parts fly from. */
function buildScatter(copies: number, flat: FlatPart[]): Scatter[] {
  const arr: Scatter[] = []
  for (let c = 0; c < copies; c++) {
    for (let p = 0; p < flat.length; p++) {
      // Both pattern roots stay anchored: machine 'core' and organism 'nucleus'.
      const isCore = flat[p].part.type === 'core' || flat[p].part.type === 'nucleus'
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
    pattern: values['machine.pattern'] > 0.5 ? 'organism' : 'machine',
    complexity: values['machine.complexity'],
    partCount: Math.round(values['machine.partCount']),
    symmetry: Math.round(values['machine.symmetry']),
    scaleSpread: values['machine.scaleSpread'],
  }

  const flat = useMemo(
    () => flatten(config.pattern === 'organism' ? generateOrganism(config) : generateMachine(config)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- regenerate only on structural value changes
    [config.pattern, config.seed, config.complexity, config.partCount, config.symmetry, config.scaleSpread],
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
  // Root group ref: spun by machine.spinX/Y/Z so MIDI can tumble the object
  // in any direction (and AUTO drives these via LFO).
  const rootRef = useRef<THREE.Group>(null!)
  // Per-mesh scatter envelopes. Recreated (zeroed) when the part set changes.
  const env = useMemo(() => new Float32Array(copies.length * flat.length), [copies, flat])

  // Rolling history of audio features. Each part reads the value from `lag`
  // frames ago, so parts (and symmetry copies) react at staggered times.
  const hist = useRef(
    Array.from({ length: HIST }, () => ({ onset: 0, low: 0, mid: 0, high: 0 })),
  )
  const writeIdx = useRef(0)

  useFrame((_state, delta) => {
    const reactivity = effectiveValue('machine.reactivity')

    if (rootRef.current) {
      const d = Math.min(delta, 0.05) // clamp to avoid jumps on tab refocus
      // Tumble from the spin params (base + AUTO modulation).
      rootRef.current.rotation.x += effectiveValue('machine.spinX') * d
      rootRef.current.rotation.y += effectiveValue('machine.spinY') * d
      rootRef.current.rotation.z += effectiveValue('machine.spinZ') * d
      // Stretch glitch: violently elongate the whole machine vertically (V)
      // or horizontally (H). 0 = none, 1 = ~20x absurd stretch.
      const sV = effectiveValue('effects.stretchV')
      const sH = effectiveValue('effects.stretchH')
      rootRef.current.scale.set(1 + sH * 19, 1 + sV * 19, 1 + sH * 19)
    }

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
        // Frame-rate independent decay (per-frame factor raised to delta*60).
        e = Math.max(e * Math.pow(sc.decay, delta * 60), target)
        e = Math.max(e, onset * sc.sensitivity * 0.7)
        env[ei] = e

        // Scatter along this mesh's own escape direction. Ease-out curve so
        // parts burst out fast then decelerate as they spread further (organic,
        // "slows as it opens") rather than moving at a constant rate.
        const en = e < 1 ? e : 1
        const eased = 1 - Math.pow(1 - en, 3)
        const off = eased * 1.1 * reactivity * sc.speed
        m.position.copy(fp.pos).addScaledVector(sc.escape, off)
        m.quaternion.copy(fp.quat)

        const punch = 1 + e * r.punch * 0.18 * reactivity
        m.scale.set(fp.scale.x * punch, fp.scale.y * punch, fp.scale.z * punch)
        if (mat) {
          mat.emissiveIntensity = e * r.flash * 0.5 * reactivity
        }
      }
    }
  })

  let idx = 0
  return (
    <group ref={rootRef}>
      {copies.map((c) => (
        <group key={c.key} position={c.position} rotation={c.rotation}>
          {flat.map((fp) => {
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
                  {...materialProps(fp.part.type, config.pattern)}
                  emissiveIntensity={0}
                />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}
