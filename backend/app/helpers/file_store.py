from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

STORAGE_FOLDER = "storage"
DATA_DIR = Path(__file__).resolve().parent.parent.parent / STORAGE_FOLDER
DATA_DIR.mkdir(parents=True, exist_ok=True)

VALID_SUFFIXES = {".parquet", ".geoparquet"}

SEP = "__"


@dataclass
class FileRecord:
    """A record of a file in the store."""

    file_id: str
    filename: str
    path: Path

    @property
    def size_bytes(self) -> int:
        return self.path.stat().st_size


class FileStore:
    """Registry of uploaded files backed by a directory on disk."""

    def __init__(self, directory: Path):
        self.directory = directory
        self._files: dict[str, FileRecord] = {}
        self._scan()

    def _scan(self) -> None:
        """Scan the directory and rebuild the file registry."""

        self._files.clear()
        for path in sorted(self.directory.iterdir()):
            if not path.is_file():
                continue
            if path.suffix.lower() not in VALID_SUFFIXES:
                continue
            if SEP not in path.name:
                continue

            file_id, _, original_name = path.name.partition(SEP)
            self._files[file_id] = FileRecord(
                file_id=file_id, filename=original_name, path=path
            )

    def list(self) -> list[FileRecord]:
        """Return a list of all file records in the store."""

        return list(self._files.values())

    def get(self, file_id: str) -> FileRecord | None:
        """Get a file record by its id, or None if not found."""

        return self._files.get(file_id)

    def save_upload(self, original_name: str, tmp_path: Path) -> FileRecord:
        """Save an uploaded file to the store and return its record."""

        # Strip any directory components — original_name may come straight
        # from a client-supplied filename (or a merge/export output name) and
        # must not be able to escape the store directory (e.g. "../../etc").
        original_name = Path(original_name).name

        suffix = Path(original_name).suffix.lower()
        if suffix not in VALID_SUFFIXES:
            raise ValueError(f"Unsupported file extension: {suffix}")

        file_id = uuid.uuid4().hex
        dest = self.directory / f"{file_id}{SEP}{original_name}"
        shutil.move(str(tmp_path), dest)

        record = FileRecord(file_id=file_id, filename=original_name, path=dest)
        self._files[file_id] = record

        return record

    def delete(self, file_id: str) -> bool:
        """Delete a file by its id. Returns True if the file was found and deleted, False otherwise."""

        record = self._files.pop(file_id, None)
        if record is None:
            return False

        record.path.unlink(missing_ok=True)

        return True


store = FileStore(DATA_DIR)
