export interface KeyGeom {
  x: number
  w: number
  black: boolean
}

export function buildKeyboard() {
  const keyEls: Record<number, HTMLElement> = {}
  const geom: Record<number, KeyGeom> = {}
  const whiteCount = 0
  return { keyEls, geom, whiteCount }
}
