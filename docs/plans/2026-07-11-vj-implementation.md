# VJ (Gantz Graf-style Audio Visualizer) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Browser VJ tool: a procedural machine that convulses in sync with audio, controllable via UI / MIDI / keyboard, with a full AUTO mode.

**Architecture:** A central parameter registry is the spine — UI sliders, MIDI learn, keyboard shortcuts, and AUTO-mode modulators all drive the same registered parameters. Audio features flow through a mutable `AudioFrame` read inside `useFrame` (never React state). The machine is a seeded procedural part tree rendered with R3F.

**Tech Stack:** Vite, React 19, TypeScript, three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, zustand, Web Audio API, Web MIDI API, Vitest.

**Design doc:** `docs/plans/2026-07-11-vj-design.md`

**Conventions for the executor:**
- Code comments in English. User-facing UI text in English (VJ tool convention).
- Use `trash`, never `rm`, when deleting files.
- Commit messages: `<type>: <description>`, NO Co-Authored-By lines.
- Run `npx vitest run <file>` for single test files; `npx vitest run` for all.
- Pure logic modules must not import `three` or React — keeps them unit-testable.

---

### Task 1: Scaffold project

**Files:**
- Create: entire Vite scaffold, `LICENSE`, `.gitignore` (from scaffold)

**Step 1: Scaffold Vite app into the existing repo**

The repo dir already contains `.git/` and `docs/`, so scaffold into a temp dir and copy:

```bash
cd /Users/masashiximoto/Documents/Reactproject
npm create vite@latest VJ-tmp -- --template react-ts
cp -R VJ-tmp/. VJ/
trash VJ-tmp
cd VJ && npm install
```

**Step 2: Install dependencies**

```bash
npm i three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing zustand
npm i -D vitest @types/three
```

**Step 3: Configure Vitest**

Replace `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`.

**Step 4: Add MIT LICENSE**

Create `LICENSE` with the standard MIT text, copyright `2026 masashiximoto`.

**Step 5: Clean scaffold cruft**

Empty `src/App.css` and `src/index.css` except:

```css
/* src/index.css */
html, body, #root { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
```

Replace `src/App.tsx` with a placeholder:

```tsx
export default function App() {
  return <div style={{ color: '#fff' }}>VJ</div>
}
```

**Step 6: Verify build and dev server**

```bash
npm run build        # Expected: builds with no errors
npx vitest run       # Expected: "No test files found" exit 0 (or passWithNoTests note — fine)
```

**Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + React + TS project with R3F deps"
```

---

### Task 2: Seeded PRNG

**Files:**
- Create: `src/lib/random.ts`
- Test: `src/lib/random.test.ts`

**Step 1: Write failing tests**

```ts
// src/lib/random.test.ts
import { describe, it, expect } from 'vitest'
import { createRng } from './random'

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('differs across seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)())
  })
  it('returns values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
```

**Step 2: Run to verify failure**

Run: `npx vitest run src/lib/random.test.ts` — Expected: FAIL (module not found)

**Step 3: Implement (mulberry32)**

```ts
// src/lib/random.ts
/** Deterministic PRNG (mulberry32). Returns a function yielding floats in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick a random element. */
export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Random float in [min, max). */
export function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}
```

**Step 4: Run tests** — Expected: PASS

**Step 5: Commit** — `git add -A && git commit -m "feat: add seeded PRNG (mulberry32)"`

---

### Task 3: Parameter registry

**Files:**
- Create: `src/control/params.ts`
- Test: `src/control/params.test.ts`

The registry is a plain data module (no zustand here) defining every controllable parameter. The store (Task 4) holds values.

**Step 1: Write failing tests**

```ts
// src/control/params.test.ts
import { describe, it, expect } from 'vitest'
import { PARAMS, getParam, clamp01ToRange, rangeTo01 } from './params'

describe('parameter registry', () => {
  it('has unique ids', () => {
    const ids = PARAMS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('defaults are within range', () => {
    for (const p of PARAMS) {
      expect(p.default).toBeGreaterThanOrEqual(p.min)
      expect(p.default).toBeLessThanOrEqual(p.max)
    }
  })
  it('getParam returns def or throws for unknown id', () => {
    expect(getParam('machine.seed').id).toBe('machine.seed')
    expect(() => getParam('nope')).toThrow()
  })
  it('maps normalized 0-1 values to param range and back', () => {
    const p = getParam('effects.glitch')
    expect(clamp01ToRange(p, 0)).toBe(p.min)
    expect(clamp01ToRange(p, 1)).toBe(p.max)
    expect(rangeTo01(p, p.min)).toBe(0)
    expect(rangeTo01(p, p.max)).toBe(1)
  })
})
```

**Step 2: Run to verify failure** — `npx vitest run src/control/params.test.ts` — FAIL

**Step 3: Implement**

```ts
// src/control/params.ts
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
```

**Step 4: Run tests** — PASS

**Step 5: Commit** — `git commit -am "feat: add central parameter registry"`

---

### Task 4: Parameter store (zustand) with modulation

**Files:**
- Create: `src/control/store.ts`
- Test: `src/control/store.test.ts`

Base values live in zustand (UI re-renders). Modulation values (AUTO/audio, 60fps) live in a plain mutable map — `effectiveValue()` combines them. R3F code calls `effectiveValue()` inside `useFrame`; UI reads base values reactively.

**Step 1: Write failing tests**

```ts
// src/control/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useParamStore, modulation, effectiveValue, resetParams } from './store'

describe('param store', () => {
  beforeEach(() => {
    resetParams()
    modulation.clear()
  })
  it('initializes with defaults', () => {
    expect(useParamStore.getState().values['effects.glitch']).toBe(0.3)
  })
  it('setParam clamps to range', () => {
    useParamStore.getState().setParam('effects.glitch', 99)
    expect(useParamStore.getState().values['effects.glitch']).toBe(1)
  })
  it('effectiveValue = base + modulation, clamped to range', () => {
    useParamStore.getState().setParam('effects.glitch', 0.5)
    modulation.set('effects.glitch', 0.3)
    expect(effectiveValue('effects.glitch')).toBeCloseTo(0.8)
    modulation.set('effects.glitch', 5)
    expect(effectiveValue('effects.glitch')).toBe(1) // clamped to max
  })
})
```

**Step 2: Run to verify failure** — FAIL

**Step 3: Implement**

```ts
// src/control/store.ts
import { create } from 'zustand'
import { PARAMS, getParam } from './params'

interface ParamState {
  values: Record<string, number>
  setParam: (id: string, value: number) => void
}

function defaults(): Record<string, number> {
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.default]))
}

