import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convertYouTubeToMidi } from '../api/youtube'
import { GameEngine, type EngineStatus } from '../game/engine'
import { ToneAudioClock } from '../playback/clock'
import { loadVoice } from '../playback/sampler'
import type { NoteDetector } from '../audio/detector'
import { BUILTIN_SONGS } from '../songs/builtin'
import { library, songName } from '../songs/library'
import { parseMidi } from '../songs/midi'
import { parseMusicXML } from '../songs/musicxml'
import type { Song } from '../songs/types'
import type { Mode } from '../game/modes'
import { MIN_FALLING_HEIGHT } from '../render/layout'
import './Orpheus.css'

/** The clock and the engine must be the same instance pair. */
function createEnginePair(): { clock: ToneAudioClock; engine: GameEngine } {
  const clock = new ToneAudioClock()
  return { clock, engine: new GameEngine({ clock }) }
}

const EMPTY_DIAGNOSTICS = {
  ctxState: 'closed',
  ctxSampleRate: 0,
  chunkCount: 0,
  inputLevel: 0,
  gate: 0,
  peakProb: 0,
  inferenceMs: 0,
}

/**
 * Height of the white-key row. `--keyboard-h` in index.css is the source of
 * truth; this fallback is only for environments where the stylesheet does not
 * cascade (jsdom), so the well still gets a sane size.
 */
function keyboardHeight(): number {
  if (typeof document === 'undefined') return 132
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-h')
  const px = Number.parseFloat(raw)
  return Number.isFinite(px) && px > 0 ? px : 132
}

const ALERT_RE = /unavailable|failed|denied|Could not start/i

