export interface NoteDetector {
  start(): Promise<void>
  stop(): void
  onNotes(cb: (notes: Set<number>) => void): void
  getDiagnostics(): Diagnostics
}

export interface Diagnostics {
  ctxState: string
  ctxSampleRate: number
  chunkCount: number
  inputLevel: number
  gate: number
  peakProb: number
  inferenceMs: number
}
