"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Option = { id: number; label: string; q?: string };

export function SearchDropdown(props: {
  options: Option[];
  valueId: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { options, valueId, onChange, placeholder, disabled } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => (valueId != null ? options.find((o) => o.id === valueId) ?? null : null),
    [valueId, options]
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options.slice(0, 80);
    const res = options.filter((o) => ((o.q ?? o.label).toLowerCase().includes(qq)));
    return res.slice(0, 80);
  }, [q, options]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: disabled ? "#fafafa" : "white",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {selected ? (
          <span>{selected.label}</span>
        ) : (
          <span style={{ opacity: 0.6 }}>{placeholder ?? "Sélectionner…"}</span>
        )}
      </button>

      {open && !disabled ? (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "white",
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
              style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              autoFocus
            />
          </div>

          <div style={{ maxHeight: 280, overflow: "auto" }}>
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 10px",
                  border: 0,
                  background: valueId === o.id ? "#f6f6f6" : "white",
                  cursor: "pointer",
                  borderBottom: "1px solid #f3f3f3",
                }}
              >
                <div style={{ fontWeight: 600 }}>{o.label}</div>
              </button>
            ))}

            {filtered.length === 0 ? (
              <div style={{ padding: 10, opacity: 0.7 }}>Aucun résultat.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SearchMultiDropdown(props: {
  options: Option[];
  valueIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { options, valueIds, onChange, placeholder, disabled } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const valueSet = useMemo(() => new Set(valueIds), [valueIds]);

  const label = useMemo(() => {
    if (valueIds.length === 0) return placeholder ?? "Sélectionner…";
    const names = valueIds
      .map((id) => options.find((o) => o.id === id)?.label ?? "")
      .filter(Boolean)
      .slice(0, 3);
    const more = valueIds.length > 3 ? ` +${valueIds.length - 3}` : "";
    return names.join(", ") + more;
  }, [valueIds, options, placeholder]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options.slice(0, 120);
    const res = options.filter((o) => ((o.q ?? o.label).toLowerCase().includes(qq)));
    return res.slice(0, 120);
  }, [q, options]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function toggle(id: number) {
    const next = valueSet.has(id) ? valueIds.filter((x) => x !== id) : [...valueIds, id];
    onChange(next);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: disabled ? "#fafafa" : "white",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <span style={{ opacity: valueIds.length ? 1 : 0.6 }}>{label}</span>
      </button>

      {open && !disabled ? (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "white",
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
              style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              autoFocus
            />
          </div>

          <div style={{ maxHeight: 320, overflow: "auto" }}>
            {filtered.map((o) => (
              <label
                key={o.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 10px",
                  borderBottom: "1px solid #f3f3f3",
                  cursor: "pointer",
                  alignItems: "center",
                }}
              >
                <input type="checkbox" checked={valueSet.has(o.id)} onChange={() => toggle(o.id)} />
                <div style={{ fontWeight: 600 }}>{o.label}</div>
              </label>
            ))}
            {filtered.length === 0 ? <div style={{ padding: 10, opacity: 0.7 }}>Aucun résultat.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}