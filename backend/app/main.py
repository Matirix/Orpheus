import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import APP_DIR, CA_PEM, YOUTUBE_RE
from .jobs import create_job, get_job
from .songs import MEDIA_TYPES, find_song, list_songs, save_song, validate_song

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


@app.get("/api/songs")
def list_songs_endpoint():
    """Everything in work/ that can be played, so the menu survives a restart."""
    return list_songs()


@app.get("/api/songs/{song_id}")
def get_song_endpoint(song_id: str):
    found = find_song(song_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Song not found")
    path, kind = found
    return FileResponse(path, media_type=MEDIA_TYPES[kind])


@app.post("/api/songs")
async def save_song_endpoint(request: Request, title: str = Query(..., min_length=1)):
    """Store a song the client parsed, keyed by its name."""
    try:
        song = json.loads(await request.body())
    except ValueError:
        raise HTTPException(status_code=400, detail="That is not a song.")
    if not validate_song(song):
        raise HTTPException(status_code=400, detail="That is not a song.")
    return {"id": save_song(title, song)}


@app.get("/ca.pem")
def ca_certificate():
    """The local CA, so a phone on the same network can install it itself."""
    if not CA_PEM.exists():
        raise HTTPException(status_code=404, detail="No local CA on this server yet.")
    return Response(
        CA_PEM.read_bytes(),
        media_type="application/pkix-cert",
        headers={"Content-Disposition": 'attachment; filename="orpheus-ca.cer"'},
    )


frontend_dist = APP_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
else:

    @app.get("/")
    def root():
        return {"message": "Frontend not built. Build with: cd frontend && npm run build"}
