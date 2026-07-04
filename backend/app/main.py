from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import columns, data, files, generate, merge, validate

app = FastAPI(title="Parquet/GeoParquet Editor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router)
app.include_router(data.router)
app.include_router(generate.router)
app.include_router(validate.router)
app.include_router(merge.router)
app.include_router(columns.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
