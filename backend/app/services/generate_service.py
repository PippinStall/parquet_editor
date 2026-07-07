from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from shapely.geometry import Point
from app.schemas.models import GenerateRequest
from app.services.parquet_service import ParquetServiceError, open_file


def _require(params: dict[str, Any], key: str) -> Any:
    """Require a parameter to be present and not None."""

    if key not in params or params[key] is None:
        raise ParquetServiceError(f"Missing required generation parameter: '{key}'")

    return params[key]


def _generate_int(params: dict[str, Any], n: int) -> np.ndarray:
    """Generate an array of random integers in the range [min, max]."""

    lo, hi = int(_require(params, "min")), int(_require(params, "max"))
    if lo > hi:
        raise ParquetServiceError("min must be <= max")

    return np.random.randint(lo, hi + 1, size=n)


def _generate_float(params: dict[str, Any], n: int) -> np.ndarray:
    """Generate an array of random floats in the range [min, max)."""

    lo, hi = float(_require(params, "min")), float(_require(params, "max"))
    if lo > hi:
        raise ParquetServiceError("min must be <= max")

    return np.round(np.random.uniform(lo, hi, size=n), decimals=2)


def _generate_bool(params: dict[str, Any], n: int) -> np.ndarray:
    """Generate an array of random booleans with a given true ratio."""

    true_ratio = float(params.get("true_ratio", 0.5))

    return np.random.random(size=n) < true_ratio


def _generate_string(params: dict[str, Any], n: int) -> list[str]:
    """Generate an array of random strings by sampling from a list of choices."""

    choices = _require(params, "choices")
    if not isinstance(choices, list) or len(choices) == 0:
        raise ParquetServiceError("'choices' must be a non-empty list of strings")

    return [str(v) for v in np.random.choice(choices, size=n)]


def _generate_datetime(params: dict[str, Any], n: int, as_date: bool) -> list:
    """Generate an array of random datetimes or dates in the range [min, max]."""

    lo = pd.to_datetime(_require(params, "min"))
    hi = pd.to_datetime(_require(params, "max"))
    if lo > hi:
        raise ParquetServiceError("min must be <= max")

    lo_ns, hi_ns = lo.value, hi.value
    if lo_ns == hi_ns:
        rand_ns = np.full(n, lo_ns, dtype=np.int64)
    else:
        rand_ns = np.random.randint(lo_ns, hi_ns + 1, size=n, dtype=np.int64)
    stamps = pd.to_datetime(rand_ns)

    return [t.date() for t in stamps] if as_date else list(stamps)


def _generate_geometry(params: dict[str, Any], n: int) -> list:
    """Generate an array of random Point geometries within a bounding box."""

    min_lon, max_lon = float(_require(params, "min_lon")), float(
        _require(params, "max_lon")
    )
    min_lat, max_lat = float(_require(params, "min_lat")), float(
        _require(params, "max_lat")
    )
    if min_lon > max_lon or min_lat > max_lat:
        raise ParquetServiceError("min_lon/min_lat must be <= max_lon/max_lat")

    lons = np.random.uniform(min_lon, max_lon, size=n)
    lats = np.random.uniform(min_lat, max_lat, size=n)

    return [Point(lon, lat) for lon, lat in zip(lons, lats)]


def _generate_column_values(kind: str, params: dict[str, Any], n: int) -> list:
    """Generate a list of values for a column of the given kind, using the provided parameters."""

    if kind == "int":
        return list(_generate_int(params, n))
    if kind == "float":
        return list(_generate_float(params, n))
    if kind == "bool":
        return list(_generate_bool(params, n))
    if kind == "string":
        return _generate_string(params, n)
    if kind == "date":
        return _generate_datetime(params, n, as_date=True)
    if kind == "timestamp":
        return _generate_datetime(params, n, as_date=False)
    if kind == "geometry":
        return _generate_geometry(params, n)

    raise ParquetServiceError(f"Generation not supported for column kind: {kind}")


def generate_values(file_id: str, request: GenerateRequest) -> dict[str, Any]:
    """Generate values for specified columns in a Parquet file, according to the request."""

    entry = open_file(file_id)
    df = entry.df
    total_rows = len(df)

    if request.target.scope == "all":
        indices = list(range(total_rows))
    else:
        indices = request.target.row_indices
        for idx in indices:
            if idx < 0 or idx >= total_rows:
                raise ParquetServiceError(f"Row index out of range: {idx}")

    n = len(indices)
    if n == 0 or not request.columns:
        return {"updated_rows": 0, "columns": []}

    updated_columns = []
    for spec in request.columns:
        if spec.name not in df.columns:
            raise ParquetServiceError(f"Unknown column: {spec.name}")

        values = _generate_column_values(spec.kind, spec.params, n)

        # Assign through a dtype-matched Series rather than scalar-by-scalar:
        # pandas' scalar setitem rejects e.g. datetime64 unit mismatches
        # (ns vs. us) that Series.astype + column assignment coerces safely.
        gen_series = pd.Series(values, index=indices)
        if spec.kind != "geometry":
            try:
                gen_series = gen_series.astype(df[spec.name].dtype)
            except (TypeError, ValueError):
                pass
        df.loc[gen_series.index, spec.name] = gen_series
        if spec.name == entry.geometry_column:
            entry.bbox = None

        updated_columns.append(spec.name)

    entry.dirty = True
    entry.search_blob = None

    return {"updated_rows": n, "columns": updated_columns}
