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
    _generate_geometry,
    _generate_int,
)
from app.services.parquet_service import ParquetServiceError

CREATABLE_KINDS = {"int", "float", "string", "bool", "date", "timestamp", "geometry"}


def _geometry_params(col: dict[str, Any]) -> dict[str, float]:
    """Extract and validate the mandatory lon/lat bounding box for a geometry column.

    Required (rather than defaulted like other kinds) so the generated points fall
    within a known bbox — the same bbox that GET /bbox would otherwise have to compute
    and cache lazily from scratch on first request.
    """

    name = col.get("name")
    missing = [
        k for k in ("min_lon", "max_lon", "min_lat", "max_lat") if col.get(k) is None
    ]
    if missing:
        raise ParquetServiceError(
            f"Geometry column '{name}' requires min_lon/max_lon/min_lat/max_lat "
            f"(missing: {', '.join(missing)})"
        )
    try:
        params = {
            k: float(col[k]) for k in ("min_lon", "max_lon", "min_lat", "max_lat")
        }
    except (TypeError, ValueError) as exc:
        raise ParquetServiceError(
            f"Geometry column '{name}' has non-numeric bbox values"
        ) from exc
    if params["min_lon"] > params["max_lon"] or params["min_lat"] > params["max_lat"]:
        raise ParquetServiceError(f"Geometry column '{name}': min must be <= max")

    return params


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
    geometry_bbox: dict[str, dict[str, float]] = {}
    geometry_column: str | None = None
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
        if kind == "geometry":
            if geometry_column is not None:
                raise ParquetServiceError("Only one geometry column is supported")
            geometry_bbox[name] = _geometry_params(col)
            geometry_column = name
        seen_names.add(name)
        usable.append((name, kind))

    if not usable:
        raise ParquetServiceError(
            "No usable columns provided — need at least one int/float/string/bool/date/timestamp/geometry column"
        )

    n = row_count
    data: dict[str, Any] = {}
    for name, kind in usable:
        if kind == "geometry":
            data[name] = _generate_geometry(geometry_bbox[name], n)
            continue
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

    suffix = ".geoparquet" if geometry_column else ".parquet"
    filename = output_filename.strip()
    if Path(filename).suffix.lower() not in {".parquet", ".geoparquet"}:
        filename = f"{filename}{suffix}"

    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
        tmp_path = Path(tmp.name)

    if geometry_column:
        import geopandas as gpd

        gdf = gpd.GeoDataFrame(df, geometry=geometry_column, crs="EPSG:4326")
        gdf.to_parquet(tmp_path, compression="snappy")
    else:
        df.to_parquet(tmp_path, engine="pyarrow", compression="snappy")
    try:
        record = store.save_upload(filename, tmp_path)
    except ValueError as exc:
        raise ParquetServiceError(str(exc)) from exc

    return record, skipped
