"use client";

import { SearchDropdown, SearchMultiDropdown, Option } from "@/components/SearchDropdown";
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
    // 1) si grist n'est pas là, on injecte le script (une seule fois)
    if (typeof window !== "undefined" && !(window as any).grist) {
      await new Promise<void>((resolve, reject) => {
        // évite double injection
        const existing = document.querySelector('script[data-grist-plugin-api="1"]') as HTMLScriptElement | null;
        if (existing) {
          // si déjà chargé, on attend un tick
          setTimeout(() => resolve(), 0);
          return;
        }

        const s = document.createElement("script");
        s.src = "https://docs.getgrist.com/grist-plugin-api.js";
        s.async = true;
        s.setAttribute("data-grist-plugin-api", "1");
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Impossible de charger grist-plugin-api.js"));
        document.head.appendChild(s);
      });
    }

    // 2) maintenant seulement on init (window.grist devrait exister dans Grist)
    const { mode, docApi } = await initGristOrMock({ requiredAccess: "full" });
    setMode(mode);
    setDocApi(docApi);

    // optionnel : message utile si on est hors Grist
    if (mode === "none") {
      setStatus("Ouvre ce widget dans Grist (ou utilise /dev/harness)");
    }
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

const choiceOptions = useMemo(() => {
  const raw = col.widgetOptionsParsed?.choices;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((label: any, i: number) => ({
    id: i + 1,
    label: String(label),
    q: String(label).toLowerCase(),
  }));
}, [col.widgetOptionsParsed]);

const choiceIdByLabel = useMemo(() => {
  const m = new Map<string, number>();
  for (const o of choiceOptions) m.set(o.label, o.id);
  return m;
}, [choiceOptions]);

const choiceLabelById = useMemo(() => {
  const m = new Map<number, string>();
  for (const o of choiceOptions) m.set(o.id, o.label);
  return m;
}, [choiceOptions]);

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
  const valueStr = value == null ? "" : String(value);
  const valueId = valueStr ? (choiceIdByLabel.get(valueStr) ?? null) : null;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 600 }}>
        {col.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({col.colId})</span>
      </label>

      <SearchDropdown
        options={choiceOptions}
        valueId={valueId}
        onChange={(id) => onChange(id ? choiceLabelById.get(id) ?? null : null)}
        placeholder="Rechercher…"
        disabled={choiceOptions.length === 0}
      />
    </div>
  );
}

  // ---------------- CHOICELIST ----------------
if (isChoiceList) {
  const selectedLabels = decodeListCell(value).filter((x) => typeof x === "string") as string[];
  const selectedIds = selectedLabels
    .map((lab) => choiceIdByLabel.get(lab))
    .filter((x): x is number => typeof x === "number");

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 600 }}>
        {col.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({col.colId})</span>
      </label>

      <SearchMultiDropdown
        options={choiceOptions}
        valueIds={selectedIds}
        onChange={(nextIds) => {
          const nextLabels = nextIds
            .map((id) => choiceLabelById.get(id))
            .filter((s): s is string => !!s);
          onChange(encodeListCell(nextLabels)); // ["L", ...strings]
        }}
        placeholder="Rechercher…"
        disabled={choiceOptions.length === 0}
      />
    </div>
  );
}

  // ---------------- REF / REFLIST (simplifié) ----------------
  if (isRef || isRefList) {
    const [refOptions, setRefOptions] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      (async () => {
        setLoading(true);
        try {
          const cache = await ensureRefCache(docApi, col, colRowIdMap);
          const opts: Option[] = (cache?.rows ?? []).map((r) => ({
            id: r.id,
            label: r.label,
            q: r.q,
          }));
          setRefOptions(opts);
        } finally {
          setLoading(false);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [col.colId]);

    if (isRef) {
      const valueId = typeof value === "number" ? value : null;
      return (
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontWeight: 600 }}>
            {col.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({col.colId})</span>
          </label>

          <SearchDropdown
            options={refOptions}
            valueId={valueId}
            onChange={(id) => onChange(id)}
            placeholder={loading ? "Chargement…" : "Rechercher…"}
            disabled={loading}
          />
        </div>
      );
    }

    // RefList
    const ids = decodeListCell(value).filter((x) => typeof x === "number") as number[];
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 600 }}>
          {col.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({col.colId})</span>
        </label>

        <SearchMultiDropdown
          options={refOptions}
          valueIds={ids}
          onChange={(nextIds) => onChange(encodeListCell(nextIds))}
          placeholder={loading ? "Chargement…" : "Rechercher…"}
          disabled={loading}
        />
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