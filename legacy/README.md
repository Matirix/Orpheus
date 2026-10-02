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
- Uploaded songs are saved in the browser's local storage
- **YouTube to MIDI:** paste a YouTube link and the server downloads the audio, transcribes it to MIDI, and adds it as a song (piano transcription model, with optional Transkun)
- **Listen:** plays any song aloud with a piano sound while the staff and falling notes animate

**Devices**
- Works in Chrome on a computer
- Works on an iPad over HTTPS (see below)

## Requirements

- [uv](https://docs.astral.sh/uv/) (installs Python dependencies automatically)
- `ffmpeg` on your PATH (yt-dlp uses it to extract audio)
- [Deno](https://deno.com) (yt-dlp needs a JavaScript runtime for YouTube)
- `wget` (the transcription library uses it to download its model on first run)
- An internet connection (Basic Pitch, Tone.js, and the piano samples load from CDNs)
- Chrome, with microphone access allowed

## Run it

Put `server.py` and `piano-learn.html` in the same folder, then:

```bash
uv run server.py
```

Open **http://localhost:8000** in Chrome. Keep the terminal open while you use the app, and press Ctrl+C to stop it.

The first YouTube conversion downloads a ~165 MB model, so expect a wait.

Optional commands:

```bash
uv run --with transkun server.py              # also enable the Transkun model
uv run --upgrade-package yt-dlp server.py     # update yt-dlp (YouTube changes often)
```

### GPU

The header of `server.py` is set up for **AMD GPUs on Linux** (PyTorch's ROCm build, index `rocm6.4`). Check [pytorch.org/get-started/locally](https://pytorch.org/get-started/locally) and change the version if a newer one is listed. For NVIDIA or CPU only, delete the `[tool.uv.sources]` and `[[tool.uv.index]]` lines in the header, plus the `pytorch-triton-rocm` dependency.

When the model loads, the terminal prints a `Transcription device:` line showing whether the GPU is in use.

## Using the app

1. Click **Start mic** and allow microphone access.
2. Choose a song, or:
   - click **Upload song** to add a MIDI or MusicXML file, or
   - paste a YouTube link and click **Convert**.
3. Choose Wait or Timed mode and set the tempo.
4. Click **Play** to practice, or **Listen** to hear the song.

You can also click the on-screen keys to test the display without a microphone.

## Using it on an iPad

The microphone only works over HTTPS, so plain `http://` on your network won't work. Pick one:

- **Tunnel (easiest):** with the server running, run `cloudflared tunnel --url http://localhost:8000` and open the `https://….trycloudflare.com` address it prints. Anyone with that address can use your converter while it's up, so keep it private.
- **Local HTTPS:** create a certificate with [mkcert](https://github.com/FiloSottile/mkcert) for your computer's IP, save it as `cert.pem` and `key.pem` next to `server.py`, and restart. The server then runs HTTPS on port 8443. Install and trust mkcert's root certificate on the iPad, then open `https://YOUR-IP:8443`.

## Configuration

| Environment variable | Purpose |
|---|---|
| `PIANO_CKPT` | Path to a manually downloaded model checkpoint, if the automatic download fails |
| `YT_COOKIES` | Path to a `cookies.txt` file for yt-dlp |
| `YT_BROWSER` | Browser name (for example `firefox`) for yt-dlp to read cookies from, as a last resort |

## Limitations

- Sheet music as PDF or images isn't supported. Convert it to MusicXML first (for example with Audiveris) and upload that.
- Compressed MusicXML (`.mxl`) isn't supported. Export an uncompressed file.
- Basic Pitch detection has a delay of a few hundred milliseconds, so Wait mode is the better way to learn new pieces.
- The transcription model is built for solo piano. Songs with vocals or drums produce messy MIDI.
- Videos longer than 15 minutes are rejected.
- Downloading from YouTube may go against its terms, so use it for personal practice.
# Orpheus
