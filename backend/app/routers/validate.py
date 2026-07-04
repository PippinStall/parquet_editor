from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.models import ValidationReport
from app.services.parquet_service import ParquetServiceError
from app.services.validate_service import validate_file

router = APIRouter(prefix="/api/files", tags=["validate"])


@router.get("/{file_id}/validate", response_model=ValidationReport)
def validate(file_id: str) -> dict:
    """Validate a file based on its ID and return a validation report."""

    try:
        return validate_file(file_id)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
