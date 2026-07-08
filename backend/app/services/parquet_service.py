from __future__ import annotations

import datetime
import io
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import geopandas as gpd
from app.helpers.column_types import KIND_GEOMETRY, column_kind
from app.helpers.file_store import FileRecord, store
from app.helpers.session_cache import OpenFile, cache

RESERVED_COLUMN_NAMES = {"__row_index__"}

_KIND_TO_DTYPE = {
    "int": "Int64",
    "float": "float64",
    "bool": "boolean",
    "string": "string",
    "date": "datetime64[ns]",
    "timestamp": "datetime64[ns]",
}


_FILTER_OPS_NUMERIC = {"eq", "ne", "lt", "lte", "gt", "gte"}
_FILTER_OPS_STRING = {"eq", "contains", "startswith"}
_FILTER_OPS_BOOL = {"eq"}


FILL_STRATEGIES = {"mean", "median", "mode", "random"}
_MEAN_MEDIAN_KINDS = {"int", "float", "date", "timestamp"}


EXPORT_FORMATS = {"json", "csv", "parquet"}


class ParquetServiceError(ValueError):
    pass


def _is_geoparquet(path: Path) -> bool:
    """Return True if the given parquet file is a GeoParquet file, False otherwise."""

    try:
        schema = pq.read_schema(path)
    except Exception as exc:  # pragma: no cover - surfaced to the API layer
        raise ParquetServiceError(f"Failed to read parquet schema: {exc}") from exc

    metadata = schema.metadata or {}

    return b"geo" in metadata


def _uses_int96_timestamps(path: Path) -> bool:
    """True if any column in the file is physically encoded as legacy INT96
    (the parquet-mr/Spark convention), as opposed to modern INT64+logical-type.
    """
    try:
        schema = pq.read_metadata(path).schema
    except Exception:  # pragma: no cover - best-effort detection
        return False
    return any(
        schema.column(i).physical_type == "INT96" for i in range(len(schema.names))
    )


def _load_dataframe(
    path: Path,
) -> tuple[pd.DataFrame, bool, str | None, str | None, bool]:
    """Load a parquet file into a DataFrame, returning the DataFrame,
    whether it's GeoParquet, the geometry column name (if any), the CRS (if
    any), and whether the file uses legacy INT96 timestamp encoding.
    """

    uses_int96 = _uses_int96_timestamps(path)

    is_geo = _is_geoparquet(path)
    if is_geo:
        gdf = gpd.read_parquet(path)
        geometry_column = gdf.geometry.name if hasattr(gdf, "geometry") else None
        crs = str(gdf.crs) if gdf.crs is not None else None

        # geopandas silently omits columns it recognizes as GeoParquet
        # "covering" metadata (e.g. a per-row bbox struct some writers —
        # notably Spark/Sedona — attach for spatial predicate pushdown) from
        # the returned GeoDataFrame. Left alone, saving would silently drop
        # that column from the file even though the user never touched it.
        # Carry any such columns forward verbatim so nothing is lost.
        raw_columns = pq.read_schema(path).names
        missing = [c for c in raw_columns if c not in gdf.columns]
        if missing:
            extra = pq.read_table(path, columns=missing).to_pandas()
            for col in missing:
                gdf[col] = extra[col].values

        return gdf, True, geometry_column, crs, uses_int96

    df = pd.read_parquet(path, engine="pyarrow")

    return df, False, None, None, uses_int96


def open_file(file_id: str) -> OpenFile:
    """Return an OpenFile session for the given file_id, loading the underlying"""

    entry = cache.get(file_id)
    if entry is not None:
        return entry

    record = store.get(file_id)
    if record is None:
        raise ParquetServiceError(f"Unknown file_id: {file_id}")

    df, is_geo, geometry_column, crs, uses_int96 = _load_dataframe(record.path)

    kinds = {
        col: column_kind(df[col], is_geometry_col=(is_geo and col == geometry_column))
        for col in df.columns
    }

    entry = OpenFile(
        df=df,
        is_geo=is_geo,
        geometry_column=geometry_column,
        crs=crs,
        kinds=kinds,
        uses_int96_timestamps=uses_int96,
    )
    cache.set(file_id, entry)

    return entry


