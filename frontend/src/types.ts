export type ColumnKind =
  | "int"
  | "float"
  | "string"
  | "bool"
  | "date"
  | "timestamp"
  | "geometry"
  | "other";

export interface FileInfo {
  file_id: string;
  filename: string;
  size_bytes: number;
  is_geo: boolean;
  row_count: number | null;
  column_count: number | null;
}

export interface ColumnInfo {
  name: string;
  dtype: string;
  kind: ColumnKind;
  nullable: boolean;
}

export interface SchemaResponse {
  file_id: string;
  is_geo: boolean;
  crs: string | null;
  row_count: number;
  columns: ColumnInfo[];
}

export type RowRecord = Record<string, unknown> & { __row_index__: number };

export interface RowsResponse {
  page: number;
  page_size: number;
  total_rows: number;
  rows: RowRecord[];
}

export interface GenerateColumnSpec {
  name: string;
  kind: ColumnKind;
  params: Record<string, unknown>;
}

export interface GenerateTarget {
  scope: "all" | "selected";
  row_indices: number[];
}

export interface GenerateRequest {
  target: GenerateTarget;
  columns: GenerateColumnSpec[];
}

export interface GenerateResult {
  updated_rows: number;
  columns: string[];
}

export interface BBox {
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
}

export interface ColumnValidation {
  name: string;
  kind: ColumnKind;
  null_count: number;
  null_percentage: number;
  inf_count: number | null;
  invalid_count: number | null;
  empty_count: number | null;
  distinct_count: number | null;
  min_value: string | null;
  max_value: string | null;
  mean_value: string | null;
  top_value: string | null;
  top_value_count: number | null;
}

export interface ValidationReport {
  file_id: string;
  row_count: number;
  duplicate_rows: number;
  is_geo: boolean;
  kind_counts: Record<string, number>;
  columns: ColumnValidation[];
}

export type FillStrategy = "mean" | "median" | "mode" | "random";

export interface FillNullsResult {
  column: string;
  strategy: FillStrategy;
  filled_count: number;
}

export interface DeleteNullColumnsResult {
  deleted_columns: string[];
}

export interface RoundFloatsResult {
  decimals: number;
  rounded_columns: string[];
}

export type FilterOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "contains" | "startswith";

export interface FilterSpec {
  column: string;
  op: FilterOp;
  value: unknown;
}

export type SortDir = "asc" | "desc";

export interface GeoFeature {
  rowIndex: number;
  wkt: string;
}

export interface GeometriesResult {
  geometryColumn: string;
  total: number;
  truncated: boolean;
  features: GeoFeature[];
}

export type ExportFormat = "json" | "csv" | "parquet";

export type CreatableColumnKind =
  | "int"
  | "float"
  | "string"
  | "bool"
  | "date"
  | "timestamp"
  | "geometry";

export interface CreateDatasetColumn {
  name: string;
  kind: CreatableColumnKind;
  min_lon?: number;
  max_lon?: number;
  min_lat?: number;
  max_lat?: number;
}

export interface CreateDatasetRequest {
  output_filename: string;
  row_count: number;
  columns: CreateDatasetColumn[];
}

export interface CreateDatasetResult {
  file: FileInfo;
  skipped_columns: number;
}
