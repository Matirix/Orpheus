export const LOW = 21 // A0
export const HIGH = 108 // C8
export const FALLING_HEIGHT = 280
export const PIXELS_PER_BEAT = 70
export const WHITE_KEY_COUNT = 52
export const MIN_WHITE_KEY_WIDTH = 16
export const CHROMA = [1, 3, 6, 8, 10]
export const BLACK_KEY_RATIO = 0.64

export const NOTE_COLORS = ['#4f8cff', '#3ddc84', '#e5484d']

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(midi: number): string {
  const name = NAMES[midi % 12]
  return (name ?? 'C') + (Math.floor(midi / 12) - 1)
}

export function whiteKeyWidth(viewportWidth: number): number {
  return Math.max(
    MIN_WHITE_KEY_WIDTH,
    Math.floor((viewportWidth - 48) / WHITE_KEY_COUNT)
  )
}

export function isBlackKey(midi: number): boolean {
  return CHROMA.includes(midi % 12)
}