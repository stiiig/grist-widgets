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
import { SearchDropdown, SearchMultiDropdown, Option } from "@/components/SearchDropdown";
import { GROUPS, GROUPS_ORDER, GROUP_TITLES, GROUP_ANCHORS, GroupKey } from "@/lib/emile/groups";

const TABLE_ID = "CANDIDATS";

type Row = { id: number; [k: string]: any };

function candidateLabel(r: Row) {
  const prenom = (r["Prenom"] ?? "").toString().trim();
  const nom = (r["Nom_de_famille"] ?? "").toString().trim();
  const id2 = (r["ID2"] ?? "").toString().trim();
  const name = `${prenom} ${nom}`.trim();
  return `${name || `#${r.id}`}${id2 ? ` — ${id2}` : ""}`;
}

export default function Page() {
  const [mode, setMode] = useState<string>("boot");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  const [cols, setCols] = useState<ColMeta[]>([]);
  const colById = useMemo(() => new Map(cols.map((c) => [c.colId, c])), [cols]);

  const [colRowIdMap, setColRowIdMap] = useState<Map<number, { colId: string }>>(new Map());

  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // INIT: charge le script grist-plugin-api si besoin (ton instance en a besoin)
  useEffect(() => {
    (async () => {
      if (typeof window !== "undefined" && !(window as any).grist) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[data-grist-plugin-api="1"]') as HTMLScriptElement | null;
          if (existing) return resolve();

          const s = document.createElement("script");
          s.src = "https://docs.getgrist.com/grist-plugin-api.js";
          s.async = true;
          s.setAttribute("data-grist-plugin-api", "1");
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Impossible de charger grist-plugin-api.js"));
          document.head.appendChild(s);
        });
      }

      const { mode, docApi } = await initGristOrMock({ requiredAccess: "full" });
      setMode(mode);
      setDocApi(docApi);

      if (mode === "none") setStatus("Ouvre ce widget dans Grist (ou /dev/harness).");
    })();
  }, []);

  // META
  useEffect(() => {
    if (!docApi) return;
    (async () => {
      const [meta, map] = await Promise.all([loadColumnsMetaFor(docApi, TABLE_ID), buildColRowIdMap(docApi)]);
      setCols(meta);
      setColRowIdMap(map);
    })();
  }, [docApi]);

  // TABLE DATA
  useEffect(() => {
    if (!docApi) return;
    (async () => {
      const t = await docApi.fetchTable(TABLE_ID);
      const out: Row[] = [];
      for (let i = 0; i < t.id.length; i++) {
        const r: Row = { id: t.id[i] };
        for (const k of Object.keys(t)) if (k !== "id") r[k] = t[k][i];
        out.push(r);
      }
      setRows(out);
      if (out.length && selectedId == null) setSelectedId(out[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docApi]);

  // RESET DRAFT
  useEffect(() => {
    if (!selected) return void setDraft({});
    const d: Record<string, any> = {};
    for (const c of cols) d[c.colId] = selected[c.colId];
    setDraft(d);
  }, [selectedId, cols, selected]);

  async function save() {
    if (!docApi || !selectedId) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      for (const c of cols) {
        if (!isEditable(c)) continue; // ✅ skip formula + colonnes système
        updates[c.colId] = draft[c.colId];
      }
      await docApi.applyUserActions([["UpdateRecord", TABLE_ID, selectedId, updates]]);
      setStatus("Enregistré ✅");
    } catch (e: any) {
      setStatus("Erreur: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  // Sections à afficher = champs du groupe présents dans la table + meta dispo
  const sections = useMemo(() => {
    const res: Array<{ key: GroupKey; fields: ColMeta[] }> = [];
    for (const g of GROUPS_ORDER) {
      const fields = GROUPS[g]
        .map((id) => colById.get(id))
        .filter((c): c is ColMeta => !!c)
        .filter((c) => isEditable(c) || true); // on affiche même non-editable si tu veux voir (à ajuster)
      res.push({ key: g, fields });
    }
    return res;
  }, [colById]);

  const headerLabel = selected ? candidateLabel(selected) : "";

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>EMILE React</h2>
        <small style={{ opacity: 0.7 }}>
          mode: <code>{mode}</code>
        </small>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={save}
            disabled={!selectedId || !docApi || saving}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white" }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {status ? <div style={{ marginTop: 10, opacity: 0.8 }}>{status}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, marginTop: 16 }}>
        {/* LEFT: candidates list */}
        <aside style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Candidats</div>
          <div style={{ display: "grid", gap: 8, maxHeight: 520, overflow: "auto" }}>
            {rows.map((r) => {
              const label = candidateLabel(r);
              const isSel = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid " + (isSel ? "#333" : "#ddd"),
                    background: isSel ? "#f5f5f5" : "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>id: {r.id}</div>
                </button>
              );
            })}
          </div>

          {/* mini nav sections */}
          <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sections</div>
            <div style={{ display: "grid", gap: 6 }}>
              {GROUPS_ORDER.map((g) => (
                <a key={g} href={`#${GROUP_ANCHORS[g]}`} style={{ color: "inherit", textDecoration: "none", opacity: 0.85 }}>
                  • {GROUP_TITLES[g]}
                </a>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT: structured form */}
        <main style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
          {!selected || !docApi ? (
            <div style={{ opacity: 0.7 }}>Sélectionne un candidat (et ouvre dans Grist).</div>
          ) : (
            <>
              {/* Header candidat */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{headerLabel}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>RowId: {selected.id}</div>
              </div>

              {/* Sections */}
              <div style={{ display: "grid", gap: 14 }}>
                {sections.map(({ key, fields }) => (
                  <section key={key} id={GROUP_ANCHORS[key]} style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
                    <h3 style={{ margin: "0 0 10px 0" }}>{GROUP_TITLES[key]}</h3>

                    {fields.length === 0 ? (
                      <div style={{ opacity: 0.6, fontSize: 13 }}>Aucun champ trouvé pour ce groupe.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 12 }}>
                        {fields.map((c) => (
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
                  </section>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* =======================
   FieldRenderer (A6)
   ======================= */

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

  // DATE
  if (isDate) {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>{col.label}</label>
        <input
          type="date"
          value={unixSecondsToISODate(value)}
          onChange={(e) => onChange(isoDateToUnixSeconds(e.target.value))}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
          disabled={!isEditable(col)}
        />
      </div>
    );
  }

  // CHOICE (searchable)
  if (isChoice) {
    const valueStr = value == null ? "" : String(value);
    const valueId = valueStr ? choiceIdByLabel.get(valueStr) ?? null : null;

    return (
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>{col.label}</label>
        <SearchDropdown
          options={choiceOptions}
          valueId={valueId}
          onChange={(id) => onChange(id ? choiceLabelById.get(id) ?? null : null)}
          placeholder="Rechercher…"
          disabled={!isEditable(col) || choiceOptions.length === 0}
        />
      </div>
    );
  }

  // CHOICELIST (searchable multi)
  if (isChoiceList) {
    const selectedLabels = decodeListCell(value).filter((x) => typeof x === "string") as string[];
    const selectedIds = selectedLabels
      .map((lab) => choiceIdByLabel.get(lab))
      .filter((x): x is number => typeof x === "number");

    return (
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>{col.label}</label>
        <SearchMultiDropdown
          options={choiceOptions}
          valueIds={selectedIds}
          onChange={(nextIds) => {
            const nextLabels = nextIds.map((id) => choiceLabelById.get(id)).filter((s): s is string => !!s);
            onChange(encodeListCell(nextLabels));
          }}
          placeholder="Rechercher…"
          disabled={!isEditable(col) || choiceOptions.length === 0}
        />
      </div>
    );
  }

  // REF / REFLIST (searchable)
  if (isRef || isRefList) {
    const [refOptions, setRefOptions] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      (async () => {
        setLoading(true);
        try {
          const cache = await ensureRefCache(docApi, col, colRowIdMap);
          const opts: Option[] = (cache?.rows ?? []).map((r) => ({ id: r.id, label: r.label, q: r.q }));
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
          <label style={{ fontWeight: 700 }}>{col.label}</label>
          <SearchDropdown
            options={refOptions}
            valueId={valueId}
            onChange={(id) => onChange(id)}
            placeholder={loading ? "Chargement…" : "Rechercher…"}
            disabled={!isEditable(col) || loading}
          />
        </div>
      );
    }

    const ids = decodeListCell(value).filter((x) => typeof x === "number") as number[];
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>{col.label}</label>
        <SearchMultiDropdown
          options={refOptions}
          valueIds={ids}
          onChange={(nextIds) => onChange(encodeListCell(nextIds))}
          placeholder={loading ? "Chargement…" : "Rechercher…"}
          disabled={!isEditable(col) || loading}
        />
      </div>
    );
  }

  // DEFAULT TEXT
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 700 }}>{col.label}</label>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        disabled={!isEditable(col)}
      />
    </div>
  );
}