"use client";

import { useEffect, useMemo, useState } from "react";
import { initGristOrMock } from "@/lib/grist/init";
import {
  loadColumnsMetaFor,
  buildColRowIdMap,
  ensureRefCache,
  decodeListCell,
  encodeListCell,
  unixSecondsToISODate,
  isoDateToUnixSeconds,
  isEditable,
  ColMeta,
  GristDocAPI,
} from "@/lib/grist/meta";

const TABLE_ID = "CANDIDATS";

type Row = { id: number; [k: string]: any };

export default function Page() {
  const [mode, setMode] = useState<string>("boot");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  const [cols, setCols] = useState<ColMeta[]>([]);
  const [colRowIdMap, setColRowIdMap] = useState<Map<number, { colId: string }>>(new Map());

  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // ------------------------------
  // INIT GRIST
  // ------------------------------
  useEffect(() => {
    (async () => {
      const { mode, docApi } = await initGristOrMock({
        requiredAccess: "full",
      });
      setMode(mode);
      setDocApi(docApi);
    })();
  }, []);

  // ------------------------------
  // LOAD META
  // ------------------------------
  useEffect(() => {
    if (!docApi) return;

    (async () => {
      const [meta, map] = await Promise.all([
        loadColumnsMetaFor(docApi, TABLE_ID),
        buildColRowIdMap(docApi),
      ]);
      setCols(meta);
      setColRowIdMap(map);
    })();
  }, [docApi]);

  // ------------------------------
  // LOAD TABLE
  // ------------------------------
  useEffect(() => {
    if (!docApi) return;

    (async () => {
      const t = await docApi.fetchTable(TABLE_ID);
      const out: Row[] = [];
      for (let i = 0; i < t.id.length; i++) {
        const r: Row = { id: t.id[i] };
        for (const k of Object.keys(t)) {
          if (k === "id") continue;
          r[k] = t[k][i];
        }
        out.push(r);
      }
      setRows(out);
      if (out.length) setSelectedId(out[0].id);
    })();
  }, [docApi]);

  // ------------------------------
  // RESET DRAFT ON SELECT
  // ------------------------------
  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    const d: Record<string, any> = {};
    for (const c of cols) d[c.colId] = selected[c.colId];
    setDraft(d);
  }, [selectedId, cols, selected]);

  async function save() {
    if (!docApi || !selectedId) return;

    setSaving(true);
    try {
      await docApi.applyUserActions([
        ["UpdateRecord", TABLE_ID, selectedId, draft],
      ]);
      setStatus("Enregistré ✅");
    } catch (e: any) {
      setStatus("Erreur: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>EMILE React — A4</h2>
      <small>mode: {mode}</small>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginTop: 16 }}>
        {/* LEFT: LIST */}
        <div style={{ border: "1px solid #eee", padding: 12 }}>
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 6,
                padding: 8,
              }}
            >
              {r.id}
            </button>
          ))}
        </div>

        {/* RIGHT: FORM */}
        <div style={{ border: "1px solid #eee", padding: 12 }}>
          {selected && docApi ? (
            <>
              {cols.filter(isEditable).map((c) => (
                <Field
                  key={c.colId}
                  col={c}
                  value={draft[c.colId]}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, [c.colId]: v }))
                  }
                  docApi={docApi}
                  colRowIdMap={colRowIdMap}
                />
              ))}

              <button
                onClick={save}
                disabled={saving}
                style={{ marginTop: 12 }}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </>
          ) : (
            <div>Aucun candidat sélectionné.</div>
          )}

          {status && <div style={{ marginTop: 12 }}>{status}</div>}
        </div>
      </div>
    </div>
  );
}

// ======================================================
// FIELD RENDERER
// ======================================================

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

  // ---------------- DATE ----------------
  if (isDate) {
    return (
      <div>
        <label>{col.label}</label>
        <input
          type="date"
          value={unixSecondsToISODate(value)}
          onChange={(e) =>
            onChange(isoDateToUnixSeconds(e.target.value))
          }
        />
      </div>
    );
  }

  // ---------------- CHOICE ----------------
  if (isChoice) {
    const opts = col.widgetOptionsParsed?.choices || [];
    return (
      <div>
        <label>{col.label}</label>
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {opts.map((o: any) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // ---------------- CHOICELIST ----------------
  if (isChoiceList) {
    const opts = col.widgetOptionsParsed?.choices || [];
    const selected = decodeListCell(value);

    function toggle(opt: string) {
      const next = selected.includes(opt)
        ? selected.filter((x: any) => x !== opt)
        : [...selected, opt];
      onChange(encodeListCell(next));
    }

    return (
      <div>
        <label>{col.label}</label>
        {opts.map((o: any) => (
          <label key={o} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => toggle(o)}
            />
            {o}
          </label>
        ))}
      </div>
    );
  }

  // ---------------- REF / REFLIST (simplifié) ----------------
  if (isRef || isRefList) {
    return (
      <div>
        <label>{col.label}</label>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Ref field (UI simplifiée pour l’instant)
        </div>
      </div>
    );
  }

  // ---------------- DEFAULT TEXT ----------------
  return (
    <div>
      <label>{col.label}</label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}