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
