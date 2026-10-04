// Offscreen HUD canvas + texture singleton shared by the painter (HudLayer)
// and the compositor (HudOverlayEffect). Drawn with the 2D API — SDF text
// would add a dependency for a layer that is mostly hairlines and short labels.
import * as THREE from 'three'

export interface HudSurface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
}

let surface: HudSurface | null = null

/** Lazy so importing this module (directly or transitively) in node tests
 *  never touches the DOM; both consumers only call this at render time. */
export function hudSurface(): HudSurface {
  if (!surface) {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const texture = new THREE.CanvasTexture(canvas)
    // Authored in sRGB; the HalfFloat composer samples linear and re-encodes on
    // output, so without this tag the HUD colors would be double-encoded.
    texture.colorSpace = THREE.SRGBColorSpace
    surface = { canvas, ctx: canvas.getContext('2d')!, texture }
  }
  return surface
}
