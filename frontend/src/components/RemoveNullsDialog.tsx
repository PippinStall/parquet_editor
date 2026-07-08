import { useEffect, useState } from "react";
import { apiErrorMessage, deleteNullColumns, validateFile } from "../api/client";
import type { ValidationReport } from "../types";

export default function DeleteNullColumnsDialog({
  fileId,
  onClose,
  onDone,
}: {
  fileId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    validateFile(fileId)
      .then(setReport)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [fileId]);

  const nullColumns = report
    ? report.columns.filter((c) => report.row_count > 0 && c.null_count === report.row_count)
    : [];

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteNullColumns(fileId);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-flex" onClick={(e) => e.stopPropagation()}>
        <h2>Delete null columns</h2>
        {error && <div className="error-banner">{error}</div>}
        {loading && <div style={{ color: "#9aa4b2" }}>Checking columns...</div>}

        {report && !loading && nullColumns.length === 0 && (
          <p style={{ color: "#9aa4b2" }}>No fully-null columns found — nothing to delete.</p>
        )}

        {report && !loading && nullColumns.length > 0 && (
          <>
            <p>
              The following {nullColumns.length} column(s) are 100% null across all{" "}
              {report.row_count} rows and will be permanently deleted:
            </p>
            <div className="modal-scroll">
              <ul style={{ margin: "0 0 4px", paddingLeft: 20 }}>
                {nullColumns.map((c) => (
                  <li key={c.name} style={{ marginBottom: 4 }}>
                    <strong>{c.name}</strong> <span className="badge">{c.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting || loading || nullColumns.length === 0}>
            {deleting ? "Deleting..." : `Delete ${nullColumns.length || ""} column(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
