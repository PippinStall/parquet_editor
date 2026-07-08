import { useCallback, useEffect, useState } from "react";
import {
  apiErrorMessage,
  deleteColumn,
  deleteRow,
  downloadFileUrl,
  exportFileUrl,
  exportSchemaUrl,
  getBbox,
  getGeometries,
  getRows,
  getSchema,
  patchCell,
  saveFile,
} from "../api/client";
import type {
  BBox,
  FileInfo,
  FilterSpec,
  GeoFeature,
  RowRecord,
  SchemaResponse,
  SortDir,
} from "../types";
import AddColumnDialog from "./AddColumnDialog";
import ConfirmDialog from "./ConfirmDialog";
import DataGrid from "./DataGrid";
import DropdownMenu from "./DropdownMenu";
import FilterDialog from "./FilterDialog";
import GenerateDialog from "./GenerateDialog";
import GeoMap from "./GeoMap";
import { useToast } from "./Toast";
import ValidationDialog from "./ValidationDialog";
import DeleteNullColumnsDialog from "./RemoveNullsDialog";

const PAGE_SIZE = 50;

type MapMode = "all" | "selected" | "viewed";

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
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showGenerate, setShowGenerate] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDeleteNullColumns, setShowDeleteNullColumns] = useState(false);
  const [saving, setSaving] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterSpec[]>([]);

  const [mapVisible, setMapVisible] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("viewed");
  const [mapFeatures, setMapFeatures] = useState<GeoFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapTruncated, setMapTruncated] = useState(false);

  const [showBbox, setShowBbox] = useState(false);
  const [datasetBbox, setDatasetBbox] = useState<BBox | null>(null);
  const [bboxLoading, setBboxLoading] = useState(false);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [columnFilterText, setColumnFilterText] = useState("");

  const [confirmDeleteColumn, setConfirmDeleteColumn] = useState<string | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<number | null>(null);
  const [deletingColumn, setDeletingColumn] = useState(false);
  const [deletingRow, setDeletingRow] = useState(false);

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
    if (!mapVisible || !geometryColumn) return;

    if (mapMode === "viewed") {
      setMapFeatures(rowsToFeatures(rows, geometryColumn));
      setMapTruncated(false);
      return;
    }

    if (mapMode === "selected" && selected.size === 0) {
      setMapFeatures([]);
      setMapTruncated(false);
      return;
    }

    let cancelled = false;
    setMapLoading(true);
    getGeometries(file.file_id, mapMode, mapMode === "selected" ? Array.from(selected) : undefined)
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
  }, [mapVisible, mapMode, geometryColumn, file.file_id, rows, selected]);

  const loadBbox = useCallback(async () => {
    if (!geometryColumn) return;
    setBboxLoading(true);
    try {
      setDatasetBbox(await getBbox(file.file_id));
    } catch (err) {
      setError(apiErrorMessage(err));
      setDatasetBbox(null);
    } finally {
      setBboxLoading(false);
    }
  }, [file.file_id, geometryColumn]);

  useEffect(() => {
    if (showBbox) loadBbox();
    else setDatasetBbox(null);
  }, [showBbox, loadBbox]);

  const handleCellCommit = async (rowIndex: number, column: string, value: unknown) => {
    const prevRows = rows;
    setRows((rs) =>
      rs.map((r) => (r.__row_index__ === rowIndex ? { ...r, [column]: value } : r)),
    );
    try {
      await patchCell(file.file_id, rowIndex, column, value);
      if (showBbox && column === geometryColumn) loadBbox();
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
    try {
      await saveFile(file.file_id);
      showToast("File saved to disk.");
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

  const confirmDeleteColumnNow = async () => {
    if (!confirmDeleteColumn) return;
    const column = confirmDeleteColumn;
    setError(null);
    setDeletingColumn(true);
    try {
      await deleteColumn(file.file_id, column);
      if (sortBy === column) setSortBy(undefined);
      setHiddenColumns((prev) => {
        if (!prev.has(column)) return prev;
        const next = new Set(prev);
        next.delete(column);
        return next;
      });
      await loadSchema();
      await loadRows();
      setConfirmDeleteColumn(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDeletingColumn(false);
    }
  };

  const confirmDeleteRowNow = async () => {
    if (confirmDeleteRow === null) return;
    const rowIndex = confirmDeleteRow;
    setError(null);
    setDeletingRow(true);
    try {
      await deleteRow(file.file_id, rowIndex);
      setSelected((prev) => {
        if (!prev.has(rowIndex)) return prev;
        const next = new Set(prev);
        next.delete(rowIndex);
        return next;
      });
      await loadRows();
      setConfirmDeleteRow(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDeletingRow(false);
    }
  };

  const toggleColumnVisibility = (column: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) next.delete(column);
      else next.add(column);
      return next;
    });
  };

  const visibleColumns = schema?.columns.filter((c) => !hiddenColumns.has(c.name)) ?? [];

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
        {hiddenColumns.size > 0 && (
          <span className="badge">columns hidden: {hiddenColumns.size}</span>
        )}
        <div className="spacer" />
        {schema && (
          <DropdownMenu label="Columns">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 300, padding: "2px 4px" }}>
              <input
                placeholder="Filter columns..."
                value={columnFilterText}
                onChange={(e) => setColumnFilterText(e.target.value)}
                autoFocus
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="secondary" style={{ flex: 1 }} onClick={() => setHiddenColumns(new Set())}>
                  Show all
                </button>
                <button
                  className="secondary"
                  style={{ flex: 1 }}
                  onClick={() => setHiddenColumns(new Set(schema.columns.map((c) => c.name)))}
                >
                  Hide all
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
                {schema.columns
                  .filter((c) => c.name.toLowerCase().includes(columnFilterText.toLowerCase()))
                  .map((c) => (
                    <label
                      key={c.name}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has(c.name)}
                        onChange={() => toggleColumnVisibility(c.name)}
                      />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          </DropdownMenu>
        )}
        <input
          placeholder="Search all columns..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ minWidth: 320 }}
        />
        <button className="secondary" onClick={() => setShowFilters(true)}>
          Filter
        </button>
      </div>

      <div className="toolbar">
        {geometryColumn && (
          <>
            <button className="secondary" onClick={() => setMapVisible((v) => !v)}>
              {mapVisible ? "Hide map" : "Show map"}
            </button>
            {mapVisible && (
              <>
                <DropdownMenu
                  label={
                    mapMode === "selected"
                      ? "Show Selected"
                      : mapMode === "all"
                        ? "Show all"
                        : "Show viewed page"
                  }
                  items={[
                    { label: "Show viewed page", onClick: () => setMapMode("viewed") },
                    { label: "Show Selected", onClick: () => setMapMode("selected") },
                    { label: "Show all", onClick: () => setMapMode("all") },
                  ]}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={showBbox}
                    onChange={(e) => setShowBbox(e.target.checked)}
                  />
                  Show bbox
                </label>
              </>
            )}
            {mapLoading && <span className="badge">loading geometries...</span>}
            {mapTruncated && <span className="badge">not all geometries shown (limit reached)</span>}
            {bboxLoading && <span className="badge">computing bbox...</span>}
          </>
        )}
        <div className="spacer" />
        <DropdownMenu
          label="Dataset tools"
          items={[
            { label: "Validate file", onClick: () => setShowValidation(true) },
            { label: "Add column", onClick: () => setShowAddColumn(true) },
            { label: "Generate values", onClick: () => setShowGenerate(true) },
            { label: "Delete null columns", onClick: () => setShowDeleteNullColumns(true) },
          ]}
        />
        <DropdownMenu
          label="Export"
          items={[
            { label: "JSON", href: exportFileUrl(file.file_id, "json") },
            { label: "CSV", href: exportFileUrl(file.file_id, "csv") },
            { label: "Parquet", href: exportFileUrl(file.file_id, "parquet") },
            { label: "Schema (JSON)", href: exportSchemaUrl(file.file_id) },
            { label: "Original file", href: downloadFileUrl(file.file_id) },
          ]}
        />
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {mapVisible && geometryColumn && (
        <GeoMap features={mapFeatures} bbox={showBbox ? datasetBbox : null} />
      )}

      {schema && (
        <DataGrid
          columns={visibleColumns}
          rows={rows}
          loading={loading}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onCellCommit={handleCellCommit}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onDeleteColumn={(column) => setConfirmDeleteColumn(column)}
          onDeleteRow={(rowIndex) => setConfirmDeleteRow(rowIndex)}
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
            showToast("Values generated.");
            loadRows();
            if (showBbox) loadBbox();
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
            showToast("Column added.");
            loadSchema();
            loadRows();
          }}
        />
      )}

      {showDeleteNullColumns && (
        <DeleteNullColumnsDialog
          fileId={file.file_id}
          onClose={() => setShowDeleteNullColumns(false)}
          onDone={() => {
            setShowDeleteNullColumns(false);
            showToast("Null columns deleted.");
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

      {confirmDeleteColumn && (
        <ConfirmDialog
          title="Delete column"
          message={`Delete column "${confirmDeleteColumn}"? This cannot be undone.`}
          busy={deletingColumn}
          onCancel={() => setConfirmDeleteColumn(null)}
          onConfirm={confirmDeleteColumnNow}
        />
      )}

      {confirmDeleteRow !== null && (
        <ConfirmDialog
          title="Delete row"
          message={`Delete row #${confirmDeleteRow}? This cannot be undone.`}
          busy={deletingRow}
          onCancel={() => setConfirmDeleteRow(null)}
          onConfirm={confirmDeleteRowNow}
        />
      )}
    </div>
  );
}
