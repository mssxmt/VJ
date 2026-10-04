import { useParamStore } from './store'
import { getParam } from './params'

/** Toggle a param between 0 and its default (or 1 when the default is 0). */
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
      // Re-roll until the seed actually changes so the machine always regenerates.
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
    case 'e':
      toggleParam('effects.empBeam')
      return true
    case 'p':
      toggleParam('machine.pattern')
      return true
    case 't':
      toggleParam('hud.visible')
      return true
    case 'o':
      // Punch-in hold: press starts push+fisheye
      s.setParam('punch.trigger', 1)
      return true
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9': {
      s.setParam('machine.seed', Number(key) * 1111) // quick preset seeds
      return true
    }
    default:
      return false
  }
}


/** Handle a key release (hold-style controls). Returns true if consumed. */
export function handleKeyUp(key: string): boolean {
  if (key === 'o') {
    useParamStore.getState().setParam('punch.trigger', 0)
    return true
  }
  return false
}
