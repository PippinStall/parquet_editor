"""Scaffold a brand-new parquet file from a column schema (name + kind),
either hand-built in the UI or lifted from a previously exported schema JSON.
Each column is filled with placeholder/randomized values using sensible
defaults per kind — there are no per-column ranges here (use "Generate
values" afterwards for that); this just gets a matching file on disk fast.
"""

from __future__ import annotations

import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from app.helpers.file_store import FileRecord, store
from app.services.generate_service import (
    _generate_bool,
    _generate_datetime,
    _generate_float,
    _generate_int,
)
from app.services.parquet_service import ParquetServiceError

CREATABLE_KINDS = {"int", "float", "string", "bool", "date", "timestamp"}


def _default_params(kind: str) -> dict[str, Any]:
    """Return a dict of default parameters for the given kind, to be used in generating values."""

    today = date.today()
    now = datetime.now()
    if kind == "int":
        return {"min": 0, "max": 1000}
    if kind == "float":
        return {"min": 0.0, "max": 1.0}
    if kind == "date":
        return {
            "min": (today - timedelta(days=365)).isoformat(),
            "max": today.isoformat(),
        }
    if kind == "timestamp":
        return {"min": (now - timedelta(days=365)).isoformat(), "max": now.isoformat()}

    return {}


def create_dataset(
    output_filename: str, row_count: int, columns: list[dict[str, Any]]
) -> tuple[FileRecord, int]:
    """Create a new parquet file with the given columns and row count, and save it to the file store."""

    if row_count <= 0:
        raise ParquetServiceError("row_count must be a positive integer")
    if not output_filename.strip():
        raise ParquetServiceError("output_filename must not be empty")

    usable: list[tuple[str, str]] = []
    seen_names: set[str] = set()
    skipped = 0
    for col in columns:
        name = str(col.get("name", "")).strip()
        kind = col.get("kind")
        if not name or name in seen_names:
            skipped += 1
            continue
        if kind not in CREATABLE_KINDS:
            skipped += 1
            continue
        seen_names.add(name)
        usable.append((name, kind))

    if not usable:
        raise ParquetServiceError(
            "No usable columns provided — need at least one int/float/string/bool/date/timestamp column"
        )

    n = row_count
    data: dict[str, Any] = {}
    for name, kind in usable:
        params = _default_params(kind)
        if kind == "int":
            data[name] = _generate_int(params, n)
        elif kind == "float":
            data[name] = _generate_float(params, n)
        elif kind == "bool":
            data[name] = _generate_bool(params, n)
        elif kind == "string":
            data[name] = [f"{name}_{i}" for i in range(n)]
        elif kind == "date":
            data[name] = _generate_datetime(params, n, as_date=True)
        else:  # timestamp
            data[name] = _generate_datetime(params, n, as_date=False)

    df = pd.DataFrame(data)

    filename = output_filename.strip()
    if Path(filename).suffix.lower() not in {".parquet", ".geoparquet"}:
        filename = f"{filename}.parquet"

    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
        tmp_path = Path(tmp.name)

    df.to_parquet(tmp_path, engine="pyarrow", compression="snappy")
    record = store.save_upload(filename, tmp_path)

    return record, skipped
