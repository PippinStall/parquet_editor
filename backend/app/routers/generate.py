from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.models import GenerateRequest
from app.services.generate_service import generate_values
from app.services.parquet_service import ParquetServiceError

router = APIRouter(prefix="/api/files", tags=["generate"])


@router.post("/{file_id}/generate")
def generate(file_id: str, request: GenerateRequest) -> dict:
    """Generate values for a given file ID based on the provided request."""

    try:
        return generate_values(file_id, request)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
