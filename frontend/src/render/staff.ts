const STEP_LETTERS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] // C,C#,D,D#,E,F,F#,G,G#,A,A#,B

export function midiToDiatonicStep(midi: number): number {
  // E4 = 30, G2 = 18 according to spec
  return (Math.floor(midi / 12) - 1) * 7 + STEP_LETTERS[midi % 12]
}

export function getStaffType(midi: number): 'treble' | 'bass' {
  return midi >= 60 ? 'treble' : 'bass'
}

// Calculate y position relative to staff base
export function getNoteY(
  midi: number,
  staffBot: number,
  staffBase: number,
  lineSpacing: number
): number {
  const d = midiToDiatonicStep(midi)
  return staffBot - (d - staffBase) * (lineSpacing / 2)
}

// Sharps only per spec
export function isSharp(midi: number): boolean {
  const sharps = [1, 3, 6, 8, 10]
  return sharps.includes(midi % 12)
}
