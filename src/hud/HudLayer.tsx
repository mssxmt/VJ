// In-canvas measurement HUD. Paints an offscreen 2D canvas once per frame and
// lets HudOverlayEffect composite it inside the postprocessing chain — a DOM
// overlay would be invisible to canvas.captureStream recordings. Mounted after
// CameraRig/Effects in App so this useFrame runs last at priority 0 and sees
// this frame's mesh + camera transforms.
import { useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { hudSurface } from './hudCanvas'
import { hudTracking } from './tracking'
import { audioFrame } from '../audio/frame'
import { effectiveValue } from '../control/store'
import { MAX_TRACKED } from '../control/params'
import { recorder } from '../recorder'
import {
  createSlot,
  advanceSlot,
  triggerAcquire,
  telemetryAlpha,
  type SlotState,
} from './lifecycle'
import {
  formatSeed,
  formatPattern,
  formatPartLabel,
  formatDistance,
  formatTimecode,
  formatRms,
  formatAzEl,
  formatClock,
  bandBarLevels,
  typeSlice,
} from './format'
import { loadHudFonts, HUD_FONT } from './font'

// Ice palette only — warm accents were considered and rejected in the design
// session, so event emphasis is carried by brightness, never by hue.
const BRIGHT = '224, 236, 246'
const BASE = '201, 215, 226'
const DIM = '127, 139, 148'

/** Paint-resolution cap on the LONG edge. Hairline HUD tolerates a slight
 *  upscale; uploading a full-retina canvas texture every frame does not. */
const MAX_EDGE = 2048

/** Base layout margin in design units (all sizes scale by min(w,h)/1080). */
const M = 44

/** Region all fixed furniture must stay inside. Brackets are exempt — they
 *  track geometry and may go wherever the part goes. */
interface SafeRect {
  x0: number
  y0: number
  x1: number
  y1: number
}
const _rect: SafeRect = { x0: 0, y0: 0, x1: 0, y1: 0 }

// The MP4 export cover-crops to a centered 16:9 (recorder.ts), so anything
// outside that region is cut from the file. The 12% inset cap deliberately
// accepts truncation at extreme aspects (portrait windows): insetting further
// would drag the frame furniture into the middle of the live projection, and
// live output outranks an export nobody runs in portrait.
function computeSafeRect(w: number, h: number, u: number): SafeRect {
  const m = M * u
  const cropX = Math.min(Math.max((w - (h * 16) / 9) / 2, 0), 0.12 * w)
  const cropY = Math.min(Math.max((h - (w * 9) / 16) / 2, 0), 0.12 * h)
  _rect.x0 = m + cropX
  _rect.y0 = m + cropY
  _rect.x1 = w - m - cropX
  _rect.y1 = h - m - cropY
  return _rect
}

function hudFont(weight: 300 | 400, size: number): string {
  return `${weight} ${size}px '${HUD_FONT}', ui-monospace, monospace`
}

function drawFrameFurniture(
  ctx: CanvasRenderingContext2D,
  r: SafeRect,
  u: number,
  a: number,
): void {
  const arm = 20 * u
  ctx.strokeStyle = `rgba(${DIM}, ${0.85 * a})`
  ctx.lineWidth = Math.max(1, 1.2 * u)
  ctx.beginPath()
  // Corner registration marks — an open frame, deliberately never closed.
  ctx.moveTo(r.x0, r.y0 + arm)
  ctx.lineTo(r.x0, r.y0)
  ctx.lineTo(r.x0 + arm, r.y0)
  ctx.moveTo(r.x1 - arm, r.y0)
  ctx.lineTo(r.x1, r.y0)
  ctx.lineTo(r.x1, r.y0 + arm)
  ctx.moveTo(r.x0, r.y1 - arm)
  ctx.lineTo(r.x0, r.y1)
  ctx.lineTo(r.x0 + arm, r.y1)
  ctx.moveTo(r.x1 - arm, r.y1)
  ctx.lineTo(r.x1, r.y1)
  ctx.lineTo(r.x1, r.y1 - arm)
  // Sparse ticks along the top and bottom safe edges.
  for (const f of [0.4, 0.5, 0.6]) {
    const x = r.x0 + (r.x1 - r.x0) * f
    ctx.moveTo(x, r.y0 - 3 * u)
    ctx.lineTo(x, r.y0 + 4 * u)
    ctx.moveTo(x, r.y1 - 4 * u)
    ctx.lineTo(x, r.y1 + 3 * u)
  }
  ctx.stroke()
}

function drawTopLeft(
  ctx: CanvasRenderingContext2D,
  r: SafeRect,
  u: number,
  a: number,
  elapsed: number,
): void {
  const x = r.x0 + 14 * u
  const y = r.y0 + 16 * u
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = hudFont(400, 21 * u)
  ctx.fillStyle = `rgba(${BASE}, ${0.9 * a})`
  ctx.fillText(formatSeed(effectiveValue('machine.seed')), x, y)
  ctx.font = hudFont(300, 15 * u)
  ctx.fillStyle = `rgba(${DIM}, ${a})`
  const pat = formatPattern(effectiveValue('machine.pattern') > 0.5)
  const sym = Math.round(effectiveValue('machine.symmetry'))
  const parts = Math.round(effectiveValue('machine.partCount'))
  ctx.fillText(`${pat} · SYM ${sym} · P ${parts}`, x, y + 30 * u)
  // Session clock: tenths tick 10x/s so the cluster visibly runs even when the
  // audio is silent — the "instrument is alive" floor state made literal.
  ctx.font = hudFont(300, 13 * u)
  ctx.fillStyle = `rgba(${DIM}, ${0.85 * a})`
  ctx.fillText(formatClock(elapsed), x, y + 53 * u)
}

const _levels: number[] = []

function drawBottomRight(
  ctx: CanvasRenderingContext2D,
  r: SafeRect,
  u: number,
  a: number,
  camera: THREE.Camera,
): void {
  const x = r.x1 - 14 * u
  let y = r.y1 - 16 * u
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'

  // REC burn-in: gun-camera convention, part of the output by design
  // (hud.recBurnIn opts out). Full alpha — the recording claim stays legible
  // even when the telemetry has breathed down to its floor. The dot is an
  // arc, not '●': the bundled latin woff2 subset lacks U+25CF, and a fallback
  // glyph would break the monospace rhythm.
  if (recorder.recording && effectiveValue('hud.recBurnIn') > 0.5) {
    const elapsed = (performance.now() - recorder.startedAt) / 1000
    const blink = (Math.sin((performance.now() / 1000) * Math.PI * 1.8) + 1) / 2
    const alpha = 0.45 + 0.4 * blink
    const text = `REC ${formatTimecode(elapsed)}`
    ctx.font = hudFont(400, 16 * u)
    ctx.fillStyle = `rgba(${BRIGHT}, ${alpha})`
    ctx.fillText(text, x, y)
    const dotR = 4.5 * u
    ctx.beginPath()
    ctx.arc(x - ctx.measureText(text).width - dotR - 8 * u, y - 5 * u, dotR, 0, Math.PI * 2)
    ctx.fill()
    y -= 27 * u
  }
  if (effectiveValue('auto.master') > 0.5) {
    ctx.font = hudFont(400, 15 * u)
    ctx.fillStyle = `rgba(${BASE}, ${0.8 * a})`
    ctx.fillText('AUTO', x, y)
    y -= 25 * u
  }
  ctx.font = hudFont(300, 15 * u)
  ctx.fillStyle = `rgba(${DIM}, ${a})`
  ctx.fillText(formatRms(audioFrame.rms), x, y)
  y -= 24 * u

  // Camera bearing: autoRotate turns azimuth every frame, so this line churns
  // permanently — real motion data, not decorated randomness.
  const p = camera.position
  const az = Math.atan2(p.x, p.z) * (180 / Math.PI)
  const el = Math.atan2(p.y, Math.hypot(p.x, p.z)) * (180 / Math.PI)
  ctx.font = hudFont(300, 13 * u)
  ctx.fillStyle = `rgba(${DIM}, ${0.85 * a})`
  ctx.fillText(formatAzEl(az, el), x, y)
  y -= 27 * u

  // 7-band meter, quantized so the bars step instead of shimmer.
  const levels = bandBarLevels(audioFrame.bands, 8, _levels)
  const bw = 6 * u
  const gap = 4 * u
  const maxH = 40 * u
  const left = x - levels.length * (bw + gap) + gap
  ctx.fillStyle = `rgba(${BASE}, ${0.75 * a})`
  for (let i = 0; i < levels.length; i++) {
    const bh = (levels[i] / 8) * maxH
    if (bh > 0) ctx.fillRect(left + i * (bw + gap), y - bh, bw, bh)
  }
  ctx.fillStyle = `rgba(${DIM}, ${0.5 * a})`
  ctx.fillRect(left, y + 3 * u, levels.length * (bw + gap) - gap, Math.max(1, u))
}

function strokeBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  arm: number,
  lw: number,
  style: string,
): void {
  ctx.strokeStyle = style
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(x - half + arm, y - half)
  ctx.lineTo(x - half, y - half)
  ctx.lineTo(x - half, y - half + arm)
  ctx.moveTo(x + half - arm, y - half)
  ctx.lineTo(x + half, y - half)
  ctx.lineTo(x + half, y - half + arm)
  ctx.moveTo(x - half + arm, y + half)
  ctx.lineTo(x - half, y + half)
  ctx.lineTo(x - half, y + half - arm)
  ctx.moveTo(x + half - arm, y + half)
  ctx.lineTo(x + half, y + half)
  ctx.lineTo(x + half, y + half - arm)
  ctx.stroke()
}

