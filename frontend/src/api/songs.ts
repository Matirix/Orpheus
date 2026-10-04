/**
 * Client for the song library: the songs that live under work/ on the server.
 *
 * The server owns them, so the menu is the same on every start and does not
 * depend on anything stored in the browser. See backend/app/songs.py for the
 * other half.
 */

import { apiBase, bodyOf, serverMessage, unreachable } from './client'
import type { Song } from '../songs/types'

export interface SongRow {
  id: string
  title: string
  created: string | null
  kind: 'midi' | 'song'
}

function toRow(value: unknown): SongRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row['id'] !== 'string' || !row['id']) return null
  if (typeof row['title'] !== 'string' || !row['title']) return null
  if (row['kind'] !== 'midi' && row['kind'] !== 'song') return null
  return {
    id: row['id'],
    title: row['title'],
    created: typeof row['created'] === 'string' ? row['created'] : null,
    kind: row['kind'],
  }
}

export async function listSongs(): Promise<SongRow[]> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/songs`)
  } catch {
    throw unreachable()
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const body = (data ?? {}) as Record<string, unknown>
    throw new Error(serverMessage(body) ?? `Could not list the songs (${res.status}).`)
  }
  if (!Array.isArray(data)) {
    throw new Error('The backend sent something that is not a song list.')
  }
  return data.map(toRow).filter((row): row is SongRow => row !== null)
}

/**
 * The bytes of one song. The caller reads them as JSON or as MIDI according
 * to the row's `kind` — the server stores both and this endpoint serves
 * whichever is there.
 */
export async function fetchSong(id: string): Promise<Response> {
  const res = await fetch(`${apiBase()}/api/songs/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? 'That song is no longer in the library.' : `Could not load it (${res.status}).`
    )
  }
  return res
}

export async function saveSong(title: string, song: Song): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/songs?title=${encodeURIComponent(title)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(song),
    })
  } catch {
    throw unreachable()
  }
  const body = await bodyOf(res)
  if (!res.ok) {
    throw new Error(serverMessage(body) ?? `Could not save the song (${res.status}).`)
  }
  const id = body['id']
  if (typeof id !== 'string' || !id) {
    throw new Error('The backend did not store the song.')
  }
  return id
}
