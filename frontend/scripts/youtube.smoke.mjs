/**
 * End-to-end check of the YouTube -> MIDI flow: paste a url, the backend
 * downloads and transcribes it, and the app loads the result as a song.
 *
 * jsdom has no backend to talk to and no way to wait out a real transcription,
 * so this drives the real page in Chrome. It needs:
 *   - the backend on port 8000 (`make dev`), with `uv sync --extra ml`
 *   - network, ffmpeg and deno, which yt-dlp needs to fetch the audio
 *
 * Usage: npm run test:youtube
 * Needs Chrome/Chromium on PATH (or set CHROME_PATH).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const PORT = 5182
const PAGE_URL = `http://localhost:${PORT}/`
const VIDEO = process.env.VIDEO || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
// A first run downloads the transcription model, so allow a long wait.
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 300000)
const CHROME =
  process.env.CHROME_PATH ||
  [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => existsSync(p))

if (!CHROME) {
  console.error('youtube.smoke: no Chrome binary found (set CHROME_PATH)')
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
    child.on('exit', () => reject(new Error('vite exited before starting')))
  })
}

function fail(msg) {
  console.error(`  FAIL ${msg}`)
  process.exit(1)
}

const vite = await startVite()
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--mute-audio'],
})

try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.setViewport({ width: 1366, height: 768 })
  await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForSelector('.orpheus', { timeout: 15000 })

  const urlInput = await page.$('input[type="url"]')
  if (!urlInput) fail('no url field rendered')
  console.log('  ok   url field rendered')

  const convert = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Convert'
    )
  )
  if (!(await convert.evaluate((el) => !!el))) fail('no Convert button')

  const disabledEmpty = await convert.evaluate((el) => el.disabled)
  if (!disabledEmpty) fail('Convert is enabled before there is a url')
  console.log('  ok   Convert disabled while the field is empty')

  await page.click('input[type="url"]')
  await page.type('input[type="url"]', VIDEO, { delay: 5 })
  if (await convert.evaluate((el) => el.disabled)) {
    fail('Convert stayed disabled after typing a url')
  }
  console.log('  ok   Convert enabled once a url is typed')

  const started = Date.now()
  await convert.click()

  const seen = new Set()
  let loaded = null
  while (Date.now() - started < TIMEOUT_MS) {
    const { busy, heading, selected } = await page.evaluate(() => ({
      busy: document.querySelector('.notices .busy')?.textContent?.trim() || '',
      heading: document.querySelector('.piece')?.textContent?.trim() || '',
      selected: document.querySelector('select')?.value || '',
    }))
    if (busy && !seen.has(busy)) {
      seen.add(busy)
      console.log(`  ...  ${busy}`)
    }
    if (/YouTube import failed/i.test(heading)) fail(heading)
    if (selected && selected !== 'Ode to Joy' && heading === selected) {
      loaded = selected
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  if (!loaded) fail(`no song after ${TIMEOUT_MS / 1000}s`)
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`  ok   song loaded in ${seconds}s: "${loaded}"`)

  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
  console.log('  ok   no page errors')
  console.log('youtube.smoke passed')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
}