export function Orpheus() {
  const [selected, setSelected] = useState<string>(Object.keys(BUILTIN_SONGS)[0] ?? 'Ode to Joy')
  const [customSongs, setCustomSongs] = useState<Record<string, Song>>({})
  const [bpm, setBpm] = useState(120)
  const [mode, setMode] = useState<Mode>('timed')
  const [status, setStatus] = useState<EngineStatus>({
    demoPlaying: false,
    playRunning: false,
    scoreText: '',
    diagnostics: EMPTY_DIAGNOSTICS,
  })
  const [busy, setBusy] = useState('')
  // Kept apart from `busy`: a conversion runs for minutes, and Play/Listen
  // stay usable throughout.
  const [ytUrl, setYtUrl] = useState('')
  const [converting, setConverting] = useState('')

  // Held as one state object, not a useMemo + ref: React re-runs the factory
  // under StrictMode, and a ref written during render keeps the *discarded*
  // clock while the engine keeps its own — so priming the ref primed the wrong
  // clock and Listen never played.
  const [{ clock, engine }] = useState(createEnginePair)

  const detectorRef = useRef<NoteDetector | null>(null)
  const keyboardElRef = useRef<HTMLDivElement | null>(null)
  const fallingRef = useRef<HTMLCanvasElement | null>(null)
  const staffRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const mastheadRef = useRef<HTMLElement | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const noticesRef = useRef<HTMLDivElement | null>(null)

  const songs = useMemo(() => ({ ...BUILTIN_SONGS, ...customSongs }), [customSongs])

  const currentSong = songs[selected]

  /**
   * The library lives on the server, so it is fetched once here and parsed
   * into memory: everything in work/ reaches the menu without depending on
   * anything stored in this browser.
   */
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        await library.migrate()
      } catch (err) {
        console.warn('Could not move songs off local storage', err)
      }
      try {
        const loaded: Record<string, Song> = {}
        for (const name of await library.list()) {
          const song = await library.load(name)
          if (song) loaded[name] = song
        }
        // Songs saved while this was fetching win, so they are spread last.
        if (alive) setCustomSongs((prev) => ({ ...loaded, ...prev }))
      } catch (err) {
        console.warn('Could not load saved songs', err)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    engine.onStatus(setStatus)
    return () => {
      engine.onStatus(() => {})
    }
  }, [engine])

  useEffect(() => {
    if (!currentSong) return
    engine.setSong(currentSong)
    setBpm(currentSong.bpm)
  }, [engine, currentSong])

  useEffect(() => {
    engine.setMode(mode)
  }, [engine, mode])

  // Release the microphone whenever the view unmounts.
  useEffect(() => {
    return () => {
      detectorRef.current?.stop()
      detectorRef.current = null
    }
  }, [])

  // Load the Tone module up front so the Listen click can resume the
  // AudioContext synchronously, inside the user gesture — and warm Basic Pitch
  // the same way, so Play does not spend its own gesture on a module download.
  useEffect(() => {
    void clock.prime()
    void import('../audio/basic-pitch-detector')
  }, [clock])

  useEffect(() => {
    engine.setBpm(bpm)
  }, [engine, bpm])

  // Size the instrument from the window, not from its own box: measuring the
  // stage's own width/height feeds the answer back into the question and the
  // well grows on every frame.
  useEffect(() => {
    const keyboardEl = keyboardElRef.current
    const falling = fallingRef.current
    const staff = staffRef.current
    const stage = stageRef.current
    const masthead = mastheadRef.current
    const controls = controlsRef.current
    const notices = noticesRef.current
    if (!keyboardEl || !falling || !staff || !stage || !masthead || !controls || !notices)
      return

    let last = { width: 0, height: 0 }

    const relayout = () => {
      const width = Math.round(document.documentElement.clientWidth) || window.innerWidth
      const rect = stage.getBoundingClientRect()
      // Document-relative so a scrolled page does not distort the answer.
      const top = rect.top + window.scrollY
      const height = Math.max(
        MIN_FALLING_HEIGHT,
        Math.round(window.innerHeight - top - keyboardHeight())
      )
      if (width === last.width && height === last.height) return
      last = { width, height }
      engine.mount(keyboardEl, falling, staff, width, height)
    }

    relayout()
    // A ResizeObserver only reports size, never movement — so every element
    // above the stage whose box can grow (the score wrapping, the control
    // strip wrapping to a second row, the meter appearing, the detail panel
    // opening, the staff's first draw) is watched too, or the keyboard would
    // drift below the fold unnoticed.
    const observer = new ResizeObserver(relayout)
    for (const el of [stage, staff, masthead, controls, notices]) observer.observe(el)
    window.addEventListener('resize', relayout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', relayout)
      engine.unmount()
    }
  }, [engine])

  const handleListen = useCallback(async () => {
    if (status.demoPlaying) {
      engine.stopDemo('Stopped')
      return
    }
    // Resume the AudioContext synchronously from the gesture: Tone must be
    // primed first, otherwise the resume happens after the activation expires.
    const started = clock.start()
    try {
      await started
    } catch (err) {
      setStatus((s) => ({
        ...s,
        scoreText:
          'Audio failed to start: ' +
          (err instanceof Error ? err.message : String(err)),
      }))
      return
    }

    try {
      if (!clock.hasVoice()) {
        setStatus((s) => ({ ...s, scoreText: 'Loading piano sounds...' }))
        const { voice, sampled, error } = await loadVoice()
        clock.setVoice(voice)
        if (!sampled) {
          console.warn('Listen is using the synth fallback:', error)
        }
      }
      const refusal = engine.startDemo()
      if (refusal) {
        setStatus((s) => ({
          ...s,
          scoreText: `Could not start playback: ${refusal}`,
        }))
      }
    } catch (err) {
      setStatus((s) => ({
        ...s,
        scoreText:
          'Audio failed: ' + (err instanceof Error ? err.message : String(err)),
      }))
    } finally {
      setBusy('')
    }
  }, [clock, engine, status.demoPlaying])

  /** Stops the mic detector and clears anything it was holding down. */
  const stopMic = useCallback(() => {
    detectorRef.current?.stop()
    detectorRef.current = null
    engine.setDetected(new Set())
    engine.setDiagnostics(EMPTY_DIAGNOSTICS)
  }, [engine])

  const handlePlay = useCallback(async () => {
    if (status.playRunning) {
      engine.stopPlay()
      stopMic()
      return
    }
    setBusy('Requesting microphone access...')
    try {
      if (!detectorRef.current) {
        // The module was warmed at mount, so this resolves from cache and the
        // AudioContext below is still created inside the click's gesture.
        const { BasicPitchDetector } = await import(
          '../audio/basic-pitch-detector'
        )
        const detector = new BasicPitchDetector()
        detector.onNotes((notes) => {
          engine.setDetected(notes)
          engine.setDiagnostics(detector.getDiagnostics())
        })
        // start() is what prompts for the microphone.
        await detector.start()
        detectorRef.current = detector
        engine.setDiagnostics(detector.getDiagnostics())
      }
      engine.startPlay()
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      const reason =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'microphone permission was denied'
          : err instanceof Error
            ? err.message
            : String(err)
      setStatus((s) => ({ ...s, scoreText: `Microphone unavailable: ${reason}` }))
    } finally {
      setBusy('')
    }
  }, [engine, status.playRunning, stopMic])

  const handleFile = useCallback(
    async (file: File) => {
      setBusy('Converting...')
      try {
        const buffer = await file.arrayBuffer()
        const isXml =
          /\.xml$|\.musicxml$/i.test(file.name) ||
          new TextDecoder().decode(buffer.slice(0, 200)).includes('<score-partwise')
        const song = isXml
          ? parseMusicXML(new TextDecoder().decode(buffer))
          : await parseMidi(buffer)
        const name = file.name.replace(/\.[^.]+$/, '')
        // The library keeps it for the next start; the menu needs it now, and
        // under whatever name it had free.
        const stored = await library.save(name, song)
        setCustomSongs((prev) => ({ ...prev, [stored]: song }))
        setSelected(stored)
        engine.setSong(song)
        setBpm(song.bpm)
      } catch (err) {
        setStatus((s) => ({
          ...s,
          scoreText: 'Conversion failed: ' + (err instanceof Error ? err.message : String(err)),
        }))
      } finally {
        setBusy('')
      }
    },
    [engine]
  )

  /**
   * YouTube URL -> backend job -> MIDI -> the song library.
   *
   * Progress messages come straight from the server (downloading,
   * transcribing, ...), so the status line never invents a stage the backend
   * is not actually in.
   */
  const handleConvert = useCallback(async () => {
    const url = ytUrl.trim()
    if (!url || converting) return
    setConverting('Contacting the backend...')
    try {
      const { midi, title } = await convertYouTubeToMidi(url, setConverting)
      const song = await parseMidi(midi)
      // Titles repeat and run long; the library is keyed by name.
      const name = songName(title)
      // The MIDI already landed in work/ as the job's own output, so saving
      // the parsed song too would put a second copy in the library.
      setCustomSongs((prev) => ({ ...prev, [name]: song }))
      setSelected(name)
      engine.setSong(song)
      setBpm(song.bpm)
      setYtUrl('')
      setStatus((s) => ({ ...s, scoreText: `Loaded "${name}"` }))
    } catch (err) {
      setStatus((s) => ({
        ...s,
        scoreText:
          'YouTube import failed: ' + (err instanceof Error ? err.message : String(err)),
      }))
    } finally {
      setConverting('')
    }
  }, [converting, engine, ytUrl])

  const diag = status.diagnostics
  const scoreText = status.scoreText
  const micLive = status.playRunning || diag.chunkCount > 0
  const levelPct = Math.min(100, Math.round(diag.inputLevel * 100))

  return (
    <div className="orpheus">
      <header className="masthead" ref={mastheadRef}>
        <h1 className="piece">{selected}</h1>
        <p className={ALERT_RE.test(scoreText) ? 'score score--alert' : 'score'}>
          {scoreText || ' '}
        </p>
      </header>

      <div className="controls" ref={controlsRef}>
        <label className="field">
          Song
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {Object.keys(songs).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Tempo
          <input
            type="range"
            min={40}
            max={200}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          <span className="field-value">{bpm}</span>
        </label>
        <label className="field">
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="timed">Timed</option>
            <option value="wait">Wait for you</option>
          </select>
        </label>
        <label className="field">
          Load file
          <input
            type="file"
            accept=".mid,.midi,.xml,.musicxml"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ''
            }}
          />
        </label>
        <label className="field">
          YouTube
          <input
            type="url"
            value={ytUrl}
            placeholder="https://youtube.com/watch?v="
            onChange={(e) => setYtUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleConvert()
            }}
            disabled={converting !== ''}
          />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => void handleConvert()}
          disabled={converting !== '' || ytUrl.trim() === ''}
        >
          {converting ? 'Converting...' : 'Convert'}
        </button>
        <div className="actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handlePlay()}
            disabled={busy !== ''}
          >
            {status.playRunning ? 'Stop' : 'Play'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void handleListen()}
            disabled={busy !== ''}
          >
            {status.demoPlaying ? 'Stop' : 'Listen'}
          </button>
        </div>
      </div>

      <div className="notices" ref={noticesRef}>
        <div className="busy">{busy || converting || ' '}</div>
        <div className="telemetry">
        {micLive && (
          <div className="meter" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${levelPct}%` }} />
          </div>
        )}
          <details className="details">
            <summary>Input detail</summary>
            <div className="status">
              <div>
                ctx: {diag.ctxState} @ {diag.ctxSampleRate}
              </div>
              <div>
                chunks: {diag.chunkCount} level: {diag.inputLevel.toFixed(3)} peak:{' '}
                {diag.peakProb.toFixed(2)} infer: {diag.inferenceMs.toFixed(0)}ms
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="instrument">
        <canvas ref={staffRef} className="staff-canvas" />
        <div className="felt" />
        <div className="stage" ref={stageRef}>
          <canvas ref={fallingRef} className="falling-canvas" />
          <div ref={keyboardElRef} className="keyboard" />
        </div>
      </div>
    </div>
  )
}
