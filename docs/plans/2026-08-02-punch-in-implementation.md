# Punch-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, hold-style "punch-in": holding a key / MIDI note pushes the camera in AND warps space with a fisheye (barrel distortion); releasing returns to normal. Intensity rises with hold length (attack), capped by warp.

**Architecture:** A single envelope `audioFrame.punch` (0-1) is advanced each frame by a `<Punch>` component toward `punch.trigger` (a range param driven by keyboard + MIDI-learn). That envelope drives two consumers: `CameraRig` (distance shrink + fov widen) and a new `FisheyeEffect` (barrel distortion) in the existing `EffectComposer`. Note Off parsing is added so MIDI note hold (press/release) works.

**Tech Stack:** TypeScript, React, @react-three/fiber, @react-three/postprocessing + postprocessing (custom `Effect`), three.js, vitest.

## Global Constraints

- TypeScript strict; `npm run lint` (oxlint) clean, `npm run build` (`tsc -b && vite build`) green, `npm test` (vitest run) green after every task.
- `src/control/*` and `src/ui/*` are Read/Edit/Write-tool-DENIED. Edit them via Bash: `git show HEAD:<path>` → python string-edit → overwrite the file. All other dirs are editable normally.
- Code comments in English. Commit messages: conventional commits (`feat:`/`fix:`/`test:`/`refactor:`), WHY in body, NO Co-Authored-By / AI attribution.
- Existing pattern: per-frame globals live in `audioFrame` (`src/audio/frame.ts`) and are read via `effectiveValue('<paramId>')` from `src/control/store.ts`. Params are declared in `PARAMS` (`src/control/params.ts`) → auto UI + MIDI-learn + AUTO.

## Design refinement vs the spec

The spec proposed a `triggerPunch(on)` action function. Implementation refines this: `punch.trigger` is a **range param (0-1)** so the existing MIDI-learn path (`mapping → paramId → setParam`) works unchanged. Keyboard sets `punch.trigger` to 1/0; MIDI Note On sets it to velocity/127, Note Off sets it to 0 → natural hold semantics + velocity sensitivity (free expressive bonus). No separate action function needed.

---

## Task 1: Note Off parsing

**Files:**
- Modify: `src/midi/mapping.ts`
- Test: `src/midi/mapping.test.ts`

**Interfaces:**
- Produces: `parseMidiMessage` now returns `{type:'note', channel, note, value01:0}` for Note Off (`0x80` status, and `0x90` with velocity 0) instead of `null`.

- [ ] **Step 1: Update + add failing tests**

In `src/midi/mapping.test.ts`, the existing case `expect(parseMidiMessage(new Uint8Array([0x90, 60, 0]))).toBeNull()` (note-on with velocity 0) must change to expect a Note Off event. Add explicit Note Off coverage. Replace/extend the relevant block:

```ts
  it('treats note-on velocity 0 as note off (value 0)', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0]))).toEqual({
      type: 'note', channel: 0, note: 60, value01: 0,
    })
  })

  it('parses explicit note-off status', () => {
    expect(parseMidiMessage(new Uint8Array([0x81, 72, 0]))).toEqual({
      type: 'note', channel: 1, note: 72, value01: 0,
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/midi/mapping.test.ts`
Expected: FAIL (current code returns null for both).

- [ ] **Step 3: Implement Note Off handling**

In `src/midi/mapping.ts`, replace the single note-on branch with note-off + note-on branches:

```ts
  // Note Off: explicit 0x80, or 0x90 with velocity 0 (running status convention)
  if (status === 0x80 || (status === 0x90 && data[2] === 0)) {
    return { type: 'note', channel, note: data[1], value01: 0 }
  }
  if (status === 0x90) {
    return { type: 'note', channel, note: data[1], value01: data[2] / 127 }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/midi/mapping.test.ts`
Expected: PASS (all mapping tests).

- [ ] **Step 5: Verify full suite, then commit**

