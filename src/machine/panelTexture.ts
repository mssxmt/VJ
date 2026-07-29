// Procedural panel-line albedo textures for machine parts.
// A seeded generator draws an ASYMMETRIC multi-sub-panel layout (engraved
// grooves + rivets + diagonal lines) so EACH part id gets its own unique look.
// Applied as the material `map` (albedo): grooves darken the metal -> hard-
// surface / mecha look. MachineObject owns a per-generation Map (useMemo on
// `flat`) and disposes the previous generation in an effect cleanup — there is
// no module-level cache, so memory stays bounded to the current part set.
import * as THREE from 'three'
import { createRng, range } from '../lib/random'

const TEX_SIZE = 256
const GROOVE = '#14161a'
const HI = '#f4f4f4'

/** Draw one unique asymmetric panel-line texture for the given part id. */
export function createPanelTexture(id: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = TEX_SIZE
  cv.height = TEX_SIZE
  const g = cv.getContext('2d')!
  const rng = createRng((id * 2654435761) >>> 0)
  const S = TEX_SIZE

  g.fillStyle = '#dcdcdc'
  g.fillRect(0, 0, S, S)

  const rect = (x: number, y: number, w: number, h: number, lineW: number) => {
    g.strokeStyle = GROOVE
    g.lineWidth = lineW
    g.strokeRect(x, y, w, h)
    g.strokeStyle = HI
    g.lineWidth = 1
    g.strokeRect(x + lineW + 1, y + lineW + 1, w - 2 * lineW - 2, h - 2 * lineW - 2)
  }
  const rivets = (x: number, y: number, w: number, h: number, n: number) => {
    g.fillStyle = GROOVE
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      ;[y, y + h].forEach((py) => {
        g.beginPath()
        g.arc(x + t * w, py, 2.4, 0, Math.PI * 2)
        g.fill()
      })
    }
  }

  // Outer face border.
  rect(8, 8, S - 16, S - 16, 3)

  // Several asymmetric sub-panels of varied size/position.
  const panelCount = 3 + Math.floor(rng() * 3) // 3..5
  for (let i = 0; i < panelCount; i++) {
    const w = range(rng, 40, 120)
    const h = range(rng, 40, 120)
    const x = Math.floor(range(rng, 14, S - 14 - w))
    const y = Math.floor(range(rng, 14, S - 14 - h))
    rect(x, y, w, h, 2)
    if (rng() < 0.6) rivets(x, y, w, h, 2 + Math.floor(rng() * 3))
  }

  g.strokeStyle = GROOVE
  g.lineWidth = 2
  // 1-2 straight dividers at asymmetric offsets.
  const divs = 1 + Math.floor(rng() * 2)
  for (let i = 0; i < divs; i++) {
    g.beginPath()
    if (rng() < 0.5) {
      const x = Math.floor(range(rng, 40, S - 40))
      g.moveTo(x, 14)
      g.lineTo(x, S - 14)
    } else {
      const y = Math.floor(range(rng, 40, S - 40))
      g.moveTo(14, y)
      g.lineTo(S - 14, y)
    }
    g.stroke()
  }
  // 1-3 diagonal groove lines (asymmetric, angled).
  const diags = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < diags; i++) {
    g.beginPath()
    g.moveTo(range(rng, 14, S - 14), range(rng, 14, S - 14))
    g.lineTo(range(rng, 14, S - 14), range(rng, 14, S - 14))
    g.stroke()
  }

  // Occasional circular access port.
  if (rng() < 0.5) {
    g.strokeStyle = GROOVE
    g.lineWidth = 2
    g.beginPath()
    g.arc(range(rng, 50, S - 50), range(rng, 50, S - 50), range(rng, 10, 22), 0, Math.PI * 2)
    g.stroke()
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
