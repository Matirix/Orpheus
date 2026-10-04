# NOTES.md

## Discrepancies found

### `npm run typecheck` was vacuous
`tsconfig.json` is a project-references file with `"files": []`, so `tsc --noEmit`
checked nothing and exited 0. Type errors accumulated in `src/audio/*` unnoticed.
Fixed by pointing `typecheck` at `tsconfig.app.json` and `tsconfig.node.json`.
`npm run build` (`tsc -b`) now runs a real check.

### `npm run build` was broken
Vitest 2.1.8 depends on Vite 5, so it installed a nested copy of Vite alongside the
project's Vite 8. That made `vitest.config.ts` fail type-checking and produced
conflicting Vite types. Fixed by moving to Vitest 4.1.11, which accepts Vite 8.

### `@tonejs/midi` was used without being declared
`songs/midi.ts` imports it directly, but it was only present transitively via
`@spotify/basic-pitch`. Now declared explicitly in `package.json`.

### `pytorch-triton-rocm` is configured but not depended on — resolved
It was listed under `[tool.uv.sources]` with no matching dependency. Since that index is
`explicit = true` and PyPI stops at 2.1.0, the resolver could not see 3.5.1 at all, so
`uv sync --extra ml` failed with "there is no version of pytorch-triton-rocm==3.5.1".
It is now a direct `ml` dependency. `torch` also carries a `>=2.8` floor: rocm6.4 ships
no cp39–cp311 wheels before 2.8, so an unpinned torch resolved to 2.0.1, which has no
wheel for Python 3.12.

### `WORK_DIR.mkdir()` runs at import time
`backend/app/config.py` creates the working directory as an import side effect, which
fails at import time if the path is not writable. Prefer a lazy init.

### Basic Pitch ring buffer was written one sample at a time
The worklet handler shifted the whole 43844-sample ring per output sample
(~4.4M copies per 150ms chunk). Now it batches the downsampled block per chunk, which
is what the legacy code does.

### Renderer `width` ignored its own mount width
`KeyboardRenderer.width` recomputed from `window.innerWidth` instead of the viewport
width it was mounted with, so the falling canvas could be sized for a different
keyboard than the one laid out. It now derives width from its own geometry.

### Pointer handlers were assigned as properties
Keyboard keys used `el.onpointerdown = ...`. That silently fails in environments
without PointerEvent IDL attributes (jsdom) and leaks listeners across remounts.
Now uses `addEventListener` with explicit teardown.

### Listen played nothing (fixed)

Two compounding faults, both found with a headless-Chrome loop rather than by
reading code:

1. `Tone.start()` was called only after `await import('tone')`. Browsers require
   `AudioContext.resume()` inside the user gesture, so by then the activation had
   expired. The module is now primed on mount and `start()` resumes
   synchronously when already primed.
2. The real blocker: `clockRef.current` was assigned **inside `useMemo`**.
   React re-runs the factory under `StrictMode`, so the ref kept the *discarded*
   clock while the engine kept its own. The button primed one clock and the
   engine read another, whose `now()` was `0` — producing a large negative time,
   no scheduled notes, and an instant "Finished". The pair is now one `useState`
   object, so the engine and the clock it reads are the same instance by
   construction.

### Play never asked for the microphone (fixed)

`handlePlay` only toggled engine state; nothing instantiated
`BasicPitchDetector`, so `getUserMedia` was never called. The detector and the
engine's `setDetected`/`setDiagnostics` sinks both existed and were correct —
they were simply never connected. Also fixed while wiring:

- `inputLevel` was hardcoded to `0` in `getDiagnostics()`, so the meter always
  read 0.000 even with signal present.
- `setDiagnostics` stored the value but never emitted, so React never saw an
  update. It now emits on a 250 ms throttle (diagnostics are status text, but
  not per-frame state).
- `src/audio/capture.ts` was dead and misleading: `AudioCapture.init()` created
  an `AudioContext` but never called `getUserMedia`. Removed.
- The model is served from `public/model/` instead of a CDN (see below).

## Browser smoke tests (the only seam that reaches Web Audio)

jsdom has no `AudioContext`, no `audioWorklet`, and no `mediaDevices`, so no
unit test can exercise Listen or Play. Both were verified in real Chrome:

- `npm run test:listen` — clicks Listen, asserts the score reaches
  `Playing...`, that `AudioBufferSourceNode`s are actually scheduled, and that
  the `AudioContext` resumed. Verified red against the buggy clock pair
  (3 failures), green after the fix.
