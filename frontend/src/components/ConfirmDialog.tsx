import type { ReactNode } from "react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ width: "min(420px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p style={{ color: "#9aa4b2" }}>{message}</p>
        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="spacer" />
          <button className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={danger ? "danger" : undefined} onClick={onConfirm} disabled={busy}>
            {busy ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