def hashable_columns(df: pd.DataFrame) -> list[str]:
    """Columns whose values can be hashed (needed for drop_duplicates()/
    duplicated()). Struct/list-typed parquet columns (e.g. a GeoParquet
    "covering" bbox struct — see `_load_dataframe`) come through as object
    dtype holding dict/list values, which aren't hashable.
    """
    hashable = []
    for col in df.columns:
        if df[col].dtype != object:
            hashable.append(col)
            continue
        sample = df[col].dropna().head(20)
        if any(isinstance(v, (dict, list)) for v in sample):
            continue
        hashable.append(col)
    return hashable


def get_schema(file_id: str) -> dict[str, Any]:
    """Return a read-only schema report for the given file."""

    entry = open_file(file_id)
    columns = [
        {
            "name": col,
            "dtype": str(entry.df[col].dtype),
            "kind": entry.kinds[col],
            "nullable": True,
        }
        for col in entry.df.columns
    ]

    return {
        "file_id": file_id,
        "is_geo": entry.is_geo,
        "crs": entry.crs,
        "row_count": len(entry.df),
        "columns": columns,
    }


def _json_safe(value: Any) -> Any:
    """Return a JSON-safe representation of a value."""

    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (np.floating,)):
        f = float(value)
        return None if math.isnan(f) else f
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        return value.isoformat()
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    try:
        from shapely.geometry.base import BaseGeometry

        if isinstance(value, BaseGeometry):
            return value.wkt
    except ImportError:  # pragma: no cover - geopandas always installed here
        pass
    if isinstance(value, float):
        return value
    if pd.isna(value):
        return None

    return value


def _apply_filters(
    df: pd.DataFrame, kinds: dict[str, str], filters: list[dict[str, Any]]
) -> pd.Series:
    """Return a boolean mask for the given DataFrame, applying the given filters."""

    mask = pd.Series(True, index=df.index)
    for f in filters:
        column, op, value = f.get("column"), f.get("op"), f.get("value")
        if column not in df.columns:
            raise ParquetServiceError(f"Unknown filter column: {column}")

        kind = kinds.get(column)
        series = df[column]

        if kind in ("int", "float", "date", "timestamp"):
            if op not in _FILTER_OPS_NUMERIC:
                raise ParquetServiceError(
                    f"Unsupported filter op '{op}' for kind '{kind}'"
                )

            casted = _cast_value(kind, value)
            if op == "eq":
                cond = series == casted
            elif op == "ne":
                cond = series != casted
            elif op == "lt":
                cond = series < casted
            elif op == "lte":
                cond = series <= casted
            elif op == "gt":
                cond = series > casted
            else:
                cond = series >= casted
        elif kind == "string":
            if op not in _FILTER_OPS_STRING:
                raise ParquetServiceError(
                    f"Unsupported filter op '{op}' for kind '{kind}'"
                )
            str_series = series.astype(str)
            text = "" if value is None else str(value)
            if op == "eq":
                cond = str_series == text
            elif op == "contains":
                cond = str_series.str.contains(text, case=False, na=False, regex=False)
            else:
                cond = str_series.str.startswith(text, na=False)
        elif kind == "bool":
            if op not in _FILTER_OPS_BOOL:
                raise ParquetServiceError(
                    f"Unsupported filter op '{op}' for kind '{kind}'"
                )
            cond = series == _cast_value("bool", value)
        else:
            raise ParquetServiceError(
                f"Column '{column}' of kind '{kind}' is not filterable"
            )

        mask &= cond.fillna(False)

    return mask


