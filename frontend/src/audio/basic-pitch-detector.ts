import { BasicPitch } from '@spotify/basic-pitch'
import type { NoteDetector, Diagnostics } from './detector'

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json'
const SAMPLE_RATE = 22050
const WINDOW = 43844
const READBACK: Record<string, [number, number]> = {
  fast: [1, 3],
  balanced: [2, 5],
  accurate: [3, 6],
}

const WORKLET_SRC = `
class Cap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice()); return true; }
}
registerProcessor("cap", Cap);
`

export class BasicPitchDetector implements NoteDetector {
  private notesCallback: ((notes: Set<number>) => void) | null = null
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private bp: BasicPitch | null = null
  private running = false
  private chunkCount = 0
  private maxProb = 0
  private inferMs = 0
  private ring = new Float32Array(WINDOW)
  private gate = 0.003
  private threshold = 0.3
  private mode: 'fast' | 'balanced' | 'accurate' = 'balanced'

  async start(): Promise<void> {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    await this.ctx.resume()

    this.bp = new BasicPitch(MODEL_URL)
    await this.bp.evaluateModel(new Float32Array(WINDOW), () => {}, () => {})

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })

    const ratio = this.ctx.sampleRate / SAMPLE_RATE
    let acc = 0
    let cnt = 0
    let phase = 0

    const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' })
    if (this.ctx) {
      await this.ctx.audioWorklet.addModule(URL.createObjectURL(blob))
      const node = new AudioWorkletNode(this.ctx, 'cap')
      if (this.stream) {
        const source = this.ctx.createMediaStreamSource(this.stream)
        source.connect(node)
      }
      node.port.onmessage = (e: MessageEvent) => {
        this.chunkCount++
        const c = e.data as Float32Array
        for (let i = 0; i < c.length; i++) {
          acc += c[i]
          cnt++
          phase += 1
          if (phase >= ratio) {
            phase -= ratio
            const outVal = acc / cnt
            this.ring.copyWithin(0, 1)
            this.ring[WINDOW - 1] = outVal
            acc = 0
            cnt = 0
          }
        }
      }
    }

    this.running = true
    this.loop()
  }

  private async loop(): Promise<void> {
    if (!this.running || !this.bp) return

    let sum = 0
    for (let i = WINDOW - 4096; i < WINDOW; i++) {
      sum += this.ring[i] * this.ring[i]
    }
    const level = Math.sqrt(sum / 4096)

    if (level < this.gate) {
      this.notesCallback?.(new Set())
      setTimeout(() => this.loop(), 20)
      return
    }

    const t0 = performance.now()
    let frames: number[][] | null = null
    try {
      await this.bp.evaluateModel(this.ring.slice(), (f: number[][]) => {
        frames = f
      }, () => {})
    } catch (e) {
      console.error(e)
    }
    const ms = performance.now() - t0
    this.inferMs = this.inferMs ? this.inferMs * 0.8 + ms * 0.2 : ms

    if (frames && frames.length) {
      const [back, count] = READBACK[this.mode]
      const end = frames.length - back
      const start = Math.max(0, end - count)
      const act = new Set<number>()
      for (let t = start; t < end; t++) {
        const frameArr = frames[t]
        if (!frameArr) continue
        for (let i = 0; i < frameArr.length; i++) {
          const p = frameArr[i]
          if (p > this.maxProb) this.maxProb = p
          if (p > this.threshold) {
            act.add(i + 21)
          }
        }
      }
      this.notesCallback?.(act)
    }

    setTimeout(() => this.loop(), 0)
  }

  stop(): void {
    this.running = false
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
    }
    if (this.ctx) {
      this.ctx.close()
    }
  }

  onNotes(cb: (notes: Set<number>) => void): void {
    this.notesCallback = cb
  }

  getDiagnostics(): Diagnostics {
    return {
      ctxState: this.ctx?.state || 'closed',
      ctxSampleRate: this.ctx?.sampleRate || 0,
      chunkCount: this.chunkCount,
      inputLevel: 0,
      gate: this.gate,
      peakProb: this.maxProb,
      inferenceMs: this.inferMs,
    }
  }

  setGate(gate: number): void {
    this.gate = gate
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold
  }

  setMode(mode: 'fast' | 'balanced' | 'accurate'): void {
    this.mode = mode
  }
}
