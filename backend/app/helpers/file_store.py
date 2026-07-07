from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

# settings.storage_dir may be a relative folder name (resolved against
# backend/, matching the historical default) or an absolute path if
# explicitly configured via STORAGE_DIR in .env.
_configured_storage_dir = Path(settings.storage_dir)
DATA_DIR = (
    _configured_storage_dir
    if _configured_storage_dir.is_absolute()
    else Path(__file__).resolve().parent.parent.parent / _configured_storage_dir
)
DATA_DIR.mkdir(parents=True, exist_ok=True)

VALID_SUFFIXES = {".parquet", ".geoparquet"}


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

            # The filename on disk *is* the file_id — no UUID prefix, so
            # uploads keep their original name in storage.
            self._files[path.name] = FileRecord(
                file_id=path.name, filename=path.name, path=path
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

        dest = self.directory / original_name
        if dest.exists():
            raise ValueError(f"A file named '{original_name}' already exists")

        shutil.move(str(tmp_path), dest)

        record = FileRecord(file_id=original_name, filename=original_name, path=dest)
        self._files[original_name] = record

        return record

    def delete(self, file_id: str) -> bool:
        """Delete a file by its id. Returns True if the file was found and deleted, False otherwise."""

        record = self._files.pop(file_id, None)
        if record is None:
            return False

        record.path.unlink(missing_ok=True)

        return True


store = FileStore(DATA_DIR)
