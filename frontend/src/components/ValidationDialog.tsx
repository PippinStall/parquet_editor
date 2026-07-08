import { useEffect, useState } from "react";
import { apiErrorMessage, validateFile } from "../api/client";
import type { ValidationReport } from "../types";
import InfoPopover from "./InfoPopover";

export default function ValidationDialog({
  fileId,
  onClose,
}: {
  fileId: string;
  onClose: () => void;
}) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    validateFile(fileId)
      .then(setReport)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [fileId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(1300px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
           <InfoPopover>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Distinct</strong> — number of distinct non-null values.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Min / Max / Mean</strong> — computed from the column's own non-null values;
              only shown for numeric and date/time columns (and min/max for strings, lexically).
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Most frequent</strong> — the most common non-null value, and how many rows
              have it.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Inf / Invalid geometries / Empty geometries</strong> — kind-specific checks:
              infinite floats, and geometries that fail a validity check or have no coordinates.
            </p>
          </InfoPopover>
          <h2 style={{ margin: "0 0 4px" }}>Dataset Analytics</h2>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {loading && <div style={{ color: "#9aa4b2" }}>Validating...</div>}

        {report && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span className="badge">{report.row_count} rows</span>
              <span className="badge">{report.columns.length} columns</span>
              <span className="badge">{report.duplicate_rows} exact duplicate rows</span>
              <span className="badge">{report.is_geo ? "geoparquet" : "parquet"}</span>
              {Object.entries(report.kind_counts)
                .sort((a, b) => b[1] - a[1])
                .map(([kind, count]) => (
                  <span className="badge" key={kind}>
                    {count}× {kind}
                  </span>
                ))}
            </div>
            <p style={{ color: "#9aa4b2", fontSize: 13 }}>
              To fill missing values, use "Generate values" — columns with existing data offer a
              "fill missing values only" option there.
            </p>
            <div className="grid-wrapper" style={{ maxHeight: "55vh" }}>
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Null</th>
                    <th>Null %</th>
                    <th>Distinct</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Mean</th>
                    <th>Most frequent</th>
                    <th>Inf</th>
                    <th>Invalid geometries</th>
                    <th>Empty geometries</th>
                  </tr>
                </thead>
                <tbody>
                  {report.columns.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td>
                        <span className="badge">{c.kind}</span>
                      </td>
                      <td>{c.null_count}</td>
                      <td>{c.null_percentage}%</td>
                      <td>{c.distinct_count ?? "—"}</td>
                      <td>{c.min_value ?? "—"}</td>
                      <td>{c.max_value ?? "—"}</td>
                      <td>{c.mean_value ?? "—"}</td>
                      <td>
                        {c.top_value !== null ? `${c.top_value} (×${c.top_value_count})` : "—"}
                      </td>
                      <td>{c.inf_count ?? "—"}</td>
                      <td>{c.invalid_count ?? "—"}</td>
                      <td>{c.empty_count ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
