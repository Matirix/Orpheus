import { describe, it, expect } from 'vitest'
import { judgeNote } from '../../src/game/judge'
import type { JudgeableNote } from '../../src/game/judge'

describe('judge released rule', () => {
  it('cannot hit the same pitch twice until released', () => {
    const note: JudgeableNote = { m: 60, s: 1.0, d: 0.5, state: 0 }
    const released = Array(128).fill(true)
    // First hit
    const result1 = judgeNote(note, 0.7, new Set([60]), released, 'wait', 0.1)
    expect(result1.hit).toBe(true)
    // Simulate after hit - released[60] becomes false
    released[60] = false
    const result2 = judgeNote(note, 0.7, new Set([60]), released, 'wait', 0.1)
    expect(result2.hit).toBe(false)
    // Release it
    released[60] = true
    const result3 = judgeNote(note, 0.7, new Set([60]), released, 'wait', 0.1)
    expect(result3.hit).toBe(true)
  })
})
