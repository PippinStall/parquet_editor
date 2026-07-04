"""In-memory cache of opened files. A file is loaded into a DataFrame the
first time it's accessed and all edits (manual + generated) are applied to
that in-memory copy until the user explicitly saves.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd


@dataclass
class OpenFile:
    df: pd.DataFrame
    is_geo: bool
    geometry_column: str | None
    crs: str | None
    dirty: bool = False
    kinds: dict[str, str] = field(default_factory=dict)


class SessionCache:
    def __init__(self) -> None:
        self._open: dict[str, OpenFile] = {}

    def get(self, file_id: str) -> OpenFile | None:
        return self._open.get(file_id)

    def set(self, file_id: str, entry: OpenFile) -> None:
        self._open[file_id] = entry

    def drop(self, file_id: str) -> None:
        self._open.pop(file_id, None)


cache = SessionCache()
