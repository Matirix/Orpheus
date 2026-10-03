/**
 * End-to-end check that the Listen button actually produces audio.
 *
 * jsdom has no Web Audio API, so no unit test can reach this path. This is the
 * only seam that covers it: it drives the real page in Chrome, clicks Listen,
 * and asserts on the AudioContext and the sound-producing nodes it starts.
 *
 * Reproduces the bug where the component primed a different ToneAudioClock than
 * the engine held (a ref written during render, diverging under StrictMode), so
 * startDemo() refused and nothing ever played.
 *
 * Usage: npm run test:listen
 * Needs Chrome/Chromium on PATH (or set CHROME_PATH).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const PORT = 5179
const PAGE_URL = `http://localhost:${PORT}/`
const CHROME =
  process.env.CHROME_PATH ||
  [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => existsSync(p))

if (!CHROME) {
  console.error('listen.smoke: no Chrome binary found (set CHROME_PATH)')
  process.exit(2)
}

function startVite() {
  const child = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: process.cwd(), stdio: 'pipe' }
  )
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('vite did not start in 30s')),
      30000
    )
    child.stdout.on('data', (buf) => {
      if (String(buf).includes('Local:')) {
        clearTimeout(timer)
        resolve(child)
      }
    })
    child.on('exit', () => reject(new Error('vite exited early')))
  })
}

const vite = await startVite()

let failed = false
const fail = (msg) => {
  failed = true
  console.error(`  FAIL ${msg}`)
}
const pass = (msg) => console.log(`  ok   ${msg}`)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--disable-gpu',
  ],
})

try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // Count sound-producing nodes actually starting, and whether the
  // AudioContext ever resumed successfully.
  await page.evaluateOnNewDocument(() => {
    const probe = { soundNodes: 0, resumes: [] }
    window.__listenProbe = probe
    const OrigAC = window.AudioContext || window.webkitAudioContext
    if (OrigAC) {
      window.AudioContext = function (...a) {
        const ctx = new OrigAC(...a)
        const origResume = ctx.resume.bind(ctx)
        ctx.resume = () => {
          const p = origResume()
          p.then(
            () => probe.resumes.push(ctx.state),
            (e) => probe.resumes.push('rejected:' + (e && e.message))
          )
          return p
        }
        return ctx
      }
      window.AudioContext.prototype = OrigAC.prototype
    }
    for (const proto of [
      window.OscillatorNode && window.OscillatorNode.prototype,
      window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype,
    ]) {
      if (!proto || !proto.start) continue
      const orig = proto.start
      proto.start = function (...a) {
        probe.soundNodes++
        return orig.apply(this, a)
      }
    }
  })

  await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForSelector('.piano-learn', { timeout: 15000 })

  const score = () =>
    page.evaluate(
      () => document.querySelector('.piano-learn .score')?.textContent ?? ''
    )

  const clicked = await page.evaluate(() => {
    // Ignore the oscillator Tone starts at page load; we only count nodes
    // scheduled by playback itself.
    window.__listenProbe.soundNodes = 0
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Listen'
    )
    btn?.click()
    return Boolean(btn)
  })
  clicked ? pass('Listen button clicked') : fail('Listen button not found')

  // Poll until playback starts, then keep going until a note is actually
  // scheduled: Listen has a 2-beat countdown, so "Playing..." alone only means
  // the scheduler armed, not that anything is audible yet.
  let text = ''
  let soundNodes = 0
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 750))
    text = await score()
    soundNodes = await page.evaluate(
      () => window.__listenProbe.soundNodes
    )
    if (text === 'Playing...' && soundNodes > 0) break
  }

  if (text === 'Playing...') pass('score reports Playing...')
  else fail(`score was ${JSON.stringify(text)} (expected "Playing...")`)

  if (/Could not start playback/.test(text))
    fail('startDemo refused: ' + text)

  soundNodes > 0
    ? pass(`scheduled ${soundNodes} sound nodes`)
    : fail('no sound nodes were started — nothing is audible')
  const probe = await page.evaluate(() => window.__listenProbe)
  probe.resumes.some((r) => r === 'running')
    ? pass('AudioContext resumed')
    : fail('AudioContext never resumed: ' + JSON.stringify(probe.resumes))

  if (pageErrors.length) fail('page errors: ' + pageErrors.join(' | '))
  else pass('no page errors')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
}

if (failed) {
  console.error('listen.smoke FAILED')
  process.exit(1)
}
console.log('listen.smoke passed')
process.exit(0)
