import { judgeNote, type NoteState } from './judge'
import type { Mode } from './modes'
import { KeyboardRenderer } from '../render/keyboard'
import { StaffRenderer } from '../render/staff'
import { FallingRenderer } from '../render/falling'
import { FALLING_HEIGHT, noteName } from '../render/layout'
import type { AudioClock } from '../playback/clock'
import { midiToFrequency } from '../playback/clock'
import type { Song } from '../songs/types'
import type { Diagnostics } from '../audio/detector'

export interface GameNote {
  m: number
  s: number
  d: number
  state: NoteState
}

export interface EngineStatus {
  demoPlaying: boolean
  playRunning: boolean
  scoreText: string
  diagnostics: Diagnostics
}

export interface EngineOptions {
  clock: AudioClock
  requestFrame?: (cb: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
}

const COUNTDOWN_BEATS = 2
const MAX_DT_SECONDS = 0.1
/** Diagnostics are status text: a few updates a second is plenty. */
const DIAGNOSTIC_EMIT_INTERVAL_MS = 250
const LOOKAHEAD_SECONDS = 0.25

export function buildGameNotes(song: Song): GameNote[] {
  return song.parts
    .flatMap((part) => part.notes)
    .map((n) => ({ m: n.midi, s: n.startBeat, d: n.beats, state: 0 as NoteState }))
    .sort((a, b) => a.s - b.s)
}

/**
 * Owns all per-frame state for the piano-learn view: the single
 * requestAnimationFrame loop, note timing/judging, the "Listen" audio
 * scheduler, and the three renderers. React only reads discrete status
 * snapshots emitted through `onStatus`.
 */
export class GameEngine {
  private readonly clock: AudioClock
  private readonly requestFrame: (cb: FrameRequestCallback) => number
  private readonly cancelFrame: (handle: number) => void

  private readonly keyboard = new KeyboardRenderer()
  private readonly staff = new StaffRenderer()
  private readonly falling = new FallingRenderer()

  private notes: GameNote[] = []
  private song: Song | null = null
  private bpm = 120
  private barBeats = 4
  private mode: Mode = 'timed'

  private t = 0
  private running = false
  private lastFrameMs = Number.NaN
  private rafHandle = 0

  private detected = new Set<number>()
  private released = new Array<boolean>(128).fill(true)

  private demoPlaying = false
  private demoNotes: GameNote[] = []
  private demoNextIndex = 0
  private demoBeatOrigin = 0
  private demoBps = 1

  private diagnostics: Diagnostics = {
    ctxState: 'closed',
    ctxSampleRate: 0,
    chunkCount: 0,
    inputLevel: 0,
    gate: 0,
    peakProb: 0,
    inferenceMs: 0,
  }

  private statusCb: ((status: EngineStatus) => void) | null = null
  private lastScoreText = ''
  private lastDiagnosticEmit = 0
  private mounted = false

  constructor(options: EngineOptions) {
    this.clock = options.clock
    this.requestFrame =
      options.requestFrame ?? ((cb) => requestAnimationFrame(cb))
    this.cancelFrame =
      options.cancelFrame ?? ((h) => cancelAnimationFrame(h))
  }

  onStatus(cb: (status: EngineStatus) => void): void {
    this.statusCb = cb
  }

  setSong(song: Song): void {
    this.song = song
    this.bpm = song.bpm
    this.barBeats = song.bar || 4
    this.notes = buildGameNotes(song)
    this.resetNotes()
  }

  setMode(mode: Mode): void {
    this.mode = mode
  }

  /** Live tempo control. Stops playback so the new rate takes effect on restart. */
  setBpm(bpm: number): void {
    const next = Math.min(400, Math.max(30, Math.round(bpm)))
    if (next === this.bpm) return
    this.bpm = next
    if (this.demoPlaying) this.stopDemo('Stopped')
  }

  setDiagnostics(d: Diagnostics): void {
    this.diagnostics = d
    // The detector pushes this on every worklet chunk. Emit at most a few
    // times a second: diagnostics are status text (React's job), but the
    // rAF frame rate is not.
    const now = Date.now()
    if (now - this.lastDiagnosticEmit >= DIAGNOSTIC_EMIT_INTERVAL_MS) {
      this.lastDiagnosticEmit = now
      this.emit()
    }
  }

  setDetected(pitches: Set<number>): void {
    this.detected = pitches
  }

  mount(
    keyboardEl: HTMLElement,
    fallingCanvas: HTMLCanvasElement,
    staffCanvas: HTMLCanvasElement,
    viewportWidth: number
  ): void {
    this.keyboard.mount(keyboardEl, viewportWidth)
    const width = this.keyboard.width
    this.falling.mount(fallingCanvas, width, FALLING_HEIGHT)
    this.staff.mount(staffCanvas, Math.min(width, viewportWidth - 48))
    this.mounted = true
    if (!this.rafHandle) {
      this.lastFrameMs = Number.NaN
      this.rafHandle = this.requestFrame(this.frame)
    }
  }

  unmount(): void {
    this.mounted = false
    if (this.rafHandle) {
      this.cancelFrame(this.rafHandle)
      this.rafHandle = 0
    }
    this.keyboard.unmount()
    this.falling.unmount()
    this.staff.unmount()
  }

  startPlay(): void {
    this.stopDemo()
    this.resetNotes()
    this.t = -COUNTDOWN_BEATS
    this.running = true
    this.lastFrameMs = Number.NaN
    this.lastScoreText = ''
    this.setScore('Get ready...')
  }

