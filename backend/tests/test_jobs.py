import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.app import jobs, youtube


@pytest.fixture(autouse=True)
def isolated_jobs():
    """Each test gets an empty registry; threads from a finished test must not
    write into the next one's assertions."""
    jobs.jobs.clear()
    yield
    jobs.jobs.clear()


def _seed(job_id: str) -> None:
    jobs.jobs[job_id] = {
        "status": "queued",
        "message": "Queued",
        "title": None,
        "midi": None,
        "url": "https://www.youtube.com/watch?v=abc",
        "model": "piano",
        "created": "2026-10-03T00:00:00+00:00",
    }


def _sidecar(job_id: str, root: Path) -> dict:
    return json.loads((root / job_id / "job.json").read_text())


def test_validate_youtube_url():
    assert youtube.validate_youtube_url("https://www.youtube.com/watch?v=123")
    assert youtube.validate_youtube_url("https://youtu.be/123")
    assert youtube.validate_youtube_url("https://music.youtube.com/watch?v=123")
    assert not youtube.validate_youtube_url("https://example.com/video")
    assert youtube.validate_youtube_url(
        "http://youtube.com/playlist?list=123"
    )  # playlist params ignored but URL is valid YouTube URL


@patch("backend.app.youtube.yt_dlp.YoutubeDL")
def test_youtube_15_min_limit(mock_ydl):
    mock_instance = MagicMock()
    mock_instance.extract_info.return_value = {"duration": 16 * 60, "id": "abc", "title": "test"}
    mock_ydl.return_value.__enter__.return_value = mock_instance
    try:
        youtube.download_audio("https://www.youtube.com/watch?v=abc", Path("/tmp/test"))
        assert False, "Should have raised"
    except ValueError as e:
        assert "15 minutes" in str(e)


@patch("backend.app.jobs.download_audio")
@patch("backend.app.jobs.transcribe")
def test_job_lifecycle(mock_transcribe, mock_download, tmp_path, monkeypatch):
    # Keep test runs out of the real work/ folder: they must not leave a
    # half-finished job behind for a human to find later.
    monkeypatch.setattr(jobs, "WORK_DIR", tmp_path)
    mock_download.return_value = (Path("/tmp/audio.mp3"), "Test Song")
    job_id = jobs.create_job("https://www.youtube.com/watch?v=test")
    job = jobs.get_job(job_id)
    assert job is not None
    assert job["status"] == "queued"


@patch("backend.app.jobs.threading.Thread")
def test_create_job_writes_the_initial_sidecar(mock_thread, tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "WORK_DIR", tmp_path)

    job_id = jobs.create_job("https://youtu.be/abc")

    payload = _sidecar(job_id, tmp_path)
    assert payload["id"] == job_id
    assert payload["url"] == "https://youtu.be/abc"
    assert payload["status"] == "queued"
    assert payload["created"]
    mock_thread.assert_called_once()


def test_sidecar_names_the_song_and_the_file(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "WORK_DIR", tmp_path)
    _seed("abc123")
    midi = tmp_path / "abc123" / "out.mid"
    midi.parent.mkdir(parents=True)
    midi.write_bytes(b"MThd")

    jobs._update("abc123", status="done", message="Done", title="Some Song", midi=str(midi))

    payload = _sidecar("abc123", tmp_path)
    assert payload["title"] == "Some Song"
    assert payload["status"] == "done"
    assert payload["midi"] == "out.mid"  # relative: it sits in this folder
    assert payload["url"] == "https://www.youtube.com/watch?v=abc"
    # written aside and renamed, so no reader ever catches half a file
    assert not (tmp_path / "abc123" / "job.json.tmp").exists()


def test_sidecar_does_not_claim_a_file_that_is_not_there(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "WORK_DIR", tmp_path)
    _seed("abc123")

    jobs._update("abc123", status="done", message="Done", midi=str(tmp_path / "abc123" / "out.mid"))

    payload = _sidecar("abc123", tmp_path)
    assert payload["status"] == "done"
    assert "midi" not in payload


def test_run_job_records_a_failure_and_keeps_the_record(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "WORK_DIR", tmp_path)
    _seed("run001")

    def fake_download(url, work):
        audio = work / "clip.mp3"
        audio.write_bytes(b"x")
        return audio, "Fake Song"

    monkeypatch.setattr(jobs, "download_audio", fake_download)
    monkeypatch.setattr(
        jobs, "transcribe", MagicMock(side_effect=RuntimeError("transcribe blew up"))
    )

    jobs.run_job("run001", "https://youtu.be/abc", "piano", 0, 0)

    payload = _sidecar("run001", tmp_path)
    assert payload["status"] == "error"
    assert payload["message"] == "transcribe blew up"
    assert payload["title"] == "Fake Song"
    # the audio is cleaned up; the record of what happened is not
    assert not (tmp_path / "run001" / "clip.mp3").exists()
    assert (tmp_path / "run001" / "job.json").exists()


def test_run_job_success_points_at_the_midi(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "WORK_DIR", tmp_path)
    _seed("run002")

    def fake_download(url, work):
        audio = work / "clip.mp3"
        audio.write_bytes(b"x")
        return audio, "Fake Song"

    def fake_transcribe(audio, midi, model, start, end):
        midi.write_bytes(b"MThd")

    monkeypatch.setattr(jobs, "download_audio", fake_download)
    monkeypatch.setattr(jobs, "transcribe", fake_transcribe)

    jobs.run_job("run002", "https://youtu.be/abc", "piano", 0, 0)

    payload = _sidecar("run002", tmp_path)
    assert payload["status"] == "done"
    assert payload["midi"] == "out.mid"
    assert not (tmp_path / "run002" / "clip.mp3").exists()


def test_an_unwritable_sidecar_never_fails_the_job(tmp_path, monkeypatch):
    # A file where the directory should be: mkdir raises NotADirectoryError.
    blocker = tmp_path / "not-a-dir"
    blocker.write_bytes(b"")
    monkeypatch.setattr(jobs, "WORK_DIR", blocker)
    _seed("blocked")

    jobs._update("blocked", status="done", message="Done")

    assert jobs.jobs["blocked"]["status"] == "done"
