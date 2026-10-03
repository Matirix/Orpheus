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

### `pytorch-triton-rocm` is configured but not depended on
`pyproject.toml` lists it under `[tool.uv.sources]` with no matching entry in any
`dependency-groups`, so the ROCm install will not actually pull it in.

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

Both need Chrome on PATH (`CHROME_PATH` to override) and start their own Vite
on ports 5179/5181.

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
5. That uv resolves torch and `pytorch-triton-rocm` from the ROCm index — the
   `pytorch-triton-rocm` source entry is currently inert (see above).

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

## Not yet implemented

- Basic Pitch inference measured **1.2-1.8 s per pass** in headless Chrome,
  which bounds how quickly Play can react. The package uses `@tensorflow/tfjs`
  3.x with the WebGL backend available, so a GPU-backed browser should be much
  faster than the test environment — not yet measured on real hardware.
- YouTube import is not wired to the UI.
- No HTTPS in production; `backend/app/main.py` mounts the frontend as static files
  only.
- `docs/MANUAL_QA.md` steps have not been executed against a real browser.