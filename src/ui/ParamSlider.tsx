import { getParam } from '../control/params'
import { useParamStore } from '../control/store'
import { useMidiStore } from '../midi/midi'

/** One registry param bound to a slider (or checkbox for toggles) with a MIDI learn button. */
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
