"""Merge several open files into one new file: columns are unioned (missing
values become null). Rows are then deduplicated either by an exact full-row
match, or — when key columns are given — by grouping on those keys and
coalescing each remaining column to its first non-null value across the
group (so a row with a value "wins" over a matching row where it's null).
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pandas as pd

from app.helpers.file_store import FileRecord, store
from app.services.parquet_service import ParquetServiceError, hashable_columns, open_file


def _coalesce_by_key(df: pd.DataFrame, key_columns: list[str]) -> pd.DataFrame:
    """Coalesce rows by key columns, preferring non-null values over nulls in
    each remaining column. Ties are broken by input row order (earlier rows win)."""

    for col in key_columns:
        if col not in df.columns:
            raise ParquetServiceError(f"Unknown dedup_by column: {col}")

    # groupby(...).first() takes, per group, the first non-null value of
    # each remaining column — i.e. exactly the "prefer a non-null value over
    # a null one" coalescing behavior, with ties broken by input row order
    # (rows from earlier files/rows win when both are non-null but differ).
    ordered_columns = list(df.columns)
    result = df.groupby(key_columns, dropna=False, as_index=False).first()

    return result[ordered_columns]


def merge_files(
    file_ids: list[str], output_filename: str, dedup_by: list[str] | None = None
) -> FileRecord:
    """Merge several open files into one new file: columns are unioned (missing
    values become null)."""

    if len(file_ids) < 2:
        raise ParquetServiceError("Select at least 2 files to merge")
    if not output_filename.strip():
        raise ParquetServiceError("output_filename must not be empty")

    entries = [open_file(fid) for fid in file_ids]
    geo_entries = [e for e in entries if e.is_geo and e.geometry_column]
    is_geo = len(geo_entries) > 0
    # If any source file used legacy INT96 timestamps (the parquet-mr/Spark
    # convention), keep using it for the merged output too — see save_file().
    use_int96 = any(e.uses_int96_timestamps for e in entries)

    frames: list[pd.DataFrame] = []
    if is_geo:
        import geopandas as gpd

        canonical_col = geo_entries[0].geometry_column
        canonical_crs = geo_entries[0].crs

        for entry in entries:
            df = entry.df.copy()
            if entry.is_geo and entry.geometry_column:
                if entry.geometry_column != canonical_col:
                    df = df.rename(columns={entry.geometry_column: canonical_col})
                gdf = gpd.GeoDataFrame(df, geometry=canonical_col, crs=entry.crs)
                if canonical_crs and entry.crs and str(entry.crs) != str(canonical_crs):
                    gdf = gdf.to_crs(canonical_crs)
            else:
                df[canonical_col] = None
                gdf = gpd.GeoDataFrame(df, geometry=canonical_col, crs=canonical_crs)
            frames.append(gdf)

        merged = pd.concat(frames, ignore_index=True)
        merged = gpd.GeoDataFrame(merged, geometry=canonical_col, crs=canonical_crs)
    else:
        frames = [entry.df for entry in entries]
        merged = pd.concat(frames, ignore_index=True)

    if dedup_by:
        merged = _coalesce_by_key(merged, dedup_by)
        if is_geo:
            merged = gpd.GeoDataFrame(merged, geometry=canonical_col, crs=canonical_crs)
    else:
        subset = hashable_columns(merged)
        dedup_subset = subset if len(subset) < len(merged.columns) else None
        merged = merged.drop_duplicates(subset=dedup_subset, ignore_index=True)

    suffix = ".geoparquet" if is_geo else ".parquet"
    filename = output_filename.strip()
    if Path(filename).suffix.lower() not in {".parquet", ".geoparquet"}:
        filename = f"{filename}{suffix}"

    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
        tmp_path = Path(tmp.name)

    if is_geo:
        merged.to_parquet(tmp_path, compression="snappy", use_deprecated_int96_timestamps=use_int96)
    else:
        merged.to_parquet(
            tmp_path, engine="pyarrow", compression="snappy", use_deprecated_int96_timestamps=use_int96
        )

    try:
        return store.save_upload(filename, tmp_path)
    except ValueError as exc:
        raise ParquetServiceError(str(exc)) from exc
