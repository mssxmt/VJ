// Runtime loader for the bundled IBM Plex Mono subsets (OFL — the license
// lives in public/OFL.txt so Vite ships it verbatim next to the woff2 in dist).
// Canvas 2D silently falls back to the generic monospace until document.fonts
// contains the faces — no readiness flag needed.
import lightUrl from '../assets/fonts/IBMPlexMono-Light.woff2?url'
import regularUrl from '../assets/fonts/IBMPlexMono-Regular.woff2?url'

export const HUD_FONT = 'IBM Plex Mono'

let started = false

export function loadHudFonts(): void {
  if (started || typeof FontFace === 'undefined') return
  started = true
  const faces = [
    new FontFace(HUD_FONT, `url(${lightUrl})`, { weight: '300' }),
    new FontFace(HUD_FONT, `url(${regularUrl})`, { weight: '400' }),
  ]
  for (const face of faces) {
    // Fire and forget: a failed load just keeps the monospace fallback.
    face.load().then((f) => document.fonts.add(f), () => {})
  }
}
