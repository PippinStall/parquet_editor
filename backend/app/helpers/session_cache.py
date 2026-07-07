"""In-memory cache of opened files. A file is loaded into a DataFrame the
first time it's accessed and all edits (manual + generated) are applied to
that in-memory copy until the user explicitly saves.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd


@dataclass
class OpenFile:
    """An opened file in the session cache."""

    df: pd.DataFrame
    is_geo: bool
    geometry_column: str | None
    crs: str | None
    dirty: bool = False
    kinds: dict[str, str] = field(default_factory=dict)
    # True if the *original* file on disk encoded any timestamp column as
    # legacy INT96 (the parquet-mr/Spark convention) rather than modern
    # INT64+logical-type. Detected once at open time and used as the default
    # on save, so round-tripping a file through this app doesn't silently
    # flip its timestamp encoding and break schema-strict downstream readers
    # (e.g. Spark's vectorized GeoParquet reader) that expect it preserved.
    uses_int96_timestamps: bool = False
    # Cached (min_lon, min_lat, max_lon, max_lat) of the geometry column.
    # None means "not computed yet"; any mutation of the geometry column
    # must reset this back to None so it gets recomputed on next access.
    bbox: tuple[float, float, float, float] | None = None
    # Cached lowercased "all columns joined" text per row, used by free-text
    # search so it doesn't re-stringify every column on every keystroke.
    # None means "not built yet"; any mutation of df's content/columns must
    # reset this back to None so it gets rebuilt on next access.
    search_blob: pd.Series | None = None


class SessionCache:
    """Simple in-memory cache of opened files."""

    def __init__(self) -> None:
        self._open: dict[str, OpenFile] = {}

    def get(self, file_id: str) -> OpenFile | None:
        return self._open.get(file_id)

    def set(self, file_id: str, entry: OpenFile) -> None:
        self._open[file_id] = entry

    def drop(self, file_id: str) -> None:
        self._open.pop(file_id, None)


cache = SessionCache()
