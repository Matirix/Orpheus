import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSong, listSongs, saveSong } from '../../src/api/songs'
import { SongLibrary } from '../../src/songs/library'
import { parseMidi } from '../../src/songs/midi'
import type { Song } from '../../src/songs/types'
import { json, songServer, stubFetch } from '../helpers/songServer'

const SONG: Song = {
  bpm: 90,
  bar: 4,
  parts: [{ name: 'Melody', notes: [{ midi: 60, startBeat: 0, beats: 1 }] }],
}

// Songs stored as JSON are handed over as they were saved; only a transcription
// has to be parsed.
vi.mock('../../src/songs/midi', () => ({
  parseMidi: vi.fn(async () => ({ bpm: 120, bar: 4, parts: [] })),
}))

describe('song client', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(parseMidi).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the name and the song, and takes the id back', async () => {
    const fetchMock = stubFetch(songServer().handle)

    const id = await saveSong('A Song', SONG)

    expect(id).toBe('song1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('title=A%20Song')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(SONG)
  })

  it('lists what the server holds', async () => {
    stubFetch(songServer().handle)
    await saveSong('Clair de Lune', SONG)

    expect(await listSongs()).toEqual([
      { id: 'song1', title: 'Clair de Lune', created: null, kind: 'song' },
    ])
  })

  it('treats an answer that is not a list as a failure', async () => {
    stubFetch(() => json({ id: 'job1' }))

    await expect(listSongs()).rejects.toThrow('not a song list')
  })

  it('says a song is gone when the server says so', async () => {
    stubFetch(() => json({ detail: 'Song not found' }, 404))

    await expect(fetchSong('vanished')).rejects.toThrow('no longer in the library')
  })
})

describe('song library', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(parseMidi).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keys a long title the same way on every start', async () => {
    const raw = 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)'
    stubFetch(() =>
      json([{ id: 'a', title: raw, created: null, kind: 'song' }])
    )

    expect(await new SongLibrary().list()).toEqual([
      'Rick Astley - Never Gonna Give You Up (Official Video)',
    ])
  })

  it('hands back a stored song exactly as it was saved', async () => {
    stubFetch(songServer().handle)
    await saveSong('Mine', SONG)
    const library = new SongLibrary()
    await library.list()

    expect(await library.load('Mine')).toEqual(SONG)
    expect(parseMidi).not.toHaveBeenCalled()
  })

  it('parses a transcription into something playable', async () => {
    stubFetch(
      (input) =>
        String(input).replace(/^https?:\/\/[^/]+/, '') === '/api/songs'
          ? json([{ id: 'm1', title: 'Transcribed', created: null, kind: 'midi' }])
          : null,
      (input) =>
        String(input).includes('/api/songs/m1')
          ? new Response(new Uint8Array([0x4d, 0x54, 0x68, 0x64]))
          : null
    )
    const library = new SongLibrary()
    expect(await library.list()).toEqual(['Transcribed'])

    expect(await library.load('Transcribed')).toEqual({ bpm: 120, bar: 4, parts: [] })
    expect(parseMidi).toHaveBeenCalledTimes(1)
  })

  it('looks again before deciding a song is missing', async () => {
    const fetchMock = stubFetch(songServer().handle)
    const library = new SongLibrary()
    expect(await library.list()).toEqual([])

    // Arrives after the listing, so only a second look can find it.
    await saveSong('Appeared', SONG)

    expect(await library.load('Appeared')).toEqual(SONG)
    const listed = fetchMock.mock.calls.filter(
      ([url]) => String(url).replace(/^https?:\/\/[^/]+/, '') === '/api/songs'
    )
    expect(listed.length).toBe(2)
  })

  it('moves the browser copy onto the server, then forgets it', async () => {
    const server = songServer()
    stubFetch(server.handle)
    localStorage.setItem('pl_songs', JSON.stringify({ 'Old One': SONG }))

    await new SongLibrary().migrate()

    expect(server.titles()).toEqual(['Old One'])
    expect(localStorage.getItem('pl_songs')).toBeNull()
  })

  it('keeps the browser copy when the server refuses', async () => {
    stubFetch(() => json({ detail: 'disk is full' }, 500))
    localStorage.setItem('pl_songs', JSON.stringify({ 'Old One': SONG }))

    await expect(new SongLibrary().migrate()).rejects.toThrow('disk is full')

    expect(localStorage.getItem('pl_songs')).not.toBeNull()
  })

  it('keeps both folders when two titles truncate to the same name', async () => {
    const base = 'Song on the Beach Arcade Fire (from Her) OST Soundtrack'
    stubFetch(
      (input) =>
        String(input).replace(/^https?:\/\/[^/]+/, '') === '/api/songs'
          ? json([
              { id: 'up', title: base, created: null, kind: 'song' },
              { id: 'yt', title: `${base} Piano Tutorial`, created: null, kind: 'midi' },
            ])
          : null,
      (input) =>
        String(input).includes('/api/songs/yt')
          ? new Response(new Uint8Array([0x4d, 0x54, 0x68, 0x64]))
          : null
    )

    const library = new SongLibrary()
    expect(await library.list()).toEqual([base, `${base} (2)`])
    // The second one is the transcription, so it gets parsed rather than
    // handed back as it was stored.
    expect(await library.load(`${base} (2)`)).toEqual({ bpm: 120, bar: 4, parts: [] })
  })

  it('saves under a number when the menu already has the name', async () => {
    const server = songServer()
    stubFetch(
      (input, init) =>
        (init?.method ?? 'GET') === 'GET' &&
        String(input).replace(/^https?:\/\/[^/]+/, '') === '/api/songs'
          ? json([{ id: 'existing', title: 'Taken', created: null, kind: 'song' }])
          : null,
      server.handle
    )
    const library = new SongLibrary()
    await library.list()

    expect(await library.save('Taken', SONG)).toBe('Taken (2)')
    expect(server.titles()).toEqual(['Taken (2)'])
  })
})
