import { useEffect, useState } from 'react'
import { PARAMS, type ParamGroup } from '../control/params'
import { ParamSlider } from './ParamSlider'
import { audioEngine } from '../audio/engine'
import { useMidiStore } from '../midi/midi'
import { handleKey, handleKeyUp } from '../control/keyboard'
import { recorder, type RecFormat } from '../recorder'

const GROUPS: ParamGroup[] = ['machine', 'effects', 'camera', 'audio', 'auto', 'punch', 'hud']

/** Control overlay: audio source, recording, group tabs, param sliders, keys. */
export function Panel() {
  const [visible, setVisible] = useState(true)
  const [tab, setTab] = useState<ParamGroup>('machine')
  const [source, setSource] = useState('none')
  const [error, setError] = useState<string | null>(null)
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [recording, setRecording] = useState(false)
  const [transcoding, setTranscoding] = useState(false)
  const [format, setFormat] = useState<RecFormat>('webm')
  const midiSupported = useMidiStore((s) => s.supported)
  const learning = useMidiStore((s) => s.learning)

  // Enumerate inputs on mount. Labels stay empty until the first startMic
  // grants permission, so show a positional placeholder until then.
  useEffect(() => {
    audioEngine.listInputs().then(setInputs).catch(() => {})
  }, [])

  // Pick a device -> start mic with it (this is the user gesture that triggers
  // the permission prompt the first time), then refresh so labels fill in.
  const selectInput = async (id: string | undefined) => {
    try {
      setError(null)
      await audioEngine.startMic(id)
      const devs = await audioEngine.listInputs()
      setInputs(devs)
      setDeviceId(id)
      setSource(devs.find((d) => d.deviceId === id)?.label ?? 'default input')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onDeviceChange = (v: string) => {
    if (v === 'off') {
      audioEngine.stop()
      setSource('none')
      setDeviceId(undefined)
      setError(null)
    } else {
      void selectInput(v === '' ? undefined : v)
    }
  }

  const selectValue = audioEngine.source !== 'mic' ? 'off' : deviceId ?? ''

  const toggleRec = async () => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    if (recorder.recording) {
      recorder.stop(setRecording)
      return
    }
    try {
      setError(null)
      await recorder.start({
        canvas,
        audioStream: audioEngine.getAudioStream(),
        format,
        fps: 60,
        onStateChange: setRecording,
        onTranscode: setTranscoding,
        onError: setError,
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    useMidiStore.getState().init().catch((e: Error) => setError(`MIDI: ${e.message}`))
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && (e.target as HTMLInputElement).type !== 'range') return
      if (e.key === 'h') return setVisible((v) => !v)
      if (e.key === 'f') return void document.documentElement.requestFullscreen().catch(() => {})
      if (handleKey(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    const onKeyUp = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement && (e.target as HTMLInputElement).type !== 'range') return; if (handleKeyUp(e.key)) e.preventDefault() }
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
  }, [])

  if (!visible) return null
  return (
    <div className="panel">
      <div className="panel-header">
        <strong>VJ</strong>
        <select
          className="device-select"
          value={selectValue}
          onChange={(e) => onDeviceChange(e.target.value)}
          title="Audio input device (select to start)"
        >
          <option value="off">— input off —</option>
          <option value="">Default input</option>
          {inputs.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Input ${i + 1}`}
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
      <div className="rec-row">
        <button className={recording ? 'rec-btn rec-on' : 'rec-btn'} onClick={toggleRec}>
          {recording ? '● STOP' : '● REC'}
        </button>
        <select
          className="device-select"
          value={format}
          onChange={(e) => setFormat(e.target.value as RecFormat)}
          disabled={recording}
          title="Recording format"
        >
          <option value="webm">WebM</option>
          <option value="mp4">MP4</option>
        </select>
        <span className="rec-hint">{transcoding ? 'transcoding to MP4…' : recording ? 'recording 60fps…' : '60fps · canvas res'}</span>
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
      <div className="hint">H: hide UI / F: fullscreen / Space: AUTO / R: regenerate / G,B,E: effects / P: pattern / T: HUD / O: punch (hold) / 1-9: seeds</div>
    </div>
  )
}
