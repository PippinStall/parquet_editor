from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.models import CreateDatasetRequest, CreateDatasetResult
from app.services.create_dataset_service import create_dataset
from app.services.parquet_service import ParquetServiceError
from app.routers.files import file_info

router = APIRouter(prefix="/api/files", tags=["create_dataset"])


@router.post("/create", response_model=CreateDatasetResult)
def create(request: CreateDatasetRequest) -> CreateDatasetResult:
    """Create a new dataset with the specified columns and row count."""

    try:
        record, skipped = create_dataset(
            request.output_filename,
            request.row_count,
            [c.model_dump() for c in request.columns],
        )
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return CreateDatasetResult(file=file_info(record), skipped_columns=skipped)
