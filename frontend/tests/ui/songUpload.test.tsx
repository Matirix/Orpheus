import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Orpheus } from '../../src/ui/Orpheus'
import type { Song } from '../../src/songs/types'
import { songServer, stubFetch, json } from '../helpers/songServer'

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
    // Saving goes to the server now; without this the test would write into
    // whatever work/ folder the backend is actually using.
    stubFetch(songServer().handle)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds the uploaded song to the song menu and selects it', async () => {
    const { container } = render(<Orpheus />)
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
    const { container } = render(<Orpheus />)
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

  it('sends an audio recording to the backend and shows the song it comes back as', async () => {
    // An upload never reaches the parsers in the browser: the bytes go up as
    // a job and the finished MIDI comes back down.
    const jobsHandler = (input: RequestInfo | URL): Response | null => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, '')
      if (path.startsWith('/api/transcribe')) return json({ id: 'up1' })
      if (path === '/api/jobs/up1/midi')
        return new Response(new Uint8Array([0x4d, 0x54, 0x68, 0x64]))
      if (path === '/api/jobs/up1')
        return json({ status: 'done', message: 'Done', title: 'practice' })
      return null
    }
    const fetchMock = stubFetch(songServer().handle, jobsHandler)

    const { container } = render(<Orpheus />)
    const select = screen.getByLabelText(/Song/i) as HTMLSelectElement
    const before = Array.from(select.options).map((o) => o.value)
    expect(before).not.toContain('practice')

    const file = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'practice.wav', {
      type: 'audio/wav',
    })
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const options = Array.from(
        (screen.getByLabelText(/Song/i) as HTMLSelectElement).options
      ).map((o) => o.value)
      expect(options).toContain('practice')
    })
    expect((screen.getByLabelText(/Song/i) as HTMLSelectElement).value).toBe(
      'practice'
    )
    expect(screen.getByText('Loaded "practice"')).toBeTruthy()

    const posts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
    )
    expect(String(posts[0][0])).toContain('/api/transcribe')
    // the file went up as the raw body, and the MIDI came down from the job
    expect((posts[0][1] as RequestInit).body).toBeInstanceOf(File)
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/jobs/up1/midi'))
    ).toBe(true)
  })
})