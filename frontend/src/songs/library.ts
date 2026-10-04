/**
 * The song library: where the player's songs come from, and the one naming
 * rule they all share.
 *
 * Songs live under work/ on the server, so the menu is the same on every
 * start and depends on nothing kept in the browser.
 */

import { fetchSong, listSongs, saveSong, type SongRow } from '../api/songs'
import { parseMidi } from './midi'
import type { Song } from './types'

const LEGACY_KEY = 'pl_songs'

/**
 * A YouTube title is both the library key and the heading, so it gets a hard
 * cap — cut on a word boundary, and never left hanging inside a bracket, or
 * the masthead ends in a lone letter.
 *
 * Applied to every title the server hands back, so a transcribed song and an
 * uploaded one are addressed by the same name whether this runs at conversion
 * time or on the next launch.
 */
export function songName(title: string): string {
  const clean = title.trim()
  if (!clean) return 'YouTube song'
  if (clean.length <= 60) return clean

  let name = ''
  for (const word of clean.split(/\s+/)) {
    const next = name ? `${name} ${word}` : word
    if (next.length > 60) break
    name = next
  }

  const opens = (s: string) => (s.match(/[[({]/g) ?? []).length
  const closes = (s: string) => (s.match(/[\])}]/g) ?? []).length
  while (name && opens(name) > closes(name)) {
    const trimmed = name.replace(/\s*\S+$/, '')
    if (!trimmed) return 'YouTube song'
    name = trimmed
  }

  return name || 'YouTube song'
}

function isSong(value: unknown): value is Song {
  if (!value || typeof value !== 'object') return false
  const song = value as Record<string, unknown>
  if (!Array.isArray(song['parts'])) return false
  return typeof song['bpm'] === 'number' && typeof song['bar'] === 'number'
}

export class SongLibrary {
  private index = new Map<string, SongRow>()

  async list(): Promise<string[]> {
    const rows = await listSongs()
    this.index = new Map()
    for (const row of rows) {
      this.index.set(this.unique(songName(row.title)), row)
    }
    return [...this.index.keys()]
  }

  /**
   * Two folders can end up with the same display name — a title that
   * truncates to one already in the menu, say — so the duplicate is numbered
   * instead of dropped: everything the server holds stays reachable.
   */
  private unique(name: string): string {
    if (!this.index.has(name)) return name
    for (let n = 2; ; n += 1) {
      const candidate = `${name} (${n})`
      if (!this.index.has(candidate)) return candidate
    }
  }

  async load(name: string): Promise<Song | null> {
    let row = this.index.get(name)
    if (!row) {
      // A folder can appear after the last listing — a conversion finishing,
      // say — so look once more before deciding it is not there.
      await this.list()
      row = this.index.get(name)
      if (!row) return null
    }
    const res = await fetchSong(row.id)
    if (row.kind === 'midi') return parseMidi(await res.arrayBuffer())
    const body: unknown = await res.json().catch(() => null)
    return isSong(body) ? body : null
  }

  /** Stores the song under a free name and hands back the one it used. */
  async save(name: string, song: Song): Promise<string> {
    const key = this.unique(name)
    const id = await saveSong(key, song)
    this.index.set(key, { id, title: key, kind: 'song', created: null })
    return key
  }

  /**
   * Move songs that only exist in this browser onto the server.
   *
   * localStorage is cleared only once every one of them is stored there, so
   * an unreachable backend leaves the key alone and the next start finishes
   * the job instead of losing the songs.
   */
  async migrate(): Promise<void> {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(LEGACY_KEY)
    } catch {
      return
    }
    if (raw === null) return

    let legacy: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') legacy = parsed as Record<string, unknown>
    } catch {
      try {
        localStorage.removeItem(LEGACY_KEY)
      } catch {
        /* unreadable and unrecoverable: stop asking on every launch */
      }
      return
    }

    for (const [name, song] of Object.entries(legacy)) {
      if (isSong(song)) await this.save(name, song)
    }
    try {
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* already moved */
    }
  }
}

export const library = new SongLibrary()
