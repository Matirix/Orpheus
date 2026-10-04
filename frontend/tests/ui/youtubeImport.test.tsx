import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PianoLearn } from '../../src/ui/PianoLearn'
import type { Song } from '../../src/songs/types'
import { json, songServer, stubFetch } from '../helpers/songServer'

const CONVERTED: Song = {
  bpm: 90,
  bar: 4,
  parts: [{ name: 'Melody', notes: [{ midi: 60, startBeat: 0, beats: 1 }] }],
}

// The point of this test is the wiring, not MIDI parsing.
vi.mock('../../src/songs/midi', () => ({
  parseMidi: async () => CONVERTED,
}))

let job: { status: string; message: string; title: string | null }

function jobs(
  input: RequestInfo | URL,
  init?: RequestInit
): Response | null {
  const path = String(input)
    .replace(/^https?:\/\/[^/]+/, '')
    .split('?')[0]
  const method = init?.method ?? 'GET'
  if (path === '/api/jobs' && method === 'POST') return json({ id: 'job1' })
  if (path === '/api/jobs/job1/midi') return new Response(new Uint8Array([1, 2, 3]))
  if (path === '/api/jobs/job1') return json(job)
  return null
}

describe('importing a song from YouTube', () => {
  let fetchMock: ReturnType<typeof stubFetch>

  beforeEach(() => {
    window.localStorage.clear()
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null
    ) as unknown as HTMLCanvasElement['getContext']
    job = { status: 'done', message: 'Done', title: 'Clair de Lune' }
    fetchMock = stubFetch(songServer().handle, jobs)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps Convert disabled until there is a url', () => {
    render(<PianoLearn />)
    const convert = screen.getByRole('button', { name: 'Convert' })
    expect(convert).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/YouTube/i), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    })

    expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled()
  })

  it('turns a url into a song in the menu and selects it', async () => {
    job = { status: 'done', message: 'Done', title: 'Clair de Lune' }

    render(<PianoLearn />)
    fireEvent.change(screen.getByLabelText(/YouTube/i), {
      target: { value: 'https://youtu.be/abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Convert' }))

    await waitFor(() =>
      expect(screen.getByLabelText(/Song/i)).toHaveValue('Clair de Lune')
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Clair de Lune'
    )
    // The bytes come from the job's own output, which is already in work/.
    const requested = fetchMock.mock.calls.map(([url]) => String(url))
    expect(requested.some((url) => url.includes('/api/jobs/job1/midi'))).toBe(true)
    // …so the song is not stored a second time.
    const posted = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
    )
    expect(posted.some(([url]) => String(url).includes('/api/songs'))).toBe(false)
    // And the field is cleared, ready for the next one.
    expect(screen.getByLabelText(/YouTube/i)).toHaveValue('')
  })

  it('cuts a long title on a word boundary, never mid-bracket', async () => {
    job = {
      status: 'done',
      message: 'Done',
      title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
    }
    const expected = 'Rick Astley - Never Gonna Give You Up (Official Video)'

    render(<PianoLearn />)
    fireEvent.change(screen.getByLabelText(/YouTube/i), {
      target: { value: 'https://youtu.be/x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Convert' }))

    await waitFor(() => expect(screen.getByLabelText(/Song/i)).toHaveValue(expected))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(expected)
  })

  it('shows the server error in the status line', async () => {
    job = {
      status: 'error',
      message: 'Video is longer than 15 minutes.',
      title: null,
    }

    render(<PianoLearn />)
    fireEvent.change(screen.getByLabelText(/YouTube/i), {
      target: { value: 'https://youtu.be/x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Convert' }))

    await waitFor(() =>
      expect(
        screen.getByText(
          /YouTube import failed: Video is longer than 15 minutes\./
        )
      ).toBeTruthy()
    )
    // Play and Listen stay usable: a conversion is not a reason to lock the app.
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Listen' })).toBeEnabled()
  })

  it('leaves the status line alone when the backend is down', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    render(<PianoLearn />)
    fireEvent.change(screen.getByLabelText(/YouTube/i), {
      target: { value: 'https://youtu.be/x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Convert' }))

    await waitFor(() =>
      expect(screen.getByText(/YouTube import failed: Backend not reachable/)).toBeTruthy()
    )
    expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled()
  })
})
