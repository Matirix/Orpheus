"""How a folder under work/ is read and written.

Both the job pipeline and the song library keep their files here, so the rules
for looking a folder up, finding the payload it holds, and rewriting its
sidecar without ever exposing half a file live in one place.
"""

import json
import re
from pathlib import Path
from typing import Any

from .config import WORK_DIR

SIDECAR = "job.json"

# Folder names are the first 12 hex digits of a uuid. Anything that starts with
# a dot, or contains a separator, is an attempt to walk out of work/.
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

# What a folder can hold, in the order a reader looks for it. A folder holds at
# most one payload: a conversion produces MIDI, and a song the client parsed is
# stored as the song itself.
PAYLOADS: dict[str, str] = {
    "out.mid": "midi",
    "song.json": "song",
}


def folder(song_id: str) -> Path | None:
    """The folder for `song_id`, or None when it is not one that exists."""
    if not ID_RE.match(song_id):
        return None
    path = WORK_DIR / song_id
    return path if path.is_dir() else None


def payload_in(path: Path) -> tuple[Path, str] | None:
    """The payload inside a folder, together with its kind."""
    for name, kind in PAYLOADS.items():
        candidate = path / name
        if candidate.is_file():
            return candidate, kind
    return None


def read_json(path: Path) -> dict[str, Any] | None:
    """A JSON object from disk, or None if it is absent or unreadable."""
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return loaded if isinstance(loaded, dict) else None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON next to its destination and rename it into place.

    Anything polling work/ must never catch a half-written file. Best effort: a
    full disk must not take down the operation that triggered the write.
    """
    tmp = path.parent / f"{path.name}.tmp"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        tmp.replace(path)
    except OSError:
        pass
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
