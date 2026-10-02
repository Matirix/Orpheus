#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9,<3.13"
# dependencies = [
#   "flask",
#   "yt-dlp[default]",
#   "librosa",
#   "soundfile",
#   "torch",
#   "piano-transcription-inference",
#   "numpy<2",
#   "pytorch-triton-rocm; sys_platform == 'linux'",
# ]
#
# # AMD GPU on Linux: install PyTorch's ROCm build instead of the default (NVIDIA/CUDA) one.
# # Check pytorch.org/get-started/locally (Linux + pip + ROCm) for the current index and
# # change "rocm6.4" below if a newer one is listed. For CPU/NVIDIA, delete the next 8 lines
# # and the "pytorch-triton-rocm" dependency above.
# [tool.uv.sources]
# torch = { index = "pytorch-rocm", marker = "sys_platform == 'linux'" }
# pytorch-triton-rocm = { index = "pytorch-rocm", marker = "sys_platform == 'linux'" }
#
# [[tool.uv.index]]
# name = "pytorch-rocm"
# url = "https://download.pytorch.org/whl/rocm6.4"
# explicit = true
# ///
"""Local server for the piano app: serves piano-learn.html and converts YouTube audio to MIDI.

Run:    uv run server.py     ->  http://localhost:8000
        (uv reads the dependency list above and builds the environment on first run.)
        Optional, often more accurate:  uv run --with transkun server.py
        If cert.pem and key.pem sit next to this file it serves HTTPS on port 8443 instead.
Also install the ffmpeg program and put it on your PATH (yt-dlp needs it to extract audio).
"""
import os
import re
import shutil
import subprocess
import threading
import uuid
from pathlib import Path

import librosa
import soundfile as sf
import torch
import yt_dlp
from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from piano_transcription_inference import PianoTranscription, sample_rate as PIANO_SR

APP_DIR = Path(__file__).parent
WORK = APP_DIR / "work"
WORK.mkdir(exist_ok=True)

app = Flask(__name__)
jobs = {}                        # job id -> {status, message, title, midi}
transcribe_lock = threading.Lock()   # heavy step runs one job at a time
_model = None
YOUTUBE = re.compile(r"^https?://((www|m|music)\.)?(youtube\.com|youtu\.be)/", re.I)
MAX_MINUTES = 15


def get_model():
    """Load the piano model once. First use downloads a ~165 MB checkpoint."""
    global _model
    if _model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"   # ROCm builds also report "cuda"
        gpu = torch.cuda.get_device_name(0) if device == "cuda" else "none"
        print(f"Transcription device: {device} (GPU: {gpu}, ROCm/HIP: {torch.version.hip})")
        # Set PIANO_CKPT to a manually downloaded checkpoint if the auto-download fails.
        _model = PianoTranscription(device=device, checkpoint_path=os.environ.get("PIANO_CKPT") or None)
    return _model


def download_audio(url, out_dir):
    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(out_dir / "%(id)s.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
    }
    cookies = os.environ.get("YT_COOKIES")          # optional: path to a cookies.txt
    if cookies and Path(cookies).exists():
        opts["cookiefile"] = cookies
    browser = os.environ.get("YT_BROWSER")          # optional last resort, e.g. "firefox" or "chrome"
    if browser:
        opts["cookiesfrombrowser"] = (browser,)
    with yt_dlp.YoutubeDL({**opts, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)
    if (info.get("duration") or 0) > MAX_MINUTES * 60:
        raise ValueError(f"Video is longer than {MAX_MINUTES} minutes.")
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    return out_dir / f"{info['id']}.mp3", info.get("title", "YouTube song")


def transcribe(audio_path, midi_path, model, start, end):
    dur = (end - start) if end and end > start else None
    if model == "transkun":
        if not shutil.which("transkun"):
            raise RuntimeError("Transkun isn't installed (pip install transkun).")
        audio, sr = librosa.load(str(audio_path), sr=44100, mono=True, offset=start, duration=dur)
        wav = midi_path.with_suffix(".wav")
        sf.write(str(wav), audio, sr)
        r = subprocess.run(["transkun", str(wav), str(midi_path)], capture_output=True, text=True)
        if r.returncode or not midi_path.exists():
            raise RuntimeError("Transkun failed: " + r.stderr[-300:])
    else:
        audio, _ = librosa.load(str(audio_path), sr=PIANO_SR, mono=True, offset=start, duration=dur)
        get_model().transcribe(audio, str(midi_path))


def run_job(job_id, url, model, start, end):
    job = jobs[job_id]
    work = WORK / job_id
    work.mkdir(parents=True, exist_ok=True)
    try:
        job.update(status="running", message="Downloading audio...")
        audio, title = download_audio(url, work)
        job.update(title=title, message="Waiting for the transcriber...")
        midi = work / "out.mid"
        with transcribe_lock:
            job.update(message="Transcribing (a few minutes on CPU, faster on a GPU)...")
            transcribe(audio, midi, model, start, end)
        job.update(status="done", message="Done", midi=str(midi))
    except Exception as e:
        job.update(status="error", message=str(e))
    finally:
        for f in work.glob("*"):
            if f.suffix.lower() in (".mp3", ".wav", ".webm", ".m4a", ".opus"):
                f.unlink(missing_ok=True)


@app.post("/api/jobs")
def create_job():
    data = request.get_json(force=True, silent=True) or {}
    url = (data.get("url") or "").strip()
    if not YOUTUBE.match(url):
        return jsonify(error="Please paste a YouTube link."), 400
    model = data.get("model") if data.get("model") in ("piano", "transkun") else "piano"
    try:
        start, end = float(data.get("start") or 0), float(data.get("end") or 0)
    except ValueError:
        return jsonify(error="Bad start/end time."), 400
    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = {"status": "queued", "message": "Queued", "title": None, "midi": None}
    threading.Thread(target=run_job, args=(job_id, url, model, start, end), daemon=True).start()
    return jsonify(id=job_id)


@app.get("/api/jobs/<job_id>")
def job_status(job_id):
    job = jobs.get(job_id) or abort(404)
    return jsonify({k: job[k] for k in ("status", "message", "title")})


@app.get("/api/jobs/<job_id>/midi")
def job_midi(job_id):
    job = jobs.get(job_id) or abort(404)
    if job["status"] != "done":
        abort(409)
    return send_file(job["midi"], mimetype="audio/midi", download_name="song.mid")


@app.get("/")
def index():
    page = APP_DIR / "piano-learn.html"
    if not page.exists():
        return f"piano-learn.html not found. Put it next to server.py, in this folder: {APP_DIR}", 404
    return send_from_directory(APP_DIR, "piano-learn.html")


if __name__ == "__main__":
    cert, key = APP_DIR / "cert.pem", APP_DIR / "key.pem"
    if cert.exists() and key.exists():
        app.run(host="0.0.0.0", port=8443, ssl_context=(str(cert), str(key)), threaded=True)
    else:
        app.run(host="0.0.0.0", port=8000, threaded=True)
