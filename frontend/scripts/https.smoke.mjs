/**
 * End-to-end check that the network host actually works from a phone's point
 * of view: a certificate the client can verify against the local CA, a secure
 * context (the only place Safari exposes navigator.mediaDevices at all), and
 * captured audio reaching detection when the page is opened over https:// on
 * the machine's LAN address rather than localhost.
 *
 * It starts scripts/host.sh itself on its own port and its own throwaway
 * certificate directory, so it never disturbs a host session you are running.
 *
 * Usage: npm run test:https   (needs frontend/dist — run npm run build first)
 * Needs Chrome/Chromium on PATH (or set CHROME_PATH).
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import puppeteer from 'puppeteer-core'

const PORT = 5185
const REPO = fileURLToPath(new URL('../..', import.meta.url))
const HOST_SH = fileURLToPath(new URL('../../scripts/host.sh', import.meta.url))
const CHROME =
  process.env.CHROME_PATH ||
  [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => existsSync(p))

if (!CHROME) {
  console.error('https.smoke: no Chrome binary found (set CHROME_PATH)')
  process.exit(2)
}
if (!existsSync(join(REPO, 'frontend', 'dist', 'index.html'))) {
  console.error('https.smoke: frontend/dist is missing — run npm run build first')
  process.exit(2)
}

let failed = false
const fail = (msg) => {
  failed = true
  console.error(`  FAIL ${msg}`)
}
const pass = (msg) => console.log(`  ok   ${msg}`)

const certDir = mkdtempSync(join(tmpdir(), 'orpheus-https-'))
const serverLogs = []
const server = spawn('bash', [HOST_SH], {
  cwd: REPO,
  env: {
    ...process.env,
    PORT: String(PORT),
    CERT_DIR: certDir,
    SKIP_BUILD: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', (buf) => serverLogs.push(String(buf)))
server.stderr.on('data', (buf) => serverLogs.push(String(buf)))

const url = await new Promise((resolve, reject) => {
  let held = ''
  const timer = setTimeout(() => reject(new Error('host.sh did not print URL= in 60s')), 60000)
  server.stdout.on('data', (buf) => {
    held += String(buf)
    const line = /^URL=(\S+)$/m.exec(held)
    if (line) {
      clearTimeout(timer)
      resolve(line[1])
    }
  })
  server.on('exit', (code) =>
    reject(new Error(`host.sh exited early (code ${code})\n${serverLogs.join('')}`))
  )
})
const ca = readFileSync(join(certDir, 'ca.pem'))

const httpCall = (method, path, body) =>
  new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port,
        path,
        method,
        ca,
        timeout: 10000,
        ...(body ? { headers: { 'Content-Length': body.length } } : {}),
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        )
      }
    )
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })

const fetchPath = (path) => httpCall('GET', path)

let statusCode = 0
try {
  for (let i = 0; i < 30 && !statusCode; i++) {
    try {
      statusCode = (await fetchPath('/')).status
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (statusCode !== 200) {
    fail(
      `serving ${url} did not verify against the local CA (last status ${statusCode || 'none'})`
    )
  } else {
    pass('certificate verifies against the CA on the LAN address')
  }

  // The device has to be able to fetch the CA from this same server before it
  // can trust anything else it serves.
  try {
    const download = await fetchPath('/ca.pem')
    if (download.status !== 200) fail(`/ca.pem answered ${download.status}`)
    else if (!download.body.equals(ca)) fail('/ca.pem did not return the CA that signed this server')
    else if (!/attachment/.test(String(download.headers['content-disposition'])))
      fail('/ca.pem is not offered as a download: ' + download.headers['content-disposition'])
    else pass('/ca.pem serves the signing CA as a download')
  } catch (err) {
    fail('/ca.pem is not reachable: ' + err.message)
  }

  // The API a device talks to has to be served over TLS as well, not only the
  // page: a rejected extension proves the upload route is mounted and reading
  // the body the phone would actually send.
  try {
    const probe = await httpCall(
      'POST',
      '/api/transcribe?title=probe&filename=recording.ogg',
      Buffer.from('not audio')
    )
    if (probe.status !== 400) fail(`/api/transcribe answered ${probe.status} to POST (400 expected)`)
    else if (!/wav and \.mp3/.test(String(probe.body)))
      fail('/api/transcribe rejected it with the wrong message: ' + probe.body)
    else pass('/api/transcribe route answers over https')
  } catch (err) {
    fail('/api/transcribe is not reachable: ' + err.message)
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
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
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.evaluateOnNewDocument(() => {
      const probe = { gumCalls: [], gumErrors: [] }
      window.__httpsProbe = probe
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
                probe.streamLive = s.getTracks().some((t) => t.readyState === 'live')
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

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await page.waitForSelector('.orpheus', { timeout: 15000 })

    const where = await page.evaluate(() => ({
      secure: window.isSecureContext,
      mediaDevices: Boolean(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      ),
      title: document.title,
    }))
    where.secure
      ? pass('page is a secure context')
      : fail('window.isSecureContext is false')
    where.mediaDevices
      ? pass('navigator.mediaDevices is available')
      : fail('navigator.mediaDevices is missing — the mic cannot be requested')
    where.title === 'Orpheus'
      ? pass('page title is Orpheus')
      : fail(`page title is ${JSON.stringify(where.title)}`)

    const diagText = () =>
      page.evaluate(() => document.querySelector('.orpheus .status')?.textContent ?? '')
    const scoreText = () =>
      page.evaluate(() => document.querySelector('.orpheus .score')?.textContent ?? '')

    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Play'
      )
      btn?.click()
      return Boolean(btn)
    })
    clicked ? pass('Play button clicked') : fail('Play button not found')

    let probe = null
    let diag = ''
    let maxLevel = 0
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 750))
      probe = await page.evaluate(() => window.__httpsProbe)
      diag = await diagText()
      maxLevel = Math.max(maxLevel, Number(/level:\s*([\d.]+)/.exec(diag)?.[1] ?? 0))
      const chunks = Number(/chunks:\s*(\d+)/.exec(diag)?.[1] ?? 0)
      if (probe.gumCalls.length > 0 && probe.streamLive && chunks > 0) break
    }

    probe.gumCalls.length > 0
      ? pass(`getUserMedia called over https (${probe.gumCalls.length}x)`)
      : fail('getUserMedia was never called')
    probe.gumErrors.length
      ? fail('getUserMedia rejected: ' + probe.gumErrors.join(', '))
      : probe.gumCalls.length
        ? pass('microphone permission granted')
        : fail('microphone permission not requested')
    probe.streamLive
      ? pass('media stream is live')
      : fail('media stream never became live')

    const chunks = Number(/chunks:\s*(\d+)/.exec(diag)?.[1] ?? 0)
    const ctxState = /ctx:\s*(\w+)/.exec(diag)?.[1] ?? '<none>'
    chunks > 0
      ? pass(`audio chunks captured over https: ${chunks} (ctx ${ctxState})`)
      : fail(`no audio chunks captured (diagnostics: ${JSON.stringify(diag)})`)
    if (maxLevel > 0) pass(`input level reached ${maxLevel}`)
    else fail('input level never rose above 0')

    const score = await scoreText()
    if (/Microphone|failed|denied|unavailable/i.test(score))
      fail('playback reported an error: ' + score)

    if (pageErrors.length) fail('page errors: ' + pageErrors.join(' | '))
    else pass('no page errors')

    console.log(`  info url=${url} diag=${JSON.stringify(diag)}`)
  } finally {
    await browser.close()
  }
} finally {
  server.kill('SIGTERM')
  rmSync(certDir, { recursive: true, force: true })
}

if (failed) {
  console.error('https.smoke FAILED')
  process.exit(1)
}
console.log('https.smoke passed')
process.exit(0)
