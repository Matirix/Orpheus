import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PianoLearn } from '../../src/ui/PianoLearn'
import type { Song } from '../../src/songs/types'

const UPLOADED: Song = {
  bpm: 90,
  bar: 4,
  parts: [
    {
      name: 'Melody',
      notes: [{ midi: 60, startBeat: 0, beats: 1 }],
    },
  ],
}

// The bug under test was the UI never re-reading the song library after an
// upload, not anything about MIDI parsing, so stub the parser.
vi.mock('../../src/songs/midi', () => ({
  parseMidi: async () => UPLOADED,
}))

vi.mock('../../src/songs/musicxml', () => ({
  parseMusicXML: () => UPLOADED,
}))

describe('uploading a song', () => {
  beforeEach(() => {
    window.localStorage.clear()
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null
    ) as unknown as HTMLCanvasElement['getContext']
  })

  it('adds the uploaded song to the song menu and selects it', async () => {
    const { container } = render(<PianoLearn />)
    const select = screen.getByLabelText(/Song/i) as HTMLSelectElement
    const before = Array.from(select.options).map((o) => o.value)
    expect(before).not.toContain('my-tune')

    const file = new File([new Uint8Array([0x4d, 0x54, 0x68, 0x64])], 'my-tune.mid', {
      type: 'audio/midi',
    })
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const options = Array.from(
        (screen.getByLabelText(/Song/i) as HTMLSelectElement).options
      ).map((o) => o.value)
      expect(options).toContain('my-tune')
    })
    expect((screen.getByLabelText(/Song/i) as HTMLSelectElement).value).toBe(
      'my-tune'
    )
  })

  it('applies the uploaded song tempo to the tempo control', async () => {
    const { container } = render(<PianoLearn />)
    const file = new File([new Uint8Array([0x4d, 0x54, 0x68, 0x64])], 'slow.mid', {
      type: 'audio/midi',
    })
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Tempo/i) as HTMLInputElement).value
      ).toBe('90')
    })
    // the engine must get the new tempo too, not just the slider
    expect(screen.getByText(/^90$/)).toBeTruthy()
  })
})