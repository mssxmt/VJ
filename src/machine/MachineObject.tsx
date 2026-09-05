// Machine renderer: v1's dramatic seed-driven tree (alien silhouettes — a
// stricter assembly grammar was tried and reverted, see generate.ts), rendered
// as Gantz-Graf dark chrome with edge wires, and convulsed on onsets by
// snapping parts between precomputed quantized pose mutations. Flattens the
// tree to world space so scatter throws each part along its OWN escape vector.
// Core stays anchored as the center parts fly from.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  generateMachine,
  generateOrganism,
  type MachineConfig,
  type Pattern,
} from './generate'
import { createConvulsionClock, shouldConvulse, convulsePoses } from './convulsion'
import { flatten, type FlatPart } from './flatten'
import { createPanelTexture } from './panelTexture'
import { createRng, range } from '../lib/random'
import { audioFrame } from '../audio/frame'
import { BAND_COUNT, HIGH_BAND } from '../audio/bands'
import { useParamStore, effectiveValue } from '../control/store'
import { machineOrientation } from './orientation'
import { hudTracking } from '../hud/tracking'
import { MAX_TRACKED } from '../control/params'

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
}

// Gantz-Graf dark chrome: the color mostly tints the environment reflection
// (metalness 1), so "near-black" lives in these dark tints plus the darkened
// panel albedo — pure #000 would kill the speculars that make chrome read.
const COL_MAIN = new THREE.Color('#464b52')
const COL_ACCENT = new THREE.Color('#33373d')
// Cool-only emissive (the design language bans warm accents — the old #fff0c0
// accent emissive predates that rule).
const EMIT_MAIN = new THREE.Color('#cfe8ff')
// Organism: fluid metal / liquid mercury — polished chrome, fully smooth.
const COL_ORGANISM_MAIN = new THREE.Color('#cdd4dc')
const COL_ORGANISM_ACCENT = new THREE.Color('#80868d')
const EMIT_ORGANISM_MAIN = new THREE.Color('#cfe6ff')
// Rounded parts render smooth-shaded (no flatShading); the rest stays faceted.
// Organism types are all smooth.
const SMOOTH_TYPES = new Set([
  'ring', 'cable', 'bolt',
  'nucleus', 'blob', 'bulb', 'stalk', 'tendril',
])
// Old accent family (pipes/rings/thorns/etc) maps onto the darker chrome tint.
const ACCENT_TYPES = new Set(['pipe', 'ring', 'greeble', 'antenna', 'spike', 'bolt', 'cable'])
const ORGANISM_ACCENT_TYPES = new Set(['stalk', 'tendril'])
// HUD tracking prefers distinctive silhouettes so the brackets frame something
// recognizable rather than a filler greeble.
const TRACK_PREFERRED = new Set(['antenna', 'ring', 'spike', 'nucleus', 'bulb'])

function materialProps(type: string, pattern: Pattern) {
  if (pattern === 'organism') {
    // Fluid metal / liquid mercury: high-polish chrome, fully smooth. Bloom
    // + emissive pick up the cool highlights.
    const accent = ORGANISM_ACCENT_TYPES.has(type)
    return {
      color: accent ? COL_ORGANISM_ACCENT : COL_ORGANISM_MAIN,
      metalness: 1.0,
      roughness: accent ? 0.3 : 0.12,
      emissive: EMIT_ORGANISM_MAIN,
      flatShading: false,
      transparent: false,
      opacity: 1,
      envMapIntensity: 0.7,
    }
  }
  const accent = ACCENT_TYPES.has(type)
  return {
    color: accent ? COL_ACCENT : COL_MAIN,
    metalness: 1.0,
    roughness: accent ? 0.32 : 0.2,
    emissive: EMIT_MAIN,
    flatShading: !SMOOTH_TYPES.has(type),
    transparent: false,
    opacity: 1,
    envMapIntensity: 1.0,
  }
}

/** Only wire-carrying meshes need their faces pushed back (z-fight with the
 *  edge overlay); offsetting every machine material would be a silent global
 *  depth bias for no benefit. */
const WIRE_HOST_PROPS = {
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
} as const

