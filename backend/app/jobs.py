import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import MAX_MINUTES, WORK_DIR
from .store import SIDECAR, write_json
from .transcribe import check_duration, transcribe
from .youtube import download_audio

jobs: dict[str, dict[str, Any]] = {}
transcribe_lock = threading.Lock()


def create_job(url: str, model: str = "piano", start: float = 0, end: float = 0) -> str:
    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = {
        "status": "queued",
        "message": "Queued",
        "title": None,
        "midi": None,
        "url": url,
        "model": model,
        "created": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    _update(job_id)
    threading.Thread(target=run_job, args=(job_id, url, model, start, end), daemon=True).start()
    return job_id


def get_job(job_id: str) -> dict[str, Any] | None:
    return jobs.get(job_id)


def prepare_upload(filename: str) -> tuple[str, Path]:
    """Make the folder an uploaded recording goes into, and say where.

    The caller streams the bytes before start_upload() registers the job, so a
    half-written file can never be picked up by a worker.
    """
    job_id = uuid.uuid4().hex[:12]
    work = WORK_DIR / job_id
    work.mkdir(parents=True)
    return job_id, work / Path(filename).name


def start_upload(job_id: str, audio_path: Path, title: str, model: str = "piano") -> None:
    """Queue an uploaded recording for transcription.

    The title is known from the start — it is the filename the user picked —
    so the sidecar names the song before any work happens.
    """
    jobs[job_id] = {
        "status": "queued",
        "message": "Queued",
        "title": title,
        "midi": None,
        "model": model,
        "created": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    _update(job_id)
    threading.Thread(target=run_upload, args=(job_id, audio_path, model), daemon=True).start()


def _update(job_id: str, **fields: Any) -> None:
    """Apply a status change and mirror it into the job's folder.

    Everything a job knows lives in this dict, which dies with the process —
    so each change is also written to work/<id>/job.json, the only record that
    outlives the server.
    """
    job = jobs.get(job_id)
    if not job:
        return
    job.update(fields)
    _write_sidecar(job_id, job)


def _write_sidecar(job_id: str, job: dict[str, Any]) -> None:
    payload = {
        "id": job_id,
        "url": job.get("url"),
        "title": job.get("title"),
        "status": job.get("status"),
        "message": job.get("message"),
        "model": job.get("model"),
        "created": job.get("created"),
    }
    # Only claim a file that is really there.
    midi = Path(job["midi"]) if job.get("midi") else None
    if job.get("status") == "done" and midi is not None and midi.exists():
        payload["midi"] = midi.name
    write_json(WORK_DIR / job_id / SIDECAR, payload)


def run_job(job_id: str, url: str, model: str, start: float, end: float):
    job = jobs.get(job_id)
    if not job:
        return
    work = WORK_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    try:
        _update(job_id, status="running", message="Downloading audio...")
        audio, title = download_audio(url, work)
        _update(job_id, title=title, message="Waiting for the transcriber...")
        midi = _transcribe_to(job_id, work, audio, model, start, end)
        _update(job_id, status="done", message="Done", midi=str(midi))
    except Exception as e:  # noqa: BLE001
        _update(job_id, status="error", message=str(e))
    finally:
        _drop_audio(work)


def run_upload(job_id: str, audio_path: Path, model: str):
    """Transcribe a recording the client has already put in work/<id>/."""
    if job_id not in jobs:
        return
    work = audio_path.parent
    try:
        _update(job_id, status="running", message="Checking the audio...")
        check_duration(audio_path, MAX_MINUTES)
        midi = _transcribe_to(job_id, work, audio_path, model)
        _update(job_id, status="done", message="Done", midi=str(midi))
    except Exception as e:  # noqa: BLE001
        _update(job_id, status="error", message=str(e))
    finally:
        _drop_audio(work)


def _transcribe_to(
    job_id: str, work: Path, audio: Path, model: str, start: float = 0, end: float = 0
) -> Path:
    """Run the model on one file, one job at a time; say where the MIDI landed."""
    midi = work / "out.mid"
    with transcribe_lock:
        _update(job_id, message="Transcribing (a few minutes on CPU, faster on a GPU)...")
        transcribe(audio, midi, model, start, end)
    return midi


def _drop_audio(work: Path) -> None:
    """Keep the sidecar and the MIDI; the audio they were made from goes."""
    for f in work.glob("*"):
        if f.suffix.lower() in (".mp3", ".wav", ".webm", ".m4a", ".opus"):
            try:
                f.unlink(missing_ok=True)
            except OSError:
                pass
