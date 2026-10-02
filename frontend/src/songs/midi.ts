import type { Song, Note } from './types'

interface ToneJSMidiNote {
  midi: number
  ticks: number
  durationTicks: number
}

interface ToneJSMidiTrack {
  name?: string
  instrument?: {
    name?: string
    percussion?: boolean
  }
  notes: ToneJSMidiNote[]
}

interface ToneJSMidiTimeSignature {
  timeSignature: [number, number]
}

interface ToneJSMidiTempo {
  bpm: number
}

interface ToneJSMidi {
  header: {
    ppq: number
    tempos: ToneJSMidiTempo[]
    timeSignatures: ToneJSMidiTimeSignature[]
  }
  tracks: ToneJSMidiTrack[]
}

function quantizeToSixteenth(beats: number): number {
  return Math.round(beats * 16) / 16
}

export async function parseMidi(buffer: ArrayBuffer): Promise<Song> {
  const { Midi } = await import('@tonejs/midi')
  const midi = new Midi(buffer) as ToneJSMidi
  const ppq = midi.header.ppq

  const parts = midi.tracks
    .filter((t) => !t.instrument?.percussion)
    .map((t, i) => {
      const name = t.name || t.instrument?.name || `Track ${i + 1}`
      const notes = t.notes
        .filter((n) => n.midi >= 21 && n.midi <= 108)
        .map((n) => {
          const startBeat = n.ticks / ppq
          const durationBeat = n.durationTicks / ppq
          const quantizedStart = quantizeToSixteenth(startBeat)
          const quantizedDur = Math.max(
            0.125,
            quantizeToSixteenth(durationBeat)
          )
          return {
            midi: n.midi,
            startBeat: quantizedStart,
            beats: quantizedDur,
          } as Note
        })
      return { name, notes }
    })
    .filter((p) => p.notes.length > 0)

  const tempo = midi.header.tempos[0]?.bpm || 100
  const ts = midi.header.timeSignatures[0]?.timeSignature
  const bar = ts ? (ts[0] * 4) / ts[1] : 4

  return { bpm: tempo, bar, parts }
}
