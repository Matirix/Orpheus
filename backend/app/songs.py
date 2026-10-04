"""The song library on disk: everything in work/ that can be played.

Songs are not tracked in the browser, so this module is what makes the list
survive a restart. A folder qualifies when it holds a payload — the MIDI a
conversion produced, or the song the client stored — and its sidecar says which
song that is.
"""

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import WORK_DIR
from .store import PAYLOADS, SIDECAR, folder, payload_in, read_json, write_json

# How each payload is served.
MEDIA_TYPES = {"midi": "audio/midi", "song": "application/json"}


def _title_of(path: Path, meta: dict[str, Any]) -> str:
    """What to call a folder: its sidecar's title, or the folder itself."""
    title = meta.get("title")
    if isinstance(title, str) and title.strip():
        return title
    return path.name


def list_songs() -> list[dict[str, Any]]:
    """Every folder in work/ that actually holds a song, oldest folder first."""
    if not WORK_DIR.is_dir():
        return []
    songs: list[dict[str, Any]] = []
    for path in sorted(WORK_DIR.iterdir()):
        if not path.is_dir():
            continue
        found = payload_in(path)
        if found is None:
            continue
        _, kind = found
        meta = read_json(path / SIDECAR) or {}
        songs.append(
            {
                "id": path.name,
                "title": _title_of(path, meta),
                "created": meta.get("created"),
                "kind": kind,
            }
        )
    return songs


def find_song(song_id: str) -> tuple[Path, str] | None:
    """The payload for a song id, with the kind a reader needs to open it."""
    path = folder(song_id)
    if path is None:
        return None
    return payload_in(path)


def _folder_for_title(title: str) -> Path | None:
    """The existing folder already named `title`, if there is one."""
    if not WORK_DIR.is_dir():
        return None
    for path in sorted(WORK_DIR.iterdir()):
        if not path.is_dir():
            continue
        meta = read_json(path / SIDECAR) or {}
        if _title_of(path, meta) == title:
            return path
    return None


def save_song(title: str, song: dict[str, Any]) -> str:
    """Store a parsed song under `title` and return the folder it lives in.

    The library is keyed by name, so the same title resolves to one folder
    rather than piling up copies. A transcription owns its folder: its MIDI is
    the better artifact, so an upload stored under the same name leaves it
    alone instead of replacing it.
    """
    title = title.strip() or "Untitled song"
    path = _folder_for_title(title)
    if path is None:
        path = WORK_DIR / uuid.uuid4().hex[:12]
        path.mkdir(parents=True, exist_ok=True)

    existing = payload_in(path)
    if existing is not None and existing[1] == "midi":
        return path.name

    for name in PAYLOADS:
        (path / name).unlink(missing_ok=True)
    write_json(path / "song.json", song)

    meta = read_json(path / SIDECAR) or {}
    write_json(
        path / SIDECAR,
        {
            "id": path.name,
            "url": None,
            "title": title,
            "status": "done",
            "message": "Added to the library",
            "model": None,
            "created": meta.get("created") or datetime.now(UTC).isoformat(timespec="seconds"),
        },
    )
    return path.name


def validate_song(song: Any) -> bool:
    """Whether this is a song the player can actually be handed."""
    if not isinstance(song, dict):
        return False
    if not isinstance(song.get("parts"), list):
        return False
    return isinstance(song.get("bpm"), (int, float)) and isinstance(song.get("bar"), (int, float))