export const useParamStore = create<ParamState>((set) => ({
  values: defaults(),
  setParam: (id, value) => {
    const p = getParam(id)
    const v = Math.min(p.max, Math.max(p.min, value))
    set((s) => ({ values: { ...s.values, [id]: v } }))
  },
}))

/** Per-frame modulation offsets (in param units), written by AUTO modulators. */
export const modulation = new Map<string, number>()

/** Base + modulation, clamped to the param's range. Safe to call in useFrame. */
export function effectiveValue(id: string): number {
  const p = getParam(id)
  const base = useParamStore.getState().values[id] ?? p.default
  const mod = modulation.get(id) ?? 0
  return Math.min(p.max, Math.max(p.min, base + mod))
}

/** Test helper / panic button: restore all defaults. */
export function resetParams(): void {
  useParamStore.setState({ values: defaults() })
}
```

**Step 4: Run tests** — PASS
**Step 5: Commit** — `git commit -am "feat: add param store with modulation layer"`

---

### Task 5: Audio feature extraction (pure)

**Files:**
- Create: `src/audio/features.ts`
- Test: `src/audio/features.test.ts`

Pure functions over typed arrays so we can test with synthetic data. The engine (Task 7) feeds them real analyser output.

**Step 1: Write failing tests**

```ts
// src/audio/features.test.ts
import { describe, it, expect } from 'vitest'
import { computeRms, bandLevel, SpectralFlux } from './features'

describe('computeRms', () => {
  it('is 0 for silence and ~0.707 for a full-scale sine', () => {
    expect(computeRms(new Float32Array(1024))).toBe(0)
    const sine = new Float32Array(1024)
    for (let i = 0; i < sine.length; i++) sine[i] = Math.sin((i / sine.length) * Math.PI * 2 * 8)
    expect(computeRms(sine)).toBeCloseTo(Math.SQRT1_2, 2)
  })
})

describe('bandLevel', () => {
  // freqData is normalized magnitudes [0,1] per bin; binHz = sampleRate / fftSize
  it('averages only the bins inside the Hz range', () => {
    const freq = new Float32Array(512).fill(0)
    freq[10] = 1 // with binHz ~46.9 (48000/1024), bin 10 ≈ 469 Hz
    const level = bandLevel(freq, 48000, 1024, 400, 600)
    expect(level).toBeGreaterThan(0)
    expect(bandLevel(freq, 48000, 1024, 5000, 10000)).toBe(0)
  })
})

describe('SpectralFlux', () => {
  it('fires an onset on a sudden spectral jump, not on steady state', () => {
    const flux = new SpectralFlux(64)
    const quiet = new Float32Array(64).fill(0.05)
    const loud = new Float32Array(64).fill(0.9)
    // establish steady baseline
    for (let i = 0; i < 30; i++) expect(flux.update(quiet, 1.5).onset).toBe(false)
    // sudden jump -> onset
    expect(flux.update(loud, 1.5).onset).toBe(true)
    // sustained loud is not a new onset
    expect(flux.update(loud, 1.5).onset).toBe(false)
  })
})
```

**Step 2: Run to verify failure** — FAIL

**Step 3: Implement**

```ts
// src/audio/features.ts

/** RMS of time-domain samples in [-1, 1]. */
export function computeRms(timeData: Float32Array): number {
  let sum = 0
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
  return Math.sqrt(sum / timeData.length)
}

/** Average normalized magnitude over a frequency band. */
export function bandLevel(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  fromHz: number,
  toHz: number,
): number {
  const binHz = sampleRate / fftSize
  const from = Math.max(0, Math.floor(fromHz / binHz))
  const to = Math.min(freqData.length - 1, Math.ceil(toHz / binHz))
  if (to < from) return 0
  let sum = 0
  for (let i = from; i <= to; i++) sum += freqData[i]
  return sum / (to - from + 1)
}

export interface FluxResult {
  onset: boolean
  /** Raw positive spectral flux this frame. */
  flux: number
}

/**
 * Onset detector via positive spectral flux with an adaptive threshold
 * (mean + sensitivity * stddev over a sliding history window).
 * A refractory period prevents machine-gun retriggers.
 */
export class SpectralFlux {
  private prev: Float32Array
  private history: number[] = []
  private cooldown = 0
  constructor(
    bins: number,
    private historySize = 43, // ~0.7s at 60fps
    private refractoryFrames = 6,
  ) {
    this.prev = new Float32Array(bins)
  }

  update(freqData: Float32Array, sensitivity: number): FluxResult {
    let flux = 0
    for (let i = 0; i < freqData.length; i++) {
      const d = freqData[i] - this.prev[i]
      if (d > 0) flux += d
      this.prev[i] = freqData[i]
    }
    const mean = this.history.reduce((a, b) => a + b, 0) / (this.history.length || 1)
    const variance =
      this.history.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (this.history.length || 1)
    const threshold = mean + sensitivity * Math.sqrt(variance)
    const enough = this.history.length >= 10
    const onset = enough && this.cooldown === 0 && flux > threshold && flux > 0.01
    this.history.push(flux)
    if (this.history.length > this.historySize) this.history.shift()
    if (onset) this.cooldown = this.refractoryFrames
    else if (this.cooldown > 0) this.cooldown--
    return { onset, flux }
  }
}
```

**Step 4: Run tests** — PASS. If the onset test is flaky against the exact threshold math, adjust the test's baseline length, not the algorithm's intent.
**Step 5: Commit** — `git commit -am "feat: add audio feature extraction (rms, bands, spectral flux onsets)"`

---

### Task 6: AudioFrame singleton

**Files:**
- Create: `src/audio/frame.ts`
- Test: `src/audio/frame.test.ts`

**Step 1: Write failing test**

```ts
// src/audio/frame.test.ts
import { describe, it, expect } from 'vitest'
import { audioFrame, decayFrame } from './frame'

describe('audioFrame', () => {
  it('decays band envelopes toward zero and clears onset', () => {
    audioFrame.low = 1
    audioFrame.onset = true
    decayFrame(audioFrame, 0.5)
    expect(audioFrame.low).toBeLessThan(1)
    expect(audioFrame.onset).toBe(false)
  })
})
```

**Step 2: Run** — FAIL

**Step 3: Implement**

```ts
// src/audio/frame.ts

