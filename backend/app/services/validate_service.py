"""Read-only data-quality report: null counts, duplicate rows, and a couple of
kind-specific checks (infinities for floats, invalid/empty geometries). Never
mutates the underlying DataFrame.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from app.services.parquet_service import open_file


def validate_file(file_id: str) -> dict[str, Any]:
    """Return a read-only data-quality report for the given file."""

    entry = open_file(file_id)
    df = entry.df
    row_count = len(df)

    try:
        duplicate_rows = int(df.duplicated().sum())
    except TypeError:
        # Unhashable column values (rare) — skip the duplicate check rather
        # than fail the whole report.
        duplicate_rows = 0

    columns = []
    for col in df.columns:
        kind = entry.kinds[col]
        series = df[col]
        null_count = int(series.isna().sum())
        info: dict[str, Any] = {
            "name": col,
            "kind": kind,
            "null_count": null_count,
            "null_percentage": (
                round(null_count / row_count * 100, 2) if row_count else 0.0
            ),
        }

        if kind == "float":
            values = series.dropna().to_numpy(dtype="float64", na_value=np.nan)
            info["inf_count"] = int(np.isinf(values).sum())
        elif kind == "geometry":
            geoms = series.dropna()
            info["invalid_count"] = int(sum(1 for g in geoms if not g.is_valid))
            info["empty_count"] = int(sum(1 for g in geoms if g.is_empty))

        columns.append(info)

    return {
        "file_id": file_id,
        "row_count": row_count,
        "duplicate_rows": duplicate_rows,
        "columns": columns,
    }
