from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas.models import ValidationReport
from ..services.parquet_service import ParquetServiceError
from ..services.validate_service import validate_file

router = APIRouter(prefix="/api/files", tags=["validate"])


@router.get("/{file_id}/validate", response_model=ValidationReport)
def validate(file_id: str) -> dict:
    try:
        return validate_file(file_id)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
