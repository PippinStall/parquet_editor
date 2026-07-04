from __future__ import annotations

import pandas as pd

KIND_INT = "int"
KIND_FLOAT = "float"
KIND_STRING = "string"
KIND_BOOL = "bool"
KIND_DATE = "date"
KIND_TIMESTAMP = "timestamp"
KIND_GEOMETRY = "geometry"
KIND_OTHER = "other"

ALL_KINDS = {
    KIND_INT,
    KIND_FLOAT,
    KIND_STRING,
    KIND_BOOL,
    KIND_DATE,
    KIND_TIMESTAMP,
    KIND_GEOMETRY,
    KIND_OTHER,
}


def column_kind(series: pd.Series, is_geometry_col: bool) -> str:
    """Determine the kind of a column based on its dtype and content."""

    if is_geometry_col:
        return KIND_GEOMETRY

    dtype = series.dtype

    if pd.api.types.is_bool_dtype(dtype):
        return KIND_BOOL
    if pd.api.types.is_integer_dtype(dtype):
        return KIND_INT
    if pd.api.types.is_float_dtype(dtype):
        return KIND_FLOAT
    if pd.api.types.is_datetime64_any_dtype(dtype):
        return KIND_TIMESTAMP
    if (
        str(dtype) == "date32[day][pyarrow]"
        or str(dtype).startswith("date32")
        or str(dtype).startswith("date64")
    ):
        return KIND_DATE
    if pd.api.types.is_object_dtype(dtype):
        # Sample a few non-null values to disambiguate strings vs. python
        # date/datetime objects stored as object dtype.
        sample = series.dropna().head(20)
        if len(sample) > 0:
            import datetime

            if all(isinstance(v, datetime.datetime) for v in sample):
                return KIND_TIMESTAMP
            if all(isinstance(v, datetime.date) for v in sample):
                return KIND_DATE
        return KIND_STRING
    if pd.api.types.is_string_dtype(dtype):
        return KIND_STRING

    return KIND_OTHER
