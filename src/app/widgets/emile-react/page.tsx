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
import { EMILE_TABS, L1TabKey } from "@/lib/emile/tabs";
import { FIELD_MAP } from "@/lib/emile/fieldmap";

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
  const [mode, setMode] = useState<string>("boot");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  const [cols, setCols] = useState<ColMeta[]>([]);
  const colById = useMemo(() => new Map(cols.map((c) => [c.colId, c])), [cols]);
  const [colRowIdMap, setColRowIdMap] = useState<Map<number, { colId: string }>>(new Map());

  // record courant
  const [selected, setSelected] = useState<Row | null>(null);

  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Tabs L1/L2
  const [activeTab, setActiveTab] = useState<L1TabKey>(EMILE_TABS[0].key);
  const activeTabObj = useMemo(() => EMILE_TABS.find((t) => t.key === activeTab) ?? EMILE_TABS[0], [activeTab]);

  const [activeSubtab, setActiveSubtab] = useState<string>(activeTabObj.subtabs[0].key);
  useEffect(() => {
    const first = activeTabObj.subtabs?.[0]?.key;
    if (first) setActiveSubtab(first);
  }, [activeTabObj]);

  // Recherche globale (sur toute la tab L1)
  const [fieldQuery, setFieldQuery] = useState("");
  useEffect(() => {
    setFieldQuery("");
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

  // Record courant via grist.onRecord
  useEffect(() => {
    if (!docApi) return;
    if (typeof window === "undefined") return;
    const grist = (window as any).grist;
    if (!grist) return;

    grist.onRecord((record: any) => {
      if (!record) {
        setSelected(null);
        return;
      }
      setSelected(record);
    });

    grist.ready({ requiredAccess: "full" });
  }, [docApi]);

  // RESET DRAFT basé sur record courant
  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    const d: Record<string, any> = {};
    for (const c of cols) d[c.colId] = selected[c.colId];
    setDraft(d);
  }, [selected, cols]);

  async function save() {
    if (!docApi || !selected?.id) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      for (const c of cols) {
        if (!isEditable(c)) continue; // skip formule/système
        updates[c.colId] = draft[c.colId];
      }
      await docApi.applyUserActions([["UpdateRecord", TABLE_ID, selected.id, updates]]);
      setStatus("Enregistré ✅");
    } catch (e: any) {
      setStatus("Erreur: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const headerLabel = selected ? candidateLabel(selected) : "EMILE";
  const headerId2 = selected ? (selected["ID2"] ?? "").toString().trim() : "";

  // ===== Mapping champs =====
  const subtabColIds = useMemo(() => FIELD_MAP[activeTab]?.[activeSubtab] ?? [], [activeTab, activeSubtab]);

  const subtabFields = useMemo(() => {
    return subtabColIds.map((id) => colById.get(id)).filter((c): c is ColMeta => !!c);
  }, [subtabColIds, colById]);

  const tabColIds = useMemo(() => {
    const subMap = FIELD_MAP[activeTab] ?? {};
    const ids = Object.values(subMap).flat();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }, [activeTab]);

  const tabFields = useMemo(() => {
    return tabColIds.map((id) => colById.get(id)).filter((c): c is ColMeta => !!c);
  }, [tabColIds, colById]);

  const isTabMapped = tabColIds.length > 0;

  const filteredFields = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase();
    if (!q) return subtabFields;

    // recherche sur TOUTE la tab (L1)
    return tabFields.filter((c) => {
      const label = (c.label ?? "").toLowerCase();
      const id = (c.colId ?? "").toLowerCase();
      return label.includes(q) || id.includes(q);
    });
  }, [fieldQuery, subtabFields, tabFields]);

  const isSearching = fieldQuery.trim().length > 0;

  return (
    <div className="emile-container">
      {/* Header sticky (legacy-like) */}
      <div className="emile-sticky-actions">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "grid" }}>
            <div className="fr-h3" style={{ margin: 0 }}>
              {headerLabel}
            </div>
            <div className="fr-hint-text" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {headerId2 ? <span className="fr-tag fr-tag--sm">{headerId2}</span> : null}
              <span className="fr-tag fr-tag--sm">mode: {mode}</span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" className="fr-btn" onClick={save} disabled={!selected?.id || !docApi || saving}>
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
              {/* Recherche globale (top, legacy-like) */}
              <div className="fr-input-group" style={{ maxWidth: 560, margin: "0 auto 16px auto" }}>
                <label className="fr-label">Rechercher un champ</label>
                <input
                  className="fr-input"
                  value={fieldQuery}
                  onChange={(e) => setFieldQuery(e.target.value)}
                  placeholder="Ex: nationalité, date, téléphone…"
                />
                {!!fieldQuery && (
                  <p className="fr-hint-text" style={{ marginTop: 6 }}>
                    {filteredFields.length} champ{filteredFields.length > 1 ? "s" : ""} trouvé{filteredFields.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>

              {/* Tabs L1 : picto + texte */}
              <div
                style={{
                  display: "flex",
                  gap: 22,
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderBottom: "1px solid var(--border-default-grey)",
                  paddingBottom: 10,
                  marginBottom: 12,
                }}
              >
                {EMILE_TABS.map((t) => {
                  const active = activeTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
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
                        opacity: active ? 1 : 0.78,
                      }}
                    >
                      <span style={{ display: "inline-flex" }}>
                        <TabIcon name={t.icon} />
                      </span>
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Subtabs L2 : tags (hidden during search -> legacy-ish behavior) */}
              {!isSearching && (
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
                  {activeTabObj.subtabs.map((st) => {
                    const active = activeSubtab === st.key;
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setActiveSubtab(st.key)}
                        style={{
                          border: active ? "1px solid var(--border-action-high-blue-france)" : "1px solid transparent",
                          background: "var(--background-action-low-blue-france)",
                          borderRadius: 999,
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
              )}

              {!isTabMapped ? (
                <div className="fr-alert fr-alert--info">
                  <p className="fr-alert__title">Onglet non mappé</p>
                  <p>
                    Pour l’instant, seul <b>Administratif</b> est mappé sur des colonnes Grist.
                    <br />
                    Prochaine étape : on mappe <b>{activeTabObj.label}</b>.
                  </p>
                </div>
              ) : (
                <>
                  {isSearching && (
                    <div className="fr-hint-text" style={{ textAlign: "center", marginBottom: 10 }}>
                      Recherche active : on affiche les champs trouvés sur <b>{activeTabObj.label}</b> (toutes sous-sections confondues).
                    </div>
                  )}

                  <div
                    className="emile-form-grid"
                    style={{
                      display: "grid",
                      gap: 16,
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    }}
                  >
                    {filteredFields.map((c) => (
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

                  {/* Responsive tweak without touching CSS file */}
                  <style jsx>{`
                    @media (max-width: 860px) {
                      .emile-form-grid {
                        grid-template-columns: 1fr !important;
                      }
                    }
                  `}</style>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* =======================
   FieldRenderer — legacy-like (textarea for comment/notes)
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

  const lowerLabel = (col.label ?? "").toLowerCase();
  const lowerId = (col.colId ?? "").toLowerCase();
  const useTextarea =
    type === "Text" && (lowerLabel.includes("comment") || lowerLabel.includes("compl") || lowerId.includes("comment"));

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

  if (useTextarea) {
    return (
      <div className="fr-input-group" style={{ gridColumn: "1 / -1" }}>
        <label className="fr-label">{col.label}</label>
        <textarea
          className="fr-input"
          rows={5}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    );
  }

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

function TabIcon({
  name,
}: {
  name: "building" | "key" | "briefcase" | "euro" | "users" | "home" | "graduation" | "car" | "monitor" | "heart";
}) {
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
    case "key":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M21 8l-3 3" />
          <path {...stroke} d="M7 14a5 5 0 1 1 4-8l10 2-2 2-2 2-2 2-2 2-2-2" />
          <path {...stroke} d="M7 14l-4 4v3h3l4-4" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1" />
          <path {...stroke} d="M4 7h16v12H4z" />
          <path {...stroke} d="M4 12h16" />
        </svg>
      );
    case "euro":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M18 7a6 6 0 1 0 0 10" />
          <path {...stroke} d="M6 10h9" />
          <path {...stroke} d="M6 14h9" />
        </svg>
      );
    case "users":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M17 21a7 7 0 0 0-14 0" />
          <path {...stroke} d="M10 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
          <path {...stroke} d="M22 21a6 6 0 0 0-8-5.2" />
          <path {...stroke} d="M16 3.4a4 4 0 0 1 0 7.2" />
        </svg>
      );
    case "home":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M3 11l9-8 9 8" />
          <path {...stroke} d="M5 10v11h14V10" />
        </svg>
      );
    case "graduation":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M22 10L12 5 2 10l10 5 10-5z" />
          <path {...stroke} d="M6 12v5c0 2 3 4 6 4s6-2 6-4v-5" />
        </svg>
      );
    case "car":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M3 16l1-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2l1 5" />
          <path {...stroke} d="M5 16v3" />
          <path {...stroke} d="M19 16v3" />
          <path {...stroke} d="M7 16h10" />
          <path {...stroke} d="M7 12h10" />
        </svg>
      );
    case "monitor":
      return (
        <svg {...common} aria-hidden="true">
          <path {...stroke} d="M4 5h16v11H4z" />
          <path {...stroke} d="M8 21h8" />
          <path {...stroke} d="M12 16v5" />
        </svg>
      );
    case "heart":
    default:
      return (
        <svg {...common} aria-hidden="true">
          <path
            {...stroke}
            d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"
          />
        </svg>
      );
  }
}