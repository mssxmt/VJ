// Canvas + audio recorder (client-side, real-time).
//
// WebM: recorded straight from the canvas at full device resolution (highest
// quality, instant download). MP4: Chrome's native video/mp4 MediaRecorder is
// broken (fragmented MP4 -> wrong duration + dropped audio), so for MP4 we
// downscale to 1080p via a <video> -> offscreen pipeline (fast to transcode)
// and transcode WebM -> MP4 with ffmpeg.wasm post-stop.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export type RecFormat = 'webm' | 'mp4'

export interface RecStartOptions {
  canvas: HTMLCanvasElement
  audioStream: MediaStream
  format: RecFormat
  fps: number
  onStateChange?: (recording: boolean) => void
  onTranscode?: (active: boolean) => void
  onError?: (message: string) => void
}

const CAP_W = 1920
const CAP_H = 1080

function pickWebmMime(): string {
  const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const m of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

// 1080p downscale pipeline for the MP4 path: canvas.captureStream -> <video>
// (reliable to read, unlike a raw WebGL canvas) -> cover-crop onto a 1920x1080
// offscreen -> captureStream. Returns the stream + a cleanup fn.
async function buildCappedStream(
  canvas: HTMLCanvasElement,
  fps: number,
): Promise<{ stream: MediaStream; cleanup: () => void }> {
  const off = document.createElement('canvas')
  off.width = CAP_W
  off.height = CAP_H
  const octx = off.getContext('2d')!

  const srcStream = canvas.captureStream(fps)
  const vid = document.createElement('video')
  vid.srcObject = srcStream
  vid.muted = true
  await vid.play()

  let raf = 0
  const draw = () => {
    const vw = vid.videoWidth
    const vh = vid.videoHeight
    if (vw && vh) {
      const scale = Math.max(CAP_W / vw, CAP_H / vh) // cover
      const sw = CAP_W / scale
      const sh = CAP_H / scale
      octx.drawImage(vid, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, CAP_W, CAP_H)
    }
    raf = requestAnimationFrame(draw)
  }
  raf = requestAnimationFrame(draw)

  const out = off.captureStream(fps)
  return {
    stream: out,
    cleanup: () => {
      cancelAnimationFrame(raf)
      vid.srcObject = null
      srcStream.getTracks().forEach((t) => t.stop())
      out.getTracks().forEach((t) => t.stop())
    },
  }
}

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
    })().catch((err) => {
      // A transient load failure shouldn't poison every later MP4 export.
      ffPromise = null
      throw err
    })
  }
  return ffPromise
}

async function transcodeToMp4(webm: Blob): Promise<Blob> {
  const ff = await loadFF()
  await ff.writeFile('in.webm', await fetchFile(webm))
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
  private cleanupVideo?: () => void
  recording = false

  async start(opts: RecStartOptions): Promise<void> {
    if (this.recording) return
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Recording is not supported in this browser.')
    }
    this.format = opts.format
    this.onTranscode = opts.onTranscode
    this.onError = opts.onError

    // MP4 path: downscale to 1080p so the transcode is fast. WebM path: full res.
    let videoStream: MediaStream
    if (opts.format === 'mp4') {
      const capped = await buildCappedStream(opts.canvas, opts.fps)
      this.cleanupVideo = capped.cleanup
      videoStream = capped.stream
    } else {
      videoStream = opts.canvas.captureStream(opts.fps)
    }

    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...opts.audioStream.getAudioTracks(),
    ])
    this.chunks = []
    this.mr = new MediaRecorder(stream, {
      mimeType: pickWebmMime(),
      videoBitsPerSecond: 16_000_000,
      audioBitsPerSecond: 192_000,
    })
    this.mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.mr.onstop = () => {
      const webm = new Blob(this.chunks, { type: 'video/webm' })
      this.chunks = []
      this.cleanupVideo?.()
      this.cleanupVideo = undefined
      if (this.format === 'mp4') {
        this.onTranscode?.(true)
        transcodeToMp4(webm)
          .then((mp4) => this.download(mp4, 'mp4'))
          .catch((e) =>
            this.onError?.(`MP4 transcode failed: ${e instanceof Error ? e.message : String(e)}`),
          )
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