/** Mutable per-frame audio features. Read directly inside useFrame — never via React state. */
export interface AudioFrame {
  rms: number
  low: number
  mid: number
  high: number
  onset: boolean
  /** Envelope that spikes to 1 on onset then decays; drives punch animations. */
  onsetEnv: number
  time: number
}

export const audioFrame: AudioFrame = {
  rms: 0, low: 0, mid: 0, high: 0, onset: false, onsetEnv: 0, time: 0,
}

/** Apply exponential decay used when no fresh analysis data is available. */
export function decayFrame(f: AudioFrame, factor: number): void {
  f.low *= factor
  f.mid *= factor
  f.high *= factor
  f.rms *= factor
  f.onsetEnv *= factor
  f.onset = false
}
```

**Step 4: Run** — PASS
**Step 5: Commit** — `git commit -am "feat: add mutable AudioFrame shared object"`

---

### Task 7: AudioEngine (mic + file, browser-only)

**Files:**
- Create: `src/audio/engine.ts`

Browser-API glue — no unit tests; verified manually in Task 15. Keep every branch explicit: surface errors to the caller (UI shows them), never swallow.

**Step 1: Implement**

```ts
// src/audio/engine.ts
import { computeRms, bandLevel, SpectralFlux } from './features'
import { audioFrame } from './frame'
import { effectiveValue } from '../control/store'

export type AudioSource = 'mic' | 'file' | 'none'

/**
 * Owns the AudioContext, input source and AnalyserNode.
 * Call update() once per render frame to refresh the shared audioFrame.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private gainNode: GainNode | null = null
  private sourceNode: AudioNode | null = null
  private micStream: MediaStream | null = null
  private fileEl: HTMLAudioElement | null = null
  private flux: SpectralFlux | null = null
  private freqData: Float32Array = new Float32Array(0)
  private timeData: Float32Array = new Float32Array(0)
  source: AudioSource = 'none'

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.5
      this.gainNode = this.ctx.createGain()
      this.gainNode.connect(this.analyser)
      this.freqData = new Float32Array(this.analyser.frequencyBinCount)
      this.timeData = new Float32Array(this.analyser.fftSize)
      this.flux = new SpectralFlux(this.analyser.frequencyBinCount)
    }
    return this.ctx
  }

  private disconnectSource(): void {
    this.sourceNode?.disconnect()
    this.sourceNode = null
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    if (this.fileEl) {
      this.fileEl.pause()
      this.fileEl = null
    }
    this.source = 'none'
  }

  /** Start microphone / line input. Throws if permission is denied. */
  async startMic(): Promise<void> {
    const ctx = this.ensureContext()
    await ctx.resume()
    this.disconnectSource()
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.sourceNode = ctx.createMediaStreamSource(this.micStream)
    this.sourceNode.connect(this.gainNode!)
    this.source = 'mic'
  }

  /** Play a local audio file and analyze it (also routed to speakers). */
  async playFile(file: File): Promise<void> {
    const ctx = this.ensureContext()
    await ctx.resume()
    this.disconnectSource()
    this.fileEl = new Audio(URL.createObjectURL(file))
    this.fileEl.loop = true
    const node = ctx.createMediaElementSource(this.fileEl)
    node.connect(this.gainNode!)
    this.gainNode!.connect(ctx.destination) // hear file playback; mic path stays analysis-only
    this.sourceNode = node
    await this.fileEl.play()
    this.source = 'file'
  }

  stop(): void {
    this.gainNode?.disconnect()
    if (this.analyser && this.gainNode) this.gainNode.connect(this.analyser)
    this.disconnectSource()
  }

  /** Refresh the shared audioFrame. Call once per render frame. */
  update(time: number): void {
    if (!this.analyser || !this.ctx || this.source === 'none') return
    this.gainNode!.gain.value = effectiveValue('audio.gain')
    this.analyser.getFloatTimeDomainData(this.timeData)
    this.analyser.getFloatFrequencyData(this.freqData)
    // Convert dB (-100..0) to normalized magnitudes [0,1]
    const mags = this.freqData
    for (let i = 0; i < mags.length; i++) mags[i] = Math.min(1, Math.max(0, (mags[i] + 100) / 100))

    const sr = this.ctx.sampleRate
    const fft = this.analyser.fftSize
    audioFrame.time = time
    audioFrame.rms = computeRms(this.timeData)
    // Smooth-follow band envelopes (fast attack, slow release)
    const follow = (cur: number, target: number) =>
      target > cur ? cur + (target - cur) * 0.6 : cur + (target - cur) * 0.15
    audioFrame.low = follow(audioFrame.low, bandLevel(mags, sr, fft, 20, 150))
    audioFrame.mid = follow(audioFrame.mid, bandLevel(mags, sr, fft, 150, 2000))
    audioFrame.high = follow(audioFrame.high, bandLevel(mags, sr, fft, 2000, 12000))

    const { onset } = this.flux!.update(mags, effectiveValue('audio.onsetSense'))
    audioFrame.onset = onset
    if (onset) audioFrame.onsetEnv = 1
    else audioFrame.onsetEnv *= 0.88
  }
}

export const audioEngine = new AudioEngine()
```

**Step 2: Verify it typechecks**

Run: `npx tsc --noEmit` — Expected: no errors.

**Step 3: Commit** — `git commit -am "feat: add AudioEngine with mic and file sources"`

---

### Task 8: Procedural machine generator

**Files:**
- Create: `src/machine/generate.ts`
- Test: `src/machine/generate.test.ts`

**Step 1: Write failing tests**

```ts
// src/machine/generate.test.ts
import { describe, it, expect } from 'vitest'
import { generateMachine, countParts, type MachineConfig } from './generate'

const config: MachineConfig = {
  seed: 42, complexity: 0.6, partCount: 40, symmetry: 2, scaleSpread: 0.5,
}

