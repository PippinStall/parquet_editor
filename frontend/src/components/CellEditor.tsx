import { useEffect, useRef, useState } from "react";
import type { ColumnKind } from "../types";

function toDatetimeLocal(value: unknown): string {
  if (typeof value !== "string") return "";
  // "2024-01-01T00:00:00.123456" -> "2024-01-01T00:00" (input[type=datetime-local] needs no offset/µs)
  return value.slice(0, 16);
}

export default function CellEditor({
  kind,
  value,
  onCommit,
  onCancel,
}: {
  kind: ColumnKind;
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<string>(
    value === null || value === undefined ? "" : String(value),
  );
  const [checked, setChecked] = useState<boolean>(Boolean(value));
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select?.();
  }, []);

  const commitText = () => onCommit(draft === "" ? null : draft);

  const keyHandlers = {
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commitText();
      if (e.key === "Escape") onCancel();
    },
  };

  if (kind === "bool") {
    return (
      <input
        type="checkbox"
        autoFocus
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          onCommit(e.target.checked);
        }}
        onBlur={onCancel}
      />
    );
  }

  if (kind === "int" || kind === "float") {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="number"
        step={kind === "int" ? 1 : "any"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        {...keyHandlers}
      />
    );
  }

  if (kind === "date") {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="date"
        value={draft.slice(0, 10)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        {...keyHandlers}
      />
    );
  }

  if (kind === "timestamp") {
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="datetime-local"
        step={1}
        value={toDatetimeLocal(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        {...keyHandlers}
      />
    );
  }

  if (kind === "geometry") {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        rows={2}
        value={draft}
        placeholder="WKT, e.g. POINT (30 10)"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitText}
      {...keyHandlers}
    />
  );
}
