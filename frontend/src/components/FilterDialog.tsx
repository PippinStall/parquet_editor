import { useState } from "react";
import type { ColumnInfo, FilterOp, FilterSpec } from "../types";

interface Rule {
  column: string;
  op: FilterOp;
  value: string;
}

const OPS_BY_KIND: Record<string, { value: FilterOp; label: string }[]> = {
  int: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
  ],
  float: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
  ],
  date: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "lt", label: "before" },
    { value: "lte", label: "before or equal" },
    { value: "gt", label: "after" },
    { value: "gte", label: "after or equal" },
  ],
  timestamp: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "lt", label: "before" },
    { value: "lte", label: "before or equal" },
    { value: "gt", label: "after" },
    { value: "gte", label: "after or equal" },
  ],
  string: [
    { value: "eq", label: "=" },
    { value: "contains", label: "contains" },
    { value: "startswith", label: "starts with" },
  ],
  bool: [{ value: "eq", label: "=" }],
};

function rulesFromFilters(filters: FilterSpec[]): Rule[] {
  return filters.map((f) => ({ column: f.column, op: f.op, value: f.value === null || f.value === undefined ? "" : String(f.value) }));
}

export default function FilterDialog({
  columns,
  initialFilters,
  onClose,
  onApply,
}: {
  columns: ColumnInfo[];
  initialFilters: FilterSpec[];
  onClose: () => void;
  onApply: (filters: FilterSpec[]) => void;
}) {
  const filterable = columns.filter((c) => c.kind in OPS_BY_KIND);
  const [rules, setRules] = useState<Rule[]>(
    rulesFromFilters(initialFilters).length > 0
      ? rulesFromFilters(initialFilters)
      : [],
  );

  const kindOf = (columnName: string) => columns.find((c) => c.name === columnName)?.kind;

  const addRule = () => {
    const first = filterable[0];
    if (!first) return;
    setRules((rs) => [...rs, { column: first.name, op: OPS_BY_KIND[first.kind][0].value, value: "" }]);
  };

  const updateRule = (idx: number, patch: Partial<Rule>) => {
    setRules((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRule = (idx: number) => {
    setRules((rs) => rs.filter((_, i) => i !== idx));
  };

  const handleApply = () => {
    const specs: FilterSpec[] = rules
      .filter((r) => r.value.trim() !== "" || kindOf(r.column) === "bool")
      .map((r) => {
        const kind = kindOf(r.column);
        let value: unknown = r.value;
        if (kind === "int" || kind === "float") value = Number(r.value);
        if (kind === "bool") value = r.value === "true";
        return { column: r.column, op: r.op, value };
      });
    onApply(specs);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(640px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Filters</h2>

        {filterable.length === 0 && (
          <p style={{ color: "#9aa4b2" }}>This file has no columns that can be filtered.</p>
        )}

        {rules.map((rule, idx) => {
          const kind = kindOf(rule.column) ?? "string";
          const ops = OPS_BY_KIND[kind] ?? [];
          return (
            <div className="column-spec" key={idx}>
              <div className="params-row" style={{ alignItems: "center" }}>
                <select
                  value={rule.column}
                  onChange={(e) => {
                    const newKind = kindOf(e.target.value) ?? "string";
                    updateRule(idx, { column: e.target.value, op: OPS_BY_KIND[newKind][0].value });
                  }}
                >
                  {filterable.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select value={rule.op} onChange={(e) => updateRule(idx, { op: e.target.value as FilterOp })}>
                  {ops.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {kind === "bool" ? (
                  <select value={rule.value} onChange={(e) => updateRule(idx, { value: e.target.value })}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={
                      kind === "int" || kind === "float"
                        ? "number"
                        : kind === "date"
                          ? "date"
                          : kind === "timestamp"
                            ? "datetime-local"
                            : "text"
                    }
                    value={rule.value}
                    onChange={(e) => updateRule(idx, { value: e.target.value })}
                    placeholder="value"
                  />
                )}

                <button className="danger" type="button" onClick={() => removeRule(idx)}>
                  ×
                </button>
              </div>
            </div>
          );
        })}

        <button className="secondary" type="button" onClick={addRule} disabled={filterable.length === 0}>
          + Add rule
        </button>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="secondary" onClick={() => setRules([])}>
            Clear all
          </button>
          <div className="spacer" />
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
