"""Read-only data-quality report: null counts, duplicate rows, basic descriptive
stats (distinct/min/max/mean/most-frequent), and a couple of kind-specific
checks (infinities for floats, invalid/empty geometries). Never mutates the
underlying DataFrame.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.services.parquet_service import hashable_columns, open_file

_STATS_KINDS = {"int", "float", "string", "bool", "date", "timestamp"}
_RANGE_KINDS = {"int", "float", "date", "timestamp"}


def _stringify(value: Any) -> str:
    """Render a scalar (possibly a pandas/numpy timestamp) as a display string."""

    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    return str(value)


def _descriptive_stats(kind: str, series: pd.Series) -> dict[str, Any]:
    """Distinct/min/max/mean/most-frequent stats from a column's own non-null
    values. Only computed for kinds where these are meaningful/cheap; None
    otherwise (geometry has its own invalid/empty checks, "other" is opaque).
    """

    empty: dict[str, Any] = {
        "distinct_count": None,
        "min_value": None,
        "max_value": None,
        "mean_value": None,
        "top_value": None,
        "top_value_count": None,
    }
    if kind not in _STATS_KINDS:
        return empty

    non_null = series.dropna()
    if len(non_null) == 0:
        return empty

    stats = dict(empty)
    stats["distinct_count"] = int(non_null.nunique())

    value_counts = non_null.value_counts()
    stats["top_value"] = _stringify(value_counts.index[0])
    stats["top_value_count"] = int(value_counts.iloc[0])

    if kind in _RANGE_KINDS:
        stats["min_value"] = _stringify(non_null.min())
        stats["max_value"] = _stringify(non_null.max())
        if kind in ("int", "float"):
            stats["mean_value"] = _stringify(round(float(non_null.mean()), 4))
        else:
            stats["mean_value"] = _stringify(pd.to_datetime(non_null).mean())
    elif kind == "string":
        stats["min_value"] = _stringify(non_null.min())
        stats["max_value"] = _stringify(non_null.max())

    return stats


def validate_file(file_id: str) -> dict[str, Any]:
    """Return a read-only data-quality report for the given file."""

    entry = open_file(file_id)
    df = entry.df
    row_count = len(df)

    # Struct/list-typed columns (e.g. a GeoParquet "covering" bbox struct)
    # aren't hashable, so they're excluded from the duplicate-row comparison
    # rather than failing the check outright.
    subset = hashable_columns(df)
    duplicate_rows = int(df.duplicated(subset=subset if len(subset) < len(df.columns) else None).sum())

    kind_counts: dict[str, int] = {}
    columns = []
    for col in df.columns:
        kind = entry.kinds[col]
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        series = df[col]
        null_count = int(series.isna().sum())
        info: dict[str, Any] = {
            "name": col,
            "kind": kind,
            "null_count": null_count,
            "null_percentage": (
                round(null_count / row_count * 100, 2) if row_count else 0.0
            ),
            **_descriptive_stats(kind, series),
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
        "is_geo": entry.is_geo,
        "kind_counts": kind_counts,
        "columns": columns,
    }
