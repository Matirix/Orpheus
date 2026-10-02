import type { Song } from './types'

export const BUILTIN_SONGS: Record<string, Song> = {
  'Ode to Joy': {
    bpm: 70,
    bar: 4,
    parts: [
      {
        name: 'Melody',
        notes: [
          { midi: 64, startBeat: 0, beats: 1 },
          { midi: 64, startBeat: 1, beats: 1 },
          { midi: 65, startBeat: 2, beats: 1 },
          { midi: 67, startBeat: 3, beats: 1 },
          { midi: 67, startBeat: 4, beats: 1 },
          { midi: 65, startBeat: 5, beats: 1 },
          { midi: 64, startBeat: 6, beats: 1 },
          { midi: 62, startBeat: 7, beats: 1 },
          { midi: 60, startBeat: 8, beats: 1 },
          { midi: 60, startBeat: 9, beats: 1 },
          { midi: 62, startBeat: 10, beats: 1 },
          { midi: 64, startBeat: 11, beats: 1 },
          { midi: 64, startBeat: 12, beats: 1.5 },
          { midi: 62, startBeat: 13.5, beats: 0.5 },
          { midi: 62, startBeat: 14, beats: 2 },
        ],
      },
    ],
  },
  'Twinkle Twinkle': {
    bpm: 70,
    bar: 4,
    parts: [
      {
        name: 'Melody',
        notes: [
          { midi: 60, startBeat: 0, beats: 1 },
          { midi: 60, startBeat: 1, beats: 1 },
          { midi: 67, startBeat: 2, beats: 1 },
          { midi: 67, startBeat: 3, beats: 1 },
          { midi: 69, startBeat: 4, beats: 1 },
          { midi: 69, startBeat: 5, beats: 1 },
          { midi: 67, startBeat: 6, beats: 2 },
          { midi: 65, startBeat: 8, beats: 1 },
          { midi: 65, startBeat: 9, beats: 1 },
          { midi: 64, startBeat: 10, beats: 1 },
          { midi: 64, startBeat: 11, beats: 1 },
          { midi: 62, startBeat: 12, beats: 1 },
          { midi: 62, startBeat: 13, beats: 1 },
          { midi: 60, startBeat: 14, beats: 2 },
        ],
      },
    ],
  },
  'Chords: C – F – G – C': {
    bpm: 50,
    bar: 4,
    parts: [
      {
        name: 'Chords',
        notes: [
          { midi: 60, startBeat: 0, beats: 2 },
          { midi: 64, startBeat: 0, beats: 2 },
          { midi: 67, startBeat: 0, beats: 2 },
          { midi: 60, startBeat: 2, beats: 2 },
          { midi: 65, startBeat: 2, beats: 2 },
          { midi: 69, startBeat: 2, beats: 2 },
          { midi: 59, startBeat: 4, beats: 2 },
          { midi: 62, startBeat: 4, beats: 2 },
          { midi: 67, startBeat: 4, beats: 2 },
          { midi: 60, startBeat: 6, beats: 2 },
          { midi: 64, startBeat: 6, beats: 2 },
          { midi: 67, startBeat: 6, beats: 2 },
        ],
      },
    ],
  },
}
