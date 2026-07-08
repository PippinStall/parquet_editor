from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pyarrow.parquet as pq
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.helpers.file_store import store
from app.schemas.models import FileInfo
from app.helpers.session_cache import cache

router = APIRouter(prefix="/api/files", tags=["files"])


def file_info(record) -> FileInfo:
    """Get file info for a given file record."""

    row_count = None
    column_count = None

    try:
        metadata = pq.read_metadata(record.path)
        row_count = metadata.num_rows
        column_count = len(metadata.schema.names)
        is_geo = b"geo" in (metadata.metadata or {})
    except Exception:
        is_geo = False

    return FileInfo(
        file_id=record.file_id,
        filename=record.filename,
        size_bytes=record.size_bytes,
        is_geo=is_geo,
        row_count=row_count,
        column_count=column_count,
    )


@router.get("", response_model=list[FileInfo])
def list_files() -> list[FileInfo]:
    """List all uploaded files."""

    return [file_info(record) for record in store.list()]


@router.post("/upload", response_model=FileInfo)
async def upload_file(file: UploadFile) -> FileInfo:
    """Upload a .parquet or .geoparquet file."""

    if not file.filename or Path(file.filename).suffix.lower() not in {
        ".parquet",
        ".geoparquet",
    }:
        raise HTTPException(
            status_code=400, detail="Only .parquet/.geoparquet files are supported"
        )

    with tempfile.NamedTemporaryFile(
        delete=False, suffix=Path(file.filename).suffix
    ) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        record = store.save_upload(file.filename, tmp_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return file_info(record)


@router.delete("/{file_id}")
def delete_file(file_id: str) -> dict[str, bool]:
    """Delete a file by its ID."""

    deleted = store.delete(file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")

    cache.drop(file_id)

    return {"deleted": True}


@router.get("/{file_id}/download")
def download_file(file_id: str) -> FileResponse:
    """Download a file by its ID."""

    record = store.get(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        record.path, filename=record.filename, media_type="application/octet-stream"
    )


@router.post("/{file_id}/duplicate", response_model=FileInfo)
def duplicate_file(file_id: str) -> FileInfo:
    """Duplicate a file by its ID, creating a new file with a "_copy" postfix."""

    try:
        record = store.duplicate(file_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return file_info(record)
