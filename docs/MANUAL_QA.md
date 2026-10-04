# Manual QA Checklist

## Setup
- [ ] All dependencies installed (frontend and backend)
- [ ] ffmpeg installed and in PATH
- [ ] Deno installed
- [ ] App builds successfully

## Microphone & Detection
- [ ] Mic starts, diagnostics show `ctx running`, detected notes light the keys
- [ ] Single notes and a chord are detected; the silence gate stops ghost notes

## Game Modes
- [ ] Wait mode pauses at each note; timed mode scores with the latency allowance
- [ ] Two-beat count-in works
- [ ] Score displays correctly

## Rendering
- [ ] Staff and falling notes stay in sync; sharps, ledger lines and dotted notes look right
- [ ] Keyboard displays all 88 keys and lights up on notes

## Songs
- [ ] Built-in songs load and play correctly
- [ ] Uploading a MIDI and a MusicXML file works; the part selector changes the notes
- [ ] Uploading a `.wav` or `.mp3` shows the server's own progress messages and the
      transcribed song lands in the menu and is selected (needs `uv sync --extra ml`)
- [ ] An audio file over 15 minutes is refused with the limit in the status line
- [ ] Uploading PDFs/images or compressed .mxl shows appropriate error message
- [ ] YouTube conversion works and shows progress; the song appears in the list
- [ ] Uploaded songs survive a reload (they come from `work/` on the server)

## Playback
- [ ] Listen plays with piano sound and visuals in time; Stop works

## Cross-Device
- [ ] `just host` serves the built app on the LAN; the iPad opens `https://<lan-ip>:8443/ca.pem`
      from it, taps through Safari's trust warning, installs the profile (Settings >
      Profile Downloaded) and enables it under Settings > General > About >
      Certificate Trust Settings
- [ ] The app then loads at `https://<lan-ip>:8443` with no certificate warning, Play
      hears notes from the piano and advances the game, Listen plays with piano sound

## Notes
- Microphone/audio output cannot be fully automated in this environment. All items above require human verification.
