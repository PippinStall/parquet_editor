import { useState } from "react";
import type { ColumnInfo, RowRecord, SortDir } from "../types";
import CellEditor from "./CellEditor";

interface EditingCell {
  rowIndex: number;
  column: string;
}

const SORTABLE_KINDS = new Set(["int", "float", "string", "bool", "date", "timestamp"]);

export default function DataGrid({
  columns,
  rows,
  loading,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onCellCommit,
  sortBy,
  sortDir,
  onSortChange,
  onDeleteColumn,
  onDeleteRow,
}: {
  columns: ColumnInfo[];
  rows: RowRecord[];
  loading: boolean;
  selected: Set<number>;
  onToggleSelect: (rowIndex: number) => void;
  onToggleSelectAll: (rowIndices: number[], checked: boolean) => void;
  onCellCommit: (rowIndex: number, column: string, value: unknown) => void;
  sortBy?: string;
  sortDir?: SortDir;
  onSortChange?: (column: string) => void;
  onDeleteColumn?: (column: string) => void;
  onDeleteRow?: (rowIndex: number) => void;
}) {
  const [editing, setEditing] = useState<EditingCell | null>(null);

  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.__row_index__));

  return (
    <div>
      <div className="grid-wrapper" style={{ maxHeight: "60vh" }}>
        <table className="data-grid">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={(e) =>
                    onToggleSelectAll(
                      rows.map((r) => r.__row_index__),
                      e.target.checked,
                    )
                  }
                />
              </th>
              <th>#</th>
              {columns.map((col) => {
                const sortable = SORTABLE_KINDS.has(col.kind) && !!onSortChange;
                const isSorted = sortBy === col.name;
                return (
                  <th key={col.name}>
                    <span
                      onClick={sortable ? () => onSortChange!(col.name) : undefined}
                      style={sortable ? { cursor: "pointer" } : undefined}
                      title={sortable ? "Sort" : undefined}
                    >
                      {col.name} <span className="badge">{col.kind}</span>
                      {isSorted && (sortDir === "desc" ? " ↓" : " ↑")}
                    </span>
                    {onDeleteColumn && (
                      <button
                        className="danger"
                        style={{ marginLeft: 6, padding: "0 6px", fontSize: 11 }}
                        title="Delete column"
                        onClick={() => onDeleteColumn(col.name)}
                      >
                        ×
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowIndex = row.__row_index__;
              return (
                <tr key={rowIndex}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(rowIndex)}
                      onChange={() => onToggleSelect(rowIndex)}
                    />
                  </td>
                  <td>
                    {rowIndex}
                    {onDeleteRow && (
                      <button
                        className="danger"
                        style={{ marginLeft: 6, padding: "0 6px", fontSize: 11 }}
                        title="Delete row"
                        onClick={() => onDeleteRow(rowIndex)}
                      >
                        ×
                      </button>
                    )}
                  </td>
                  {columns.map((col) => {
                    const isEditing =
                      editing?.rowIndex === rowIndex && editing?.column === col.name;
                    const value = row[col.name];
                    return (
                      <td
                        key={col.name}
                        className="editable"
                        onDoubleClick={() =>
                          setEditing({ rowIndex, column: col.name })
                        }
                      >
                        {isEditing ? (
                          <CellEditor
                            kind={col.kind}
                            value={value}
                            onCommit={(v) => {
                              setEditing(null);
                              onCellCommit(rowIndex, col.name, v);
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          formatCell(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={columns.length + 2} style={{ color: "#9aa4b2" }}>
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div style={{ marginTop: 8, color: "#9aa4b2" }}>Loading...</div>}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
