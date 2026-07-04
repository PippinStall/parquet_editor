import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export interface DropdownItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export default function DropdownMenu({
  label,
  items,
  children,
  buttonClassName = "secondary",
}: {
  label: string;
  items?: DropdownItem[];
  children?: ReactNode;
  buttonClassName?: string;
}) {
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
      <button className={buttonClassName} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className="dropdown-menu">
          {children ??
            items?.map((item) =>
              item.href ? (
                <a key={item.label} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {item.label}
                </button>
              ),
            )}
        </div>
      )}
    </div>
  );
}
