import type { PianoVoice } from './clock'

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'
const LOAD_TIMEOUT_MS = 8000

function salamanderUrls(): Record<string, string> {
  const urls: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' }
  for (let o = 1; o <= 7; o++) {
    for (const [note, sample] of [
      ['C', 'C'],
      ['D#', 'Ds'],
      ['F#', 'Fs'],
      ['A', 'A'],
    ] as const) {
      urls[note + o] = sample + o + '.mp3'
    }
  }
  return urls
}

export interface VoiceLoadResult {
  voice: PianoVoice
  /** True when the grand piano samples loaded; false when the synth fallback was used. */
  sampled: boolean
  error?: string
}

/**
 * Loads the Salamander grand piano sampler, falling back to a basic synth when
 * the samples cannot be fetched. Mirrors the legacy fallback so playback still
 * works offline, but reports which path was taken so the UI can say so.
 */
export async function loadVoice(): Promise<VoiceLoadResult> {
  const Tone = await import('tone')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const voice = await Promise.race([
      new Promise<PianoVoice>((resolve) => {
        // The sampler has to exist before onload fires, so capture it in a
        // holder rather than a `let` that onload would close over.
        const holder: { voice?: PianoVoice } = {}
        holder.voice = new Tone.Sampler({
          urls: salamanderUrls(),
          release: 1,
          baseUrl: SALAMANDER_BASE_URL,
          onload: () => resolve(holder.voice as PianoVoice),
        }).toDestination()
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('sample load timed out')),
          LOAD_TIMEOUT_MS
        )
      }),
    ])
    if (timer) clearTimeout(timer)
    return { voice, sampled: true }
  } catch (err) {
    if (timer) clearTimeout(timer)
    const error = err instanceof Error ? err.message : String(err)
    console.warn('Piano samples failed, using a basic synth', err)
    const voice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.25, release: 0.8 },
    }).toDestination()
    return { voice, sampled: false, error }
  }
}