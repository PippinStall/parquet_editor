import { useCallback, useEffect, useState } from "react";
import {
  apiErrorMessage,
  deleteColumn,
  downloadFileUrl,
  exportFileUrl,
  getGeometries,
  getRows,
  getSchema,
  patchCell,
  saveFile,
} from "../api/client";
import type {
  ExportFormat,
  FileInfo,
  FilterSpec,
  GeoFeature,
  RowRecord,
  SchemaResponse,
  SortDir,
} from "../types";
import AddColumnDialog from "./AddColumnDialog";
import DataGrid from "./DataGrid";
import FilterDialog from "./FilterDialog";
import GenerateDialog from "./GenerateDialog";
import GeoMap from "./GeoMap";
import ValidationDialog from "./ValidationDialog";

const PAGE_SIZE = 50;

type MapScope = "page" | "selected" | "all";

function rowsToFeatures(rows: RowRecord[], column: string): GeoFeature[] {
  return rows
    .filter((r) => typeof r[column] === "string")
    .map((r) => ({ rowIndex: r.__row_index__, wkt: r[column] as string }));
}

export default function Editor({
  file,
  onClose,
}: {
  file: FileInfo;
  onClose: () => void;
}) {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(file.row_count ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showGenerate, setShowGenerate] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [saving, setSaving] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterSpec[]>([]);

  const [mapScope, setMapScope] = useState<MapScope | null>(null);
  const [mapFeatures, setMapFeatures] = useState<GeoFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapTruncated, setMapTruncated] = useState(false);

  // Debounce the free-text search box so we don't re-query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadSchema = useCallback(async () => {
    try {
      setSchema(await getSchema(file.file_id));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [file.file_id]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRows(file.file_id, page, PAGE_SIZE, {
        sortBy,
        sortDir,
        search,
        filters,
      });
      setRows(data.rows);
      setTotalRows(data.total_rows);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [file.file_id, page, sortBy, sortDir, search, filters]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const geometryColumn = schema?.columns.find((c) => c.kind === "geometry")?.name;

  useEffect(() => {
    if (!mapScope || !geometryColumn) return;

    if (mapScope === "page") {
      setMapFeatures(rowsToFeatures(rows, geometryColumn));
      setMapTruncated(false);
      return;
    }

    if (mapScope === "selected" && selected.size === 0) {
      setMapFeatures([]);
      setMapTruncated(false);
      return;
    }

    let cancelled = false;
    setMapLoading(true);
    getGeometries(file.file_id, mapScope, mapScope === "selected" ? Array.from(selected) : undefined)
      .then((res) => {
        if (cancelled) return;
        setMapFeatures(res.features);
        setMapTruncated(res.truncated);
      })
      .catch((err) => !cancelled && setError(apiErrorMessage(err)))
      .finally(() => !cancelled && setMapLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapScope, geometryColumn, file.file_id, rows, selected]);

  const handleCellCommit = async (rowIndex: number, column: string, value: unknown) => {
    const prevRows = rows;
    setRows((rs) =>
      rs.map((r) => (r.__row_index__ === rowIndex ? { ...r, [column]: value } : r)),
    );
    try {
      await patchCell(file.file_id, rowIndex, column, value);
    } catch (err) {
      setError(apiErrorMessage(err));
      setRows(prevRows);
    }
  };

  const toggleSelect = (rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const toggleSelectAll = (rowIndices: number[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const idx of rowIndices) {
        if (checked) next.add(idx);
        else next.delete(idx);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveFile(file.file_id);
      setMessage("File saved to disk.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSortChange = (column: string) => {
    setPage(0);
    setSortBy((prev) => {
      if (prev !== column) {
        setSortDir("asc");
        return column;
      }
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return column;
    });
  };

  const handleDeleteColumn = async (column: string) => {
    if (!confirm(`Delete column "${column}"?`)) return;
    setError(null);
    try {
      await deleteColumn(file.file_id, column);
      if (sortBy === column) setSortBy(undefined);
      await loadSchema();
      await loadRows();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const handleExport = (format: ExportFormat) => {
    window.open(exportFileUrl(file.file_id, format), "_blank");
  };

  return (
    <div>
      <div className="toolbar">
        <button className="secondary" onClick={onClose}>
          ← Files
        </button>
        <strong>{file.filename}</strong>
        <span className="badge">{file.is_geo ? "geoparquet" : "parquet"}</span>
        <span className="badge">{totalRows} rows</span>
        {selected.size > 0 && (
          <span className="badge">selected: {selected.size}</span>
        )}
        {filters.length > 0 && (
          <span className="badge">filters: {filters.length}</span>
        )}
        <div className="spacer" />
        <input
          placeholder="Search all columns..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <button className="secondary" onClick={() => setShowFilters(true)}>
          Filters
        </button>
        <button className="secondary" onClick={() => setShowValidation(true)}>
          Validate file
        </button>
        <button className="secondary" onClick={() => setShowAddColumn(true)}>
          Add column
        </button>
        <button className="secondary" onClick={() => setShowGenerate(true)}>
          Generate values
        </button>
      </div>

      <div className="toolbar">
        {geometryColumn && (
          <>
            <span className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              Map:
              <select
                value={mapScope ?? ""}
                onChange={(e) => setMapScope((e.target.value || null) as MapScope | null)}
              >
                <option value="">Hidden</option>
                <option value="page">Current page</option>
                <option value="selected">Selected rows</option>
                <option value="all">All rows</option>
              </select>
            </span>
            {mapLoading && <span className="badge">loading geometries...</span>}
            {mapTruncated && <span className="badge">not all geometries shown (limit reached)</span>}
          </>
        )}
        <div className="spacer" />
        <span className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          Export:
          <button className="secondary" onClick={() => handleExport("json")}>
            JSON
          </button>
          <button className="secondary" onClick={() => handleExport("csv")}>
            CSV
          </button>
          <button className="secondary" onClick={() => handleExport("parquet")}>
            Parquet
          </button>
        </span>
        <a href={downloadFileUrl(file.file_id)}>
          <button className="secondary">Download original</button>
        </a>
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && (
        <div className="error-banner" style={{ background: "#173a2b", borderColor: "#1f6b41", color: "#bbf7d0" }}>
          {message}
        </div>
      )}

      {mapScope && geometryColumn && <GeoMap features={mapFeatures} />}

      {schema && (
        <DataGrid
          columns={schema.columns}
          rows={rows}
          loading={loading}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onCellCommit={handleCellCommit}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onDeleteColumn={handleDeleteColumn}
        />
      )}

      <div className="pagination">
        <button
          className="secondary"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Back
        </button>
        <span>
          Page {page + 1} of {totalPages}
        </span>
        <button
          className="secondary"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {showGenerate && schema && (
        <GenerateDialog
          fileId={file.file_id}
          columns={schema.columns}
          rows={rows}
          selectedRows={selected}
          onClose={() => setShowGenerate(false)}
          onDone={() => {
            setShowGenerate(false);
            setMessage("Values generated.");
            loadRows();
          }}
        />
      )}

      {showValidation && (
        <ValidationDialog
          fileId={file.file_id}
          onClose={() => setShowValidation(false)}
          onDataChanged={loadRows}
        />
      )}

      {showAddColumn && (
        <AddColumnDialog
          fileId={file.file_id}
          onClose={() => setShowAddColumn(false)}
          onDone={() => {
            setShowAddColumn(false);
            setMessage("Column added.");
            loadSchema();
            loadRows();
          }}
        />
      )}

      {showFilters && schema && (
        <FilterDialog
          columns={schema.columns}
          initialFilters={filters}
          onClose={() => setShowFilters(false)}
          onApply={(newFilters) => {
            setFilters(newFilters);
            setPage(0);
            setShowFilters(false);
          }}
        />
      )}
    </div>
  );
}