def _get_search_blob(entry: OpenFile) -> pd.Series:
    """Lowercased "all columns joined" text per row, cached on the open-file
    session (see `OpenFile.search_blob`) so free-text search doesn't
    re-stringify every column on every keystroke — for a wide table (this
    was measured at 8+ seconds per search on a real 45k-row/430-column
    geoparquet file before caching). The geometry column is skipped: WKT
    text search is rarely useful and shapely->str is one of the slower
    conversions here. The cache is invalidated wherever any cell/column can
    be mutated (edit_cell, generate_values, add_column, delete_column,
    fill_nulls).
    """
    if entry.search_blob is None:
        df = entry.df
        parts = [
            df[col].astype(str).str.lower()
            for col in df.columns
            if entry.kinds.get(col) != "geometry"
        ]
        if parts:
            # A single str.cat() call over all parts is a linear-time,
            # vectorized join; building the same result via a Python loop of
            # `blob = blob + " " + part` is quadratic (each `+` copies the
            # whole, ever-growing column) and was the actual bottleneck.
            # na_rep="" is required: without it, str.cat's default behavior
            # makes the *entire row's* blob NaN if *any* one of the ~430
            # joined columns is missing at that row — which, empirically,
            # silently broke search for most/all rows in real data.
            entry.search_blob = parts[0].str.cat(parts[1:], sep=" ", na_rep="")
        else:
            entry.search_blob = pd.Series("", index=df.index)

    return entry.search_blob


def _apply_search(entry: OpenFile, search: str) -> pd.Series:
    """Return a boolean mask of rows whose search blob contains `search`."""

    blob = _get_search_blob(entry)
    return blob.str.contains(search.lower(), na=False, regex=False)


