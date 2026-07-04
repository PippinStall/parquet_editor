from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.models import FileInfo, MergeRequest
from app.services.merge_service import merge_files
from app.services.parquet_service import ParquetServiceError
from app.routers.files import file_info

router = APIRouter(prefix="/api/files", tags=["merge"])


@router.post("/merge", response_model=FileInfo)
def merge(request: MergeRequest) -> FileInfo:
    """Merge multiple files into a single file based on the provided request."""

    try:
        record = merge_files(
            request.file_ids, request.output_filename, request.dedup_by
        )
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return file_info(record)
