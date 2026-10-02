import { describe, it, expect } from 'vitest'
import { judgeNote } from '../../src/game/judge'
import type { JudgeableNote } from '../../src/game/judge'

describe('judge', () => {
  it('wait mode hits when pitch detected within 0.3 beats before start', () => {
    const note: JudgeableNote = { m: 60, s: 1.0, d: 1.0, state: 0 }
    const released = Array(128).fill(true)
    const result = judgeNote(note, 0.7, new Set([60]), released, 'wait', 0.1)
    expect(result.hit).toBe(true)
    expect(result.newState).toBe(1)
  })

  it('wait mode does not hit if detected too early', () => {
    const note: JudgeableNote = { m: 60, s: 1.0, d: 1.0, state: 0 }
    const released = Array(128).fill(true)
    const result = judgeNote(note, 0.6, new Set([60]), released, 'wait', 0.1)
    expect(result.hit).toBe(false)
  })

  it('timed mode has different window', () => {
    const note: JudgeableNote = { m: 60, s: 1.0, d: 1.0, state: 0 }
    const released = Array(128).fill(true)
    // hit window is from 0.5 beats before start to note's end plus (inferenceSeconds + 0.3) beats
    // t=0.4 is 0.6 before start? start is 1.0, t is 0.4, so start - t = 0.6 > 0.5 - so not in window
    // t=0.5 is 0.5 before start? 1.0 - 0.5 = 0.5, so t>=0.5 before means t >= start-0.5; if t = start-0.5, then t = 0.5 when start=1.0 - yes it's in window
    const result = judgeNote(note, 0.5, new Set([60]), released, 'timed', 0.1)
    expect(result.hit).toBe(true)
  })
})
