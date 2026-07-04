import { useRef, useState } from "react";
import { apiErrorMessage, createDataset } from "../api/client";
import type { CreatableColumnKind, CreateDatasetColumn } from "../types";
import { useToast } from "./Toast";

const KIND_OPTIONS: { value: CreatableColumnKind; label: string }[] = [
  { value: "int", label: "integer" },
  { value: "float", label: "floating-point number" },
  { value: "string", label: "string" },
  { value: "bool", label: "boolean" },
  { value: "date", label: "date" },
  { value: "timestamp", label: "date & time" },
];

function isCreatableKind(value: unknown): value is CreatableColumnKind {
  return typeof value === "string" && KIND_OPTIONS.some((o) => o.value === value);
}

export default function CreateDatasetDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [outputFilename, setOutputFilename] = useState("generated_dataset");
  const [rowCount, setRowCount] = useState(100);
  const [columns, setColumns] = useState<CreateDatasetColumn[]>([
    { name: "id", kind: "int" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addColumn = () => {
    setColumns((cs) => [...cs, { name: "", kind: "string" }]);
  };

  const updateColumn = (idx: number, patch: Partial<CreateDatasetColumn>) => {
    setColumns((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeColumn = (idx: number) => {
    setColumns((cs) => cs.filter((_, i) => i !== idx));
  };

  const handleLoadSchemaFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawColumns = Array.isArray(parsed?.columns) ? parsed.columns : null;
      if (!rawColumns) {
        throw new Error('Expected a JSON object with a "columns" array');
      }
      const loaded: CreateDatasetColumn[] = rawColumns
        .filter((c: unknown): c is { name: unknown; kind: unknown } => typeof c === "object" && c !== null)
        .map((c: { name: unknown; kind: unknown }) => ({
          name: String(c.name ?? ""),
          kind: isCreatableKind(c.kind) ? c.kind : "string",
        }))
        .filter((c: CreateDatasetColumn) => c.name.trim() !== "");
      if (loaded.length === 0) {
        throw new Error("No usable columns found in that schema file");
      }
      setColumns(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!outputFilename.trim()) {
      setError("Please provide an output filename");
      return;
    }
    if (!Number.isInteger(rowCount) || rowCount <= 0) {
      setError("Row count must be a positive integer");
      return;
    }
    const cleaned = columns
      .map((c) => ({ name: c.name.trim(), kind: c.kind }))
      .filter((c) => c.name !== "");
    if (cleaned.length === 0) {
      setError("Add at least one column");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createDataset(outputFilename.trim(), rowCount, cleaned);
      showToast(
        result.skipped_columns > 0
          ? `Dataset created. ${result.skipped_columns} column(s) were skipped (unsupported type or duplicate name).`
          : "Dataset created.",
      );
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(680px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Create dataset</h2>
        {error && <div className="error-banner">{error}</div>}

        <p style={{ color: "#9aa4b2", fontSize: 13 }}>
          Define a column schema — either build it below, or load it from a JSON schema file
          (e.g. one exported via "Schema (JSON)" from the editor) — and a new file with
          randomized placeholder values will be created. Geometry columns aren't supported here.
        </p>

        <div className="params-row" style={{ marginBottom: 10 }}>
          <span className="field">
            Output filename
            <input value={outputFilename} onChange={(e) => setOutputFilename(e.target.value)} />
          </span>
          <span className="field">
            Row count
            <input
              type="number"
              min={1}
              value={rowCount}
              onChange={(e) => setRowCount(Number(e.target.value))}
            />
          </span>
          <span className="field">
            Load schema from JSON
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={(e) => handleLoadSchemaFile(e.target.files?.[0])}
            />
          </span>
        </div>

        {columns.map((col, idx) => (
          <div className="column-spec" key={idx}>
            <div className="params-row" style={{ alignItems: "center" }}>
              <span className="field" style={{ flex: 1 }}>
                Name
                <input
                  value={col.name}
                  onChange={(e) => updateColumn(idx, { name: e.target.value })}
                  placeholder="column_name"
                />
              </span>
              <span className="field">
                Type
                <select
                  value={col.kind}
                  onChange={(e) => updateColumn(idx, { kind: e.target.value as CreatableColumnKind })}
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>
              <button className="danger" type="button" onClick={() => removeColumn(idx)}>
                ×
              </button>
            </div>
          </div>
        ))}

        <button className="secondary" type="button" onClick={addColumn}>
          + Add column
        </button>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create dataset"}
          </button>
        </div>
      </div>
    </div>
  );
}
