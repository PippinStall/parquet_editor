import { useState } from "react";
import { apiErrorMessage, mergeFiles } from "../api/client";
import type { FileInfo } from "../types";

type DedupMode = "exact" | "key";

export default function MergeDialog({
  files,
  onClose,
  onDone,
}: {
  files: FileInfo[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [outputFilename, setOutputFilename] = useState("merged");
  const [dedupMode, setDedupMode] = useState<DedupMode>("exact");
  const [keyColumns, setKeyColumns] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!outputFilename.trim()) {
      setError("Please provide an output filename");
      return;
    }
    const dedupBy =
      dedupMode === "key"
        ? keyColumns
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];
    if (dedupMode === "key" && dedupBy.length === 0) {
      setError("Please provide at least one key column");
      return;
    }
    setSubmitting(true);
    try {
      await mergeFiles(
        files.map((f) => f.file_id),
        outputFilename.trim(),
        dedupBy,
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
      <div className="modal" style={{ width: "min(520px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Merge files</h2>
        {error && <div className="error-banner">{error}</div>}

        <p style={{ color: "#9aa4b2", fontSize: 13 }}>
          Columns are unioned — if a column is missing from one of the files, it's null there.
        </p>

        <ul style={{ marginBottom: 12 }}>
          {files.map((f) => (
            <li key={f.file_id}>
              {f.filename} <span className="badge">{f.is_geo ? "geoparquet" : "parquet"}</span>
            </li>
          ))}
        </ul>

        <div className="field" style={{ marginBottom: 10 }}>
          Output filename
          <input
            value={outputFilename}
            onChange={(e) => setOutputFilename(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          Deduplication rule
          <label style={{ marginTop: 4 }}>
            <input
              type="radio"
              checked={dedupMode === "exact"}
              onChange={() => setDedupMode("exact")}
            />{" "}
            Exact match across all columns
          </label>
          <label>
            <input
              type="radio"
              checked={dedupMode === "key"}
              onChange={() => setDedupMode("key")}
            />{" "}
            By key columns — non-null values take priority
          </label>
        </div>

        {dedupMode === "key" && (
          <div className="field" style={{ marginBottom: 10 }}>
            Key columns (comma-separated, e.g. id)
            <input
              value={keyColumns}
              onChange={(e) => setKeyColumns(e.target.value)}
              placeholder="id"
            />
            <span style={{ color: "#9aa4b2", fontSize: 12 }}>
              Rows sharing the same key value are merged into one: for each column, the
              first non-null value among the matching rows is kept.
            </span>
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting || files.length < 2}>
            {submitting ? "Merging..." : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
