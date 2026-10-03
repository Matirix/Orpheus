export const LOW = 21 // A0
export const HIGH = 108 // C8
export const FALLING_HEIGHT = 280
/**
 * Floor for the well when it is sized to fill the window. The well gives up
 * height before the keyboard does: a short viewport must still show the keys.
 */
export const MIN_FALLING_HEIGHT = 140
export const PIXELS_PER_BEAT = 70
export const WHITE_KEY_COUNT = 52
export const MIN_WHITE_KEY_WIDTH = 16
export const CHROMA = [1, 3, 6, 8, 10]
export const BLACK_KEY_RATIO = 0.64

/**
 * Note states: 0 upcoming, 1 hit, 2 missed. Each surface gets its own set —
 * the manuscript is ink on paper, the well is light in the dark.
 */
export const NOTE_COLORS = ['#2f2a24', '#a32b2b', '#b5aca1']
export const FALLING_NOTE_COLORS = ['#c9963f', '#f8f5ee', '#8a7f74']

/**
 * Canvas surfaces cannot read CSS custom properties, so the ink the two
 * renderers draw with is declared here — the mirror of index.css.
 */
export const CANVAS = {
  staffLine: '#3a332b',
  staffInk: '#191512',
  playhead: '#a32b2b',
  lane: '#241f19',
  labelInk: '#17130f',
  strike: 'rgba(201, 150, 63, 0.72)',
  wellInk: '#f8f5ee',
} as const

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(midi: number): string {
  const name = NAMES[midi % 12]
  return (name ?? 'C') + (Math.floor(midi / 12) - 1)
}

/** Key width for a full-bleed keyboard: 52 whites across the whole viewport. */
export function whiteKeyWidth(viewportWidth: number): number {
  return Math.max(MIN_WHITE_KEY_WIDTH, viewportWidth / WHITE_KEY_COUNT)
}

export function isBlackKey(midi: number): boolean {
  return CHROMA.includes(midi % 12)
}