describe('generateMachine', () => {
  it('is deterministic: same config -> identical tree', () => {
    expect(generateMachine(config)).toEqual(generateMachine(config))
  })
  it('different seeds -> different trees', () => {
    expect(generateMachine(config)).not.toEqual(generateMachine({ ...config, seed: 43 }))
  })
  it('respects partCount (symmetry copies excluded)', () => {
    expect(countParts(generateMachine(config))).toBe(40)
    expect(countParts(generateMachine({ ...config, partCount: 8 }))).toBe(8)
  })
  it('every part has valid reactivity band', () => {
    const walk = (p: ReturnType<typeof generateMachine>): void => {
      expect(['low', 'mid', 'high']).toContain(p.reactivity.band)
      p.children.forEach(walk)
    }
    walk(generateMachine(config))
  })
})
```

**Step 2: Run** — FAIL

**Step 3: Implement**

```ts
// src/machine/generate.ts
import { createRng, pick, range } from '../lib/random'

export type PartType = 'core' | 'box' | 'pipe' | 'fin' | 'antenna' | 'ring' | 'greeble'
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

const CHILD_TYPES: readonly PartType[] = ['box', 'pipe', 'fin', 'antenna', 'ring', 'greeble']
const BANDS: readonly Band[] = ['low', 'mid', 'high']

export function countParts(root: MachinePart): number {
  return 1 + root.children.reduce((n, c) => n + countParts(c), 0)
}