- `npm run test:play` — asserts `getUserMedia` is called (the permission
  prompt), that the stream goes live, that audio chunks reach the worklet, that
  the input level rises, and that the game advances past its countdown.
  Verified red before wiring (5 failures), green after.

- `npm run test:https` — starts `scripts/host.sh` on its own port and a
  throwaway certificate directory, checks the served chain against the local CA
  on the machine's LAN address, then drives Chrome over that origin: secure
  context, `navigator.mediaDevices` present, `getUserMedia` granted, audio
  chunks flowing. Needs `frontend/dist` (`npm run build`) rather than Vite.

Both need Chrome on PATH (`CHROME_PATH` to override) and start their own Vite
on ports 5179/5181 (test:https starts scripts/host.sh on 5185 instead).

**Caveat on `test:play`:** it drives Chrome's fake microphone, which beeps with
silence in between, so any single instantaneous `level` sample can read 0. The
test tracks the peak across samples instead. A real microphone behaves
differently — treat `keysHighlightedAtPeak` as informational, not an assertion.

## Unverified assumptions (to verify as needed)

1. Unicode clef glyphs (U+1D11E, U+1D122) render acceptably in target browsers —
   still needs a real browser.
2. ~~The Basic Pitch model is loaded from a CDN~~ — **resolved.** Both
   `model/model.json` and `group1-shard1of1.bin` are now in `public/model/`
   (the JSON alone is not enough: the manifest references the binary by relative
   path) and `MODEL_URL` points at `/model/model.json`.
3. Salamander samples are still fetched from
   `https://tonejs.github.io/audio/salamander/`, so Listen needs network access.
   There is a PolySynth fallback if the samples fail to load.
4. The Transkun CLI argument order (input.wav output.mid) has not been executed.
5. ~~That uv resolves torch and `pytorch-triton-rocm` from the ROCm index — the
   `pytorch-triton-rocm` source entry is currently inert~~ — **resolved**, see
   above. `uv sync --extra ml` now installs on Python 3.12 and reports the RX 9070
   XT as a usable device.

## Verified during this refactor

All of these were checked by reading the installed package type definitions, not by
running them.

- `BasicPitch.evaluateModel(buffer, onComplete, percentCallback)` and the
  `OnCompleteCallback` shape `(frames, onsets, contours)` in
  `@spotify/basic-pitch@1.0.1`.
- `Note` in `@tonejs/midi@2.0.28` exposes `ticks`, `durationTicks`, `midi`, `time`,
  and `duration`. `midi.ts` was using the correct field.
- `Tone.Sampler` accepts `urls`, `release`, `baseUrl`, and `onload` options in
  Tone 15.

## YouTube import

Paste a URL into the control strip and press **Convert**. `frontend/src/api/youtube.ts`
drives the backend job (`POST /api/jobs` → poll `GET /api/jobs/{id}` →
`GET /api/jobs/{id}/midi`), the MIDI is parsed into the song library, and the same
bytes stay at `work/<job_id>/out.mid`. Progress messages come from the server, so the
status line never claims a stage the backend is not in.

Job state lives only in server memory, so every change is also mirrored to
`work/<job_id>/job.json`: id, URL, title, model, status, message, and — once the job is
done — the MIDI filename. That sidecar is written aside and renamed, so a reader never
catches half a file, and a failure to write it never fails the conversion. It is what
makes a bare `work/` folder tell you what it contains after a restart.

Needs `uv sync --extra ml` once; the first conversion downloads a ~165 MB checkpoint.
Verified end to end by `npm run test:youtube` — real Chrome, real backend, 65 s for a
3½ minute video with the model already warm.

## Audio upload

`Load file` accepts `.wav` and `.mp3` alongside MIDI and MusicXML. The bytes are
posted raw to `POST /api/transcribe?title=…&filename=…` — no multipart, the endpoint
streams them off the request into `work/<id>/`, bounded by `MAX_UPLOAD_BYTES` so a
large file costs disk rather than RAM — and the job that comes back is polled
exactly like a YouTube conversion.

- `waitForJobMidi` in `frontend/src/api/youtube.ts` is shared by both paths: same
  statuses, same server messages, same MIDI on the way back.
- The extension is the gate, checked on the client (`AUDIO_RE`) and again on the
  server (`AUDIO_SUFFIXES`); every other file still goes to the parsers in the
  browser. The name from the query string is reduced to its basename before it is
  ever used as a path.
