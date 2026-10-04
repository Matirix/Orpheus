/**
 * End-to-end check of the song library: every song in work/ reaches the menu
 * from the server, parsed and ready, with nothing kept in the browser.
 *
 * jsdom has no backend to talk to, so this drives the real page in Chrome. It
 * needs the backend on port 8000 (`make dev`) and at least one song in work/.
 *
 * Usage: npm run test:library
 * Needs Chrome/Chromium on PATH (or set CHROME_PATH).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const PORT = 5184
const PAGE_URL = `http://localhost:${PORT}/`
const API = 'http://localhost:8000'
const CHROME =
  process.env.CHROME_PATH ||
  [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => existsSync(p))

if (!CHROME) {
  console.error('library.smoke: no Chrome binary found (set CHROME_PATH)')
  process.exit(2)
}

function startVite() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite did not start in 30s')), 30000)
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

let serverSongs
try {
  const res = await fetch(`${API}/api/songs`)
  if (!res.ok) fail(`/api/songs answered ${res.status}`)
  serverSongs = await res.json()
} catch (err) {
  fail(`backend not reachable at ${API}: ${err.message}`)
}
if (!Array.isArray(serverSongs)) fail('/api/songs did not answer with a list')
if (serverSongs.length === 0) {
  console.log('  skip  work/ holds no songs yet, so there is nothing to compare against')
  process.exit(0)
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
  const fetched = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('request', (r) => {
    if (r.url().includes('/api/songs/')) fetched.push(r.url().split('/').pop())
  })

  await page.setViewport({ width: 1366, height: 768 })
  await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForSelector('.orpheus select', { timeout: 15000 })
  // The library is fetched after the first paint, so give it a beat.
  await new Promise((r) => setTimeout(r, 1500))

  const menu = await page.$eval('select', (el) => [...el.options].map((o) => o.value))
  if (!menu.includes('Ode to Joy')) fail('the built-in songs are missing')
  console.log(`  ok   built-in songs still listed (${menu.length} entries)`)

  // The menu shows songName(title), which keeps the leading 60 characters.
  for (const row of serverSongs) {
    const head = row.title.slice(0, 40)
    if (!menu.some((name) => name.startsWith(head))) {
      fail(`"${row.title}" is not in the menu`)
    }
  }
  console.log(`  ok   all ${serverSongs.length} songs from work/ are in the menu`)

  const missing = serverSongs.filter((row) => !fetched.includes(row.id))
  if (missing.length) fail(`${missing.length} song(s) were never fetched from the server`)
  console.log('  ok   every song was read from the server, not the browser')

  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
  console.log('  ok   no page errors')
  console.log('library.smoke passed')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
}
