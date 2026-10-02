from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import APP_DIR, YOUTUBE_RE
from .jobs import create_job, get_job

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JobCreate(BaseModel):
    url: str = Field(..., description="YouTube URL")
    model: str = Field("piano", description="transcription model")
    start: float = Field(0, description="start seconds")
    end: float = Field(0, description="end seconds")


@app.post("/api/jobs")
def create_job_endpoint(job: JobCreate):
    import re

    if not re.match(YOUTUBE_RE, job.url.strip(), re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Please paste a YouTube link.")
    if job.model not in ("piano", "transkun"):
        job.model = "piano"
    job_id = create_job(job.url.strip(), job.model, job.start, job.end)
    return {"id": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {k: job[k] for k in ("status", "message", "title") if k in job}


@app.get("/api/jobs/{job_id}/midi")
def job_midi(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Job not done")
    midi_path = job.get("midi")
    if not midi_path or not Path(midi_path).exists():
        raise HTTPException(status_code=404, detail="MIDI not found")
    return FileResponse(midi_path, media_type="audio/midi", filename="song.mid")


frontend_dist = APP_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
else:

    @app.get("/")
    def root():
        return {"message": "Frontend not built. Build with: cd frontend && npm run build"}