export function generateMachine(config: MachineConfig): MachinePart {
  const rng = createRng(config.seed)
  let nextId = 0
  const makePart = (type: PartType, depth: number): MachinePart => ({
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

  const root = makePart('core', 0)
  root.scale = [1.2, 1.2, 1.2]
  const all: MachinePart[] = [root]

  while (all.length < config.partCount) {
    // Higher complexity prefers attaching deeper in the tree (more clustering)
    const parent =
      rng() < config.complexity ? all[all.length - 1 - Math.floor(rng() * Math.min(5, all.length))] : root
    const part = makePart(pick(rng, CHILD_TYPES), 0)
    const spread = 0.6 + config.complexity
    part.position = [range(rng, -spread, spread), range(rng, -spread, spread), range(rng, -spread, spread)]
    part.rotation = [
      Math.round(rng() * 4) * (Math.PI / 2), // machines look better with 90° steps
      Math.round(rng() * 4) * (Math.PI / 2),
      Math.round(rng() * 4) * (Math.PI / 2),
    ]
    const s = 1 - config.scaleSpread * rng()
    // Elongate pipes/antennas along one axis for a mechanical silhouette
    const elongate = part.type === 'pipe' || part.type === 'antenna'
    part.scale = elongate ? [s * 0.15, s * range(rng, 1, 3), s * 0.15] : [s, s, s]
    parent.children.push(part)
    all.push(part)
  }
  return root
}
```

**Step 4: Run tests** — PASS
**Step 5: Commit** — `git commit -am "feat: add seeded procedural machine generator"`

---

### Task 9: Machine renderer (R3F)

**Files:**
- Create: `src/machine/MachineObject.tsx`
- Modify: `src/App.tsx`

No unit tests (rendering); verify visually.

**Step 1: Implement the renderer**

One mesh per part (part counts ≤ ~120 × symmetry ≤ 8 is fine without instancing; note as future optimization). Geometry per type from a shared lookup; audio reactivity applied per-part in `useFrame` via refs.

```tsx
// src/machine/MachineObject.tsx
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { generateMachine, type MachinePart, type MachineConfig } from './generate'
import { audioFrame } from '../audio/frame'
import { useParamStore, effectiveValue } from '../control/store'

const GEOMETRIES: Record<string, THREE.BufferGeometry> = {
  core: new THREE.BoxGeometry(1, 1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  pipe: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  fin: new THREE.BoxGeometry(1, 0.6, 0.05),
  antenna: new THREE.ConeGeometry(0.3, 1, 4),
  ring: new THREE.TorusGeometry(0.5, 0.08, 6, 16),
  greeble: new THREE.BoxGeometry(0.3, 0.3, 0.3),
}

function Part({ part }: { part: MachinePart }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(() => {
    const r = part.reactivity
    const level = audioFrame[r.band]
    const reactivity = effectiveValue('machine.reactivity')
    const punch = 1 + audioFrame.onsetEnv * r.punch * 0.6 * reactivity
    mesh.current.scale.set(part.scale[0] * punch, part.scale[1] * punch, part.scale[2] * punch)
    mesh.current.rotation.z = part.rotation[2] + audioFrame.time * r.spin * level * reactivity
    mat.current.emissiveIntensity = level * r.flash * 3 * reactivity
  })
  return (
    <group position={part.position} rotation={part.rotation}>
      <mesh ref={mesh} geometry={GEOMETRIES[part.type]} scale={part.scale as [number, number, number]}>
        <meshStandardMaterial
          ref={mat}
          color="#b8bcc4"
          metalness={0.9}
          roughness={0.25}
          emissive="#ffffff"
          emissiveIntensity={0}
          flatShading
        />
      </mesh>
      {part.children.map((c) => (
        <Part key={c.id} part={c} />
      ))}
    </group>
  )
}

export function MachineObject() {
  // Structural params come from the reactive store (regeneration on change is intended)
  const values = useParamStore((s) => s.values)
  const config: MachineConfig = {
    seed: values['machine.seed'],
    complexity: values['machine.complexity'],
    partCount: Math.round(values['machine.partCount']),
    symmetry: Math.round(values['machine.symmetry']),
    scaleSpread: values['machine.scaleSpread'],
  }
  const root = useMemo(
    () => generateMachine(config),
    [config.seed, config.complexity, config.partCount, config.symmetry, config.scaleSpread],
  )
  const copies = Array.from({ length: config.symmetry }, (_, i) => (i / config.symmetry) * Math.PI * 2)
  return (
    <group>
      {copies.map((angle) => (
        <group key={angle} rotation={[0, angle, 0]}>
          <Part part={root} />
        </group>
      ))}
    </group>
  )
}
```

**Step 2: Wire a minimal Canvas in App.tsx**

```tsx
// src/App.tsx
import { Canvas } from '@react-three/fiber'
import { MachineObject } from './machine/MachineObject'

export default function App() {
  return (
    <Canvas camera={{ position: [0, 2, 8], fov: 50 }} gl={{ antialias: true }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 10, 5]} intensity={2} />
      <pointLight position={[-5, -5, -5]} intensity={0.5} />
      <MachineObject />
    </Canvas>
  )
}
```

**Step 3: Verify visually**

Run `npm run dev`, open the URL. Expected: a metallic abstract machine made of boxes/pipes/fins on black background. Then `npx tsc --noEmit` and `npx vitest run` — all green.

**Step 4: Commit** — `git commit -am "feat: render procedural machine with R3F"`

---

### Task 10: Post-processing effects chain

**Files:**
- Create: `src/effects/Effects.tsx`
- Modify: `src/App.tsx` (add `<Effects />` inside Canvas)

**Step 1: Implement**

Effect params must update at 60fps without re-rendering React — use refs on effect instances inside `useFrame`. Glitch is gated by onsets: `effects.glitch` sets burst probability/strength.

```tsx
// src/effects/Effects.tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Glitch, Noise, Pixelation, Scanline } from '@react-three/postprocessing'
import { GlitchMode } from 'postprocessing'
import { effectiveValue } from '../control/store'
import { audioFrame } from '../audio/frame'

export function Effects() {
  const bloom = useRef<any>(null)
  const chroma = useRef<any>(null)
  const glitch = useRef<any>(null)
  const noise = useRef<any>(null)
  const pixel = useRef<any>(null)
  const scan = useRef<any>(null)

  useFrame(() => {
    const g = effectiveValue('effects.glitch')
    if (bloom.current) bloom.current.intensity = effectiveValue('effects.bloom') * (1 + audioFrame.high)
    if (chroma.current) {
      const c = effectiveValue('effects.chroma') * (0.002 + audioFrame.onsetEnv * 0.01)
      chroma.current.offset.set(c, c * 0.6)
    }
    if (glitch.current) {
      // Fire glitch bursts on onsets, scaled by the glitch param
      glitch.current.mode = audioFrame.onsetEnv * g > 0.25 ? GlitchMode.CONSTANT_WILD : GlitchMode.DISABLED
    }
    if (noise.current) noise.current.blendMode.opacity.value = effectiveValue('effects.noise')
    if (pixel.current) pixel.current.granularity = effectiveValue('effects.pixelate') * 24
    if (scan.current) scan.current.blendMode.opacity.value = effectiveValue('effects.scanline')
  })

  return (
    <EffectComposer>
      <Bloom ref={bloom} luminanceThreshold={0.4} mipmapBlur intensity={1} />
      <ChromaticAberration ref={chroma} />
      <Glitch ref={glitch} mode={GlitchMode.DISABLED} />
      <Pixelation ref={pixel} granularity={0} />
      <Scanline ref={scan} density={1.5} />
      <Noise ref={noise} premultiply />
    </EffectComposer>
  )
}
```

Note for executor: the exact ref/prop API of @react-three/postprocessing effects varies by version — check the installed version's types and adapt (e.g. some effects expose uniforms via `.blendMode.opacity`). Keep the *behavior* (audio-reactive intensities) even if property paths differ.

**Step 2: Add `<Effects />` in App.tsx** after `<MachineObject />`.

**Step 3: Verify** — `npm run dev`: bloom visible; `npx tsc --noEmit` green.

**Step 4: Commit** — `git commit -am "feat: add audio-reactive postprocessing chain"`

---

### Task 11: Camera rig (manual + auto)

**Files:**
- Create: `src/camera/CameraRig.tsx`
- Modify: `src/App.tsx`

**Step 1: Implement**

Manual mode: OrbitControls with param-driven auto-rotate. Auto mode: on onset (with min interval), jump to a new random pose; continuous shake scaled by `camera.shake` and onsetEnv.

```tsx
// src/camera/CameraRig.tsx
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { effectiveValue } from '../control/store'
import { audioFrame } from '../audio/frame'
import { createRng } from '../lib/random'

const rng = createRng(Date.now() % 100000)

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null!)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const lastCut = useRef(0)

  useFrame((state) => {
    const auto = effectiveValue('auto.master') > 0.5 && effectiveValue('auto.camera') > 0.5
    const dist = effectiveValue('camera.distance')
    const t = state.clock.elapsedTime

    camera.fov = effectiveValue('camera.fov')
    camera.updateProjectionMatrix()
    controls.current.autoRotate = true
    controls.current.autoRotateSpeed = effectiveValue('camera.orbitSpeed') * 10

    if (auto && audioFrame.onset && t - lastCut.current > 0.35) {
      // Hard cut to a new pose on onset
      lastCut.current = t
      const theta = rng() * Math.PI * 2
      const phi = 0.3 + rng() * 1.2
      camera.position.setFromSphericalCoords(dist * (0.7 + rng() * 0.6), phi, theta)
      camera.lookAt(0, 0, 0)
    }

    // Audio shake (both modes, scaled by param)
    const shake = effectiveValue('camera.shake') * audioFrame.onsetEnv * 0.15
    camera.position.x += (rng() - 0.5) * shake
    camera.position.y += (rng() - 0.5) * shake

    controls.current.update()
  })

  return <OrbitControls ref={controls} enableDamping makeDefault />
}
```

**Step 2: Add `<CameraRig />` to App.tsx.**

**Step 3: Verify** — `npm run dev`: drag orbits the camera. `npx tsc --noEmit` green.

**Step 4: Commit** — `git commit -am "feat: add camera rig with manual orbit and auto cuts"`

---

### Task 12: AUTO mode modulators

**Files:**
- Create: `src/control/lfo.ts`, `src/control/auto.ts`
- Test: `src/control/lfo.test.ts`
- Modify: `src/App.tsx` (mount `<AutoPilot />` inside Canvas)

**Step 1: Write failing LFO tests**

```ts
// src/control/lfo.test.ts
import { describe, it, expect } from 'vitest'
import { lfoValue } from './lfo'

describe('lfoValue', () => {
  it('sine: 0 at t=0, ~1 at quarter period', () => {
    expect(lfoValue('sine', 0, 1)).toBeCloseTo(0)
    expect(lfoValue('sine', 0.25, 1)).toBeCloseTo(1)
  })
  it('square: -1 or +1 only', () => {
    expect([-1, 1]).toContain(lfoValue('square', 0.1, 1))
    expect([-1, 1]).toContain(lfoValue('square', 0.6, 1))
  })
  it('saw ramps from -1 to 1 over a period', () => {
    expect(lfoValue('saw', 0, 1)).toBeCloseTo(-1)
    expect(lfoValue('saw', 0.999, 1)).toBeCloseTo(1, 1)
  })
})
```

**Step 2: Run** — FAIL

**Step 3: Implement LFO**

```ts
// src/control/lfo.ts
export type LfoShape = 'sine' | 'square' | 'saw'

