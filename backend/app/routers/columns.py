from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.models import AddColumnRequest, FillNullsRequest, FillNullsResult
from app.services.parquet_service import (
    ParquetServiceError,
    add_column,
    delete_column,
    fill_nulls,
    get_schema,
)

router = APIRouter(prefix="/api/files", tags=["columns"])


@router.post("/{file_id}/columns")
def create_column(file_id: str, request: AddColumnRequest) -> dict:
    """Create a new column in a file."""

    try:
        add_column(file_id, request.name, request.kind, request.default)
        return get_schema(file_id)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{file_id}/columns/{column_name}")
def remove_column(file_id: str, column_name: str) -> dict:
    """Delete a column from a file."""

    try:
        delete_column(file_id, column_name)
        return get_schema(file_id)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{file_id}/columns/{column_name}/fill", response_model=FillNullsResult)
def fill_column_nulls(
    file_id: str, column_name: str, request: FillNullsRequest
) -> FillNullsResult:
    """Fill null values in a column with a specified strategy."""

    try:
        filled_count = fill_nulls(file_id, column_name, request.strategy)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return FillNullsResult(
        column=column_name, strategy=request.strategy, filled_count=filled_count
    )
