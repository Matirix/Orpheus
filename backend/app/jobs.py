import threading
import uuid
from typing import Any

from .config import WORK_DIR
from .transcribe import transcribe
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
    }
    threading.Thread(target=run_job, args=(job_id, url, model, start, end), daemon=True).start()
    return job_id


def get_job(job_id: str) -> dict[str, Any] | None:
    return jobs.get(job_id)


def run_job(job_id: str, url: str, model: str, start: float, end: float):
    job = jobs.get(job_id)
    if not job:
        return
    work = WORK_DIR / job_id
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
    except Exception as e:  # noqa: BLE001
        job.update(status="error", message=str(e))
    finally:
        for f in work.glob("*"):
            if f.suffix.lower() in (".mp3", ".wav", ".webm", ".m4a", ".opus"):
                try:
                    f.unlink(missing_ok=True)
                except OSError:
                    pass
