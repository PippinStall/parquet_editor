from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class FileInfo(BaseModel):
    file_id: str
    filename: str
    size_bytes: int
    is_geo: bool
    row_count: int | None = None
    column_count: int | None = None


class ColumnInfo(BaseModel):
    name: str
    dtype: str
    kind: str
    nullable: bool = True


class SchemaResponse(BaseModel):
    file_id: str
    is_geo: bool
    crs: str | None = None
    row_count: int
    columns: list[ColumnInfo]


class RowsResponse(BaseModel):
    page: int
    page_size: int
    total_rows: int
    rows: list[dict[str, Any]]


class CellEdit(BaseModel):
    row_index: int
    column: str
    value: Any = None


class GenerateColumnSpec(BaseModel):
    name: str
    kind: str
    params: dict[str, Any] = {}


class GenerateTarget(BaseModel):
    scope: Literal["all", "selected"] = "all"
    row_indices: list[int] = []


class GenerateRequest(BaseModel):
    target: GenerateTarget = GenerateTarget()
    columns: list[GenerateColumnSpec]


class SaveRequest(BaseModel):
    legacy_int96_timestamps: bool = False


class SaveResponse(BaseModel):
    file_id: str
    saved: bool
    size_bytes: int


class ColumnValidation(BaseModel):
    name: str
    kind: str
    null_count: int
    null_percentage: float
    inf_count: int | None = None
    invalid_count: int | None = None
    empty_count: int | None = None


class ValidationReport(BaseModel):
    file_id: str
    row_count: int
    duplicate_rows: int
    columns: list[ColumnValidation]


class MergeRequest(BaseModel):
    file_ids: list[str]
    output_filename: str
    dedup_by: list[str] = []


class AddColumnRequest(BaseModel):
    name: str
    kind: str
    default: Any = None


class FillNullsRequest(BaseModel):
    strategy: str


class FillNullsResult(BaseModel):
    column: str
    strategy: str
    filled_count: int


class FilterSpec(BaseModel):
    column: str
    op: str
    value: Any = None


class GeometryFeature(BaseModel):
    row_index: int
    wkt: str


class GeometriesResponse(BaseModel):
    geometry_column: str
    total: int
    truncated: bool
    features: list[GeometryFeature]