const _world = new THREE.Vector3()

// Per-frame label rects for collision avoidance (preallocated, reset by count).
const _labelRects = Array.from({ length: MAX_TRACKED }, () => ({ x: 0, y: 0, w: 0, h: 0 }))
let _labelCount = 0

function labelCollides(x: number, y: number, w: number, h: number): boolean {
  for (let i = 0; i < _labelCount; i++) {
    const r = _labelRects[i]
    if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return true
  }
  return false
}

function pushLabelRect(x: number, y: number, w: number, h: number): void {
  const r = _labelRects[_labelCount++]
  r.x = x
  r.y = y
  r.w = w
  r.h = h
}

function drawBrackets(
  ctx: CanvasRenderingContext2D,
  camera: THREE.Camera,
  w: number,
  h: number,
  u: number,
  dt: number,
  slots: SlotState[],
  lastGen: MutableRefObject<number>,
): void {
  if (hudTracking.generation !== lastGen.current) {
    lastGen.current = hudTracking.generation
    for (let i = 0; i < slots.length; i++) triggerAcquire(slots[i], i * 0.12)
  }
  const targets = Math.min(
    Math.round(effectiveValue('hud.targets')),
    hudTracking.parts.length,
  )
  camera.updateMatrixWorld()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  _labelCount = 0
  for (let i = 0; i < slots.length; i++) {
    // Slots beyond the target count are fed silence so lowering then raising
    // hud.targets fades and re-acquires instead of popping stale locked slots.
    const part = i < targets ? hudTracking.parts[i] : undefined
    const slot = slots[i]
    if (part) advanceSlot(slot, audioFrame.bands[part.band] ?? 0, audioFrame.onsetEnv, dt)
    else advanceSlot(slot, 0, 0, dt)
    if (!part || slot.alpha <= 0.02) continue

    // Real projection of the real part — the brackets track geometry, they
    // are not composed decoration.
    part.mesh.updateWorldMatrix(true, false)
    _world.setFromMatrixPosition(part.mesh.matrixWorld)
    const dist = camera.position.distanceTo(_world)
    _world.project(camera)
    if (_world.z > 1 || _world.z < -1) continue
    const px = (_world.x * 0.5 + 0.5) * w
    const py = (-_world.y * 0.5 + 0.5) * h
    if (px < -60 || px > w + 60 || py < -60 || py > h + 60) continue

    const eased = 1 - Math.pow(1 - slot.progress, 3)
    const half = (26 + (1 - eased) * 34) * u
    const alpha = slot.alpha * 0.9
    strokeBracket(ctx, px, py, half, 8 * u, Math.max(1, 1.3 * u), `rgba(${BASE}, ${alpha})`)

    const label = typeSlice(
      `${formatPartLabel(part.partId)} · ${formatDistance(dist)}`,
      slot.progress,
    )
    const locked = slot.phase === 'locked'
    ctx.font = hudFont(400, 14 * u)
    // Collision handling: measure the full final text (stable bound), try the
    // mirrored anchor below the bracket, and if both collide draw the bracket
    // without text this frame — restraint over completeness.
    const tw = ctx.measureText(locked ? `${label} · LCK` : label).width
    const th = 17 * u
    const lx = px + half + 12 * u
    let ly = py - half
    if (labelCollides(lx, ly, tw, th)) {
      ly = py + half + 4 * u
      if (labelCollides(lx, ly, tw, th)) continue
    }
    pushLabelRect(lx, ly, tw, th)
    ctx.fillStyle = `rgba(${BASE}, ${alpha})`
    ctx.fillText(label, lx, ly)
    if (locked) {
      ctx.fillStyle = `rgba(${BRIGHT}, ${Math.min(1, alpha + 0.1)})`
      ctx.fillText(' · LCK', lx + ctx.measureText(label).width, ly)
    }
  }
}

