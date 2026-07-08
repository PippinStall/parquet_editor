from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class FileInfo(BaseModel):
    """Information about a file."""

    file_id: str
    filename: str
    size_bytes: int
    is_geo: bool
    row_count: int | None = None
    column_count: int | None = None


class ColumnInfo(BaseModel):
    """Information about a column."""

    name: str
    dtype: str
    kind: str
    nullable: bool = True


class SchemaResponse(BaseModel):
    """Response containing schema information for a file."""

    file_id: str
    is_geo: bool
    crs: str | None = None
    row_count: int
    columns: list[ColumnInfo]


class RowsResponse(BaseModel):
    """Response containing rows of data for a file."""

    page: int
    page_size: int
    total_rows: int
    rows: list[dict[str, Any]]


class CellEdit(BaseModel):
    """Represents an edit to a single cell in a file."""

    row_index: int
    column: str
    value: Any = None


class GenerateColumnSpec(BaseModel):
    """Specification for generating a new column."""

    name: str
    kind: str
    params: dict[str, Any] = {}


class GenerateTarget(BaseModel):
    """Specifies the target rows for a generate operation."""

    scope: Literal["all", "selected"] = "all"
    row_indices: list[int] = []


class GenerateRequest(BaseModel):
    """Request to generate new columns."""

    target: GenerateTarget = GenerateTarget()
    columns: list[GenerateColumnSpec]


class SaveRequest(BaseModel):
    """Request to save a file."""

    # None means "preserve whatever the original file used" (auto-detected —
    # see OpenFile.uses_int96_timestamps); pass True/False to override it.
    legacy_int96_timestamps: bool | None = None


class SaveResponse(BaseModel):
    """Response after saving a file."""

    file_id: str
    saved: bool
    size_bytes: int


class ColumnValidation(BaseModel):
    """Validation information for a column."""

    name: str
    kind: str
    null_count: int
    null_percentage: float
    inf_count: int | None = None
    invalid_count: int | None = None
    empty_count: int | None = None
    # Basic descriptive stats, computed from the column's own non-null values.
    # None where not applicable to the column's kind (e.g. min/max for bool).
    distinct_count: int | None = None
    min_value: str | None = None
    max_value: str | None = None
    mean_value: str | None = None
    top_value: str | None = None
    top_value_count: int | None = None


class ValidationReport(BaseModel):
    """Validation report for a file."""

    file_id: str
    row_count: int
    duplicate_rows: int
    is_geo: bool
    kind_counts: dict[str, int]
    columns: list[ColumnValidation]


class MergeRequest(BaseModel):
    """Request to merge multiple files."""

    file_ids: list[str]
    output_filename: str
    dedup_by: list[str] = []


class AddColumnRequest(BaseModel):
    """Request to add a new column to a file."""

    name: str
    kind: str
    default: Any = None


class FillNullsRequest(BaseModel):
    """Request to fill null values in a column."""

    strategy: str


class FillNullsResult(BaseModel):
    """Result of filling null values in a column."""

    column: str
    strategy: str
    filled_count: int


class DeleteNullColumnsResult(BaseModel):
    """Result of deleting all fully-null columns from a file."""

    deleted_columns: list[str]


class FilterSpec(BaseModel):
    """Specification for filtering rows in a file."""

    column: str
    op: str
    value: Any = None


class GeometryFeature(BaseModel):
    """Represents a geometry feature in a file."""

    row_index: int
    wkt: str


class GeometriesResponse(BaseModel):
    """Response containing geometry features for a file."""

    geometry_column: str
    total: int
    truncated: bool
    features: list[GeometryFeature]


class BBox(BaseModel):
    """Represents a bounding box."""

    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float


class CreateDatasetColumn(BaseModel):
    """Represents a column in a dataset."""

    name: str
    kind: str
    # Mandatory bounding box for kind="geometry" — see create_dataset_service._geometry_params.
    min_lon: float | None = None
    max_lon: float | None = None
    min_lat: float | None = None
    max_lat: float | None = None


class CreateDatasetRequest(BaseModel):
    """Request to create a new dataset."""

    output_filename: str
    row_count: int
    columns: list[CreateDatasetColumn]


class CreateDatasetResult(BaseModel):
    """Result of creating a new dataset."""

    file: FileInfo
    skipped_columns: int
