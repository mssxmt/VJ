// Canvas + audio recorder (client-side, real-time) using MediaRecorder.
// Captures the WebGL canvas (video) and the engine's analyzed audio stream,
// muxes them, and downloads the result. Format is native MediaRecorder:
// WebM (VP9/Opus) or MP4 (H.264/AAC) where the browser supports it.

export type RecFormat = 'webm' | 'mp4'

export interface RecStartOptions {
  canvas: HTMLCanvasElement
  audioStream: MediaStream
  format: RecFormat
  fps: number
  /** Bumped when recording starts/stops so the UI can reflect state. */
  onStateChange?: (recording: boolean) => void
}

const MIME_CANDIDATES: Record<RecFormat, string[]> = {
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.640029,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/mp4'],
}

/** Pick the first supported mime type for the requested format. */
export function pickMime(format: RecFormat): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of MIME_CANDIDATES[format]) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return null
}

function extFor(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm'
}

export class Recorder {
  private mr: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mime = ''
  recording = false

  start(opts: RecStartOptions): void {
    if (this.recording) return
    const mime = pickMime(opts.format)
    if (!mime) {
      throw new Error(
        `${opts.format.toUpperCase()} recording is not supported in this browser. Try WebM.`,
      )
    }
    const videoStream = opts.canvas.captureStream(opts.fps)
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...opts.audioStream.getAudioTracks(),
    ])
    this.chunks = []
    this.mime = mime
    this.mr = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 16_000_000,
      audioBitsPerSecond: 192_000,
    })
    this.mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.mr.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mime })
      this.download(blob)
      this.chunks = []
    }
    this.mr.start(1000) // gather data every 1s
    this.recording = true
    opts.onStateChange?.(true)
  }

  stop(onStateChange?: (recording: boolean) => void): void {
    if (!this.recording || !this.mr) return
    this.mr.stop()
    this.recording = false
    onStateChange?.(false)
  }

  private download(blob: Blob): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.href = url
    a.download = `vj-${ts}.${extFor(this.mime)}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke a little later so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
}

export const recorder = new Recorder()