/** Value in [-1, 1] for the given shape at time t (seconds) and rate (Hz). */
export function lfoValue(shape: LfoShape, t: number, rateHz: number, phase = 0): number {
  const x = (t * rateHz + phase) % 1
  switch (shape) {
    case 'sine': return Math.sin(x * Math.PI * 2)
    case 'square': return x < 0.5 ? 1 : -1
    case 'saw': return x * 2 - 1
  }
}
```

**Step 4: Run LFO tests** — PASS

**Step 5: Implement AutoPilot component**

```tsx
// src/control/auto.ts — rename to auto.tsx if JSX is added; this version has none.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { lfoValue } from './lfo'
import { modulation, effectiveValue, useParamStore } from './store'
import { audioFrame } from '../audio/frame'
import { getParam } from './params'

/** Onsets accumulate; every N onsets the machine regenerates (seed change). */
const ONSETS_PER_REGEN = 16

export function AutoPilot() {
  const onsetCount = useRef(0)

  useFrame((state) => {
    const master = effectiveValue('auto.master') > 0.5
    if (!master) {
      modulation.clear()
      return
    }
    const t = state.clock.elapsedTime

    if (effectiveValue('auto.effects') > 0.5) {
      // Slow LFO drift + audio push on effect intensities (modulation is in param units)
      modulation.set('effects.glitch', lfoValue('sine', t, 0.05) * 0.3 + audioFrame.onsetEnv * 0.3)
      modulation.set('effects.chroma', lfoValue('sine', t, 0.07, 0.3) * 0.2)
      modulation.set('effects.pixelate', Math.max(0, lfoValue('square', t, 0.02)) * audioFrame.onsetEnv * 0.5)
      const bloomDef = getParam('effects.bloom')
      modulation.set('effects.bloom', lfoValue('sine', t, 0.03) * 0.3 * (bloomDef.max - bloomDef.min) * 0.2)
    }

    if (effectiveValue('auto.machine') > 0.5 && audioFrame.onset) {
      onsetCount.current++
      if (onsetCount.current >= ONSETS_PER_REGEN) {
        onsetCount.current = 0
        // Structural change: new seed via base value (not modulation) so UI reflects it
        const s = useParamStore.getState()
        s.setParam('machine.seed', Math.floor(Math.random() * 9999))
      }
    }
  })
  return null
}
```

**Step 6: Mount in App.tsx** (`<AutoPilot />` inside `<Canvas>`), run `npx tsc --noEmit` + `npx vitest run` — green.

**Step 7: Commit** — `git commit -am "feat: add AUTO mode modulators (LFO + audio driven)"`

---

### Task 13: MIDI — mapping logic (TDD) + Web MIDI glue

**Files:**
- Create: `src/midi/mapping.ts`, `src/midi/midi.ts`
- Test: `src/midi/mapping.test.ts`

**Step 1: Write failing tests for pure mapping logic**

```ts
// src/midi/mapping.test.ts
import { describe, it, expect } from 'vitest'
import { parseMidiMessage, mappingKey, serializeMappings, deserializeMappings } from './mapping'

describe('parseMidiMessage', () => {
  it('parses control change', () => {
    // 0xB0 = CC on channel 0; controller 7; value 64
    expect(parseMidiMessage(new Uint8Array([0xb0, 7, 64]))).toEqual({
      type: 'cc', channel: 0, controller: 7, value01: 64 / 127,
    })
  })
  it('parses note on with velocity', () => {
    expect(parseMidiMessage(new Uint8Array([0x91, 60, 127]))).toEqual({
      type: 'note', channel: 1, note: 60, value01: 1,
    })
  })
  it('treats note-on velocity 0 as note-off (null)', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0]))).toBeNull()
  })
  it('ignores unrelated messages', () => {
    expect(parseMidiMessage(new Uint8Array([0xf8]))).toBeNull() // clock
  })
})

describe('mapping persistence', () => {
  it('round-trips through JSON', () => {
    const m = new Map([[mappingKey({ type: 'cc', channel: 0, controller: 7, value01: 0 }), 'effects.glitch']])
    expect(deserializeMappings(serializeMappings(m))).toEqual(m)
  })
})
```

**Step 2: Run** — FAIL

**Step 3: Implement mapping logic**

```ts
// src/midi/mapping.ts
export interface MidiMsg {
  type: 'cc' | 'note'
  channel: number
  controller?: number
  note?: number
  value01: number
}

export function parseMidiMessage(data: Uint8Array): MidiMsg | null {
  if (data.length < 3) return null
  const status = data[0] & 0xf0
  const channel = data[0] & 0x0f
  if (status === 0xb0) return { type: 'cc', channel, controller: data[1], value01: data[2] / 127 }
  if (status === 0x90 && data[2] > 0) return { type: 'note', channel, note: data[1], value01: data[2] / 127 }
  return null
}

/** Stable key identifying a physical control, e.g. "cc:0:7" or "note:1:60". */
export function mappingKey(msg: MidiMsg): string {
  return msg.type === 'cc' ? `cc:${msg.channel}:${msg.controller}` : `note:${msg.channel}:${msg.note}`
}

export function serializeMappings(m: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(m))
}

export function deserializeMappings(json: string): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(json) as Record<string, string>))
  } catch {
    return new Map()
  }
}
```

**Step 4: Run tests** — PASS

**Step 5: Implement Web MIDI glue (browser-only, no tests)**

```ts
// src/midi/midi.ts
import { create } from 'zustand'
import { parseMidiMessage, mappingKey, serializeMappings, deserializeMappings } from './mapping'
import { useParamStore } from '../control/store'
import { getParam, clamp01ToRange } from '../control/params'

const STORAGE_KEY = 'vj.midi.mappings'

interface MidiState {
  supported: boolean
  connected: string[]           // input names
  mappings: Map<string, string> // controlKey -> paramId
  learning: string | null       // paramId currently in learn mode
  init: () => Promise<void>
  startLearn: (paramId: string) => void
  cancelLearn: () => void
  clearMapping: (paramId: string) => void
  exportJson: () => string
  importJson: (json: string) => void
}