// Shared wire overlay material: one instance drives every edge overlay, so
// per-frame opacity rides a single material update. No toneMapped flag: AGX
// runs as a postprocessing effect, so the material-level flag is a no-op here.
const WIRE_MAT = new THREE.LineBasicMaterial({
  color: '#9fc2d8',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
})
// Lazy per-type edge geometries. Only faceted types get overlays: EdgesGeometry
// at a 30° threshold yields nothing legible on smooth tubes/rings/lathes.
const EDGE_GEOS = new Map<string, THREE.EdgesGeometry>()
function edgesFor(type: string): THREE.EdgesGeometry {
  let g = EDGE_GEOS.get(type)
  if (!g) {
    g = new THREE.EdgesGeometry(GEOMETRIES[type], 30)
    EDGE_GEOS.set(type, g)
  }
  return g
}

/** Types whose edge overlay reads as structure (flat-shaded, hard corners). */
const WIRE_TYPES = new Set(['core', 'box', 'fin', 'vent', 'strut'])
/** How many of the largest faceted parts carry wires. */
const WIRE_COUNT = 8


/** Build a unique scatter profile per (copy, part) so every mesh — including
 *  across symmetry copies — moves independently. Root (core / nucleus) stays
 *  anchored as the center parts fly from. */
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

  // Convulsion state: per-(copy, part) active pose index, zeroed on regenerate.
  const poseCounts = useMemo(() => {
    const a = new Uint8Array(flat.length)
    for (let i = 0; i < flat.length; i++) a[i] = flat[i].poses.length
    return a
  }, [flat])
  const poseIdx = useMemo(() => new Uint8Array(copies.length * flat.length), [copies, flat])
  // Halve switch probability for parts with children: their subtree stays put
  // when they jump, and orphaning it every other beat read as noise.
  const poseDamp = useMemo(() => {
    const a = new Uint8Array(flat.length)
    for (let i = 0; i < flat.length; i++) a[i] = flat[i].part.children.length > 0 ? 1 : 0
    return a
  }, [flat])
  // Copy-0 pose snapshot so tracked parts can be stamped only when THEY moved.
  const prevPose = useMemo(() => new Uint8Array(flat.length), [flat])
  const convClock = useRef(createConvulsionClock())
  useEffect(() => {
    convClock.current = createConvulsionClock()
  }, [flat])

  // Wire overlays go on the N largest faceted parts (by world volume) — the
  // masses whose edges define the silhouette — not on tubes/thorns where an
  // edge overlay is noise. Deterministic: volume sort with index tiebreak.
  const wireSet = useMemo(() => {
    const picked = new Set<number>()
    if (config.pattern === 'machine') {
      flat
        .map((fp, i) => ({
          i,
          v: WIRE_TYPES.has(fp.part.type)
            ? Math.abs(fp.scale.x * fp.scale.y * fp.scale.z)
            : -1,
        }))
        .filter((e) => e.v > 0)
        .sort((a, b) => b.v - a.v || a.i - b.i)
        .slice(0, WIRE_COUNT)
        .forEach((e) => picked.add(e.i))
    }
    return picked
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror flat's structural deps
  }, [flat])

  // One unique engraved panel-line texture per part id. Regenerated WITH `flat`
  // (so R/seed/partCount/scaleSpread redraw the grooves), not read from a module
  // cache — part ids are plain 0..N indices, so a stale cache would keep serving
  // the previous generation's texture after a regenerate.
  const panelTextures = useMemo(() => {
    const m = new Map<number, THREE.Texture>()
    if (config.pattern === 'machine') {
      for (const fp of flat) {
        if (!m.has(fp.part.id)) m.set(fp.part.id, createPanelTexture(fp.part.id))
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror flat's structural deps
  }, [flat])

  // Dispose the PREVIOUS generation once the new Map is committed — never the
  // textures currently bound to materials (keeps GPU memory bounded).
  useEffect(() => {
    return () => {
      for (const t of panelTextures.values()) t.dispose()
    }
  }, [panelTextures])

  // Publish HUD tracking candidates: up to MAX_TRACKED copy-0 meshes (copy 0's
  // flat index equals its mesh index), chosen deterministically per structure.
  // Off-center parts are favored so brackets spread instead of piling on the
  // anchored core. Runs after render, so the inline ref callbacks are fresh.
  useEffect(() => {
    const rng = createRng((Math.floor(config.seed) * 2246822519 + flat.length) >>> 0)
    const scored = flat.map((fp, i) => ({
      i,
      score:
        (TRACK_PREFERRED.has(fp.part.type) ? 2 : 0) +
        (fp.pos.length() > 0.6 ? 1 : 0) +
        rng(),
    }))
    scored.sort((a, b) => b.score - a.score)
    hudTracking.parts = scored.slice(0, MAX_TRACKED).flatMap(({ i }) => {
      const mesh = meshRefs.current[i]
      const fp = flat[i]
      return mesh
        ? [{ mesh, partId: fp.part.id, band: fp.part.reactivity.band, flatIndex: i, poseStamp: 0 }]
        : []
    })
    hudTracking.generation++
    return () => {
      hudTracking.parts = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror flat's structural deps
  }, [flat])

  // Rolling history of audio features. Each part reads the value from `lag`
  // frames ago, so parts (and symmetry copies) react at staggered times.
  // Float32Array per entry, allocated once (no per-frame allocation).
  const hist = useRef(
    Array.from({ length: HIST }, () => ({ onset: 0, bands: new Float32Array(BAND_COUNT) })),
  )
  const writeIdx = useRef(0)

  useFrame((state, delta) => {
    const reactivity = effectiveValue('machine.reactivity')

    if (config.pattern === 'machine') {
      // Convulsion: quantized instantaneous reconfiguration on onsets — the
      // Gantz-Graf motion signature. Scatter keeps easing on top of whichever
      // pose is active.
      const convulse = effectiveValue('machine.convulse')
      if (
        convulse > 0 &&
        shouldConvulse(convClock.current, state.clock.elapsedTime, audioFrame.onset)
      ) {
        for (let p = 0; p < flat.length; p++) prevPose[p] = poseIdx[p]
        const eventSeed = (Math.floor(config.seed) * 31 + convClock.current.count) >>> 0
        convulsePoses(poseIdx, poseCounts, copies.length, convulse * 0.5, eventSeed, poseDamp)
        // Stamp only the tracked parts whose copy-0 mesh actually switched —
        // HudLayer re-acquires those brackets and leaves the rest locked.
        for (const tp of hudTracking.parts) {
          if (poseIdx[tp.flatIndex] !== prevPose[tp.flatIndex]) {
            tp.poseStamp = convClock.current.count
          }
        }
      }
      // Wire overlay: one shared material, band-lit so the edges pulse with
      // the highs and spike on onsets.
      const wires = effectiveValue('machine.wires')
      WIRE_MAT.opacity =
        wires * (0.22 + Math.min(0.78, audioFrame.bands[HIGH_BAND] * 0.9 + audioFrame.onsetEnv * 0.35))
      WIRE_MAT.visible = wires > 0.01
    }

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
      // Publish the tumble orientation so world-space effects (EMP beam) can
      // follow the machine's facing instead of being locked to world axes.
      machineOrientation.quaternion.copy(rootRef.current.quaternion)
    }

    // Record this frame's audio into the history ring buffer.
    const w = writeIdx.current
    const cur = hist.current[w]
    cur.onset = audioFrame.onsetEnv
    const cb = cur.bands
    const ab = audioFrame.bands
    for (let i = 0; i < BAND_COUNT; i++) cb[i] = ab[i]
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
        const level = snap.bands[r.band]
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
        // Scatter offsets apply from whichever precomputed pose the convulsion
        // state has active (index 0 until the first event).
        const pp = fp.poses[poseIdx[ei]] ?? fp.poses[0]
        m.position.copy(pp.pos).addScaledVector(sc.escape, off)
        m.quaternion.copy(pp.quat)

        const punch = 1 + e * r.punch * 0.18 * reactivity
        m.scale.set(pp.scale.x * punch, pp.scale.y * punch, pp.scale.z * punch)
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
          {flat.map((fp, fi) => {
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
                  {...(wireSet.has(fi) ? WIRE_HOST_PROPS : {})}
                  // Machine parts: engraved panel-line albedo, varied per part
                  // (panelTextures is empty for organism -> map stays undefined).
                  map={panelTextures.get(fp.part.id)}
                  emissiveIntensity={0}
                />
                {/* Edge wires on the largest masses only — a child inherits the
                    mesh transform, so the overlay follows scatter/convulsions
                    with zero extra per-frame work. */}
                {wireSet.has(fi) && (
                  <lineSegments geometry={edgesFor(fp.part.type)} material={WIRE_MAT} />
                )}
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}
