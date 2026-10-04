/**
 * Client for uploading a recording and having the backend transcribe it.
 *
 * The bytes go up as the raw body — the backend streams them off the request,
 * so there is no multipart and no extra dependency — and the job they create
 * is polled exactly like a YouTube conversion: same statuses, same messages,
 * the finished MIDI on the way back. See backend/app/jobs.py for the other
 * half.
 */

import { apiBase, bodyOf, serverMessage, unreachable } from './client'
import { waitForJobMidi, type Conversion } from './youtube'

/** What the file input offers for transcription; the backend checks again. */
export const AUDIO_RE = /\.(wav|mp3)$/i

async function startAudioJob(file: File, title: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(
      `${apiBase()}/api/transcribe?title=${encodeURIComponent(title)}&filename=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file }
    )
  } catch {
    throw unreachable()
  }
  const body = await bodyOf(res)
  if (!res.ok) {
    throw new Error(serverMessage(body) ?? `Could not upload the audio (${res.status}).`)
  }
  const id = body['id']
  if (typeof id !== 'string' || !id) {
    throw new Error('The backend did not return a job id.')
  }
  return id
}

/**
 * Uploads a .wav/.mp3 and runs it to completion. The title is the filename
 * without its extension, which is what the song will be called in the menu.
 *
 * `pollMs` exists so tests do not have to wait out a real poll interval.
 */
export async function transcribeAudio(
  file: File,
  onProgress: (message: string) => void,
  pollMs?: number
): Promise<Conversion> {
  const stem = file.name.replace(/\.[^.]+$/, '')
  const id = await startAudioJob(file, stem)
  return waitForJobMidi(id, onProgress, pollMs, stem)
}
