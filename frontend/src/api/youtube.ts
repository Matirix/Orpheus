/**
 * Client for the backend's YouTube -> MIDI pipeline.
 *
 * The server runs the conversion as a job: one POST creates it, GET reports
 * where it got to, and the finished MIDI is a third request. See
 * backend/app/jobs.py for the other half.
 */

import { apiBase, bodyOf, serverMessage, sleep, unreachable } from './client'

export interface JobStatus {
  status: 'queued' | 'running' | 'done' | 'error'
  message: string
  title: string | null
}

export interface Conversion {
  midi: ArrayBuffer
  title: string
}

const POLL_MS = 2000

/** Generous: a CPU transcription of a 15 minute video is slow, not endless. */
const MAX_POLLS = 450

export async function startJob(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {
    throw unreachable()
  }
  const body = await bodyOf(res)
  if (!res.ok) {
    throw new Error(serverMessage(body) ?? `Could not start the job (${res.status}).`)
  }
  const id = body['id']
  if (typeof id !== 'string' || !id) {
    throw new Error('The backend did not return a job id.')
  }
  return id
}

export async function getJob(id: string): Promise<JobStatus> {
  const res = await fetch(`${apiBase()}/api/jobs/${encodeURIComponent(id)}`)
  const body = await bodyOf(res)
  if (!res.ok) {
    throw new Error(serverMessage(body) ?? `Job ${id} is no longer available.`)
  }
  const status = body['status']
  const message = body['message']
  const title = body['title']
  return {
    status: typeof status === 'string' ? (status as JobStatus['status']) : 'error',
    message: typeof message === 'string' ? message : '',
    title: typeof title === 'string' ? title : null,
  }
}

export async function getMidi(id: string): Promise<ArrayBuffer> {
  const res = await fetch(`${apiBase()}/api/jobs/${encodeURIComponent(id)}/midi`)
  if (!res.ok) {
    throw new Error(
      res.status === 409
        ? 'The job finished but the MIDI was not ready.'
        : `Could not download the MIDI (${res.status}).`
    )
  }
  return res.arrayBuffer()
}

/**
 * Runs a conversion to completion, reporting the server's own progress
 * messages as it goes. The first poll happens immediately: a job that has
 * already failed should not take two seconds to say so.
 *
 * `pollMs` exists so tests do not have to wait out a real poll interval.
 */
export async function convertYouTubeToMidi(
  url: string,
  onProgress: (message: string) => void,
  pollMs: number = POLL_MS
): Promise<Conversion> {
  const id = await startJob(url)
  onProgress('Queued')
  for (let polls = 0; ; polls++) {
    if (polls >= MAX_POLLS) {
      throw new Error('Conversion timed out after 15 minutes.')
    }
    const job = await getJob(id)
    if (job.message) onProgress(job.message)
    if (job.status === 'error') {
      throw new Error(job.message || 'Conversion failed.')
    }
    if (job.status === 'done') {
      return { midi: await getMidi(id), title: job.title ?? 'YouTube song' }
    }
    await sleep(pollMs)
  }
}
