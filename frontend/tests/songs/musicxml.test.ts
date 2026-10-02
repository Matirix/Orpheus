import { describe, it, expect } from 'vitest'
import { parseMusicXML } from '../../src/songs/musicxml'

describe('musicxml parser', () => {
  it('parses partwise musicxml with chords', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`
    const song = parseMusicXML(xml)
    expect(song.parts.length).toBe(1)
    expect(song.parts[0]?.notes.length).toBeGreaterThan(1)
  })

  it('handles backup and forward', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>`
    const song = parseMusicXML(xml)
    expect(song.parts.length).toBe(1)
    expect(song.parts[0]?.notes.length).toBeGreaterThan(0)
  })

  it('merges tied notes', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/></note>
    </measure>
  </part>
</score-partwise>`
    const song = parseMusicXML(xml)
    expect(song.parts[0]?.notes.length).toBe(1)
    expect(song.parts[0]?.notes[0]?.beats).toBeGreaterThanOrEqual(0.25) // combined
  })

  it('handles accidentals via alter', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step><octave>4</octave><alter>1</alter></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`
    const song = parseMusicXML(xml)
    expect(song.parts[0]?.notes[0]?.midi).toBe(61) // C#4
  })
})
