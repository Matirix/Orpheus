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

## Unverified assumptions (to verify as needed)

1. Unicode clef glyphs (U+1D11E, U+1D122) render acceptably in target browsers —
   still needs a real browser.
2. The Basic Pitch model is still loaded from a CDN
   (`src/audio/basic-pitch-detector.ts`). The spec calls for a locally served model.
   The package ships `model/model.json` plus `group1-shard1of1.bin`, so both files
   need to be copied to `public/` — the JSON alone is not enough because the manifest
   references the binary by relative path.
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

- Microphone capture / detection is not wired to the UI. `BasicPitchDetector`
  exists and is type-correct but nothing instantiates it, and the local model
  requirement above is unmet.
- YouTube import is not wired to the UI.
- No HTTPS in production; `backend/app/main.py` mounts the frontend as static files
  only.
- `docs/MANUAL_QA.md` steps have not been executed against a real browser.