export const useMidiStore = create<MidiState>((set, get) => ({
  supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
  connected: [],
  mappings: deserializeMappings(localStorage.getItem(STORAGE_KEY) ?? '{}'),
  learning: null,

  init: async () => {
    if (!get().supported) return
    const access = await navigator.requestMIDIAccess()
    const attach = () => {
      const names: string[] = []
      access.inputs.forEach((input) => {
        names.push(input.name ?? 'unknown')
        input.onmidimessage = (e: MIDIMessageEvent) => {
          const msg = parseMidiMessage(e.data!)
          if (!msg) return
          const key = mappingKey(msg)
          const { learning, mappings } = get()
          if (learning) {
            const next = new Map(mappings).set(key, learning)
            localStorage.setItem(STORAGE_KEY, serializeMappings(next))
            set({ mappings: next, learning: null })
            return
          }
          const paramId = mappings.get(key)
          if (!paramId) return
          const def = getParam(paramId)
          const value = def.toggle
            ? (msg.value01 > 0 ? (useParamStore.getState().values[paramId] > 0.5 ? 0 : 1) : null)
            : clamp01ToRange(def, msg.value01)
          if (value !== null) useParamStore.getState().setParam(paramId, value)
        }
      })
      set({ connected: names })
    }
    access.onstatechange = attach
    attach()
  },

  startLearn: (paramId) => set({ learning: paramId }),
  cancelLearn: () => set({ learning: null }),
  clearMapping: (paramId) => {
    const next = new Map(get().mappings)
    for (const [k, v] of next) if (v === paramId) next.delete(k)
    localStorage.setItem(STORAGE_KEY, serializeMappings(next))
    set({ mappings: next })
  },
  exportJson: () => serializeMappings(get().mappings),
  importJson: (json) => {
    const next = deserializeMappings(json)
    localStorage.setItem(STORAGE_KEY, serializeMappings(next))
    set({ mappings: next })
  },
}))
```

**Step 6: Verify** — `npx tsc --noEmit` + `npx vitest run` green.

**Step 7: Commit** — `git commit -am "feat: add MIDI learn with persisted mappings"`

---

### Task 14: Keyboard shortcuts

**Files:**
- Create: `src/control/keyboard.ts`
- Test: `src/control/keyboard.test.ts`

**Step 1: Write failing test for the pure key→action table**

```ts
// src/control/keyboard.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { handleKey } from './keyboard'
import { useParamStore, resetParams } from './store'

describe('handleKey', () => {
  beforeEach(() => resetParams())
  it('space toggles AUTO', () => {
    handleKey(' ')
    expect(useParamStore.getState().values['auto.master']).toBe(1)
    handleKey(' ')
    expect(useParamStore.getState().values['auto.master']).toBe(0)
  })
  it('r regenerates the machine (seed changes)', () => {
    const before = useParamStore.getState().values['machine.seed']
    handleKey('r')
    expect(useParamStore.getState().values['machine.seed']).not.toBe(before)
  })
  it('g toggles glitch between 0 and default', () => {
    handleKey('g')
    expect(useParamStore.getState().values['effects.glitch']).toBe(0)
    handleKey('g')
    expect(useParamStore.getState().values['effects.glitch']).toBeGreaterThan(0)
  })
  it('returns handled flag', () => {
    expect(handleKey('r')).toBe(true)
    expect(handleKey('!')).toBe(false)
  })
})
```

**Step 2: Run** — FAIL

**Step 3: Implement**

```ts
// src/control/keyboard.ts
import { useParamStore } from './store'
import { getParam } from './params'

function toggleParam(id: string): void {
  const s = useParamStore.getState()
  s.setParam(id, s.values[id] > 0 ? 0 : getParam(id).default || 1)
}

/**
 * Handle a key press. Returns true if the key was consumed.
 * UI-only keys ('h' hide panel, 'f' fullscreen) are handled by the UI layer, not here.
 */
export function handleKey(key: string): boolean {
  const s = useParamStore.getState()
  switch (key) {
    case ' ':
      s.setParam('auto.master', s.values['auto.master'] > 0.5 ? 0 : 1)
      return true
    case 'r': {
      let seed = s.values['machine.seed']
      while (seed === s.values['machine.seed']) seed = Math.floor(Math.random() * 9999)
      s.setParam('machine.seed', seed)
      return true
    }
    case 'g':
      toggleParam('effects.glitch')
      return true
    case 'b':
      toggleParam('effects.bloom')
      return true
    case 'p':
      toggleParam('effects.pixelate')
      return true
    case '1': case '2': case '3': case '4': case '5':
    case '6': case '7': case '8': case '9': {
      s.setParam('machine.seed', Number(key) * 1111) // quick preset seeds
      return true
    }
    default:
      return false
  }
}
```

**Step 4: Run tests** — PASS. Note: the 'g' toggle test asserts toggle-to-0 first because the default is 0.3 (non-zero); keep `toggleParam` semantics (nonzero→0, 0→default).

**Step 5: Commit** — `git commit -am "feat: add keyboard shortcut handling"`

---

### Task 15: UI overlay panel + app wiring

**Files:**
- Create: `src/ui/Panel.tsx`, `src/ui/ParamSlider.tsx`
- Modify: `src/App.tsx`, `src/index.css`

This is the biggest wiring task. Verify manually with dev server + real audio.

**Step 1: Implement ParamSlider (binds a registry param + MIDI learn)**

```tsx
// src/ui/ParamSlider.tsx
import { getParam } from '../control/params'
import { useParamStore } from '../control/store'
import { useMidiStore } from '../midi/midi'

export function ParamSlider({ id }: { id: string }) {
  const def = getParam(id)
  const value = useParamStore((s) => s.values[id])
  const setParam = useParamStore((s) => s.setParam)
  const learning = useMidiStore((s) => s.learning)
  const startLearn = useMidiStore((s) => s.startLearn)
  const mapped = useMidiStore((s) => [...s.mappings.values()].includes(id))

  return (
    <div className="param-row">
      <label>{def.label}</label>
      {def.toggle ? (
        <input
          type="checkbox"
          checked={value > 0.5}
          onChange={(e) => setParam(id, e.target.checked ? 1 : 0)}
        />
      ) : (
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step ?? (def.max - def.min) / 200}
          value={value}
          onChange={(e) => setParam(id, Number(e.target.value))}
        />
      )}
      <span className="param-value">{def.step === 1 ? value : value.toFixed(2)}</span>
      <button
        className={learning === id ? 'midi-learn learning' : mapped ? 'midi-learn mapped' : 'midi-learn'}
        title="MIDI learn: click, then move a controller"
        onClick={() => startLearn(id)}
      >
        M
      </button>
    </div>
  )
}
```

**Step 2: Implement Panel (tabs per group, audio source controls, hide with H)**

```tsx
// src/ui/Panel.tsx
import { useEffect, useState } from 'react'
import { PARAMS, type ParamGroup } from '../control/params'
import { ParamSlider } from './ParamSlider'
import { audioEngine } from '../audio/engine'
import { useMidiStore } from '../midi/midi'
import { handleKey } from '../control/keyboard'

