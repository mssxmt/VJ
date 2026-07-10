import { create } from 'zustand'
import { parseMidiMessage, mappingKey, serializeMappings, deserializeMappings } from './mapping'
import { useParamStore } from '../control/store'
import { getParam, clamp01ToRange } from '../control/params'

const STORAGE_KEY = 'vj.midi.mappings'

interface MidiState {
  supported: boolean
  connected: string[] // input names
  mappings: Map<string, string> // controlKey -> paramId
  learning: string | null // paramId currently in learn mode
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
  // Guarded so accidental import in node tests doesn't crash.
  mappings: deserializeMappings(
    (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) ?? '{}',
  ),
  learning: null,

  init: async () => {
    if (!get().supported) return
    const access = await navigator.requestMIDIAccess()
    const attach = () => {
      const names: string[] = []
      access.inputs.forEach((input) => {
        names.push(input.name ?? 'unknown')
        input.onmidimessage = (e: MIDIMessageEvent) => {
          if (!e.data) return
          const msg = parseMidiMessage(e.data)
          if (!msg) return
          const key = mappingKey(msg)
          const { learning, mappings } = get()
          if (learning) {
            // Learn mode: bind this physical control to the pending param.
            const next = new Map(mappings).set(key, learning)
            localStorage.setItem(STORAGE_KEY, serializeMappings(next))
            set({ mappings: next, learning: null })
            return
          }
          const paramId = mappings.get(key)
          if (!paramId) return
          const def = getParam(paramId)
          // Toggles flip on press (any nonzero value); ranges track the control.
          const value = def.toggle
            ? msg.value01 > 0
              ? useParamStore.getState().values[paramId] > 0.5
                ? 0
                : 1
              : null
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
