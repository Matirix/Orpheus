import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameEngine, type EngineStatus } from '../game/engine'
import { ToneAudioClock } from '../playback/clock'
import { loadVoice } from '../playback/sampler'
import { BUILTIN_SONGS } from '../songs/builtin'
import { LocalStorageSongLibrary } from '../songs/library'
import { parseMidi } from '../songs/midi'
import { parseMusicXML } from '../songs/musicxml'
import type { Song } from '../songs/types'
import type { Mode } from '../game/modes'

const library = new LocalStorageSongLibrary()

const EMPTY_DIAGNOSTICS = {
  ctxState: 'closed',
  ctxSampleRate: 0,
  chunkCount: 0,
  inputLevel: 0,
  gate: 0,
  peakProb: 0,
  inferenceMs: 0,
}

export function PianoLearn() {
  const [selected, setSelected] = useState<string>(Object.keys(BUILTIN_SONGS)[0] ?? 'Ode to Joy')
  const [customNames, setCustomNames] = useState<string[]>(() => library.list())
  const [bpm, setBpm] = useState(120)
  const [mode, setMode] = useState<Mode>('timed')
  const [status, setStatus] = useState<EngineStatus>({
    demoPlaying: false,
    playRunning: false,
    scoreText: '',
    diagnostics: EMPTY_DIAGNOSTICS,
  })
  const [busy, setBusy] = useState('')

  const engineRef = useRef<GameEngine | null>(null)
  const clockRef = useRef<ToneAudioClock | null>(null)
  const keyboardElRef = useRef<HTMLDivElement | null>(null)
  const fallingRef = useRef<HTMLCanvasElement | null>(null)
  const staffRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const engine = useMemo(() => {
    const clock = new ToneAudioClock()
    clockRef.current = clock
    const e = new GameEngine({ clock })
    engineRef.current = e
    return e
  }, [])

  const songs = useMemo(() => {
    const map: Record<string, Song> = { ...BUILTIN_SONGS }
    for (const name of customNames) {
      const loaded = library.load(name)
      if (loaded) map[name] = loaded
    }
    return map
  }, [customNames])

  const currentSong = songs[selected]

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

  // Load the Tone module up front so the Listen click can resume the
  // AudioContext synchronously, inside the user gesture.
  useEffect(() => {
    void clockRef.current?.prime()
  }, [])

  useEffect(() => {
    engine.setBpm(bpm)
  }, [engine, bpm])

  useEffect(() => {
    const keyboardEl = keyboardElRef.current
    const falling = fallingRef.current
    const staff = staffRef.current
    const stage = stageRef.current
    if (!keyboardEl || !falling || !staff || !stage) return

    // Size the keyboard from the stage's own width so it fills the screen
    // instead of overflowing based on window.innerWidth.
    const relayout = () => {
      const width = stage.clientWidth || window.innerWidth
      engine.mount(keyboardEl, falling, staff, width)
    }
    relayout()

    const observer = new ResizeObserver(relayout)
    observer.observe(stage)
    return () => {
      observer.disconnect()
      engine.unmount()
    }
  }, [engine])

  const handleListen = useCallback(async () => {
    const clock = clockRef.current
    if (!clock) return
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
      if (!engine.startDemo()) {
        setStatus((s) => ({
          ...s,
          scoreText: 'Could not start playback — is a song selected?',
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
  }, [engine, status.demoPlaying])

  const handlePlay = useCallback(() => {
    if (status.playRunning) {
      engine.stopPlay()
      return
    }
    engine.startPlay()
  }, [engine, status.playRunning])

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
        library.save(name, song)
        // Refresh the menu so the uploaded song is selectable, then select it.
        setCustomNames(library.list())
        setSelected(name)
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

  const diag = status.diagnostics

  return (
    <div className="piano-learn">
      <div className="controls">
        <label>
          Song{' '}
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {Object.keys(songs).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tempo <input type="range" min={40} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />{' '}
          <span>{bpm}</span>
        </label>
        <label>
          Mode{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="timed">Timed</option>
            <option value="wait">Wait for you</option>
          </select>
        </label>
        <label>
          Load file{' '}
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
        <button type="button" onClick={handlePlay}>
          {status.playRunning ? 'Stop' : 'Play'}
        </button>
        <button type="button" onClick={() => void handleListen()} disabled={busy !== ''}>
          {status.demoPlaying ? 'Stop' : 'Listen'}
        </button>
      </div>

      {busy && <div className="busy">{busy}</div>}
      <div className="status">
        <div>ctx: {diag.ctxState} @ {diag.ctxSampleRate}</div>
        <div>chunks: {diag.chunkCount} level: {diag.inputLevel.toFixed(3)} peak: {diag.peakProb.toFixed(2)} infer: {diag.inferenceMs.toFixed(0)}ms</div>
      </div>
      <div className="score">{status.scoreText || ' '}</div>

      <canvas ref={staffRef} className="staff-canvas" />
      <div className="stage" ref={stageRef}>
        <canvas ref={fallingRef} className="falling-canvas" />
        <div ref={keyboardElRef} className="keyboard" />
      </div>

      <style>{`
        .piano-learn { font-family: system-ui, sans-serif; }
        .piano-learn .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 8px; }
        .piano-learn .busy { color: #8a93a0; font-size: 13px; }
        .piano-learn .status { font: 12px ui-monospace, monospace; color: #8a93a0; }
        .piano-learn .score { color: #7dffb2; font-size: 18px; min-height: 24px; }
        .piano-learn .staff-canvas { display: block; background: #f7f4ec; border-radius: 8px; margin-top: 12px; }
        .piano-learn .stage { position: relative; margin-top: 12px; overflow-x: auto; width: 100%; }
        .piano-learn .falling-canvas { display: block; background: #0d0f12; border-radius: 8px 8px 0 0; }
        .piano-learn .keyboard { position: relative; height: 120px; }
        .piano-learn .key { position: absolute; top: 0; box-sizing: border-box; border: 1px solid #222; border-radius: 0 0 4px 4px; cursor: pointer; }
        .piano-learn .white { background: #f4f4f4; height: 120px; z-index: 1; }
        .piano-learn .black { background: #222; height: 74px; z-index: 2; }
        .piano-learn .white.on { background: #7dffb2; }
        .piano-learn .black.on { background: #1fa85b; }
      `}</style>
    </div>
  )
}