  stopPlay(): void {
    this.running = false
    this.emit()
  }

  /**
 * Starts Listen playback. Returns null on success, or a human-readable reason
 * for refusing — never a bare `false`, which hid which precondition failed.
 */
  startDemo(): string | null {
    if (!this.song) return 'no song is selected'
    // Without a live audio clock the scheduler would compute a negative time and
    // report "Finished" instantly, so refuse instead of silently doing nothing.
    if (!this.clock.isReady()) return 'the audio clock has not started'
    // The render/scheduler loop has to be running for anything to be audible.
    if (!this.rafHandle) return 'the render loop is not running'
    if (this.song.parts.every((p) => p.notes.length === 0))
      return 'the selected song has no notes'
    this.stopDemo()
    this.running = false
    this.notes = buildGameNotes(this.song)
    this.demoNotes = [...this.notes].sort((a, b) => a.s - b.s)
    this.demoNextIndex = 0
    this.demoBps = this.bpm / 60
    this.demoBeatOrigin = this.clock.now() + COUNTDOWN_BEATS / this.demoBps
    this.t = -COUNTDOWN_BEATS
    this.demoPlaying = true
    this.lastScoreText = ''
    this.setScore('Playing...')
    return null
  }

  stopDemo(message?: string): void {
    if (!this.demoPlaying) return
    this.demoPlaying = false
    try {
      this.clock.releaseAll()
    } catch {
      // voice may already be stopped
    }
    if (message) this.setScore(message)
    else this.emit()
  }

  private resetNotes(): void {
    for (const n of this.notes) n.state = 0
    this.t = 0
    this.lastScoreText = ''
  }

  private frame = (now: number): void => {
    const dt = Number.isNaN(this.lastFrameMs)
      ? 0
      : Math.min(Math.max((now - this.lastFrameMs) / 1000, 0), MAX_DT_SECONDS)
    this.lastFrameMs = now

    const active = this.demoPlaying
      ? this.tickDemo()
      : new Set([...this.detected, ...this.keyboard.manual])
    for (let m = 0; m < 128; m++) {
      if (!active.has(m)) this.released[m] = true
    }

    if (this.running) this.tickGame(dt, active)

    this.staff.draw(this.notes, this.t, this.barBeats)
    this.falling.draw(
      this.notes,
      this.t,
      this.keyboard.geom,
      this.running || this.demoPlaying
    )
    this.keyboard.setActive(active)

    if (this.mounted) this.rafHandle = this.requestFrame(this.frame)
  }

  /** Advances the "Listen" playback clock and schedules upcoming notes. */
  private tickDemo(): Set<number> {
    const now = this.clock.now()
    this.t = (now - this.demoBeatOrigin) * this.demoBps
    while (this.demoNextIndex < this.demoNotes.length) {
      const n = this.demoNotes[this.demoNextIndex]
      if (!n) break
      if (this.demoBeatOrigin + n.s / this.demoBps >= now + LOOKAHEAD_SECONDS) break
      this.demoNextIndex++
      const when = Math.max(this.demoBeatOrigin + n.s / this.demoBps, now)
      try {
        this.clock.triggerAttackRelease(
          midiToFrequency(n.m),
          Math.max(n.d / this.demoBps, 0.12),
          when,
          0.75
        )
      } catch {
        // a failed note must not stop the loop
      }
    }

    const active = new Set(this.keyboard.manual)
    let done = true
    for (const n of this.notes) {
      if (this.t >= n.s) n.state = 1
      if (this.t >= n.s && this.t < n.s + n.d) active.add(n.m)
      if (this.t < n.s + n.d) done = false
    }
    if (done) this.stopDemo('Finished')
    return active
  }

  private tickGame(dt: number, active: Set<number>): void {
    const bps = this.bpm / 60
    const pending = this.notes.filter((n) => n.state === 0)
    if (this.mode === 'wait') {
      const nextStart = pending.length
        ? Math.min(...pending.map((n) => n.s))
        : Infinity
      this.t = Math.min(this.t + dt * bps, nextStart)
    } else {
      this.t += dt * bps
    }

    const inferenceSeconds = this.diagnostics.inferenceMs / 1000
    for (const n of pending) {
      const result = judgeNote(
        n,
        this.t,
        active,
        this.released,
        this.mode,
        inferenceSeconds
      )
      if (result.hit) {
        n.state = result.newState
        this.released[n.m] = false
      } else if (result.miss) {
        n.state = result.newState
      }
    }

    if (this.t >= 0) {
      const hits = this.notes.filter((n) => n.state === 1).length
      this.setScore(`Hit ${hits} / ${this.notes.length}`)
    }
    if (this.notes.length > 0 && this.notes.every((n) => n.state !== 0)) {
      this.running = false
      const hits = this.notes.filter((n) => n.state === 1).length
      const pct = Math.round((100 * hits) / this.notes.length)
      this.setScore(`Done! ${hits} / ${this.notes.length} notes (${pct}%)`)
    }
  }

  private setScore(text: string): void {
    if (text === this.lastScoreText) return
    this.lastScoreText = text
    this.emit()
  }

  private emit(): void {
    this.statusCb?.(this.getStatus())
  }

  getStatus(): EngineStatus {
    return {
      demoPlaying: this.demoPlaying,
      playRunning: this.running,
      scoreText: this.lastScoreText,
      diagnostics: this.diagnostics,
    }
  }
}

export { noteName }