import { vi } from 'vitest'

interface Stored {
  id: string
  title: string
  body: unknown
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pathOf(input: RequestInfo | URL): string {
  return String(input)
    .replace(/^https?:\/\/[^/]+/, '')
    .split('?')[0]
}

function titleOf(input: RequestInfo | URL): string {
  const match = String(input).match(/[?&]title=([^&]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

/**
 * An in-memory stand-in for the song library, so a test can exercise the real
 * client without a backend — and without leaving songs in the developer's
 * work/ folder.
 *
 * Returns null for anything that is not a song endpoint, so a test can route
 * the rest of the API itself.
 */
export function songServer() {
  const songs = new Map<string, Stored>()
  let next = 0

  return {
    titles(): string[] {
      return [...songs.values()].map((song) => song.title)
    },
    handle(input: RequestInfo | URL, init?: RequestInit): Response | null {
      const path = pathOf(input)
      if (!path.startsWith('/api/songs')) return null

      if ((init?.method ?? 'GET') === 'POST') {
        const id = `song${++next}`
        songs.set(id, { id, title: titleOf(input), body: JSON.parse(String(init?.body)) })
        return json({ id })
      }

      const prefix = '/api/songs/'
      if (path.startsWith(prefix)) {
        const found = songs.get(path.slice(prefix.length))
        return found ? json(found.body) : json({ detail: 'Song not found' }, 404)
      }

      return json(
        [...songs.values()].map(({ id, title }) => ({
          id,
          title,
          created: null,
          kind: 'song',
        }))
      )
    },
  }
}

/** Stubs fetch with a chain of handlers; the first non-null answer wins. */
export function stubFetch(...handlers: Array<(input: RequestInfo | URL, init?: RequestInit) => Response | null>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    for (const handler of handlers) {
      const response = handler(input, init)
      if (response) return response
    }
    return json({ detail: `unexpected request: ${String(input)}` }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