def get_rows(
    file_id: str,
    page: int,
    page_size: int,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    search: str | None = None,
    filters: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return a paginated, optionally filtered and sorted view of the rows in the given file."""

    entry = open_file(file_id)
    df = entry.df

    mask = pd.Series(True, index=df.index)
    if filters:
        mask &= _apply_filters(df, entry.kinds, filters)
    if search:
        mask &= _apply_search(entry, search)

    filtered_index = df.index[mask]

    if sort_by:
        if sort_by not in df.columns:
            raise ParquetServiceError(f"Unknown sort column: {sort_by}")
        if entry.kinds.get(sort_by) == "geometry":
            raise ParquetServiceError("Cannot sort by a geometry column")
        ascending = sort_dir != "desc"
        filtered_index = (
            df.loc[filtered_index, sort_by]
            .sort_values(ascending=ascending, kind="mergesort", na_position="last")
            .index
        )

    total_rows = len(filtered_index)
    start = page * page_size
    end = min(start + page_size, total_rows)
    page_index = filtered_index[start:end]

    rows = []
    for row_index in page_index:
        record = {"__row_index__": int(row_index)}
        for col in df.columns:
            record[col] = _json_safe(df.at[row_index, col])
        rows.append(record)

    return {
        "page": page,
        "page_size": page_size,
        "total_rows": total_rows,
        "rows": rows,
    }


def _cast_value(kind: str, raw_value: Any) -> Any:
    """Cast a raw value to the given column kind, raising ParquetServiceError if invalid."""

    if raw_value is None:
        return None

    if kind == "int":
        return int(raw_value)
    if kind == "float":
        return float(raw_value)
    if kind == "bool":
        if isinstance(raw_value, str):
            return raw_value.strip().lower() in {"true", "1", "yes"}
        return bool(raw_value)
    if kind == "string":
        return str(raw_value)
    if kind in {"date", "timestamp"}:
        ts = pd.to_datetime(raw_value)
        return ts.date() if kind == "date" else ts
    if kind == "geometry":
        from shapely import wkt

        try:
            return wkt.loads(raw_value)
        except Exception as exc:
            raise ParquetServiceError(f"Invalid WKT geometry: {exc}") from exc

    return raw_value


def edit_cell(file_id: str, row_index: int, column: str, value: Any) -> None:
    """Edit a single cell in the given file, casting the value to the column's kind."""

    entry = open_file(file_id)
    if column not in entry.df.columns:
        raise ParquetServiceError(f"Unknown column: {column}")
    if row_index < 0 or row_index >= len(entry.df):
        raise ParquetServiceError(f"Row index out of range: {row_index}")

    kind = entry.kinds[column]
    casted = _cast_value(kind, value)

    # Assign through a dtype-matched Series rather than a raw scalar: pandas'
    # scalar setitem is strict about e.g. datetime64 unit mismatches (ns vs.
    # us), while Series.astype + column assignment coerces safely.
    single = pd.Series([casted], index=[row_index])
    if kind != "geometry":
        try:
            single = single.astype(entry.df[column].dtype)
        except (TypeError, ValueError):
            pass
    entry.df.loc[single.index, column] = single
    entry.dirty = True
    entry.search_blob = None
    if column == entry.geometry_column:
        entry.bbox = None


def add_column(file_id: str, name: str, kind: str, default: Any = None) -> None:
    """Add a new column to the given file, with the given kind and optional default value."""

    entry = open_file(file_id)
    if name in RESERVED_COLUMN_NAMES:
        raise ParquetServiceError(f"'{name}' is a reserved column name")
    if name in entry.df.columns:
        raise ParquetServiceError(f"Column already exists: {name}")
    if kind not in _KIND_TO_DTYPE:
        supported = ", ".join(sorted(_KIND_TO_DTYPE))
        if kind == KIND_GEOMETRY:
            raise ParquetServiceError(
                "Adding a geometry column is not supported — geometry columns "
                "require a full geo-conversion of the file"
            )
        raise ParquetServiceError(
            f"Unsupported column kind for add_column: {kind} (supported: {supported})"
        )

    n = len(entry.df)
    value = _cast_value(kind, default) if default is not None else None
    series = pd.Series([value] * n)
    target_dtype = _KIND_TO_DTYPE.get(kind)
    if target_dtype:
        try:
            series = series.astype(target_dtype)
        except (TypeError, ValueError):
            pass

    entry.df[name] = series
    entry.kinds[name] = kind
    entry.dirty = True
    entry.search_blob = None


def delete_column(file_id: str, name: str) -> None:
    """Delete a column from the given file, updating the geometry column and bbox if needed."""

    entry = open_file(file_id)
    if name not in entry.df.columns:
        raise ParquetServiceError(f"Unknown column: {name}")

    entry.df.drop(columns=[name], inplace=True)
    entry.kinds.pop(name, None)
    if entry.geometry_column == name:
        entry.geometry_column = None
        entry.bbox = None
    entry.dirty = True
    entry.search_blob = None


def delete_row(file_id: str, row_index: int) -> None:
    """Delete a single row from the given file by its row index."""

    entry = open_file(file_id)
    if row_index < 0 or row_index >= len(entry.df):
        raise ParquetServiceError(f"Row index out of range: {row_index}")

    entry.df.drop(index=row_index, inplace=True)
    # row_index is used elsewhere (edit_cell, get_rows, ...) as both a bounds
    # check against len(df) and a .loc label, which only stays correct if the
    # index remains a contiguous 0..len-1 RangeIndex after the drop.
    entry.df.reset_index(drop=True, inplace=True)
    if entry.geometry_column:
        entry.bbox = None
    entry.dirty = True
    entry.search_blob = None


def delete_null_columns(file_id: str) -> list[str]:
    """Delete all columns that are entirely null, returning the list of deleted column names."""

    entry = open_file(file_id)
    if len(entry.df) == 0:
        # Series.isna().all() is vacuously True on an empty column, which would
        # otherwise make every column look "all null" and wipe the whole schema.
        return []
    null_cols = [col for col in entry.df.columns if entry.df[col].isna().all()]
    if not null_cols:
        return []

    entry.df.drop(columns=null_cols, inplace=True)
    for col in null_cols:
        entry.kinds.pop(col, None)
        if entry.geometry_column == col:
            entry.geometry_column = None
            entry.bbox = None
    entry.dirty = True
    entry.search_blob = None

    return null_cols


def fill_nulls(file_id: str, column: str, strategy: str) -> int:
    """Fill null values in `column` from its own existing values, using one
    of: mean/median (numeric & date/timestamp only), mode (most frequent
    existing value), or random (bootstrap-sample from existing values,
    preserving the column's own distribution). Returns how many cells were
    filled.
    """

    entry = open_file(file_id)
    if column not in entry.df.columns:
        raise ParquetServiceError(f"Unknown column: {column}")
    if strategy not in FILL_STRATEGIES:
        raise ParquetServiceError(
            f"Unknown fill strategy: {strategy} (supported: {', '.join(sorted(FILL_STRATEGIES))})"
        )

    kind = entry.kinds[column]
    if kind == KIND_GEOMETRY:
        raise ParquetServiceError("Filling a geometry column is not supported")
    if strategy in ("mean", "median") and kind not in _MEAN_MEDIAN_KINDS:
        raise ParquetServiceError(
            f"'{strategy}' is only supported for int/float/date/timestamp columns (got '{kind}')"
        )

    series = entry.df[column]
    null_mask = series.isna()
    n_missing = int(null_mask.sum())
    if n_missing == 0:
        return 0

    non_null = series.dropna()
    if len(non_null) == 0:
        raise ParquetServiceError("Column has no existing values to fill from")

    if strategy in ("mean", "median"):
        if kind in ("date", "timestamp"):
            as_dt = pd.to_datetime(non_null)
            agg = as_dt.mean() if strategy == "mean" else as_dt.median()
            fill_value = agg.date() if kind == "date" else agg
        else:
            agg = non_null.mean() if strategy == "mean" else non_null.median()
            fill_value = int(round(agg)) if kind == "int" else float(agg)
        fill_values: list[Any] = [fill_value] * n_missing
    elif strategy == "mode":
        fill_value = non_null.mode().iloc[0]
        fill_values = [fill_value] * n_missing
    else:  # random: bootstrap-sample from the column's own existing values
        fill_values = list(
            np.random.choice(non_null.to_numpy(dtype=object), size=n_missing)
        )

    idx = series.index[null_mask]
    fill_series = pd.Series(fill_values, index=idx)
    try:
        fill_series = fill_series.astype(series.dtype)
    except (TypeError, ValueError):
        pass
    entry.df.loc[idx, column] = fill_series
    entry.dirty = True
    entry.search_blob = None

    return n_missing


def save_file(file_id: str, legacy_int96_timestamps: bool | None = None) -> FileRecord:
    """Save the given file back to its original path.

    Timestamp encoding (legacy INT96 vs. modern INT64) defaults to whatever
    the original file used (`entry.uses_int96_timestamps`, detected at open
    time) so a save doesn't silently change it — this matters a lot for
    schema-strict downstream readers like Spark, which choke on a mismatch.
    Pass `legacy_int96_timestamps` explicitly to override that default.
    """

    entry = open_file(file_id)
    record = store.get(file_id)
    if record is None:
        raise ParquetServiceError(f"Unknown file_id: {file_id}")

    use_int96 = (
        entry.uses_int96_timestamps
        if legacy_int96_timestamps is None
        else legacy_int96_timestamps
    )

    can_write_geo = (
        entry.is_geo
        and entry.geometry_column
        and entry.geometry_column in entry.df.columns
    )
    if can_write_geo:
        entry.df.to_parquet(
            record.path,
            engine="pyarrow",
            compression="snappy",
            use_deprecated_int96_timestamps=use_int96,
        )
    else:
        entry.df.to_parquet(
            record.path,
            engine="pyarrow",
            compression="snappy",
            use_deprecated_int96_timestamps=use_int96,
        )

    entry.dirty = False

    return record


def export_file(file_id: str, fmt: str) -> tuple[bytes, str, str]:
    """Export the given file in the requested format (json, csv, or parquet)."""

    if fmt not in EXPORT_FORMATS:
        raise ParquetServiceError(f"Unsupported export format: {fmt}")

    entry = open_file(file_id)
    record = store.get(file_id)
    if record is None:
        raise ParquetServiceError(f"Unknown file_id: {file_id}")

    export_df = entry.df
    if entry.geometry_column and entry.geometry_column in export_df.columns:
        export_df = pd.DataFrame(export_df.drop(columns=[entry.geometry_column]))

    base_name = Path(record.filename).stem

    if fmt == "json":
        buf = io.StringIO()
        export_df.to_json(buf, orient="records", date_format="iso")
        return buf.getvalue().encode("utf-8"), "application/json", f"{base_name}.json"

    if fmt == "csv":
        buf = io.StringIO()
        export_df.to_csv(buf, index=False)
        return buf.getvalue().encode("utf-8"), "text/csv", f"{base_name}.csv"

    buf = io.BytesIO()
    export_df.to_parquet(
        buf,
        engine="pyarrow",
        compression="snappy",
        use_deprecated_int96_timestamps=entry.uses_int96_timestamps,
    )

    return buf.getvalue(), "application/octet-stream", f"{base_name}.parquet"


def get_bbox(file_id: str) -> dict[str, float]:
    """Bounding box of the geometry column, cached on the open-file session
    (see `OpenFile.bbox`) so repeated requests don't rescan the whole column.
    The cache is invalidated wherever the geometry column can be mutated
    (edit_cell, generate_values, delete_column).
    """

    entry = open_file(file_id)
    if (
        not entry.is_geo
        or not entry.geometry_column
        or entry.geometry_column not in entry.df.columns
    ):
        raise ParquetServiceError("File has no geometry column")

    if entry.bbox is None:
        geo_series = entry.df[entry.geometry_column]
        valid = geo_series[geo_series.notna() & ~geo_series.is_empty]
        if len(valid) == 0:
            raise ParquetServiceError("No geometries to compute a bounding box from")
        min_lon, min_lat, max_lon, max_lat = valid.total_bounds
        entry.bbox = (float(min_lon), float(min_lat), float(max_lon), float(max_lat))

    min_lon, min_lat, max_lon, max_lat = entry.bbox

    return {
        "min_lon": min_lon,
        "min_lat": min_lat,
        "max_lon": max_lon,
        "max_lat": max_lat,
    }


def get_geometries(
    file_id: str, row_indices: list[int] | None, limit: int = 5000
) -> dict[str, Any]:
    """Return a list of geometries from the given file, optionally filtered to the given row indices,
    and truncated to the given limit. Each geometry is returned as a WKT string with its row index.
    """

    entry = open_file(file_id)
    if (
        not entry.is_geo
        or not entry.geometry_column
        or entry.geometry_column not in entry.df.columns
    ):
        raise ParquetServiceError("File has no geometry column")

    col = entry.geometry_column
    total_rows = len(entry.df)

    if row_indices is not None:
        for idx in row_indices:
            if idx < 0 or idx >= total_rows:
                raise ParquetServiceError(f"Row index out of range: {idx}")
        candidate_indices = row_indices
    else:
        candidate_indices = list(range(total_rows))

    total = len(candidate_indices)
    truncated = total > limit
    candidate_indices = candidate_indices[:limit]

    features = []
    for idx in candidate_indices:
        geom = entry.df[col].iloc[idx]
        if geom is None or (hasattr(geom, "is_empty") and geom.is_empty):
            continue
        features.append({"row_index": idx, "wkt": geom.wkt})

    return {
        "geometry_column": col,
        "total": total,
        "truncated": truncated,
        "features": features,
    }
