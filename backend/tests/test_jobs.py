from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.app import jobs, youtube


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
def test_job_lifecycle(mock_transcribe, mock_download):
    mock_download.return_value = (Path("/tmp/audio.mp3"), "Test Song")
    job_id = jobs.create_job("https://www.youtube.com/watch?v=test")
    job = jobs.get_job(job_id)
    assert job is not None
    assert job["status"] == "queued"
