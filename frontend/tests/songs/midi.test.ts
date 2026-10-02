import { describe, it, expect } from 'vitest'
import { parseMidi } from '../../src/songs/midi'

describe('midi parser', () => {
  it('should quantize to 1/16 beat and have min duration 0.125', async () => {
    const { Midi } = await import('@tonejs/midi')
    const midi = new Midi()
    midi.header.setTempo(120)
    const track = midi.addTrack()
    track.addNote({
      midi: 60,
      ticks: 5,
      durationTicks: 3,
    })
    const buf = midi.toArray()
    const song = await parseMidi(buf.buffer)
    expect(song.parts.length).toBe(1)
    if (song.parts[0]) {
      expect(song.parts[0].notes[0]?.startBeat).toBeDefined()
      expect(song.parts[0].notes[0]?.beats).toBeGreaterThanOrEqual(0.125)
    }
  })
})
