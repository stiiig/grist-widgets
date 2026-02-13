"use client";

import "./styles.css";

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

function StatusAlert({ status }: { status: string }) {
  if (!status) return null;

  const isError = status.toLowerCase().includes("erreur") || status.toLowerCase().includes("error");
  const isSuccess = status.includes("✅") || status.toLowerCase().includes("enregistr");

  const cls = isError
    ? "fr-alert fr-alert--error"
    : isSuccess
    ? "fr-alert fr-alert--success"
    : "fr-alert fr-alert--info";

  return (
    <div className={cls} style={{ marginTop: 12 }}>
      <p className="fr-alert__title">{isError ? "Erreur" : isSuccess ? "Succès" : "Info"}</p>
      <p>{status.replace("Erreur:", "").trim()}</p>
    </div>
  );
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<GroupKey>("perso");
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

  // INIT: charge grist-plugin-api.js si besoin
  useEffect(() => {
    (async () => {
      try {
        if (typeof window !== "undefined" && !(window as any).grist) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector(
              'script[data-grist-plugin-api="1"]'
            ) as HTMLScriptElement | null;
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
      } catch (e: any) {
        setStatus(`Erreur: ${e?.message ?? String(e)}`);
      }
    })();
  }, []);

  // META
  useEffect(() => {
    if (!docApi) return;
    (async () => {
      try {
        const [meta, map] = await Promise.all([loadColumnsMetaFor(docApi, TABLE_ID), buildColRowIdMap(docApi)]);
        setCols(meta);
        setColRowIdMap(map);
      } catch (e: any) {
        setStatus(`Erreur: ${e?.message ?? String(e)}`);
      }
    })();
  }, [docApi]);

  // TABLE DATA
  useEffect(() => {
    if (!docApi) return;
    (async () => {
      try {
        const t = await docApi.fetchTable(TABLE_ID);
        const out: Row[] = [];
        for (let i = 0; i < t.id.length; i++) {
          const r: Row = { id: t.id[i] };
          for (const k of Object.keys(t)) if (k !== "id") r[k] = t[k][i];
          out.push(r);
        }
        setRows(out);
        if (out.length && selectedId == null) setSelectedId(out[0].id);
      } catch (e: any) {
        setStatus(`Erreur: ${e?.message ?? String(e)}`);
      }
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

const activeFields = useMemo(() => {
  return GROUPS[activeTab]
    .map((id) => colById.get(id))
    .filter((c): c is ColMeta => !!c);
}, [activeTab, colById]);

  // Sections = champs du groupe présents dans la table, dans l’ordre legacy
  const sections = useMemo(() => {
    const res: Array<{ key: GroupKey; fields: ColMeta[] }> = [];
    for (const g of GROUPS_ORDER) {
      const fields = GROUPS[g]
        .map((id) => colById.get(id))
        .filter((c): c is ColMeta => !!c);
      res.push({ key: g, fields });
    }
    return res;
  }, [colById]);

  const headerLabel = selected ? candidateLabel(selected) : "";

  return (
    <div className="emile-container">
      {/* Sticky actions */}
      <div className="emile-sticky-actions">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid" }}>
            <div className="fr-h3" style={{ margin: 0 }}>
              EMILE
            </div>
            <div className="fr-hint-text">
              mode: <code>{mode}</code>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="fr-btn"
              onClick={save}
              disabled={!selectedId || !docApi || saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>

        <StatusAlert status={status} />
      </div>

      <div className="emile-card" style={{ marginTop: 16 }}>
  <div className="emile-card__inner">
    {!selected || !docApi ? (
      <div className="fr-alert fr-alert--info">
        <p className="fr-alert__title">En attente</p>
        <p>Sélectionne un candidat dans Grist (ligne courante) et ouvre le widget.</p>
      </div>
    ) : (
      <>
        {/* Header candidat */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div className="fr-h4" style={{ margin: 0 }}>
            {headerLabel}
          </div>
          <div className="fr-tag fr-tag--sm">{String(selected["ID2"] ?? "").trim() || `RowId ${selected.id}`}</div>
        </div>

        {/* Tabs (texte pour l'instant) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {GROUPS_ORDER.map((g) => (
            <button
              key={g}
              type="button"
              className={`fr-tag ${activeTab === g ? "" : "fr-tag--dismiss"}`}
              onClick={() => setActiveTab(g)}
              style={{
                border: activeTab === g ? "1px solid var(--border-action-high-blue-france)" : "1px solid var(--border-default-grey)",
                background: activeTab === g ? "var(--background-action-low-blue-france)" : "white",
                cursor: "pointer",
              }}
            >
              {GROUP_TITLES[g]}
            </button>
          ))}
        </div>

        {/* Form (tab active) */}
        <div className="emile-form-grid">
          {activeFields.map((c) => (
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
      </>
    )}
  </div>
</div>
    </div>
  );
}

/* =======================
   FieldRenderer (A6) — DSFR skin
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

  const disabled = !isEditable(col);

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
      <div className="fr-input-group">
        <label className="fr-label">
          {col.label}
          <span className="fr-hint-text"> ({col.colId})</span>
        </label>
        <input
          className="fr-input"
          type="date"
          value={unixSecondsToISODate(value)}
          onChange={(e) => onChange(isoDateToUnixSeconds(e.target.value))}
          disabled={disabled}
        />
      </div>
    );
  }

  // CHOICE (searchable)
  if (isChoice) {
    const valueStr = value == null ? "" : String(value);
    const valueId = valueStr ? choiceIdByLabel.get(valueStr) ?? null : null;

    return (
      <div className="fr-input-group">
        <label className="fr-label">
          {col.label}
          <span className="fr-hint-text"> ({col.colId})</span>
        </label>
        <div>
          <SearchDropdown
            options={choiceOptions}
            valueId={valueId}
            onChange={(id) => onChange(id ? choiceLabelById.get(id) ?? null : null)}
            placeholder="Rechercher…"
            disabled={disabled || choiceOptions.length === 0}
          />
        </div>
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
      <div className="fr-input-group">
        <label className="fr-label">
          {col.label}
          <span className="fr-hint-text"> ({col.colId})</span>
        </label>
        <div>
          <SearchMultiDropdown
            options={choiceOptions}
            valueIds={selectedIds}
            onChange={(nextIds) => {
              const nextLabels = nextIds.map((id) => choiceLabelById.get(id)).filter((s): s is string => !!s);
              onChange(encodeListCell(nextLabels));
            }}
            placeholder="Rechercher…"
            disabled={disabled || choiceOptions.length === 0}
          />
        </div>
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
        <div className="fr-input-group">
          <label className="fr-label">
            {col.label}
            <span className="fr-hint-text"> ({col.colId})</span>
          </label>
          <div>
            <SearchDropdown
              options={refOptions}
              valueId={valueId}
              onChange={(id) => onChange(id)}
              placeholder={loading ? "Chargement…" : "Rechercher…"}
              disabled={disabled || loading}
            />
          </div>
        </div>
      );
    }

    const ids = decodeListCell(value).filter((x) => typeof x === "number") as number[];
    return (
      <div className="fr-input-group">
        <label className="fr-label">
          {col.label}
          <span className="fr-hint-text"> ({col.colId})</span>
        </label>
        <div>
          <SearchMultiDropdown
            options={refOptions}
            valueIds={ids}
            onChange={(nextIds) => onChange(encodeListCell(nextIds))}
            placeholder={loading ? "Chargement…" : "Rechercher…"}
            disabled={disabled || loading}
          />
        </div>
      </div>
    );
  }

  // DEFAULT TEXT
  return (
    <div className="fr-input-group">
      <label className="fr-label">
        {col.label}
        <span className="fr-hint-text"> ({col.colId})</span>
      </label>
      <input
        className="fr-input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}