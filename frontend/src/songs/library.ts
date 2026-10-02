import type { Song } from './types'

export interface SongLibrary {
  save(name: string, song: Song): void
  load(name: string): Song | null
  list(): string[]
  remove(name: string): void
}

export class LocalStorageSongLibrary implements SongLibrary {
  private key = 'pl_songs'

  save(name: string, song: Song): void {
    try {
      const saved = this.getSaved()
      saved[name] = song
      localStorage.setItem(this.key, JSON.stringify(saved))
    } catch (e) {
      console.warn('Could not save songs', e)
    }
  }

  load(name: string): Song | null {
    const saved = this.getSaved()
    return saved[name] || null
  }

  list(): string[] {
    return Object.keys(this.getSaved())
  }

  remove(name: string): void {
    try {
      const saved = this.getSaved()
      delete saved[name]
      localStorage.setItem(this.key, JSON.stringify(saved))
    } catch (e) {
      console.warn('Could not remove song', e)
    }
  }

  private getSaved(): Record<string, Song> {
    try {
      const raw = localStorage.getItem(this.key)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }
}
