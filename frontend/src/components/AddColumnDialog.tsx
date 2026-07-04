import { useState } from "react";
import { addColumn, apiErrorMessage } from "../api/client";
import type { ColumnKind } from "../types";

const ADDABLE_KINDS: { value: ColumnKind; label: string }[] = [
  { value: "int", label: "integer" },
  { value: "float", label: "floating-point number" },
  { value: "string", label: "string" },
  { value: "bool", label: "boolean" },
  { value: "date", label: "date" },
  { value: "timestamp", label: "date & time" },
];

export default function AddColumnDialog({
  fileId,
  onClose,
  onDone,
}: {
  fileId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ColumnKind>("string");
  const [defaultValue, setDefaultValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Please provide a column name");
      return;
    }
    setSubmitting(true);
    try {
      let value: unknown = defaultValue.trim() === "" ? null : defaultValue;
      if (value !== null && kind === "bool") {
        value = defaultValue.trim().toLowerCase() === "true";
      }
      await addColumn(fileId, name.trim(), kind, value);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(420px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Add column</h2>
        {error && <div className="error-banner">{error}</div>}

        <div className="field" style={{ marginBottom: 10 }}>
          Column name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as ColumnKind)}>
            {ADDABLE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          Default value (optional, otherwise null)
          {kind === "bool" ? (
            <select value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)}>
              <option value="">null</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              type={kind === "int" || kind === "float" ? "number" : kind === "date" ? "date" : kind === "timestamp" ? "datetime-local" : "text"}
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
            />
          )}
        </div>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
