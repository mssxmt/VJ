// Canvas + audio recorder (client-side, real-time).
//
// Always records WebM via MediaRecorder (correct duration + audio in Chrome).
// For MP4, the WebM is transcoded post-stop with ffmpeg.wasm — Chrome's native
// video/mp4 MediaRecorder produces fragmented MP4 with broken duration and
// dropped audio, so we don't use it directly.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export type RecFormat = 'webm' | 'mp4'

export interface RecStartOptions {
  canvas: HTMLCanvasElement
  audioStream: MediaStream
  format: RecFormat
  fps: number
  onStateChange?: (recording: boolean) => void
  /** Bumped around the (async) MP4 transcode so the UI can show progress. */
  onTranscode?: (active: boolean) => void
  onError?: (message: string) => void
}

// WebM mime (Chrome records this correctly with audio).
function pickWebmMime(): string {
  const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const m of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

// Lazy singleton ffmpeg.wasm instance (single-thread core, no COOP/COEP needed).
let ffPromise: Promise<FFmpeg> | null = null
function loadFF(): Promise<FFmpeg> {
  if (!ffPromise) {
    ffPromise = (async () => {
      const ff = new FFmpeg()
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      const baseFf = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm'
      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        classWorkerURL: await toBlobURL(`${baseFf}/worker.js`, 'text/javascript'),
      })
      return ff
    })()
  }
  return ffPromise
}

async function transcodeToMp4(webm: Blob): Promise<Blob> {
  const ff = await loadFF()
  await ff.writeFile('in.webm', await fetchFile(webm))
  // yuv420p + faststart -> broadly compatible, web-progressive MP4.
  // ff.runTranscode is ffmpeg.wasm's command runner (not a shell call).
  const args = ['-i', 'in.webm', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'out.mp4']
  await ff.exec(args)
  const data = await ff.readFile('out.mp4')
  await ff.deleteFile('in.webm')
  await ff.deleteFile('out.mp4')
  return new Blob([data as unknown as BlobPart], { type: 'video/mp4' })
}

export class Recorder {
  private mr: MediaRecorder | null = null
  private chunks: Blob[] = []
  private format: RecFormat = 'webm'
  private onTranscode?: (active: boolean) => void
  private onError?: (message: string) => void
  recording = false

  start(opts: RecStartOptions): void {
    if (this.recording) return
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Recording is not supported in this browser.')
    }
    const mime = pickWebmMime()
    const videoStream = opts.canvas.captureStream(opts.fps)
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...opts.audioStream.getAudioTracks(),
    ])
    this.format = opts.format
    this.onTranscode = opts.onTranscode
    this.onError = opts.onError
    this.chunks = []
    this.mr = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 16_000_000,
      audioBitsPerSecond: 192_000,
    })
    this.mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.mr.onstop = () => {
      const webm = new Blob(this.chunks, { type: 'video/webm' })
      this.chunks = []
      if (this.format === 'mp4') {
        this.onTranscode?.(true)
        transcodeToMp4(webm)
          .then((mp4) => this.download(mp4, 'mp4'))
          .catch((e) => this.onError?.(`MP4 transcode failed: ${e instanceof Error ? e.message : String(e)}`))
          .finally(() => this.onTranscode?.(false))
      } else {
        this.download(webm, 'webm')
      }
    }
    this.mr.start(1000)
    this.recording = true
    opts.onStateChange?.(true)
  }

  stop(onStateChange?: (recording: boolean) => void): void {
    if (!this.recording || !this.mr) return
    this.mr.stop()
    this.recording = false
    onStateChange?.(false)
  }

  private download(blob: Blob, ext: 'webm' | 'mp4'): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.href = url
    a.download = `vj-${ts}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
}

export const recorder = new Recorder()
