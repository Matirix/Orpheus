# Orpheus

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

### Serve it on your network (iPad / phone)

```bash
just host        # or: make host
```

Builds the frontend and serves it over HTTPS on port 8443, printing the address,
two QR codes (certificate first, then the app) and the steps below. Safari only
exposes the microphone in a secure context, so HTTPS — not the HTTP server above
— is what lets an iPad or phone be granted the microphone for Play and Listen.

**One-time setup on the iPad**

1. Scan the first QR, or open `https://<lan-ip>:8443/ca.pem`. Safari warns that
   the certificate is not trusted — expected, the CA is not installed yet: **Show
   Details > visit this website anyway**, then allow the download.
2. **Settings > Profile Downloaded > Install** (passcode if it asks).
3. **Settings > General > About > Certificate Trust Settings > switch on
   "Orpheus local CA"**. Installing and trusting are two separate taps — both are
   required, and this pair is the only thing that happens once.
4. Scan the second QR and allow the microphone.

That is the whole setup. The first run creates a local CA in `certs/` (ignored by
git) and the running server hands it out at `/ca.pem`, so no cable or cloud
account is involved — and because every run issues a fresh leaf certificate
against that same CA, a changed address never needs another install.

No QR handy? `certs/ca.pem` is an ordinary file: email it to yourself and tap the
attachment, or drop it into iCloud/Drive and open it in Files — same profile.

Options: `PORT=9000` for a different port, `SKIP_BUILD=1` to serve the last
build, `LAN=192.168.1.78` to override the detected address.

## Linux/AMD GPU

The backend is configured for AMD GPUs on Linux (PyTorch's ROCm build, index `rocm6.4`). For NVIDIA or CPU only, update pyproject.toml to remove ROCm-specific sources.

## Testing

```bash
just test
just lint
```