export function HudLayer() {
  const slots = useRef<SlotState[]>(Array.from({ length: MAX_TRACKED }, createSlot))
  const lastGen = useRef(-1)
  const smoothTele = useRef(0)
  const cleared = useRef(false)

  useEffect(() => {
    loadHudFonts()
  }, [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05) // clamp to avoid jumps on tab refocus
    const { canvas, ctx, texture } = hudSurface()
    if (effectiveValue('hud.visible') < 0.5) {
      // One clear + upload, then idle: a hidden HUD must cost nothing per frame.
      if (!cleared.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        texture.needsUpdate = true
        cleared.current = true
      }
      return
    }
    cleared.current = false

    const buf = state.gl.domElement
    const down = Math.min(1, MAX_EDGE / Math.max(buf.width, buf.height))
    const w = Math.max(2, Math.round(buf.width * down))
    const h = Math.max(2, Math.round(buf.height * down))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      // three allocates immutable texStorage2D storage sized to the first
      // upload; a resized canvas would hit glCopySubTexture overflow errors.
      // dispose() drops the GL texture so the next bind reallocates at the
      // new size (the THREE.Texture object identity stays valid).
      texture.dispose()
    }
    // min(): identical to h/1080 on landscape, keeps type/margins sane when
    // someone runs a portrait window.
    const u = Math.min(w, h) / 1080

    ctx.clearRect(0, 0, w, h)
    ctx.letterSpacing = `${2.5 * u}px`

    const tele = telemetryAlpha(audioFrame.rms, audioFrame.onsetEnv)
    smoothTele.current += (tele - smoothTele.current) * Math.min(1, dt * 6)
    const a = smoothTele.current

    const r = computeSafeRect(w, h, u)
    drawFrameFurniture(ctx, r, u, a)
    drawTopLeft(ctx, r, u, a, state.clock.elapsedTime)
    drawBottomRight(ctx, r, u, a, state.camera)
    drawBrackets(ctx, state.camera, w, h, u, dt, slots.current, lastGen)

    texture.needsUpdate = true
  })

  return null
}
