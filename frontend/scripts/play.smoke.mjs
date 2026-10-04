/**
 * End-to-end check that the Play button actually asks for the microphone and
 * that captured audio reaches detection.
 *
 * jsdom has neither `AudioContext.audioWorklet` nor `mediaDevices`, so no unit
 * test can reach this path. This drives the real page in Chrome and asserts on
 * the exact symptoms reported: no mic permission prompt, no hearing, no
 * progress.
 *
 * Usage: npm run test:play
 * Needs Chrome/Chromium on PATH (or set CHROME_PATH).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const PORT = 5181
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
  console.error('play.smoke: no Chrome binary found (set CHROME_PATH)')
  process.exit(2)
}

function startVite() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
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
    // auto-answer the permission prompt, but still record that it was asked for
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--disable-gpu',
  ],
})

try {
  const page = await browser.newPage()
  const pageErrors = []
  const consoleLines = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      consoleLines.push(`[${m.type()}] ${m.text()}`)
  })

  // Record every getUserMedia call: "no mic prompt" is symptom #1.
  await page.evaluateOnNewDocument(() => {
    const probe = { gumCalls: [], gumErrors: [] }
    window.__playProbe = probe
    const md = navigator.mediaDevices
    if (md && md.getUserMedia) {
      const orig = md.getUserMedia.bind(md)
      Object.defineProperty(md, 'getUserMedia', {
        configurable: true,
        writable: true,
        value: (constraints) => {
          probe.gumCalls.push(constraints)
          return orig(constraints).then(
            (s) => {
              probe.streamLive = s
                .getTracks()
                .some((t) => t.readyState === 'live')
              return s
            },
            (e) => {
              probe.gumErrors.push(e && e.name ? e.name : String(e))
              throw e
            }
          )
        },
      })
    }
  })

  await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForSelector('.orpheus', { timeout: 15000 })

  const statusText = () =>
    page.evaluate(() => document.querySelector('.orpheus .score')?.textContent ?? '')
  const diagText = () =>
    page.evaluate(() => document.querySelector('.orpheus .status')?.textContent ?? '')

  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Play'
    )
    btn?.click()
    return Boolean(btn)
  })
  clicked ? pass('Play button clicked') : fail('Play button not found')

  // Poll until the mic is captured and audio is flowing. Track peaks: the fake
  // device beeps, so any single instantaneous reading can land on silence.
  let probe = null
  let status = ''
  let diag = ''
  let maxLevel = 0
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 750))
    probe = await page.evaluate(() => window.__playProbe)
    status = await statusText()
    diag = await diagText()
    maxLevel = Math.max(
      maxLevel,
      Number(/level:\s*([\d.]+)/.exec(diag)?.[1] ?? 0)
    )
    const chunks = Number(/chunks:\s*(\d+)/.exec(diag)?.[1] ?? 0)
    if (probe.gumCalls.length > 0 && probe.streamLive && chunks > 0) break
  }

  // 1. The permission prompt is requested at all.
  probe.gumCalls.length > 0
    ? pass(`getUserMedia called (${probe.gumCalls.length}x)`)
    : fail('getUserMedia was never called — no mic permission prompt')

  // 2. The prompt was granted rather than rejected.
  probe.gumErrors.length
    ? fail('getUserMedia rejected: ' + probe.gumErrors.join(', '))
    : probe.gumCalls.length
      ? pass('microphone permission granted')
      : fail('microphone permission not requested')

  // 3. The stream is live and audio reaches the detector's worklet.
  probe.streamLive
    ? pass('media stream is live')
    : fail('media stream never became live')

  const chunks = Number(/chunks:\s*(\d+)/.exec(diag)?.[1] ?? 0)
  const ctxState = /ctx:\s*(\w+)/.exec(diag)?.[1] ?? '<none>'
  chunks > 0
    ? pass(`audio chunks captured: ${chunks}`)
    : fail(`no audio chunks captured (diagnostics: ${JSON.stringify(diag)})`)

  maxLevel > 0
    ? pass(`input level reached ${maxLevel}`)
    : fail('input level never rose above 0 — the meter never moves')

  // 4. The game must advance past the countdown: that is what "hearing and
  //    continuing" looks like from the user's side.
  let keysOn = 0
  let finalScore = status
  for (let i = 0; i < 20; i++) {
    finalScore = await statusText()
    const d = await diagText()
    maxLevel = Math.max(maxLevel, Number(/level:\s*([\d.]+)/.exec(d)?.[1] ?? 0))
    keysOn = Math.max(
      keysOn,
      await page.evaluate(
        () => document.querySelectorAll('.keyboard .key.on').length
      )
    )
    if (!/Get ready/.test(finalScore) && finalScore.trim() !== '') break
    await new Promise((r) => setTimeout(r, 500))
  }

  if (/Get ready/.test(finalScore))
    fail(`game never left the countdown (score=${JSON.stringify(finalScore)})`)
  else pass(`game advanced to ${JSON.stringify(finalScore)}`)

  const finalDiag = await diagText()
  console.log(
    `  info score=${JSON.stringify(finalScore)} ctx=${ctxState} keysHighlightedAtPeak=${keysOn}`
  )
  console.log('  info diagnostics=' + JSON.stringify(finalDiag))
  if (/Microphone|failed|denied|unavailable/i.test(status))
    fail('playback reported an error: ' + status)

  if (pageErrors.length) fail('page errors: ' + pageErrors.join(' | '))
  else pass('no page errors')
  if (consoleLines.length) console.log('  console: ' + consoleLines.join(' | '))
} finally {
  await browser.close()
  vite.kill('SIGTERM')
}

if (failed) {
  console.error('play.smoke FAILED')
  process.exit(1)
}
console.log('play.smoke passed')
process.exit(0)
