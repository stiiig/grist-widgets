// src/app/widgets/emile-react/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { initGristOrMock } from "@/lib/grist/init";
import {
  buildColRowIdMap,
  decodeListCell,
  encodeListCell,
  ensureRefCache,
  GristDocAPI,
  isEditable,
  loadColumnsMetaFor,
  ColMeta,
  isoDateToUnixSeconds,
  unixSecondsToISODate,
} from "@/lib/grist/meta";

const TABLE_ID = "CANDIDATS"; // <- à adapter

type CandidateRow = { id: number; [k: string]: any };

function pickFirstCol(table: any, preferred: string[]): string | null {
  const keys = Object.keys(table || {}).filter((k) => k !== "id");
  for (const p of preferred) if (keys.includes(p)) return p;
  return keys[0] ?? null;
}

export default function Page() {
  const [mode, setMode] = useState<string>("boot");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  const [cols, setCols] = useState<ColMeta[]>([]);
  const [colRowIdMap, setColRowIdMap] = useState<Map<number, { colId: string }>>(new Map());

  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [labelCol, setLabelCol] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  // local draft values (what we will write to Grist on Save)
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      const init = await initGristOrMock();
      setMode(init.mode);
      if (init.docApi) setDocApi(init.docApi as any);
    })();
  }, []);

  useEffect(() => {
    if (!docApi) return;
    (async () => {
      setStatus("Chargement métadonnées…");
      const [meta, map] = await Promise.all([
        loadColumnsMetaFor(docApi, TABLE_ID),
        buildColRowIdMap(docApi),
      ]);
      setCols(meta);
      setColRowIdMap(map);
      setStatus("");
    })().catch((e) => setStatus(String(e?.message || e)));
  }, [docApi]);

  useEffect(() => {
    if (!docApi) return;
    (async () => {
      setStatus("Chargement candidats…");
      const t = await docApi.fetchTable(TABLE_ID);
      const lc = pickFirstCol(t, ["Nom", "nom", "Label", "label", "Prenom", "Prénom", "Identite"]);
      setLabelCol(lc);

      const out: CandidateRow[] = [];
      for (let i = 0; i < t.id.length; i++) {
        const r: CandidateRow = { id: t.id[i] };
        for (const k of Object.keys(t)) {
          if (k === "id") continue;
          r[k] = t[k][i];
        }
        out.push(r);
      }
      setRows(out);
      setStatus("");
      if (!out.length) setSelectedId(null);
      else if (selectedId == null) setSelectedId(out[0].id);
    })().catch((e) => setStatus(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docApi]);

  // when selection changes -> reset draft from record
  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    const d: Record<string, any> = {};
    for (const c of cols) d[c.colId] = (selected as any)[c.colId];
    setDraft(d);
  }, [selectedId, cols, selected]);

  async function save() {
    if (!docApi || !selectedId) return;
    setSaving(true);
    setStatus("");
    try {
      const updates: Record<string, any> = {};
      for (const c of cols) {
        if (!isEditable(c)) continue;
        updates[c.colId] = draft[c.colId];
      }
      await docApi.applyUserActions([["UpdateRecord", TABLE_ID, selectedId, updates]]);
      setStatus("Enregistré ✅");
    } catch (e: any) {
      setStatus(`Erreur: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>EMILE (React)</h2>
        <small style={{ opacity: 0.7 }}>
          mode: <code>{mode}</code>
        </small>
      </div>

      {status ? (
        <div style={{ marginTop: 12, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}>
          {status}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginTop: 16 }}>
        {/* left: candidates list */}
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Candidats</div>
          <div style={{ display: "grid", gap: 6, maxHeight: 420, overflow: "auto" }}>
            {rows.map((r) => {
              const label = labelCol ? String((r as any)[labelCol] ?? r.id) : String(r.id);
              const isSel = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid " + (isSel ? "#333" : "#ddd"),
                    background: isSel ? "#f5f5f5" : "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{label}</div>
                  <div style={{ opacity: 0.65, fontSize: 12 }}>id: {r.id}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* right: dynamic form */}
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600 }}>Fiche</div>
            <button
              onClick={save}
              disabled={!selectedId || saving}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: saving ? "#fafafa" : "white",
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>

          {!selected ? (
            <div style={{ marginTop: 12, opacity: 0.7 }}>Aucun candidat sélectionné.</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {cols.filter(isEditable).map((c) => (
                <Field
                  key={c.colId}
                  col={c}
                  value={draft[c.colId]}
                  onChange={(v) => setDraft((d) => ({ ...d, [c.colId]: v }))}
                  docApi={docApi}
                  colRowIdMap={colRowIdMap}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  col: ColMeta;
  value: any;
  onChange: (v: any) => void;
  docApi: GristDocAPI;
  colRowIdMap: Map<number, { colId: string }>;
}) {
  const { col, value, onChange, docApi, colRowIdMap } = props;

  const type = col.type || "Text";
  const isRef = /^Ref:/.test(type);
  const isRefList = /^RefList:/.test(type);
  const isChoice = type === "Choice";
  const isChoiceList = type === "ChoiceList";
  const isDate = type === "Date";

  const [refOptions, setRefOptions] = useState<{ id: number; label: string }[]>([]);
  const [loadingRef, setLoadingRef] = useState(false);

  // Load ref options (simple list) when needed
  useEffect(() => {
    if (!isRef && !isRefList) return;
    (async () => {
      setLoadingRef(true);
      try {
        const cache = await ensureRefCache(docApi, col, colRowIdMap);
        const opts = (cache?.rows || []).slice(0, 400).map((r) => ({ id: r.id, label: r.label }));
        setRefOptions(opts);
      } finally {
        setLoadingRef(false);
      }
    })();
  }, [isRef, isRefList, docApi, col, colRowIdMap]);

  // CHOICE options: from widgetOptions.choices (comme ton HTML)  [oai_citation:9‡index.html](sediment://file_00000000c8307246a79ff09ceabb26c4)
  const choiceOptions = useMemo(() => {
    const wopts = col.widgetOptionsParsed || {};
    const arr = Array.isArray(wopts.choices) ? wopts.choices : [];
    return arr.map((x: any) => String(x));
  }, [col.widgetOptionsParsed]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 600 }}>
        {col.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({col.colId})</span>
      </label>

      {/* DATE */}
      {isDate ? (
        <input
          type="date"
          value={unixSecondsToISODate(value)}
          onChange={(e) => onChange(isoDateToUnixSeconds(e.target.value))}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        />
      ) : null}

      {/* CHOICE */}
      {isChoice ? (
        <select
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        >
          <option value="">—</option>
          {choiceOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : null}

      {/* CHOICELIST (["L", ...]) */}
      {isChoiceList ? (
        <ChoiceListEditor
          options={choiceOptions}
          value={value}
          onChange={onChange}
        />
      ) : null}

      {/* REF */}
      {isRef ? (
        <select
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          disabled={loadingRef}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        >
          <option value="">—</option>
          {refOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} (#{o.id})
            </option>
          ))}
        </select>
      ) : null}

      {/* REFLIST (["L", ...ids]) */}
      {isRefList ? (
        <RefListEditor
          options={refOptions}
          value={value}
          onChange={onChange}
          disabled={loadingRef}
        />
      ) : null}

      {/* DEFAULT TEXT */}
      {!isDate && !isChoice && !isChoiceList && !isRef && !isRefList ? (
        <input
          type="text"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        />
      ) : null}

      {col.description ? <small style={{ opacity: 0.7 }}>{col.description}</small> : null}
    </div>
  );
}

function ChoiceListEditor(props: {
  options: string[];
  value: any;
  onChange: (v: any) => void;
}) {
  const { options, value, onChange } = props;
  const selected = useMemo(
    () => decodeListCell(value).filter((x) => typeof x === "string"),
    [value]
  );

  function toggle(opt: string) {
    const next = selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt];
    onChange(encodeListCell(next)); // ["L", ...]  [oai_citation:10‡index.html](sediment://file_00000000c8307246a79ff09ceabb26c4)
  }

  return (
    <details style={{ border: "1px solid #ddd", borderRadius: 10, padding: 8 }}>
      <summary style={{ cursor: "pointer" }}>
        {selected.length ? selected.join(", ") : "Sélectionner…"}
      </summary>
      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
        {options.map((o) => (
          <label key={o} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => toggle(o)}
            />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function RefListEditor(props: {
  options: { id: number; label: string }[];
  value: any;
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  const { options, value, onChange, disabled } = props;
  const selectedIds = useMemo(
    () => decodeListCell(value).filter((x) => typeof x === "number") as number[],
    [value]
  );

  function toggle(id: number) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange(encodeListCell(next)); // ["L", ...]  [oai_citation:11‡index.html](sediment://file_00000000c8307246a79ff09ceabb26c4)
  }

  const label = selectedIds.length
    ? selectedIds
        .map((id) => options.find((o) => o.id === id)?.label ?? `#${id}`)
        .join(", ")
    : "Sélectionner…";

  return (
    <details
      style={{
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 8,
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <summary style={{ cursor: "pointer" }}>{label}</summary>
      <div style={{ marginTop: 8, display: "grid", gap: 6, maxHeight: 240, overflow: "auto" }}>
        {options.map((o) => (
          <label key={o.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={selectedIds.includes(o.id)}
              onChange={() => toggle(o.id)}
            />
            <span>
              {o.label} <small style={{ opacity: 0.7 }}>#{o.id}</small>
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}