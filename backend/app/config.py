from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent.parent
WORK_DIR = APP_DIR / "work"
WORK_DIR.mkdir(exist_ok=True)

MAX_MINUTES = 15
YOUTUBE_RE = r"^https?://((www|m|music)\.)?(youtube\.com|youtu\.be)/.*$"
