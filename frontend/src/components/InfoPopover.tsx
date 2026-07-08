import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export default function InfoPopover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className="secondary"
        title="Help"
        aria-label="Help"
        onClick={() => setOpen((o) => !o)}
        style={{
          borderRadius: "50%",
          width: 22,
          height: 22,
          padding: 0,
          lineHeight: "20px",
          fontSize: 12,
          fontWeight: "bold",
        }}
      >
        ?
      </button>
      {open && (
        <div
          className="dropdown-menu"
          style={{ width: 360, padding: "12px 14px", whiteSpace: "normal", fontSize: 13, lineHeight: 1.5 }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
