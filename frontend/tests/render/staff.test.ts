import { describe, it, expect } from 'vitest'
import {
  midiToDiatonicStep,
  getStaffType,
  isSharp,
} from '../../src/render/staff'

describe('staff math', () => {
  it('calculates diatonic step correctly - E4 should be 30, G2 should be 18', () => {
    // E4 = MIDI 64 (4th octave, E is index 4 in that octave relative to C; 12*5 + 4 = 64, but formula says E4 gives step 30)
    // E4: Math.floor(64/12)-1 = 4, STEP_LETTERS[64%12] = STEP_LETTERS[4] (64%12=4, E is 4) = 4, so 4*7 + 4 = 32
    // Wait - let us check: C4 is MIDI 60. (60/12)=5, floor-1 = 4, 60%12=0 -> 4*7+0=28; C#4: 4*7+0 = 28 same step? Or depends on mapping.
    // According to spec: "Diatonic step: E4 = 30 and G2 = 18"
    expect(midiToDiatonicStep(64)).toBe(30) // E4 is MIDI 64
    expect(midiToDiatonicStep(43)).toBe(18) // G2 is MIDI 43 (12*3 + 7 = 43 for G3? G3 is 55, G2 is 43)
  })

  it('identifies sharps correctly', () => {
    expect(isSharp(61)).toBe(true) // C#4
    expect(isSharp(60)).toBe(false) // C4
    expect(isSharp(64)).toBe(false) // E4
  })

  it('chooses staff type', () => {
    // spec says "Treble staff for MIDI 60 and above, bass below"
    expect(getStaffType(60)).toBe('treble')
    expect(getStaffType(61)).toBe('treble')
    expect(getStaffType(59)).toBe('bass')
  })
})
