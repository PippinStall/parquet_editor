import { useEffect, useState } from "react";
import { apiErrorMessage, fillNulls, validateFile } from "../api/client";
import type { ColumnKind, FillStrategy, ValidationReport } from "../types";

const MEAN_MEDIAN_KINDS = new Set<ColumnKind>(["int", "float", "date", "timestamp"]);

function strategyOptions(kind: ColumnKind): { value: FillStrategy; label: string }[] {
  const opts: { value: FillStrategy; label: string }[] = [];
  if (MEAN_MEDIAN_KINDS.has(kind)) {
    opts.push({ value: "mean", label: "mean" });
    opts.push({ value: "median", label: "median" });
  }
  opts.push({ value: "mode", label: "most frequent value" });
  opts.push({ value: "random", label: "random from existing values" });
  return opts;
}

export default function ValidationDialog({
  fileId,
  onClose,
  onDataChanged,
}: {
  fileId: string;
  onClose: () => void;
  onDataChanged?: () => void;
}) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [strategyByColumn, setStrategyByColumn] = useState<Record<string, FillStrategy>>({});
  const [fillingColumn, setFillingColumn] = useState<string | null>(null);
  const [fillMessage, setFillMessage] = useState<string | null>(null);

  const loadReport = () => {
    setLoading(true);
    return validateFile(fileId)
      .then(setReport)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const handleFill = async (column: string, kind: ColumnKind) => {
    const strategy = strategyByColumn[column] ?? strategyOptions(kind)[0].value;
    setError(null);
    setFillMessage(null);
    setFillingColumn(column);
    try {
      const result = await fillNulls(fileId, column, strategy);
      setFillMessage(`"${column}": filled ${result.filled_count} value(s)`);
      await loadReport();
      onDataChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setFillingColumn(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(1200px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Validate file</h2>
        {error && <div className="error-banner">{error}</div>}
        {fillMessage && (
          <div
            className="error-banner"
            style={{ background: "#173a2b", borderColor: "#1f6b41", color: "#bbf7d0" }}
          >
            {fillMessage}
          </div>
        )}
        {loading && <div style={{ color: "#9aa4b2" }}>Validating...</div>}

        {report && (
          <>
            <p>
              Rows: <strong>{report.row_count}</strong> · Exact duplicate rows:{" "}
              <strong>{report.duplicate_rows}</strong>
            </p>
            <div className="grid-wrapper" style={{ maxHeight: "50vh" }}>
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Null</th>
                    <th>Null %</th>
                    <th>Inf</th>
                    <th>Invalid geometries</th>
                    <th>Empty geometries</th>
                    <th>Fill nulls</th>
                  </tr>
                </thead>
                <tbody>
                  {report.columns.map((c) => {
                    const fillable =
                      c.kind !== "geometry" && c.null_count > 0 && c.null_count < report.row_count;
                    const options = strategyOptions(c.kind);
                    const currentStrategy = strategyByColumn[c.name] ?? options[0].value;
                    return (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>
                          <span className="badge">{c.kind}</span>
                        </td>
                        <td>{c.null_count}</td>
                        <td>{c.null_percentage}%</td>
                        <td>{c.inf_count ?? "—"}</td>
                        <td>{c.invalid_count ?? "—"}</td>
                        <td>{c.empty_count ?? "—"}</td>
                        <td>
                          {fillable ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <select
                                value={currentStrategy}
                                onChange={(e) =>
                                  setStrategyByColumn((prev) => ({
                                    ...prev,
                                    [c.name]: e.target.value as FillStrategy,
                                  }))
                                }
                              >
                                {options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="secondary"
                                disabled={fillingColumn === c.name}
                                onClick={() => handleFill(c.name, c.kind)}
                              >
                                {fillingColumn === c.name ? "..." : "Fill"}
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: "#9aa4b2" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
