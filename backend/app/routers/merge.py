from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas.models import FileInfo, MergeRequest
from ..services.merge_service import merge_files
from ..services.parquet_service import ParquetServiceError
from .files import file_info

router = APIRouter(prefix="/api/files", tags=["merge"])


@router.post("/merge", response_model=FileInfo)
def merge(request: MergeRequest) -> FileInfo:
    try:
        record = merge_files(request.file_ids, request.output_filename, request.dedup_by)
    except ParquetServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return file_info(record)
