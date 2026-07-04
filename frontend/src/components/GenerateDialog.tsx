import { useState } from "react";
import { apiErrorMessage, generateValues } from "../api/client";
import type { BBox, ColumnInfo, GenerateColumnSpec, GeoFeature, RowRecord } from "../types";
import GeoMap from "./GeoMap";

function rowsToFeatures(rows: RowRecord[], column: string): GeoFeature[] {
  return rows
    .filter((r) => typeof r[column] === "string")
    .map((r) => ({ rowIndex: r.__row_index__, wkt: r[column] as string }));
}

type Draft = Record<string, string>;

const KIND_LABEL: Record<string, string> = {
  int: "integer",
  float: "floating-point number",
  string: "string",
  bool: "boolean",
  date: "date",
  timestamp: "date & time",
  geometry: "geometry",
  other: "other",
};

function buildParams(col: ColumnInfo, draft: Draft): Record<string, unknown> {
  switch (col.kind) {
    case "int":
    case "float":
      return { min: Number(draft.min), max: Number(draft.max) };
    case "bool":
      return { true_ratio: Number(draft.true_ratio ?? "50") / 100 };
    case "string":
      return {
        choices: (draft.choices ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      };
    case "date":
    case "timestamp":
      return { min: draft.min, max: draft.max };
    case "geometry":
      return {
        min_lon: Number(draft.min_lon),
        max_lon: Number(draft.max_lon),
        min_lat: Number(draft.min_lat),
        max_lat: Number(draft.max_lat),
      };
    default:
      return {};
  }
}

function validate(col: ColumnInfo, draft: Draft): string | null {
  switch (col.kind) {
    case "int":
    case "float":
      if (draft.min === undefined || draft.max === undefined || draft.min === "" || draft.max === "")
        return `${col.name}: please provide min and max`;
      if (Number(draft.min) > Number(draft.max)) return `${col.name}: min must be <= max`;
      return null;
    case "string":
      if (!draft.choices || draft.choices.trim() === "")
        return `${col.name}: please provide a comma-separated list of values`;
      return null;
    case "date":
    case "timestamp":
      if (!draft.min || !draft.max) return `${col.name}: please provide a date range`;
      return null;
    case "geometry":
      if (["min_lon", "max_lon", "min_lat", "max_lat"].some((k) => !draft[k]))
        return `${col.name}: please provide a bbox (you can draw it on the map)`;
      return null;
    case "other":
      return `${col.name}: generation is not supported for this type`;
    default:
      return null;
  }
}

export default function GenerateDialog({
  fileId,
  columns,
  rows,
  selectedRows,
  onClose,
  onDone,
}: {
  fileId: string;
  columns: ColumnInfo[];
  rows: RowRecord[];
  selectedRows: Set<number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const generatable = columns.filter((c) => c.kind !== "other");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapForColumn, setMapForColumn] = useState<string | null>(null);

  const toggleColumn = (name: string, checked: boolean) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const updateDraft = (name: string, field: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [name]: { ...(prev[name] ?? {}), [field]: value },
    }));
  };

  const handleBBoxDrawn = (name: string, bbox: BBox) => {
    setDrafts((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] ?? {}),
        min_lon: String(bbox.min_lon.toFixed(6)),
        max_lon: String(bbox.max_lon.toFixed(6)),
        min_lat: String(bbox.min_lat.toFixed(6)),
        max_lat: String(bbox.max_lat.toFixed(6)),
      },
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (selectedColumns.size === 0) {
      setError("Select at least one column");
      return;
    }
    if (scope === "selected" && selectedRows.size === 0) {
      setError("No rows selected — check some rows in the table, or choose 'All rows'");
      return;
    }

    const specs: GenerateColumnSpec[] = [];
    for (const name of selectedColumns) {
      const col = columns.find((c) => c.name === name)!;
      const draft = drafts[name] ?? {};
      const validationError = validate(col, draft);
      if (validationError) {
        setError(validationError);
        return;
      }
      specs.push({ name, kind: col.kind, params: buildParams(col, draft) });
    }

    setSubmitting(true);
    try {
      await generateValues(fileId, {
        target:
          scope === "all"
            ? { scope: "all", row_indices: [] }
            : { scope: "selected", row_indices: Array.from(selectedRows) },
        columns: specs,
      });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Auto-generate values</h2>
        {error && <div className="error-banner">{error}</div>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>
            <input
              type="radio"
              checked={scope === "all"}
              onChange={() => setScope("all")}
            />{" "}
            All rows
          </label>{" "}
          <label style={{ marginLeft: 16 }}>
            <input
              type="radio"
              checked={scope === "selected"}
              onChange={() => setScope("selected")}
            />{" "}
            Selected rows only ({selectedRows.size})
          </label>
        </div>

        <div>
          {generatable.map((col) => {
            const isSelected = selectedColumns.has(col.name);
            const draft = drafts[col.name] ?? {};
            return (
              <div className="column-spec" key={col.name}>
                <label>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => toggleColumn(col.name, e.target.checked)}
                  />{" "}
                  <strong>{col.name}</strong>{" "}
                  <span className="badge">{KIND_LABEL[col.kind] ?? col.kind}</span>
                </label>

                {isSelected && (
                  <div className="params-row">
                    {(col.kind === "int" || col.kind === "float") && (
                      <>
                        <span className="field">
                          min
                          <input
                            type="number"
                            value={draft.min ?? ""}
                            onChange={(e) => updateDraft(col.name, "min", e.target.value)}
                          />
                        </span>
                        <span className="field">
                          max
                          <input
                            type="number"
                            value={draft.max ?? ""}
                            onChange={(e) => updateDraft(col.name, "max", e.target.value)}
                          />
                        </span>
                      </>
                    )}

                    {col.kind === "bool" && (
                      <span className="field">
                        % of values that are true
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={draft.true_ratio ?? "50"}
                          onChange={(e) => updateDraft(col.name, "true_ratio", e.target.value)}
                        />
                      </span>
                    )}

                    {col.kind === "string" && (
                      <span className="field" style={{ flex: 1 }}>
                        comma-separated list of values
                        <textarea
                          rows={2}
                          placeholder="A, B, C"
                          value={draft.choices ?? ""}
                          onChange={(e) => updateDraft(col.name, "choices", e.target.value)}
                        />
                      </span>
                    )}

                    {(col.kind === "date" || col.kind === "timestamp") && (
                      <>
                        <span className="field">
                          from
                          <input
                            type={col.kind === "date" ? "date" : "datetime-local"}
                            value={draft.min ?? ""}
                            onChange={(e) => updateDraft(col.name, "min", e.target.value)}
                          />
                        </span>
                        <span className="field">
                          to
                          <input
                            type={col.kind === "date" ? "date" : "datetime-local"}
                            value={draft.max ?? ""}
                            onChange={(e) => updateDraft(col.name, "max", e.target.value)}
                          />
                        </span>
                      </>
                    )}

                    {col.kind === "geometry" && (
                      <>
                        <span className="field">
                          min_lon
                          <input
                            type="number"
                            value={draft.min_lon ?? ""}
                            onChange={(e) => updateDraft(col.name, "min_lon", e.target.value)}
                          />
                        </span>
                        <span className="field">
                          min_lat
                          <input
                            type="number"
                            value={draft.min_lat ?? ""}
                            onChange={(e) => updateDraft(col.name, "min_lat", e.target.value)}
                          />
                        </span>
                        <span className="field">
                          max_lon
                          <input
                            type="number"
                            value={draft.max_lon ?? ""}
                            onChange={(e) => updateDraft(col.name, "max_lon", e.target.value)}
                          />
                        </span>
                        <span className="field">
                          max_lat
                          <input
                            type="number"
                            value={draft.max_lat ?? ""}
                            onChange={(e) => updateDraft(col.name, "max_lat", e.target.value)}
                          />
                        </span>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() =>
                            setMapForColumn(mapForColumn === col.name ? null : col.name)
                          }
                        >
                          {mapForColumn === col.name ? "Hide map" : "Draw bbox on map"}
                        </button>
                        {mapForColumn === col.name && (
                          <div style={{ width: "100%" }}>
                            <GeoMap
                              features={rowsToFeatures(rows, col.name)}
                              onBBoxDrawn={(bbox) => handleBBoxDrawn(col.name, bbox)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
