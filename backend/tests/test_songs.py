from pathlib import Path

import pytest

from backend.app import songs, store


@pytest.fixture(autouse=True)
def work_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Every test writes into its own work/ — never the real one."""
    monkeypatch.setattr(songs, "WORK_DIR", tmp_path)
    monkeypatch.setattr(store, "WORK_DIR", tmp_path)
    return tmp_path


SONG = {"bpm": 90, "bar": 4, "parts": [{"name": "Melody", "notes": []}]}


def test_a_folder_without_a_song_is_not_listed(work_dir: Path):
    (work_dir / "failed000001").mkdir()
    store.write_json(work_dir / "failed000001" / store.SIDECAR, {"title": "Broken"})

    assert songs.list_songs() == []


def test_a_saved_song_comes_back_from_the_list(work_dir: Path):
    song_id = songs.save_song("Clair de Lune", SONG)
    listed = songs.list_songs()

    assert len(listed) == 1
    row = listed[0]
    assert row["id"] == song_id
    assert row["title"] == "Clair de Lune"
    assert row["kind"] == "song"
    assert row["created"]
    # and the sidecar names it, so work/ explains itself without the API
    meta = store.read_json(work_dir / song_id / store.SIDECAR)
    assert meta["title"] == "Clair de Lune"
    assert meta["status"] == "done"


def test_the_same_title_stays_one_folder(work_dir: Path):
    first = songs.save_song("Requiem", SONG)
    second = songs.save_song("Requiem", SONG)

    assert first == second
    assert len(songs.list_songs()) == 1


def test_an_upload_does_not_replace_a_transcription(work_dir: Path):
    transcribed = work_dir / "abc123def456"
    transcribed.mkdir()
    (transcribed / "out.mid").write_bytes(b"MThd")
    store.write_json(
        transcribed / store.SIDECAR,
        {"title": "Clair de Lune", "status": "done", "created": "2026-10-03T07:00:00+00:00"},
    )

    assert songs.save_song("Clair de Lune", SONG) == "abc123def456"
    assert (transcribed / "out.mid").read_bytes() == b"MThd"
    assert not (transcribed / "song.json").exists()
    # the folder still reads as the transcription, not as the upload
    assert songs.list_songs()[0]["kind"] == "midi"


def test_find_song_returns_the_payload_and_its_kind(work_dir: Path):
    song_id = songs.save_song("Nimbus", SONG)

    found = songs.find_song(song_id)

    assert found is not None
    path, kind = found
    assert path.name == "song.json"
    assert kind == "song"
    assert songs.MEDIA_TYPES[kind] == "application/json"


def test_ids_that_could_leave_work_dir_are_refused(work_dir: Path):
    real = work_dir / "okfolder0001"
    real.mkdir()
    (real / "out.mid").write_bytes(b"MThd")

    assert songs.find_song("..") is None
    assert songs.find_song("../secrets") is None
    assert songs.find_song("..%2Fsecrets") is None
    assert songs.find_song("") is None
    assert songs.find_song("missing00000") is None
    # a real folder with a song in it is still reachable
    assert songs.find_song("okfolder0001") is not None


def test_a_folder_named_by_hand_is_still_listed(work_dir: Path):
    hand_made = work_dir / "my-songs"
    hand_made.mkdir()
    (hand_made / "out.mid").write_bytes(b"MThd")

    assert [row["id"] for row in songs.list_songs()] == ["my-songs"]


def test_validate_song_rejects_something_the_player_cannot_use():
    assert songs.validate_song(SONG)
    assert not songs.validate_song(None)
    assert not songs.validate_song([])
    assert not songs.validate_song({"bpm": 120, "bar": 4})
    assert not songs.validate_song({"bpm": 120, "bar": 4, "parts": "no"})
