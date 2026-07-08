import { useState } from "react";
import { apiErrorMessage, roundFloats } from "../api/client";

export default function RoundFloatsDialog({
  fileId,
  onClose,
  onDone,
}: {
  fileId: string;
  onClose: () => void;
  onDone: (roundedColumns: string[]) => void;
}) {
  const [decimals, setDecimals] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!Number.isInteger(decimals)) {
      setError("Please provide a whole number of decimal places");
      return;
    }
    setSubmitting(true);
    try {
      const result = await roundFloats(fileId, decimals);
      onDone(result.rounded_columns);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(420px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Round float columns</h2>
        {error && <div className="error-banner">{error}</div>}

        <p style={{ color: "#9aa4b2", fontSize: 13 }}>
          Rounds every float-kind column in the file to the given number of decimal places.
        </p>

        <div className="field" style={{ marginBottom: 10 }}>
          Decimal places
          <input
            type="number"
            step={1}
            value={decimals}
            onChange={(e) => setDecimals(Number(e.target.value))}
            autoFocus
          />
        </div>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Rounding..." : "Round"}
          </button>
        </div>
      </div>
    </div>
  );
}
