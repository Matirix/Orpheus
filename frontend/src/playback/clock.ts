export interface PianoVoice {
  triggerAttackRelease(
    note: number | number[],
    duration: number,
    time?: number,
    velocity?: number
  ): unknown
  releaseAll(time?: number): unknown
}

export interface AudioClock {
  start(): Promise<void>
  now(): number
  triggerAttackRelease(
    note: number | number[],
    duration: number,
    time?: number,
    velocity?: number
  ): void
  releaseAll(): void
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * Wraps Tone.js. Call `ensureReady()` before `now()` / `triggerAttackRelease`:
 * both are synchronous once the module and voice are loaded.
 */
export class ToneAudioClock implements AudioClock {
  private tone: typeof import('tone') | null = null
  private voice: PianoVoice | null = null
  private ready: Promise<void> | null = null

  ensureReady(): Promise<void> {
    this.ready ??= import('tone').then((tone) => {
      this.tone = tone
    })
    return this.ready
  }

  setVoice(voice: PianoVoice): void {
    this.voice = voice
  }

  async start(): Promise<void> {
    await this.ensureReady()
    await this.tone?.start()
  }

  now(): number {
    return this.tone?.now() ?? 0
  }

  triggerAttackRelease(
    note: number | number[],
    duration: number,
    time?: number,
    velocity?: number
  ): void {
    this.voice?.triggerAttackRelease(note, duration, time, velocity)
  }

  releaseAll(): void {
    this.voice?.releaseAll()
  }
}