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
import { GROUPS, GROUPS_ORDER, GROUP_TITLES, GroupKey } from "@/lib/emile/groups";

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

/**
 * Sous-tabs "visuels" (style screenshot). Pour l'instant ils ne filtrent pas les champs,
 * on s'en sert pour l'UI. Ensuite on pourra mapper subtab -> champs.
 */
const SUBTABS: Record<GroupKey, { key: string; label: string }[]> = {
  perso: [
    { key: "identite", label: "Identité" },
    { key: "situation", label: "Situation" },
    { key: "sante", label: "Santé" },
  ],
  coord: [{ key: "contacts", label: "Contacts" }],
  admin: [
    { key: "situation", label: "Situation actuelle" },
    { key: "ft", label: "France Travail" },
    { key: "avis", label: "Avis et attestations" },
    { key: "complements", label: "Compléments" },
  ],
  besoins: [
    { key: "emploi", label: "Emploi-Formation" },
    { key: "finances", label: "Finances" },
    { key: "habitat", label: "Habitat" },
    { key: "mobilite", label: "Mobilité" },
  ],
  complements: [{ key: "notes", label: "Compléments" }],
};

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

  const [activeTab, setActiveTab] = useState<GroupKey>("perso");
  const [activeSubtab, setActiveSubtab] = useState<string>(SUBTABS.perso[0].key);

  useEffect(() => {
    const first = SUBTABS[activeTab]?.[0]?.key;
    if (first) setActiveSubtab(first);
  }, [activeTab]);

  // INIT: charge grist-plugin-api.js si besoin (self-hosted)
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

  // DATA (pour l’instant on garde fetchTable — on passera ensuite à onRecord pour le "record courant")
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

  const headerLabel = selected ? candidateLabel(selected) : "";
  const headerId2 = selected ? (selected["ID2"] ?? "").toString().trim() : "";

  // Champs de l’onglet actif, dans l’ordre legacy
  const activeFields = useMemo(() => {
    return GROUPS[activeTab]
      .map((id) => colById.get(id))
      .filter((c): c is ColMeta => !!c);
  }, [activeTab, colById]);

  return (
    <div className="emile-container">
      {/* Sticky actions */}
      <div className="emile-sticky-actions">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid" }}>
            <div className="fr-h3" style={{ margin: 0 }}>
              {headerLabel || "EMILE"}
            </div>
            <div className="fr-hint-text">
              {headerId2 ? <span className="fr-tag fr-tag--sm">{headerId2}</span> : null}{" "}
              <span style={{ marginLeft: 8 }}>
                mode: <code>{mode}</code>
              </span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="fr-btn" onClick={save} disabled={!selectedId || !docApi || saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>

        <StatusAlert status={status} />
      </div>

      {/* Single pane */}
      <div className="emile-card" style={{ marginTop: 16 }}>
        <div className="emile-card__inner">
          {!selected || !docApi ? (
            <div className="fr-alert fr-alert--info">
              <p className="fr-alert__title">En attente</p>
              <p>Sélectionne un candidat dans Grist (ligne courante) et ouvre le widget.</p>
            </div>
          ) : (
            <>
              {/* Tabs picto + texte */}
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderBottom: "1px solid var(--border-default-grey)",
                  paddingBottom: 10,
                  marginBottom: 14,
                }}
              >
                {GROUPS_ORDER.map((g) => {
                  const active = activeTab === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setActiveTab(g)}
                      style={{
                        display: "inline-flex",
                        gap: 10,
                        alignItems: "center",
                        border: "none",
                        background: "transparent",
                        padding: "8px 0",
                        cursor: "pointer",
                        borderBottom: active ? "3px solid var(--border-action-high-blue-france)" : "3px solid transparent",
                        color: active ? "var(--text-title-blue-france)" : "var(--text-default-grey)",
                        fontWeight: active ? 700 : 500,
                      }}
                    >
                      <span style={{ display: "inline-flex" }}>
                        <TabIcon name={iconForGroup(g)} />
                      </span>
                      <span>{GROUP_TITLES[g]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Subtabs tags */}
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
                {SUBTABS[activeTab].map((st) => {
                  const active = activeSubtab === st.key;
                  return (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setActiveSubtab(st.key)}
                      style={{
                        border: active ? "1px solid var(--border-action-high-blue-france)" : "1px solid transparent",
                        background: "var(--background-action-low-blue-france)",
                        borderRadius: 14,
                        padding: "10px 18px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>

              {/* Form */}
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

  // Choice options (id numérique interne -> label string)
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
        <label className="fr-label">{col.label}</label>
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
        <label className="fr-label">{col.label}</label>
        <SearchDropdown
          options={choiceOptions}
          valueId={valueId}
          onChange={(id) => onChange(id ? choiceLabelById.get(id) ?? null : null)}
          placeholder="Rechercher…"
          disabled={disabled || choiceOptions.length === 0}
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
      <div className="fr-input-group">
        <label className="fr-label">{col.label}</label>
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
        <div className="fr-input-group">
          <label className="fr-label">{col.label}</label>
          <SearchDropdown
            options={refOptions}
            valueId={valueId}
            onChange={(id) => onChange(id)}
            placeholder={loading ? "Chargement…" : "Rechercher…"}
            disabled={disabled || loading}
          />
        </div>
      );
    }

    const ids = decodeListCell(value).filter((x) => typeof x === "number") as number[];
    return (
      <div className="fr-input-group">
        <label className="fr-label">{col.label}</label>
        <SearchMultiDropdown
          options={refOptions}
          valueIds={ids}
          onChange={(nextIds) => onChange(encodeListCell(nextIds))}
          placeholder={loading ? "Chargement…" : "Rechercher…"}
          disabled={disabled || loading}
        />
      </div>
    );
  }

  // DEFAULT TEXT
  return (
    <div className="fr-input-group">
      <label className="fr-label">{col.label}</label>
      <input className="fr-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

/* =======================
   Tabs icons (inline SVG)
   ======================= */

function iconForGroup(g: GroupKey): "user" | "phone" | "building" | "heart" | "edit" {
  switch (g) {
    case "admin":
      return "building";
    case "coord":
      return "phone";
    case "besoins":
      return "heart";
    case "complements":
      return "edit";
    case "perso":
    default:
      return "user";
  }
}

function TabIcon({ name }: { name: "user" | "phone" | "building" | "heart" | "edit" }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none" as const };
  const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (name) {
    case "building":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M3 21h18" />
          <path {...stroke} d="M6 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" />
          <path {...stroke} d="M9 9h.01M9 12h.01M9 15h.01M12 9h.01M12 12h.01M12 15h.01M15 9h.01M15 12h.01M15 15h.01" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3 5.18 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.72c.12.86.31 1.7.57 2.5a2 2 0 0 1-.45 2.11L9 10.91a16 16 0 0 0 4.09 4.09l1.58-1.12a2 2 0 0 1 2.11-.45c.8.26 1.64.45 2.5.57A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common} aria-hidden="true">
          <path
            {...stroke}
            d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"
          />
        </svg>
      );
    case "edit":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M12 20h9" />
          <path {...stroke} d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      );
    case "user":
    default:
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M20 21a8 8 0 0 0-16 0" />
          <path {...stroke} d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
        </svg>
      );
  }
}