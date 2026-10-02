import type { PianoVoice } from './clock'

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'
const LOAD_TIMEOUT_MS = 20000

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

/**
 * Loads the Salamander grand piano sampler, falling back to a basic synth when
 * the samples cannot be fetched. Mirrors the legacy fallback so playback still
 * works offline.
 */
export async function loadVoice(): Promise<PianoVoice> {
  const Tone = await import('tone')
  try {
    return await Promise.race([
      new Promise<PianoVoice>((resolve) => {
        const sampler = new Tone.Sampler({
          urls: salamanderUrls(),
          release: 1,
          baseUrl: SALAMANDER_BASE_URL,
          onload: () => resolve(sampler),
        }).toDestination()
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('sample load timed out')), LOAD_TIMEOUT_MS)
      ),
    ])
  } catch (err) {
    console.warn('Piano samples failed, using a basic synth', err)
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.25, release: 0.8 },
    }).toDestination()
  }
}