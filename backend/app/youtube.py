import os
import re
from pathlib import Path

import yt_dlp

from .config import MAX_MINUTES, YOUTUBE_RE

YOUTUBE_REGEX = re.compile(YOUTUBE_RE, re.IGNORECASE)


def validate_youtube_url(url: str) -> bool:
    return bool(YOUTUBE_REGEX.match(url.strip()))


def download_audio(url: str, out_dir: Path):
    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(out_dir / "%(id)s.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}
        ],
    }
    cookies = os.environ.get("YT_COOKIES")
    if cookies and Path(cookies).exists():
        opts["cookiefile"] = cookies
    browser = os.environ.get("YT_BROWSER")
    if browser:
        opts["cookiesfrombrowser"] = (browser,)

    with yt_dlp.YoutubeDL({**opts, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)
    if (info.get("duration") or 0) > MAX_MINUTES * 60:
        raise ValueError(f"Video is longer than {MAX_MINUTES} minutes.")
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    return out_dir / f"{info['id']}.mp3", info.get("title", "YouTube song")
