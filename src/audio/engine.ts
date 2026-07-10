import { computeRms, bandLevel, SpectralFlux } from './features'
import { audioFrame } from './frame'
import { effectiveValue } from '../control/store'

export type AudioSource = 'mic' | 'file' | 'none'

/**
 * Owns the AudioContext, input source and AnalyserNode.
 * Call update() once per render frame to refresh the shared audioFrame.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private gainNode: GainNode | null = null
  private sourceNode: AudioNode | null = null
  private micStream: MediaStream | null = null
  private fileEl: HTMLAudioElement | null = null
  private flux: SpectralFlux | null = null
  private freqData: Float32Array<ArrayBuffer> = new Float32Array(0)
  private timeData: Float32Array<ArrayBuffer> = new Float32Array(0)
  source: AudioSource = 'none'

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.5
      this.gainNode = this.ctx.createGain()
      this.gainNode.connect(this.analyser)
      this.freqData = new Float32Array(this.analyser.frequencyBinCount)
      this.timeData = new Float32Array(this.analyser.fftSize)
      this.flux = new SpectralFlux(this.analyser.frequencyBinCount)
    }
    return this.ctx
  }

  private disconnectSource(): void {
    this.sourceNode?.disconnect()
    this.sourceNode = null
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    if (this.fileEl) {
      this.fileEl.pause()
      this.fileEl = null
    }
    this.source = 'none'
  }

  /** Start microphone / line input. Throws if permission is denied. */
  async startMic(): Promise<void> {
    const ctx = this.ensureContext()
    await ctx.resume()
    this.disconnectSource()
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.sourceNode = ctx.createMediaStreamSource(this.micStream)
    this.sourceNode.connect(this.gainNode!)
    this.source = 'mic'
  }

  /** Play a local audio file and analyze it (also routed to speakers). */
  async playFile(file: File): Promise<void> {
    const ctx = this.ensureContext()
    await ctx.resume()
    this.disconnectSource()
    this.fileEl = new Audio(URL.createObjectURL(file))
    this.fileEl.loop = true
    const node = ctx.createMediaElementSource(this.fileEl)
    node.connect(this.gainNode!)
    this.gainNode!.connect(ctx.destination) // hear file playback; mic path stays analysis-only
    this.sourceNode = node
    await this.fileEl.play()
    this.source = 'file'
  }

  stop(): void {
    this.gainNode?.disconnect()
    if (this.analyser && this.gainNode) this.gainNode.connect(this.analyser)
    this.disconnectSource()
  }

  /** Refresh the shared audioFrame. Call once per render frame. */
  update(time: number): void {
    if (!this.analyser || !this.ctx || this.source === 'none') return
    this.gainNode!.gain.value = effectiveValue('audio.gain')
    this.analyser.getFloatTimeDomainData(this.timeData)
    this.analyser.getFloatFrequencyData(this.freqData)
    // Convert dB (-100..0) to normalized magnitudes [0,1]
    const mags = this.freqData
    for (let i = 0; i < mags.length; i++) mags[i] = Math.min(1, Math.max(0, (mags[i] + 100) / 100))

    const sr = this.ctx.sampleRate
    const fft = this.analyser.fftSize
    audioFrame.time = time
    audioFrame.rms = computeRms(this.timeData)
    // Smooth-follow band envelopes (fast attack, slow release)
    const follow = (cur: number, target: number) =>
      target > cur ? cur + (target - cur) * 0.6 : cur + (target - cur) * 0.15
    audioFrame.low = follow(audioFrame.low, bandLevel(mags, sr, fft, 20, 150))
    audioFrame.mid = follow(audioFrame.mid, bandLevel(mags, sr, fft, 150, 2000))
    audioFrame.high = follow(audioFrame.high, bandLevel(mags, sr, fft, 2000, 12000))

    const { onset } = this.flux!.update(mags, effectiveValue('audio.onsetSense'))
    audioFrame.onset = onset
    if (onset) audioFrame.onsetEnv = 1
    else audioFrame.onsetEnv *= 0.88
  }
}

export const audioEngine = new AudioEngine()
