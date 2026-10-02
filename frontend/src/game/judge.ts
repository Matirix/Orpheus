export type NoteState = 0 | 1 | 2 // 0 pending, 1 hit, 2 missed

export interface JudgeableNote {
  m: number
  s: number
  d: number
  state: NoteState
}

export interface JudgeResult {
  hit: boolean
  miss: boolean
  newState: NoteState
}

export function judgeNote(
  note: JudgeableNote,
  t: number,
  detectedPitches: Set<number>,
  released: boolean[],
  mode: 'wait' | 'timed',
  inferenceSeconds: number
): JudgeResult {
  const pitch = note.m
  const isInWaitWindow = mode === 'wait' && t >= note.s - 0.3
  const lat = inferenceSeconds + 0.3
  const isInTimedWindow =
    mode === 'timed' && t >= note.s - 0.5 && t <= note.s + note.d + lat

  const isDetected = detectedPitches.has(pitch) && released[pitch]

  if (
    isDetected &&
    ((mode === 'wait' && isInWaitWindow) ||
      (mode === 'timed' && isInTimedWindow))
  ) {
    return { hit: true, miss: false, newState: 1 }
  }

  if (mode === 'timed' && t > note.s + note.d + lat) {
    return { hit: false, miss: true, newState: 2 }
  }

  return { hit: false, miss: false, newState: note.state }
}
