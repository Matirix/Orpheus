/**
 * Where the backend lives and how it answers.
 *
 * Every endpoint reports failures the same way: FastAPI with `detail`, the
 * legacy Flask server with `error`. Both are read here so no client has to
 * care which one is speaking.
 */

/**
 * Dev serves the app from Vite (5173) while the backend listens on 8000, so
 * the two origins differ; a production build is served by the backend itself,
 * so same origin wins. `VITE_API_BASE` overrides both.
 */
export function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE as string | undefined
  if (configured) return configured.replace(/\/+$/, '')
  return import.meta.env.DEV ? 'http://localhost:8000' : ''
}

export async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function serverMessage(body: Record<string, unknown>): string | null {
  for (const key of ['detail', 'error'] as const) {
    const value = body[key]
    if (typeof value === 'string' && value) return value
  }
  return null
}

export function unreachable(): Error {
  return new Error(
    `Backend not reachable at ${apiBase() || 'this origin'}. ` +
      'Is it running on port 8000?'
  )
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
