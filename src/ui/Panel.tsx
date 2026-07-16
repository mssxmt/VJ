import { useEffect, useState } from 'react'
import { PARAMS, type ParamGroup } from '../control/params'
import { ParamSlider } from './ParamSlider'
import { audioEngine } from '../audio/engine'
import { useMidiStore } from '../midi/midi'
import { handleKey } from '../control/keyboard'

const GROUPS: ParamGroup[] = ['machine', 'effects', 'camera', 'audio', 'auto']

/** Control overlay: audio source, group tabs, param sliders, keyboard shortcuts. */
export function Panel() {
  const [visible, setVisible] = useState(true)
  const [tab, setTab] = useState<ParamGroup>('machine')
  const [source, setSource] = useState('none')
  const [error, setError] = useState<string | null>(null)
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const midiSupported = useMidiStore((s) => s.supported)
  const learning = useMidiStore((s) => s.learning)

  // Start the mic with a specific input device (undefined = system default),
  // then refresh the device list so labels populate after permission is granted.
  const startWithDevice = async (id?: string) => {
    try {
      await audioEngine.startMic(id)
      const devs = await audioEngine.listInputs()
      setInputs(devs)
      setDeviceId(id)
      setSource(devs.find((d) => d.deviceId === id)?.label ?? 'mic')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    useMidiStore.getState().init().catch((e: Error) => setError(`MIDI: ${e.message}`))
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
        <button onClick={() => startWithDevice(deviceId)}>Mic</button>
        <select
          className="device-select"
          value={deviceId ?? ''}
          onChange={(e) => startWithDevice(e.target.value || undefined)}
          title="Audio input device"
        >
          <option value="">Default input</option>
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId}
            </option>
          ))}
        </select>
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
      {learning && <div className="learn-hint">Move a MIDI control to assign…</div>}
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
      {!midiSupported && <div className="hint">Web MIDI not supported in this browser</div>}
      <div className="hint">H: hide UI / F: fullscreen / Space: AUTO / R: regenerate / G,B: effects / 1-9: seeds</div>
    </div>
  )
}
