import type { Song, Note } from './types'

function quantizeToSixteenth(beats: number): number {
  return Math.round(beats * 16) / 16
}

const STEP_MAP: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

export function parseMusicXML(text: string): Song {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')

  if (doc.querySelector('parsererror')) {
    throw new Error("That doesn't look like valid MusicXML.")
  }
  if (!doc.querySelector('score-partwise')) {
    throw new Error('Only score-partwise MusicXML is supported.')
  }

  const names: Record<string, string> = {}
  doc.querySelectorAll('score-part').forEach((sp) => {
    const id = sp.getAttribute('id')
    if (id) {
      const partName = sp.querySelector('part-name')?.textContent?.trim()
      names[id] = partName || 'Part'
    }
  })

  const parts: Array<{ name: string; notes: Note[] }> = []
  doc.querySelectorAll('score-partwise > part').forEach((p) => {
    let div = 1
    let pos = 0
    let lastStart = 0
    const notes: Note[] = []

    for (const meas of Array.from(p.querySelectorAll(':scope > measure'))) {
      for (const el of Array.from(meas.children)) {
        const tag = el.tagName
        if (tag === 'attributes') {
          const dv = el.querySelector('divisions')
          if (dv && dv.textContent) {
            div = parseFloat(dv.textContent) || div
          }
        } else if (tag === 'backup') {
          const dur = el.querySelector('duration')
          if (dur && dur.textContent) {
            pos -= parseFloat(dur.textContent) / div
          }
        } else if (tag === 'forward') {
          const dur = el.querySelector('duration')
          if (dur && dur.textContent) {
            pos += parseFloat(dur.textContent) / div
          }
        } else if (tag === 'note') {
          if (el.querySelector('grace')) continue
          const durEl = el.querySelector('duration')
          const dur =
            durEl && durEl.textContent ? parseFloat(durEl.textContent) / div : 0
          const isChord = !!el.querySelector('chord')
          const start = isChord ? lastStart : pos
          const pitch = el.querySelector('pitch')
          if (pitch) {
            const step = pitch.querySelector('step')?.textContent
            const octave = pitch.querySelector('octave')?.textContent
            const alter = pitch.querySelector('alter')?.textContent
            if (step && octave) {
              const midi = Math.round(
                12 * (parseInt(octave) + 1) +
                  STEP_MAP[step] +
                  (parseFloat(alter || '0') || 0)
              )
              const tieStop = el.querySelector('tie[type="stop"]')
              if (tieStop) {
                const tiedNote = notes.findLast(
                  (n) =>
                    n.midi === midi &&
                    Math.abs(n.startBeat + n.beats - start) < 0.01
                )
                if (tiedNote) {
                  tiedNote.beats += dur
                }
              } else if (midi >= 21 && midi <= 108) {
                notes.push({
                  midi,
                  startBeat: start,
                  beats: dur,
                } as Note)
              }
            }
          }
          if (!isChord) {
            lastStart = pos
            pos += dur
          }
        }
      }
    }

    if (notes.length > 0) {
      parts.push({
        name: names[p.getAttribute('id') || ''] || 'Part',
        notes: notes.map((n) => ({
          midi: n.midi,
          startBeat: quantizeToSixteenth(n.startBeat),
          beats: Math.max(0.125, quantizeToSixteenth(n.beats)),
        })),
      })
    }
  })

  const b = doc.querySelector('time > beats')?.textContent
  const bt = doc.querySelector('time > beat-type')?.textContent
  const tempoEl = doc.querySelector('sound[tempo]')
  const bpm = tempoEl ? parseFloat(tempoEl.getAttribute('tempo') || '100') : 100
  const bar = b && bt ? (parseInt(b) * 4) / parseInt(bt) : 4

  return { bpm, bar, parts }
}
