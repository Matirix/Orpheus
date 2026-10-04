# Piano Learn

A browser-based piano practice app. It listens to you play through the microphone, shows what it hears on a full 88-key keyboard, and checks you against falling notes and a scrolling sheet-music staff. A small local Python server adds YouTube-to-MIDI conversion.

## Features

**Listening and detection**
- Real-time note and chord detection from the microphone using Spotify's Basic Pitch (runs in the browser)
- Detected notes light up on a full 88-key on-screen piano (A0 to C8)
- Adjustable frame threshold, silence gate, and a speed/accuracy setting for detection
- Live diagnostics line (audio state, input level, inference time) for troubleshooting

**Practice**
- Falling-notes view that lines up with the keyboard
- Scrolling grand staff (treble and bass) above it, synced to the same song
- **Wait mode:** the song pauses at each note until you play it
- **Timed mode:** the song keeps moving and you play along
- Tempo slider and a running score
- Built-in songs: Ode to Joy, Twinkle Twinkle, and a C – F – G – C chord progression

**Songs**
- Upload MIDI files (`.mid`, `.midi`) or uncompressed MusicXML (`.musicxml`, `.xml`)
- Pick a single part or track (for example, right hand only)
- Uploaded songs are stored under `work/` on the server, so the song list is the same after a restart
- **YouTube to MIDI:** paste a YouTube link and the server downloads the audio, transcribes it to MIDI, and adds it as a song
- **Listen:** plays any song aloud with a piano sound while the staff and falling notes animate

## Requirements

- [uv](https://docs.astral.sh/uv/) (installs Python dependencies automatically)
- `ffmpeg` on your PATH (yt-dlp uses it to extract audio)
- [Deno](https://deno.com) (yt-dlp needs a JavaScript runtime for YouTube)
- `wget` (the transcription library uses it to download its model on first run)
- An internet connection (Basic Pitch, Tone.js, and the piano samples load from CDNs)
- Chrome, with microphone access allowed

## Run it

### Development

Using just:
```bash
just dev
```

Or run separately:
```bash
# Backend
cd /home/malefor/Projects/piano-detect && uv run uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm run dev
```

YouTube-to-MIDI needs the transcription model, which is an optional extra:
```bash
uv sync --extra ml
```
The first conversion also downloads a ~165 MB checkpoint. It is not needed for
Play, Listen or file uploads.

### Production

Build the frontend and serve from backend:
```bash
just build
cd /home/malefor/Projects/piano-detect && uv run uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

## Linux/AMD GPU

The backend is configured for AMD GPUs on Linux (PyTorch's ROCm build, index `rocm6.4`). For NVIDIA or CPU only, update pyproject.toml to remove ROCm-specific sources.

## Testing

```bash
just test
just lint
```