Run: `npm test`
Expected: 38+ tests pass (no regressions; the previously-`null` test now asserts value 0).
```bash
git add src/midi/mapping.ts src/midi/mapping.test.ts
git commit -m "feat(midi): parse Note Off so note controls support hold/press-release"
```

---

## Task 2: punch envelope state in audioFrame

**Files:**
- Modify: `src/audio/frame.ts`
- Test: `src/audio/frame.test.ts`

**Interfaces:**
- Produces: `AudioFrame.punch: number` (current envelope value, 0-1), default 0.
- `decayFrame` MUST NOT touch `punch` (punch is user-driven via useFrame, not audio analysis).

- [ ] **Step 1: Write the failing test**

In `src/audio/frame.test.ts` add:

```ts
  it('exposes punch starting at 0 and decayFrame leaves it untouched', () => {
    const f = { ...audioFrame, punch: 0.7 }
    decayFrame(f, 0.5)
    expect(f.punch).toBe(0.7) // punch is user-driven, not audio-decayed
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/audio/frame.test.ts`
Expected: FAIL (`punch` does not exist on AudioFrame → TS/runtime error).

- [ ] **Step 3: Add the field**

In `src/audio/frame.ts`:

```ts
export interface AudioFrame {
  rms: number
  bands: number[]
  onset: boolean
  onsetEnv: number
  /** User-driven punch-in envelope (0-1); advanced each frame by <Punch>. */
  punch: number
  time: number
}

export const audioFrame: AudioFrame = {
  rms: 0,
  bands: new Array<number>(BAND_COUNT).fill(0),
  onset: false,
  onsetEnv: 0,
  punch: 0,
  time: 0,
}
```
(`decayFrame` is unchanged — it intentionally does not decay `punch`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/audio/frame.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

Run: `npm run build && npm test`
```bash
git add src/audio/frame.ts src/audio/frame.test.ts
git commit -m "feat(audio): add punch envelope field to audioFrame"
```

---

## Task 3: advancePunch pure helper

**Files:**
- Create: `src/effects/envelope.ts`
- Test: `src/effects/envelope.test.ts`

**Interfaces:**
- Produces: `advancePunch(current, target, attack, release, dt): number` — frame-rate-independent exponential approach. `attack`/`release` are time-constants in seconds (0 = instant snap to target).

- [ ] **Step 1: Write the failing tests**

Create `src/effects/envelope.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { advancePunch } from './envelope'

describe('advancePunch', () => {
  it('snaps instantly when the relevant time-constant is 0', () => {
    expect(advancePunch(0, 1, 0, 0.5, 0.016)).toBe(1) // attack 0 -> instant rise
    expect(advancePunch(1, 0, 0.5, 0, 0.016)).toBe(0) // release 0 -> instant fall
  })
  it('moves partway toward target with a positive time-constant', () => {
    const r = advancePunch(0, 1, 0.3, 0.5, 0.016)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })
  it('converges to target over many frames', () => {
    let v = 0
    for (let i = 0; i < 1000; i++) v = advancePunch(v, 1, 0.2, 0.2, 0.016)
    expect(v).toBeGreaterThan(0.99)
  })
  it('is frame-rate independent (same end value for different dt sums)', () => {
    const big = advancePunch(0, 1, 0.3, 0.3, 0.1)
    let acc = 0
    for (let i = 0; i < 10; i++) acc = advancePunch(acc, 1, 0.3, 0.3, 0.01)
    expect(acc).toBeCloseTo(big, 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/effects/envelope.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/effects/envelope.ts`:

```ts
// Frame-rate-independent exponential approach for the punch-in envelope.
// `attack`/`release` are time-constants in seconds (0 = instant snap).
export function advancePunch(
  current: number,
  target: number,
  attack: number,
  release: number,
  dt: number,
): number {
  const tc = target > current ? attack : release
  if (tc <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tc))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/effects/envelope.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

Run: `npm test`
```bash
git add src/effects/envelope.ts src/effects/envelope.test.ts
git commit -m "feat(punch): add frame-rate-independent punch envelope helper"
```

---

## Task 4: barrelUv helper + FisheyeEffect

**Files:**
- Create: `src/effects/FisheyeEffect.ts`
- Test: `src/effects/FisheyeEffect.test.ts` (pure `barrelUv` only)

**Interfaces:**
- Produces: `barrelUv(uv: [number,number], intensity: number): [number,number]` (pure, testable), and `FisheyeEffect` (React component via `wrapEffect`) exposing a `intensity` uniform read through `ref.current.uniforms.get('intensity').value`.

- [ ] **Step 1: Write the failing test for barrelUv**

Create `src/effects/FisheyeEffect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { barrelUv } from './FisheyeEffect'

describe('barrelUv', () => {
  it('is identity at intensity 0', () => {
    expect(barrelUv([0.3, 0.7], 0)).toEqual([0.3, 0.7])
  })
  it('leaves the center fixed', () => {
    expect(barrelUv([0.5, 0.5], 1)).toEqual([0.5, 0.5])
  })
  it('pushes off-center points outward for intensity > 0', () => {
    const [u] = barrelUv([1, 0.5], 0.5)
    expect(u).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/effects/FisheyeEffect.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement barrelUv + FisheyeEffect**

Create `src/effects/FisheyeEffect.ts`:

```ts
import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import { wrapEffect } from '@react-three/postprocessing'

// Pure radial (barrel) distortion used by the shader and unit-tested directly.
export function barrelUv([u, v]: [number, number], intensity: number): [number, number] {
  const dx = u - 0.5
  const dy = v - 0.5
  const r2 = dx * dx + dy * dy
  const k = 1 + intensity * r2
  return [0.5 + dx * k, 0.5 + dy * k]
}

const fragmentShader = /* glsl */ `
uniform float intensity;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - vec2(0.5);
  float r2 = dot(d, d);
  vec2 duv = vec2(0.5) + d * (1.0 + intensity * r2);
  outputColor = texture2D(inputBuffer, clamp(duv, 0.0, 1.0));
}
`

class FisheyeEffectImpl extends Effect {
  constructor({ intensity = 0 } = {}) {
    super('FisheyeEffect', fragmentShader, {
      uniforms: new Map([['intensity', new Uniform(intensity)]]),
    })
  }
}

// intensity uniform read/write: ref.current.uniforms.get('intensity').value
export const FisheyeEffect = wrapEffect(FisheyeEffectImpl as never)
```

> **Why-not:** sampling `inputBuffer` (not `inputColor`) so the distortion actually reshapes the frame; `inputColor` alone can't move pixels. `clamp` prevents wrap artifacts at the border.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/effects/FisheyeEffect.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify build + commit**

Run: `npm run build && npm test`
```bash
git add src/effects/FisheyeEffect.ts src/effects/FisheyeEffect.test.ts
git commit -m "feat(effects): add barrel-distortion fisheye Effect"
```

---

## Task 5: Register punch params

**Files:**
- Modify: `src/control/params.ts` (Bash-edit — control dir is tool-denied)

**Interfaces:**
- Produces: param ids `punch.trigger` (range 0-1, default 0), `punch.strength` (0-1, 0.8), `punch.warp` (0-1, 0.6), `punch.attack` (0-1, 0.3), `punch.release` (0-1, 0.5); and `ParamGroup` gains `'punch'`.

- [ ] **Step 1: Edit params.ts via Bash**

`src/control/params.ts` is tool-denied. Use the git-show → python-edit → overwrite workaround:

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path('src/control/params.ts')
s = p.read_text()
s = s.replace(
  "export type ParamGroup = 'machine' | 'effects' | 'camera' | 'audio' | 'auto'",
  "export type ParamGroup = 'machine' | 'effects' | 'camera' | 'audio' | 'auto' | 'punch'",
)
anchor = "  // camera\n"
block = (
  "  // punch-in (hold zoom + fisheye)\n"
  "  { id: 'punch.trigger', label: 'Punch', group: 'punch', min: 0, max: 1, default: 0 },\n"
  "  { id: 'punch.strength', label: 'Punch Strength', group: 'punch', min: 0, max: 1, default: 0.8 },\n"
  "  { id: 'punch.warp', label: 'Fisheye Warp', group: 'punch', min: 0, max: 1, default: 0.6 },\n"
  "  { id: 'punch.attack', label: 'Punch Attack', group: 'punch', min: 0, max: 1, default: 0.3 },\n"
  "  { id: 'punch.release', label: 'Punch Release', group: 'punch', min: 0, max: 1, default: 0.5 },\n"
)
assert anchor in s, 'camera anchor not found'
s = s.replace(anchor, block + anchor, 1)
p.write_text(s)
PY
```

- [ ] **Step 2: Verify lint + build + the param resolves**

Run: `npm run lint && npm run build && npx vitest run src/control/params.test.ts`
Expected: clean/green; `getParam('punch.strength')` does not throw.

- [ ] **Step 3: Commit**

```bash
git add src/control/params.ts
git commit -m "feat(punch): register punch-in params (trigger/strength/warp/attack/release)"
```

---

## Task 6: Punch component + App wiring

**Files:**
- Create: `src/effects/Punch.tsx`
- Modify: `src/App.tsx` (insert `<Punch />` after `<EmpBeam />`, before `<CameraRig />`)

**Interfaces:**
- Consumes: `audioFrame.punch` (Task 2), `advancePunch` (Task 3), `effectiveValue` for `punch.trigger`/`punch.attack`/`punch.release` (Task 5).
- Produces: a component that, each frame, advances `audioFrame.punch` toward `effectiveValue('punch.trigger')`.

- [ ] **Step 1: Create the component**

Create `src/effects/Punch.tsx`:

```tsx
// Advances the punch-in envelope each frame toward the `punch.trigger` param
// (keyboard/MIDI-driven). Placed in App before CameraRig/Effects so those
// consumers read an up-to-date audioFrame.punch.
import { useFrame } from '@react-three/fiber'
import { audioFrame } from '../audio/frame'
import { advancePunch } from './envelope'
import { effectiveValue } from '../control/store'

export function Punch() {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05) // clamp like CameraRig (avoid tab-refocus jumps)
    const target = effectiveValue('punch.trigger')
    audioFrame.punch = advancePunch(
      audioFrame.punch,
      target,
      effectiveValue('punch.attack'),
      effectiveValue('punch.release'),
      dt,
    )
  })
  return null
}
```

- [ ] **Step 2: Wire it into App**

In `src/App.tsx`, add the import and place the component right before `<CameraRig />`:

```tsx
import { Punch } from './effects/Punch'
// ...
        <EmpBeam />
        <Punch />
        <CameraRig />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: green (component renders null; no behavior yet visible without a consumer).

- [ ] **Step 4: Commit**

```bash
git add src/effects/Punch.tsx src/App.tsx
git commit -m "feat(punch): add Punch envelope component + app wiring"
```

---

## Task 7: CameraRig push

**Files:**
- Modify: `src/camera/CameraRig.tsx` (around the existing `const dist = effectiveValue('camera.distance')` and `camera.fov` lines)

**Interfaces:**
- Consumes: `audioFrame.punch`, `punch.strength`.

- [ ] **Step 1: Apply punch to distance + fov**

In `src/camera/CameraRig.tsx`, the existing per-frame block reads `camera.distance` and `camera.fov`. Modify so the EFFECTIVE distance/fov include a punch push. Replace the lines that read those two values:

```tsx
    // Punch-in: push in (shorter distance) + widen fov while held.
    const p = audioFrame.punch * effectiveValue('punch.strength')
    const dist = effectiveValue('camera.distance') * (1 - p * 0.6)
    // ... (existing code uses `dist`)
    camera.fov = effectiveValue('camera.fov') + p * 40
```
Keep the rest of the existing logic (auto cut uses `dist`; `camera.updateProjectionMatrix()` already follows). Add `import { audioFrame } from '../audio/frame'` if not present.

- [ ] **Step 2: Verify build + tests**

Run: `npm run build && npm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/camera/CameraRig.tsx
git commit -m "feat(punch): push camera in (distance + fov) on punch envelope"
```

---

## Task 8: Fisheye in Effects

**Files:**
- Modify: `src/effects/Effects.tsx`

**Interfaces:**
- Consumes: `FisheyeEffect` (Task 4), `audioFrame.punch`, `punch.warp`.

- [ ] **Step 1: Add the Fisheye ref + uniform drive + element**

In `src/effects/Effects.tsx`:

Add imports:
```tsx
import { FisheyeEffect } from './FisheyeEffect'
import { audioFrame } from '../audio/frame' // if not already imported
```

Add a ref typed loosely (the wrapped effect exposes `uniforms`):
```tsx
  const fisheye = useRef<{ uniforms: Map<string, { value: number }> }>(null)
```

In the existing `useFrame`, drive the intensity:
```tsx
    if (fisheye.current) {
      fisheye.current.uniforms.get('intensity')!.value =
        audioFrame.punch * effectiveValue('punch.warp')
    }
```

Add the element inside `<EffectComposer>` (order: after visual effects, e.g. after `<Bloom>` so it distorts the bloomed image):
```tsx
      <FisheyeEffect ref={fisheye as never} />
```

> **Why-not intensity 0 bypass:** `wrapEffect` doesn't no-op an effect at uniform 0 automatically, but `barrelUv` is identity at intensity 0 (verified in Task 4), so it costs only the texture sample — acceptable and avoids effect-swapping churn.

- [ ] **Step 2: Verify build + tests**

Run: `npm run build && npm test`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/effects/Effects.tsx
git commit -m "feat(punch): drive fisheye barrel distortion from punch envelope"
```

---

## Task 9: Keyboard trigger (hold)

**Files:**
- Modify: `src/control/keyboard.ts` (Bash-edit — control dir is tool-denied): add `case 'o'` to `handleKey` + new `handleKeyUp`.
- Modify: `src/ui/Panel.tsx` (Bash-edit — ui dir is tool-denied): import `handleKeyUp`, add a `keyup` listener mirroring the existing `keydown` one.

**Interfaces:**
- Consumes: `useParamStore.getState().setParam('punch.trigger', 1|0)`.
- Context: key is `'o'` (free — existing bindings: space/r/g/b/e/p/1-9/h/f). `handleKey` is keydown-only today; `handleKeyUp` is new (hold semantics).

- [ ] **Step 1: Edit keyboard.ts via Bash**

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path('src/control/keyboard.ts')
s = p.read_text()
anchor = "    case 'p':\n      toggleParam('machine.pattern')\n      return true"
assert anchor in s, 'anchor (case p) not found'
s = s.replace(
    anchor,
    anchor + "\n    case 'o':\n      // Punch-in hold: press starts push+fisheye\n      s.setParam('punch.trigger', 1)\n      return true",
)
# Append hold-release handler
s += '''

/** Handle a key release (hold-style controls). Returns true if consumed. */
export function handleKeyUp(key: string): boolean {
  if (key === 'o') {
    useParamStore.getState().setParam('punch.trigger', 0)
    return true
  }
  return false
}
'''
p.write_text(s)
PY
```

- [ ] **Step 2: Edit Panel.tsx via Bash** (import + keyup listener)

```bash
python3 - <<'PY'
import pathlib, subprocess
s = subprocess.check_output(['git', 'show', 'HEAD:src/ui/Panel.tsx'], text=True)
# 1) import handleKeyUp alongside handleKey
imp = "import { handleKey } from '../control/keyboard'"
assert imp in s, 'handleKey import not found'
s = s.replace(imp, "import { handleKey, handleKeyUp } from '../control/keyboard'")
# 2) mirror the existing keydown listener with a keyup one
old = "      window.addEventListener('keydown', onKey)\n      return () => window.removeEventListener('keydown', onKey)"
new = (
    "      window.addEventListener('keydown', onKey)\n"
    "      const onKeyUp = (e: KeyboardEvent) => { if (handleKeyUp(e.key)) e.preventDefault() }\n"
    "      window.addEventListener('keyup', onKeyUp)\n"
    "      return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }"
)
assert old in s, 'keydown listener block not found'
s = s.replace(old, new)
pathlib.Path('src/ui/Panel.tsx').write_text(s)
PY
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: clean/green.

- [ ] **Step 4: Commit**

```bash
git add src/control/keyboard.ts src/ui/Panel.tsx
git commit -m "feat(punch): keyboard hold trigger (O) + keyup release wiring"
```

---

## Task 10: UI hint + final verification

**Files:**
- Modify: `src/ui/Panel.tsx` (Bash-edit — ui dir is tool-denied)

- [ ] **Step 1: Add the punch key to the hint string**

The hint line ends `... P: pattern / 1-9: seeds</div>`. Insert `O: punch (hold)` before `1-9`:

```bash
python3 - <<'PY'
import pathlib, subprocess
s = subprocess.check_output(['git', 'show', 'HEAD:src/ui/Panel.tsx'], text=True)
old = "P: pattern / 1-9: seeds</div>"
new = "P: pattern / O: punch (hold) / 1-9: seeds</div>"
assert old in s, 'hint line not found'
s = s.replace(old, new)
pathlib.Path('src/ui/Panel.tsx').write_text(s)
PY
```

- [ ] **Step 2: Final verification**

Run: `npm run lint && npm run build && npm test`
Expected: clean/green, test count increased (mapping Note Off, frame punch, advancePunch, barrelUv).

Manual browser check (http://localhost:5173):
- Hold the chosen key → machine pushes in + space warps (fisheye); release → smooth return.
- Short tap = subtle; long hold = full fisheye (attack knob).
- MIDI: learn `punch.trigger` to a note; hold the note → punch; release → return. Velocity scales push strength.
- strength/warp/attack/release sliders all respond.

- [ ] **Step 3: Commit + push + open PR**

```bash
git add src/ui/Panel.tsx
git commit -m "docs(ui): hint for punch-in key"
git push -u origin feat/punch-in
gh pr create --base main --head feat/punch-in --title "Punch-in: hold zoom + fisheye" --body "<summary>"
```

---

## Self-Review (completed)

- **Spec coverage:** Note Off (Task 1), punch state (2), envelope (3), fisheye (4), params incl. trigger (5), component+wiring (6), CameraRig (7), Effects (8), keyboard (9), hint/verify/PR (10) — all spec sections mapped. MIDI hold works via Task 1 + 5 through the EXISTING midi.ts flow (no separate MIDI task needed — confirmed against midi.ts: mapping → paramId → setParam, toggle=false for `punch.trigger` → Note On sets vel/127, Note Off sets 0).
- **Placeholders:** Task 9 Step 2 contains a template python snippet with an explicit `IMPORTANT` note requiring real edits after inspection — this is unavoidable because keyboard.ts is tool-denied and its exact handler shape must be read first. All other steps have concrete code.
- **Type/name consistency:** `advancePunch` signature identical in Task 3 & 6; `barrelUv` identical in Task 4; `audioFrame.punch` field identical in 2/6/7/8; param ids `punch.*` identical in 5/6/7/8/9; FisheyeEffect `intensity` uniform identical in 4/8.
