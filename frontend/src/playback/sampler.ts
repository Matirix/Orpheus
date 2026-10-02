import * as Tone from 'tone'

const SALAMANDER: Record<string, string> = {
  A0: 'A0.mp3',
  C8: 'C8.mp3',
}

for (let o = 1; o <= 7; o++) {
  SALAMANDER['C' + o] = 'C' + o + '.mp3'
  SALAMANDER['D#' + o] = 'Ds' + o + '.mp3'
  SALAMANDER['F#' + o] = 'Fs' + o + '.mp3'
  SALAMANDER['A' + o] = 'A' + o + '.mp3'
}

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/'

export async function loadSampler(): Promise<Tone.Sampler> {
  return new Promise((resolve, reject) => {
    const sampler = new Tone.Sampler({
      urls: SALAMANDER,
      release: 1,
      baseUrl: SALAMANDER_BASE_URL,
      onload: () => resolve(sampler),
    }).toDestination()

    const timeout = setTimeout(() => {
      reject(new Error('sample load timed out'))
    }, 20000)

    const originalOnload = sampler.onload
    sampler.onload = () => {
      clearTimeout(timeout)
      if (originalOnload) originalOnload.call(sampler)
      resolve(sampler)
    }
  })
}
