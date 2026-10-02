import os
import shutil
import subprocess
from pathlib import Path

_model = None


def get_model():
    global _model
    if _model is None:
        import torch
        from piano_transcription_inference import PianoTranscription

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _model = PianoTranscription(
            device=device, checkpoint_path=os.environ.get("PIANO_CKPT") or None
        )
    return _model


def transcribe(audio_path: Path, midi_path: Path, model: str, start: float = 0, end: float = 0):
    dur = (end - start) if end and end > start else None
    if model == "transkun":
        if not shutil.which("transkun"):
            raise RuntimeError("Transkun isn't installed (pip install transkun).")
        import librosa
        import soundfile as sf

        audio, sr = librosa.load(str(audio_path), sr=44100, mono=True, offset=start, duration=dur)
        wav = midi_path.with_suffix(".wav")
        sf.write(str(wav), audio, sr)
        r = subprocess.run(
            ["transkun", str(wav), str(midi_path)], capture_output=True, text=True, check=False
        )
        if r.returncode or not midi_path.exists():
            raise RuntimeError("Transkun failed: " + (r.stderr or "")[-300:])
    else:
        import librosa
        from piano_transcription_inference import sample_rate as PIANO_SR

        audio, _ = librosa.load(str(audio_path), sr=PIANO_SR, mono=True, offset=start, duration=dur)
        get_model().transcribe(audio, str(midi_path))
