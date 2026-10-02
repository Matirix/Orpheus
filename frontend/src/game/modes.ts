export type Mode = 'wait' | 'timed'

export function getHitWindow(
  mode: Mode,
  noteStart: number,
  noteEnd: number,
  t: number,
  inferenceSeconds: number
): { inWindow: boolean } {
  if (mode === 'wait') {
    return { inWindow: t >= noteStart - 0.3 }
  }
  const lat = inferenceSeconds + 0.3
  return { inWindow: t >= noteStart - 0.5 && t <= noteEnd + lat }
}
