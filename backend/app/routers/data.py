from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import TypeAdapter, ValidationError

from app.schemas.models import (
    BBox,
    CellEdit,
    FilterSpec,
    GeometriesResponse,
    SaveRequest,
    SaveResponse,
)
from app.services.parquet_service import (
    ParquetServiceError,
    delete_row,
    edit_cell,
    export_file,
    get_bbox,
    get_geometries,
    get_rows,
    get_schema,
    save_file,
)

router = APIRouter(prefix="/api/files", tags=["data"])

_filters_adapter = TypeAdapter(list[FilterSpec])


@router.get("/{file_id}/schema")
def schema(file_id: str) -> dict:
    """Get the schema of a file."""

    try:
        return get_schema(file_id)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{file_id}/rows")
def rows(
    file_id: str,
    page: int = 0,
    page_size: int = 50,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    search: str | None = None,
    filters: str | None = None,
) -> dict:
    """Get rows of a file with optional pagination, sorting, searching, and filtering."""

    if page < 0 or page_size <= 0 or page_size > 1000:
        raise HTTPException(status_code=400, detail="Invalid page/page_size")
    if sort_dir not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="sort_dir must be 'asc' or 'desc'")

    parsed_filters = None
    if filters:
        try:
            parsed_filters = [
                f.model_dump() for f in _filters_adapter.validate_json(filters)
            ]
        except ValidationError as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid filters: {exc}"
            ) from exc

    try:
        return get_rows(
            file_id,
            page,
            page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
            search=search,
            filters=parsed_filters,
        )
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{file_id}/cell")
def patch_cell(file_id: str, edit: CellEdit) -> dict[str, bool]:
    """Edit a cell in a file."""

    try:
        edit_cell(file_id, edit.row_index, edit.column, edit.value)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True}


@router.delete("/{file_id}/rows/{row_index}")
def remove_row(file_id: str, row_index: int) -> dict[str, bool]:
    """Delete a single row from a file by its row index."""

    try:
        delete_row(file_id, row_index)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True}


@router.post("/{file_id}/save", response_model=SaveResponse)
def save(file_id: str, req: SaveRequest) -> SaveResponse:
    """Save a file with optional legacy Int96 timestamps."""

    try:
        record = save_file(file_id, legacy_int96_timestamps=req.legacy_int96_timestamps)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SaveResponse(file_id=file_id, saved=True, size_bytes=record.size_bytes)


@router.get("/{file_id}/export")
def export(
    file_id: str, format: str = Query(..., pattern="^(json|csv|parquet)$")
) -> Response:
    """Export a file in the specified format."""

    try:
        content, media_type, filename = export_file(file_id, format)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{file_id}/bbox", response_model=BBox)
def bbox(file_id: str) -> BBox:
    """Get the bounding box of geometries in a file."""

    try:
        return BBox(**get_bbox(file_id))
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{file_id}/schema/export")
def export_schema(file_id: str) -> Response:
    """Export the schema of a file as a JSON file."""

    try:
        data = get_schema(file_id)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    body = json.dumps(data, indent=2)

    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{file_id}_schema.json"'
        },
    )


@router.get("/{file_id}/geometries", response_model=GeometriesResponse)
def geometries(
    file_id: str,
    scope: str = Query("all", pattern="^(all|selected)$"),
    row_indices: str | None = None,
    limit: int = 5000,
) -> dict:
    """Get geometries from a file, either all or selected rows."""

    parsed_indices = None
    if scope == "selected":
        if not row_indices:
            raise HTTPException(
                status_code=400, detail="row_indices is required when scope=selected"
            )
        try:
            parsed_indices = [int(x) for x in row_indices.split(",") if x.strip() != ""]
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid row_indices: {exc}"
            ) from exc

    try:
        return get_geometries(file_id, parsed_indices, limit=limit)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
