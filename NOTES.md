# NOTES.md

## Discrepancies found

### None identified yet
All extracted logic preserves behavior from legacy files as observed.

## Unverified assumptions (to verify as needed)

1. The Basic Pitch `evaluateModel` callback signature matches @spotify/basic-pitch@1.0.1 API
2. The Tone.js `Sampler` options and Salamander file names match expected format
3. Unicode clef glyphs (U+1D11E, U+1D122) render acceptably in target browsers
4. The `@tonejs/midi` fields used match v2.0.28 API
5. The Transkun CLI argument order (input.wav output.mid)
6. That uv resolves torch and `pytorch-triton-rocm` from the ROCm index as configured
