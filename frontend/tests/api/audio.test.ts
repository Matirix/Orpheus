import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBase } from '../../src/api/client'
import { transcribeAudio } from '../../src/api/audio'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const MIDI_BYTES = new Uint8Array([0x4d, 0x54, 0x68, 0x64])

const fetchMock = vi.fn()

const recording = () =>
  new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'practice.mp3', {
    type: 'audio/mpeg',
  })

describe('audio upload client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the file as a raw body with its title and filename', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'job1' }))
      .mockResolvedValueOnce(json({ status: 'done', message: 'Done', title: 'practice' }))
      .mockResolvedValueOnce(new Response(MIDI_BYTES))

    const result = await transcribeAudio(recording(), () => {})

    const [requestUrl, init] = fetchMock.mock.calls[0]
    expect(String(requestUrl)).toBe(
      `${apiBase()}/api/transcribe?title=practice&filename=practice.mp3`
    )
    expect(init?.method).toBe('POST')
    // Raw bytes, no multipart — the backend reads the request as a stream.
    expect(init?.body).toBeInstanceOf(File)
    expect(result.title).toBe('practice')
    expect(new Uint8Array(result.midi)).toEqual(MIDI_BYTES)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/jobs/job1/midi')
  })

  it('surfaces the message the server rejected it with', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ detail: 'Only .wav and .mp3 files can be transcribed.' }, 400)
    )

    await expect(transcribeAudio(recording(), () => {})).rejects.toThrow(
      'Only .wav and .mp3 files can be transcribed.'
    )
  })

  it('says the backend is unreachable when the fetch itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(transcribeAudio(recording(), () => {})).rejects.toThrow(
      /Backend not reachable/
    )
  })

  it('reports server progress while the transcription runs', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'job1' }))
      .mockResolvedValueOnce(
        json({ status: 'running', message: 'Transcribing...', title: 'practice' })
      )
      .mockResolvedValueOnce(json({ status: 'done', message: 'Done', title: 'practice' }))
      .mockResolvedValueOnce(new Response(MIDI_BYTES))
    const progress: string[] = []

    await transcribeAudio(recording(), (m) => progress.push(m), 0)

    expect(progress).toEqual(['Queued', 'Transcribing...', 'Done'])
    // upload, two polls, the MIDI — four requests
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('fails with the message the server reported', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'job1' }))
      .mockResolvedValueOnce(
        json({
          status: 'error',
          message: 'That audio is 42 minutes long; the limit is 15 minutes.',
          title: 'practice',
        })
      )

    await expect(transcribeAudio(recording(), () => {}, 0)).rejects.toThrow(
      'That audio is 42 minutes long; the limit is 15 minutes.'
    )
  })
})
