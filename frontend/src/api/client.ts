import axios from "axios";
import type {
  BBox,
  ColumnKind,
  CreateDatasetColumn,
  CreateDatasetResult,
  ExportFormat,
  FileInfo,
  FillNullsResult,
  FillStrategy,
  FilterSpec,
  GenerateRequest,
  GenerateResult,
  GeometriesResult,
  RowsResponse,
  SchemaResponse,
  SortDir,
  ValidationReport,
} from "../types";

const api = axios.create({ baseURL: "/api" });

export async function listFiles(): Promise<FileInfo[]> {
  const { data } = await api.get<FileInfo[]>("/files");
  return data;
}

export async function uploadFile(file: File): Promise<FileInfo> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<FileInfo>("/files/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`);
}

export function downloadFileUrl(fileId: string): string {
  return `/api/files/${fileId}/download`;
}

export async function getSchema(fileId: string): Promise<SchemaResponse> {
  const { data } = await api.get<SchemaResponse>(`/files/${fileId}/schema`);
  return data;
}

export interface GetRowsOptions {
  sortBy?: string;
  sortDir?: SortDir;
  search?: string;
  filters?: FilterSpec[];
}

export async function getRows(
  fileId: string,
  page: number,
  pageSize: number,
  options: GetRowsOptions = {},
): Promise<RowsResponse> {
  const { data } = await api.get<RowsResponse>(`/files/${fileId}/rows`, {
    params: {
      page,
      page_size: pageSize,
      sort_by: options.sortBy || undefined,
      sort_dir: options.sortBy ? (options.sortDir ?? "asc") : undefined,
      search: options.search || undefined,
      filters: options.filters?.length ? JSON.stringify(options.filters) : undefined,
    },
  });
  return data;
}

export async function patchCell(
  fileId: string,
  rowIndex: number,
  column: string,
  value: unknown,
): Promise<void> {
  await api.patch(`/files/${fileId}/cell`, {
    row_index: rowIndex,
    column,
    value,
  });
}

export async function generateValues(
  fileId: string,
  request: GenerateRequest,
): Promise<GenerateResult> {
  const { data } = await api.post<GenerateResult>(
    `/files/${fileId}/generate`,
    request,
  );
  return data;
}

export async function saveFile(
  fileId: string,
  legacyInt96Timestamps = false,
): Promise<void> {
  await api.post(`/files/${fileId}/save`, {
    legacy_int96_timestamps: legacyInt96Timestamps,
  });
}

export async function validateFile(fileId: string): Promise<ValidationReport> {
  const { data } = await api.get<ValidationReport>(`/files/${fileId}/validate`);
  return data;
}

export async function fillNulls(
  fileId: string,
  column: string,
  strategy: FillStrategy,
): Promise<FillNullsResult> {
  const { data } = await api.post<FillNullsResult>(
    `/files/${fileId}/columns/${encodeURIComponent(column)}/fill`,
    { strategy },
  );
  return data;
}

export async function mergeFiles(
  fileIds: string[],
  outputFilename: string,
  dedupBy: string[] = [],
): Promise<FileInfo> {
  const { data } = await api.post<FileInfo>("/files/merge", {
    file_ids: fileIds,
    output_filename: outputFilename,
    dedup_by: dedupBy,
  });
  return data;
}

export async function addColumn(
  fileId: string,
  name: string,
  kind: ColumnKind,
  defaultValue: unknown = null,
): Promise<SchemaResponse> {
  const { data } = await api.post<SchemaResponse>(`/files/${fileId}/columns`, {
    name,
    kind,
    default: defaultValue,
  });
  return data;
}

export async function deleteColumn(
  fileId: string,
  columnName: string,
): Promise<SchemaResponse> {
  const { data } = await api.delete<SchemaResponse>(
    `/files/${fileId}/columns/${encodeURIComponent(columnName)}`,
  );
  return data;
}

export function exportFileUrl(fileId: string, format: ExportFormat): string {
  return `/api/files/${fileId}/export?format=${format}`;
}

export function exportSchemaUrl(fileId: string): string {
  return `/api/files/${fileId}/schema/export`;
}

export async function getBbox(fileId: string): Promise<BBox> {
  const { data } = await api.get<BBox>(`/files/${fileId}/bbox`);
  return data;
}

export async function createDataset(
  outputFilename: string,
  rowCount: number,
  columns: CreateDatasetColumn[],
): Promise<CreateDatasetResult> {
  const { data } = await api.post<CreateDatasetResult>("/files/create", {
    output_filename: outputFilename,
    row_count: rowCount,
    columns,
  });
  return data;
}

export async function getGeometries(
  fileId: string,
  scope: "all" | "selected",
  rowIndices?: number[],
): Promise<GeometriesResult> {
  const { data } = await api.get(`/files/${fileId}/geometries`, {
    params: {
      scope,
      row_indices: rowIndices?.length ? rowIndices.join(",") : undefined,
    },
  });
  return {
    geometryColumn: data.geometry_column,
    total: data.total,
    truncated: data.truncated,
    features: data.features.map((f: { row_index: number; wkt: string }) => ({
      rowIndex: f.row_index,
      wkt: f.wkt,
    })),
  };
}

export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    return err.message;
  }
  return String(err);
}
