import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBase } from '../../src/api/client'
import {
  convertYouTubeToMidi,
  getJob,
  getMidi,
  startJob,
} from '../../src/api/youtube'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const MIDI_BYTES = new Uint8Array([0x4d, 0x54, 0x68, 0x64])

const fetchMock = vi.fn()

describe('YouTube job client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('points at the backend origin in dev', () => {
    // jsdom runs the dev build: the app is on 5173, the backend on 8000.
    expect(apiBase()).toBe('http://localhost:8000')
  })

  it('posts the url and returns the job id', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'abc123' }))

    await expect(startJob('https://youtu.be/dQw4w9WgXcQ')).resolves.toBe('abc123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [requestUrl, init] = fetchMock.mock.calls[0]
    expect(requestUrl).toBe(`${apiBase()}/api/jobs`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      url: 'https://youtu.be/dQw4w9WgXcQ',
    })
  })

  it('surfaces the message the server rejected it with', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ detail: 'Please paste a YouTube link.' }, 400)
    )

    await expect(startJob('not a url')).rejects.toThrow('Please paste a YouTube link.')
  })

  it('says the backend is unreachable when the fetch itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(startJob('https://youtu.be/x')).rejects.toThrow(
      /Backend not reachable/
    )
  })

  it('reports server progress and downloads the midi when done', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'job1' }))
      .mockResolvedValueOnce(
        json({ status: 'done', message: 'Done', title: 'My Song' })
      )
      .mockResolvedValueOnce(new Response(MIDI_BYTES))
    const progress: string[] = []

    const result = await convertYouTubeToMidi('https://youtu.be/x', (m) =>
      progress.push(m)
    )

    expect(progress).toEqual(['Queued', 'Done'])
    expect(result.title).toBe('My Song')
    expect(new Uint8Array(result.midi)).toEqual(MIDI_BYTES)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/jobs/job1/midi')
  })

  it('keeps polling while the job is still running', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'job1' }))
      .mockResolvedValueOnce(
        json({ status: 'running', message: 'Downloading audio...', title: null })
      )
      .mockResolvedValueOnce(
        json({ status: 'running', message: 'Transcribing...', title: 'T' })
      )
      .mockResolvedValueOnce(
        json({ status: 'done', message: 'Done', title: 'T' })
      )
      .mockResolvedValueOnce(new Response(MIDI_BYTES))
    const progress: string[] = []

    const result = await convertYouTubeToMidi(
      'https://youtu.be/x',
      (m) => progress.push(m),
      0
    )

    expect(progress).toEqual([
      'Queued',
      'Downloading audio...',
      'Transcribing...',
      'Done',
    ])
    expect(result.title).toBe('T')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('fails with the message the server reported', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'job1' }))
      .mockResolvedValueOnce(
        json({
          status: 'error',
          message: 'Video is longer than 15 minutes.',
          title: null,
        })
      )

    await expect(
      convertYouTubeToMidi('https://youtu.be/x', () => {}, 0)
    ).rejects.toThrow('Video is longer than 15 minutes.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reads job status fields defensively', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ status: 'running', message: 42, title: null })
    )

    const job = await getJob('job1')
    expect(job).toEqual({ status: 'running', message: '', title: null })
  })

  it('reports an unfinished midi request as unfinished', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 409 }))

    await expect(getMidi('job1')).rejects.toThrow(/not ready/)
  })
})