const GROUPS: ParamGroup[] = ['machine', 'effects', 'camera', 'audio', 'auto']

export function Panel() {
  const [visible, setVisible] = useState(true)
  const [tab, setTab] = useState<ParamGroup>('machine')
  const [source, setSource] = useState('none')
  const [error, setError] = useState<string | null>(null)
  const midi = useMidiStore()

  useEffect(() => {
    midi.init().catch((e) => setError(`MIDI: ${e.message}`))
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'h') return setVisible((v) => !v)
      if (e.key === 'f') return void document.documentElement.requestFullscreen().catch(() => {})
      if (handleKey(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!visible) return null
  return (
    <div className="panel">
      <div className="panel-header">
        <strong>VJ</strong>
        <button onClick={() => audioEngine.startMic().then(() => setSource('mic'), (e) => setError(e.message))}>
          Mic
        </button>
        <label className="file-btn">
          File
          <input
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) audioEngine.playFile(f).then(() => setSource(f.name), (e2) => setError(e2.message))
            }}
          />
        </label>
        <span className="source">{source}</span>
      </div>
      {error && <div className="error">{error}</div>}
      {midi.learning && <div className="learn-hint">Move a MIDI control to assign…</div>}
      <div className="tabs">
        {GROUPS.map((g) => (
          <button key={g} className={tab === g ? 'active' : ''} onClick={() => setTab(g)}>
            {g}
          </button>
        ))}
      </div>
      <div className="params">
        {PARAMS.filter((p) => p.group === tab).map((p) => (
          <ParamSlider key={p.id} id={p.id} />
        ))}
      </div>
      {tab === 'auto' && !midi.supported && <div className="hint">Web MIDI not supported in this browser</div>}
      <div className="hint">H: hide UI / F: fullscreen / Space: AUTO / R: regenerate / G,B,P: effects / 1-9: seeds</div>
    </div>
  )
}
```

**Step 3: Add panel CSS to `src/index.css`**

```css
.panel {
  position: fixed; top: 12px; left: 12px; width: 320px; max-height: calc(100vh - 24px);
  overflow-y: auto; background: rgba(10, 10, 12, 0.85); color: #ddd;
  font: 12px/1.5 'SF Mono', ui-monospace, monospace; padding: 10px;
  border: 1px solid #333; border-radius: 4px; backdrop-filter: blur(8px); z-index: 10;
}
.panel-header { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.panel button, .file-btn {
  background: #222; color: #ddd; border: 1px solid #444; border-radius: 3px;
  padding: 2px 8px; cursor: pointer; font: inherit;
}
.panel .tabs { display: flex; gap: 4px; margin: 8px 0; }
.panel .tabs .active { background: #4af; color: #000; }
.param-row { display: grid; grid-template-columns: 90px 1fr 44px 20px; gap: 6px; align-items: center; }
.param-row input[type='range'] { width: 100%; }
.param-value { text-align: right; font-variant-numeric: tabular-nums; }
.midi-learn { padding: 0 4px !important; }
.midi-learn.learning { background: #fa4 !important; color: #000; }
.midi-learn.mapped { background: #4af !important; color: #000; }
.error { color: #f66; margin: 4px 0; }
.learn-hint { color: #fa4; margin: 4px 0; }
.hint { color: #777; margin-top: 8px; }
.source { color: #6c6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

**Step 4: Final App.tsx wiring (audio update loop inside Canvas)**

```tsx
// src/App.tsx
import { Canvas, useFrame } from '@react-three/fiber'
import { MachineObject } from './machine/MachineObject'
import { Effects } from './effects/Effects'
import { CameraRig } from './camera/CameraRig'
import { AutoPilot } from './control/auto'
import { Panel } from './ui/Panel'
import { audioEngine } from './audio/engine'

function AudioUpdater() {
  // Run audio analysis first each frame (renderPriority not needed; order of mount suffices)
  useFrame((state) => audioEngine.update(state.clock.elapsedTime))
  return null
}

export default function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 2, 8], fov: 50 }} gl={{ antialias: true }}>
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 10, 5]} intensity={2} />
        <pointLight position={[-5, -5, -5]} intensity={0.5} />
        <AudioUpdater />
        <MachineObject />
        <CameraRig />
        <AutoPilot />
        <Effects />
      </Canvas>
      <Panel />
    </>
  )
}
```

**Step 5: Full manual verification (use webapp-testing / chrome-devtools MCP where possible)**

1. `npm run dev`
2. Panel visible; tabs switch; sliders move and update values
3. Click **File**, load an audio file → machine pulses with the music, glitch bursts on hits
4. Click **Mic** (needs permission) → reacts to input
5. Press `H` (panel hides), `F` (fullscreen), `Space` (AUTO: camera cuts + effect drift), `R` (new machine), `1`-`9` (preset seeds)
6. `npx tsc --noEmit` and `npx vitest run` — all green

**Step 6: Commit** — `git commit -am "feat: add UI panel and wire full app"`

---### Task 16: README + polish

**Files:**
- Create: `README.md` (overwrite scaffold README)

**Step 1: Write README** (Japanese, per project language) covering: what it is (Gantz Graf-inspired browser VJ), features, browser requirements (Chrome/Edge for Web MIDI), `npm install && npm run dev`, controls table (keyboard/MIDI learn), license (MIT), and a screenshot placeholder.

**Step 2: Final verification**

```bash
npx vitest run       # all tests pass
npx tsc --noEmit     # no type errors
npm run build        # production build succeeds
```

**Step 3: Commit** — `git commit -am "docs: add README"`

---

## Execution notes

- Tasks 2–8 are pure logic and can be verified entirely by tests; Tasks 9–15 need the dev server and eyes (and ideally the chrome-devtools MCP for screenshots/console checks).
- If @react-three/postprocessing or drei APIs differ from the code above (version drift), adapt property paths but preserve the audio-reactive behavior. Consult context7 MCP for current docs.
- Keep `npx tsc --noEmit` green at every commit (a PostToolUse hook also runs tsc on edits).
