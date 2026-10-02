import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameEngine, buildGameNotes } from '../../src/game/engine'
import type { AudioClock } from '../../src/playback/clock'
import type { Song } from '../../src/songs/types'

class FakeClock implements AudioClock {
  time = 0
  played: { freq: number; duration: number; time: number }[] = []
  released = 0
  async start() {}
  now() {
    return this.time
  }
  triggerAttackRelease(
    note: number | number[],
    duration: number,
    time?: number
  ) {
    this.played.push({ freq: note as number, duration, time: time ?? 0 })
  }
  releaseAll() {
    this.released++
  }
}

const SONG: Song = {
  bpm: 120,
  bar: 4,
  parts: [
    {
      name: 'Melody',
      notes: [
        { midi: 60, startBeat: 0, beats: 1 },
        { midi: 64, startBeat: 1, beats: 1 },
      ],
    },
  ],
}

/** Drives the engine's rAF loop manually and captures frames. */
function makeDriver() {
  let pending: FrameRequestCallback | null = null
  let now = 0
  const driver = {
    requestFrame(cb: FrameRequestCallback) {
      pending = cb
      return 1
    },
    cancelFrame() {
      pending = null
    },
    /** Advance the fake clock and run one frame. */
    step(ms: number) {
      now += ms
      const cb = pending
      pending = null
      cb?.(now)
    },
    get hasPendingFrame() {
      return pending !== null
    },
  }
  return driver
}

function mount(engine: GameEngine) {
  const keyboard = document.createElement('div')
  const falling = document.createElement('canvas')
  const staff = document.createElement('canvas')
  vi.spyOn(falling, 'getContext').mockReturnValue(null)
  vi.spyOn(staff, 'getContext').mockReturnValue(null)
  engine.mount(keyboard, falling, staff, 1200)
  return { keyboard, falling, staff }
}

describe('buildGameNotes', () => {
  it('flattens parts and sorts by start beat', () => {
    const notes = buildGameNotes(SONG)
    expect(notes).toHaveLength(2)
    expect(notes[0]?.s).toBe(0)
    expect(notes[1]?.s).toBe(1)
    expect(notes[0]?.state).toBe(0)
  })
})

describe('GameEngine frame loop', () => {
  let clock: FakeClock
  let driver: ReturnType<typeof makeDriver>
  let engine: GameEngine

  beforeEach(() => {
    clock = new FakeClock()
    driver = makeDriver()
    engine = new GameEngine({
      clock,
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
    })
    engine.setSong(SONG)
  })

  afterEach(() => {
    engine.unmount()
  })

  it('keeps requesting frames while mounted', () => {
    mount(engine)
    expect(driver.hasPendingFrame).toBe(true)
    driver.step(16)
    expect(driver.hasPendingFrame).toBe(true)
  })

  it('stops requesting frames after unmount', () => {
    mount(engine)
    engine.unmount()
    expect(driver.hasPendingFrame).toBe(false)
  })

  it('advances song time during play and reports hits', () => {
    const scores: string[] = []
    engine.onStatus((s) => scores.push(s.scoreText))
    mount(engine)
    engine.startPlay()

    // countdown is 2 beats at 120bpm; 100ms per frame advances t by 0.2 beats
    for (let i = 0; i < 15; i++) driver.step(100)
    expect(scores.some((s) => s.startsWith('Hit'))).toBe(true)
  })

  it('marks a note hit when its pitch is detected', () => {
    engine.setMode('timed')
    mount(engine)
    engine.startPlay()
    // t = -2 + 0.2 per frame; reach the first note's window (t ~ 0.4) then detect it
    for (let i = 0; i < 12; i++) driver.step(100)
    engine.setDetected(new Set([60]))
    driver.step(100)
    // run past the second note's miss threshold (s + d + 0.3 = 2.3)
    for (let i = 0; i < 12; i++) driver.step(100)

    const status = engine.getStatus()
    expect(status.playRunning).toBe(false)
    expect(status.scoreText).toMatch(/Done! 1 \/ 2/)
  })

  it('schedules notes on the audio clock during listen', () => {
    mount(engine)
    engine.startDemo()
    expect(clock.played).toHaveLength(0)

    clock.time = 1
    driver.step(16)
    clock.time = 2
    driver.step(16)

    expect(clock.played.length).toBeGreaterThan(0)
    // midi 60 = C4 = 261.63Hz, midi 64 = E4 = 329.63Hz
    const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
    expect(clock.played.some((p) => p.freq === freq(60))).toBe(true)
    expect(clock.played.some((p) => p.freq === freq(64))).toBe(true)
  })

  it('releases the voice when listen stops', () => {
    mount(engine)
    engine.startDemo()
    engine.stopDemo('Stopped')
    expect(clock.released).toBe(1)
    expect(engine.getStatus().scoreText).toBe('Stopped')
  })

  it('does not schedule the same note twice', () => {
    mount(engine)
    engine.startDemo()
    clock.time = 2
    driver.step(16)
    const afterFirst = clock.played.length
    driver.step(16)
    driver.step(16)
    expect(clock.played.length).toBe(afterFirst)
  })
})