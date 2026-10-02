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
  /** Load the audio module without touching the AudioContext. Safe to call early. */
  prime(): Promise<void>
  /** True once the module is loaded and `now()` returns a real clock value. */
  isReady(): boolean
  /**
   * Resume the AudioContext. Browsers only allow this inside a user gesture, so
   * when the module is already primed this calls into Tone synchronously rather
   * than awaiting anything first.
   */
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

/** Wraps Tone.js. `prime()` then `start()` keeps the user gesture intact. */
export class ToneAudioClock implements AudioClock {
  private tone: typeof import('tone') | null = null
  private voice: PianoVoice | null = null
  private primed: Promise<void> | null = null

  prime(): Promise<void> {
    this.primed ??= import('tone')
      .then((tone) => {
        this.tone = tone
      })
      .catch((err) => {
        // let the next prime() attempt retry instead of caching a rejection
        this.primed = null
        throw err
      })
    return this.primed
  }

  isReady(): boolean {
    return this.tone !== null
  }

  setVoice(voice: PianoVoice): void {
    this.voice = voice
  }

  hasVoice(): boolean {
    return this.voice !== null
  }

  start(): Promise<void> {
    // Already primed: resume synchronously so the browser sees the gesture.
    if (this.tone) return Promise.resolve(this.tone.start())
    return this.prime().then(() => {
      if (!this.tone) throw new Error('audio module failed to load')
      return this.tone.start()
    })
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
    if (!this.voice) return
    this.voice.triggerAttackRelease(note, duration, time, velocity)
  }

  releaseAll(): void {
    try {
      this.voice?.releaseAll()
    } catch {
      // voice may already be torn down
    }
  }
}