- `run_upload` checks the duration first (`check_duration`, `MAX_MINUTES`) and only
  then takes `transcribe_lock`, so an over-long recording is refused before the
  model loads and two transcriptions never overlap.
- The recording is deleted in the same `finally` that cleans up a conversion's
  download: `job.json` and `out.mid` are what stay, and `out.mid` is what puts the
  song in the library.
- The upload rides `converting` rather than `busy`, the same decision as the
  Convert button, so Play and Listen stay clickable while the server works.
- Needs `uv sync --extra ml`: librosa decodes the file (libsndfile reads MP3
  directly, so ffmpeg is not involved on this path) and the model writes the MIDI.

## Song library

`work/` is the library. `backend/app/songs.py` lists every folder that holds a payload —
`out.mid` from a conversion, `song.json` from a song the browser parsed — and serves it
from `GET /api/songs` and `GET /api/songs/{id}`, so the menu is the same on every start
and nothing about a song depends on the browser.

- `frontend/src/songs/library.ts` is the only caller: `list()` fetches the rows,
  `load()` reads the bytes and parses them (MIDI through `parseMidi`, a stored song as it
  was saved), `save()` posts one.
- Saving is keyed by name, so the same title resolves to one folder instead of stacking
  up copies — and a transcription owns its folder: an upload stored under the same name
  leaves the MIDI alone rather than replacing it with something lossier.
- Titles go through `songName()` on the way in, so a long YouTube title and the menu
  entry are the same string whether they are read at conversion time or on the next
  launch.
- Whatever is left in localStorage under `pl_songs` is moved across on the first load,
  and the key is dropped only once every song is stored: an unreachable backend leaves it
  in place for the next start instead of losing the songs.
- A conversion does not save the parsed song — the job's own `out.mid` is already in
  `work/`, and storing it again would put two copies of one song in the library.
- Verified end to end by `npm run test:library`, which needs the backend on 8000 and at
  least one song in `work/`.

## Network hosting

- `just host` / `make host` runs `scripts/host.sh`: builds the frontend, then
  serves `backend.app.main:app` on `0.0.0.0:8443` with `--ssl-certfile` /
  `--ssl-keyfile` straight from `frontend/dist`. The address comes from
  `ip route get 1.1.1.1` (`LAN=` overrides it) and is printed as a URL, an
  ASCII QR code (`uv run --with qrcode`, which draws from `get_matrix()` so it
  needs no Pillow — plain URL on failure) and the install steps. It runs the
  project venv's `python -m uvicorn` directly rather than `uv run`, so no
  session can have its ml extras resynced away underneath it.
- Certificates live in `certs/` (gitignored): the CA is created once
  (`CA:TRUE,pathlen:0`, 10 years) and is what the iPad trusts; the leaf is
  reissued on every run with
  `IP:<lan>,IP:127.0.0.1,DNS:localhost,DNS:<host>,DNS:<host>.local`, EKU
  `serverAuth`, and 825 days — Apple's maximum for a server certificate. The
  one-time device step is installing `ca.pem` and enabling it under
  Settings > General > About > Certificate Trust Settings; the per-run leaf
  means a changed address never needs another install.
- Getting the CA onto the device needs no cloud or cable: `GET /ca.pem` serves
  `certs/ca.pem` as `application/pkix-cert` with an attachment disposition, so
  Safari offers a download that installs as a profile. It reads `CERT_DIR` from
  the environment (host.sh exports it), so a session using its own certificates
  hands out the CA that actually signed it. Two QR codes are printed: the
  certificate link first, then the app. `test:https` asserts the served bytes
  are the signing CA and that the disposition is an attachment.
- Safari on iOS exposes `navigator.mediaDevices` only in a secure context and
  has no "allow insecure sites" switch, which is why HTTPS is required for
  Play/Listen from a device rather than merely nice to have.
- Play's detector module is warmed at mount next to `clock.prime()`, so
  `handlePlay` creates its `AudioContext` inside the click's gesture on Safari
  the way Listen already does.

## Not yet implemented

- Basic Pitch inference measured **1.2-1.8 s per pass** in headless Chrome,
  which bounds how quickly Play can react. The package uses `@tensorflow/tfjs`
  3.x with the WebGL backend available, so a GPU-backed browser should be much
  faster than the test environment — not yet measured on real hardware.
- `docs/MANUAL_QA.md` steps have not been executed against a real browser.