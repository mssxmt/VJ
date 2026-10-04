import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The transcode path is browser-only and never reached here; stub the module
// so importing the recorder works in node.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {} }))
vi.mock('@ffmpeg/util', () => ({ fetchFile: vi.fn(), toBlobURL: vi.fn() }))

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported(): boolean {
    return true
  }
  state: 'inactive' | 'recording' | 'stopped' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  // erasableSyntaxOnly: no parameter properties — explicit fields instead.
  stream: { parts: unknown[] }
  constructor(stream: { parts: unknown[] }, _opts: unknown) {
    this.stream = stream
    FakeMediaRecorder.instances.push(this)
  }
  start(): void {
    this.state = 'recording'
  }
  stop(): void {
    // onstop fires only when the test drives it — that timing is the bug.
    this.state = 'stopped'
  }
}

const track = () => ({ stop: vi.fn() })
const fakeStream = () => ({ getVideoTracks: () => [track()], getAudioTracks: () => [track()] })
const fakeCanvas = () => ({ captureStream: () => fakeStream() })

let downloads: string[]
beforeEach(() => {
  FakeMediaRecorder.instances = []
  downloads = []
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal(
    'MediaStream',
    class {
      parts: unknown[]
      constructor(parts: unknown[]) {
        this.parts = parts
      }
    },
  )
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
  vi.stubGlobal('document', {
    createElement: () => ({
      href: '',
      download: '',
      click(this: { download: string }) {
        downloads.push(this.download)
      },
      remove() {},
    }),
    body: { appendChild: () => {}, removeChild: () => {} },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

import { Recorder } from './recorder'

function startOpts(): Parameters<Recorder['start']>[0] {
  return {
    canvas: fakeCanvas() as unknown as HTMLCanvasElement,
    audioStream: fakeStream() as unknown as MediaStream,
    format: 'webm',
    fps: 60,
  }
}

describe('Recorder session isolation', () => {
  it('stop(); start() before the first onstop leaves the new session intact', async () => {
    const rec = new Recorder()
    await rec.start(startOpts())
    const first = FakeMediaRecorder.instances.at(-1)!
    first.ondataavailable?.({ data: new Blob(['first-session']) })

    rec.stop() // queues the stop; onstop has NOT fired yet
    await rec.start(startOpts())
    const second = FakeMediaRecorder.instances.at(-1)!
    expect(second).not.toBe(first)
    expect(rec.recording).toBe(true)

    // The stale session's onstop fires late — it must flush its own blob
    // without touching the new session's flag or killing its video tracks.
    first.onstop?.()
    expect(rec.recording).toBe(true)
    expect(second.state).toBe('recording')
    expect(second.stream.parts[0]).toHaveProperty('stop')
    expect((second.stream.parts[0] as { stop: ReturnType<typeof vi.fn> }).stop).not.toHaveBeenCalled()
    expect(downloads).toHaveLength(1) // stale blob still delivered

    second.ondataavailable?.({ data: new Blob(['second-session']) })
    second.onstop?.()
    expect(rec.recording).toBe(false)
    expect(downloads).toHaveLength(2)
  })

  it('surfaces recording state through onStateChange', async () => {
    const rec = new Recorder()
    const states: boolean[] = []
    await rec.start({ ...startOpts(), onStateChange: (r) => states.push(r) })
    const mr = FakeMediaRecorder.instances.at(-1)!
    expect(rec.recording).toBe(true)
    mr.onstop?.()
    expect(rec.recording).toBe(false)
    expect(states).toEqual([true, false])
  })
})
