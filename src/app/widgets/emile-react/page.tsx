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

function fullName(r: Row) {
  const prenom = (r["Prenom"] ?? "").toString().trim();
  const nom = (r["Nom_de_famille"] ?? "").toString().trim();
  return `${prenom} ${nom}`.trim();
}

function candidateHint(r: Row) {
  return (r["ID2"] ?? "").toString().trim();
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
    <div className={cls} style={{ marginTop: 10 }}>
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
  const selectedName = selected ? fullName(selected) : "";
  const selectedHint = selected ? candidateHint(selected) : "";

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

  // Liste candidats (pour recherche)
  const [candidateOptions, setCandidateOptions] = useState<Option[]>([]);
  const [candidateIdByRowId, setCandidateIdByRowId] = useState<Map<number, number>>(new Map());
  const [rowIdByCandidateId, setRowIdByCandidateId] = useState<Map<number, number>>(new Map());
  const [candidateValueId, setCandidateValueId] = useState<number | null>(null);

  // INIT: charge grist-plugin-api.js si besoin (self-hosted)
  useEffect(() => {
    (async () => {
      try {
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

  // Reset draft
  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    const d: Record<string, any> = {};
    for (const c of cols) d[c.colId] = selected[c.colId];
    setDraft(d);
  }, [selected, cols]);

  // Fetch table pour construire la recherche candidats
  useEffect(() => {
    if (!docApi) return;
    (async () => {
      try {
        const t = await docApi.fetchTable(TABLE_ID);

        // On fabrique un "catalogue candidats"
        // Option.id = rowId (mais SearchDropdown veut number id ; OK)
        const opts: Option[] = [];
        const idByRow = new Map<number, number>();
        const rowById = new Map<number, number>();

        for (let i = 0; i < t.id.length; i++) {
          const rowId = t.id[i] as number;
          const prenom = (t["Prenom"]?.[i] ?? "").toString().trim();
          const nom = (t["Nom_de_famille"]?.[i] ?? "").toString().trim();
          const label = `${prenom} ${nom}`.trim() || `#${rowId}`;
          const hint = (t["ID2"]?.[i] ?? "").toString().trim();
          const q = `${label} ${hint}`.toLowerCase();

          // on invente un id interne stable (i+1) pour SearchDropdown
          const candidateId = i + 1;
          idByRow.set(rowId, candidateId);
          rowById.set(candidateId, rowId);

          opts.push({
            id: candidateId,
            label,
            q,
            hint, // <-- si ton SearchDropdown ignore hint, on affichera autrement (voir note)
          } as any);
        }

        setCandidateOptions(opts);
        setCandidateIdByRowId(idByRow);
        setRowIdByCandidateId(rowById);
      } catch (e: any) {
        // pas bloquant
        setStatus(`Erreur: ${e?.message ?? String(e)}`);
      }
    })();
  }, [docApi]);

  // Sync dropdown value avec record courant
  useEffect(() => {
    if (!selected?.id) return;
    const v = candidateIdByRowId.get(selected.id) ?? null;
    setCandidateValueId(v);
  }, [selected?.id, candidateIdByRowId]);

  async function save() {
    if (!docApi || !selected?.id) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      for (const c of cols) {
        if (!isEditable(c)) continue;
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

  // Mapping champs : on affiche la sous-tab, MAIS si recherche candidat on ne change pas
  const subtabColIds = useMemo(() => FIELD_MAP[activeTab]?.[activeSubtab] ?? [], [activeTab, activeSubtab]);
  const subtabFields = useMemo(() => subtabColIds.map((id) => colById.get(id)).filter((c): c is ColMeta => !!c), [subtabColIds, colById]);
  const isTabMapped = useMemo(() => {
    const subMap = FIELD_MAP[activeTab] ?? {};
    return Object.values(subMap).flat().length > 0;
  }, [activeTab]);

  return (
    <div className="emile-shell">

      {/* ===== HEADER BLEU ===== */}
      <header className="emile-header">
        <div className="emile-header__logo">
          <i className="fa-solid fa-landmark" aria-hidden="true" />
          DDT31
        </div>
        <span className="emile-header__appname">EMILE</span>
        {selectedName && (
          <>
            <span className="emile-header__sep">›</span>
            <span className="emile-header__candidate">{selectedName}</span>
            {selectedHint && <span className="emile-header__badge">{selectedHint}</span>}
          </>
        )}

        <div className="emile-header__spacer" />

        {/* Recherche candidat */}
        <div className="emile-header__search">
          <span className="emile-header__search-label">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          </span>
          <div className="emile-header__search-wrap">
            <SearchDropdown
              options={candidateOptions}
              valueId={candidateValueId}
              onChange={(candidateId) => {
                if (!candidateId) return;
                setCandidateValueId(candidateId);
                const rowId = rowIdByCandidateId.get(candidateId);
                const grist = (window as any).grist;
                if (rowId && grist?.setCursorPos) {
                  grist.setCursorPos({ rowId });
                } else {
                  setStatus("Info: sélection candidat active uniquement dans Grist.");
                }
              }}
              placeholder="Candidat…"
              disabled={candidateOptions.length === 0}
            />
          </div>
          <button
            type="button"
            className="emile-save-btn"
            onClick={save}
            disabled={!selected?.id || !docApi || saving}
          >
            <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>
      </header>

      {/* ===== BARRE L1 : onglets principaux ===== */}
      <nav className="emile-navbar" aria-label="Onglets principaux">
        {EMILE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`emile-nav-tab${activeTab === t.key ? " active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            <i className={t.icon} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </nav>

      {/* ===== BARRE L2 : subtabs ===== */}
      <div className="emile-subnav">
        {activeTabObj.subtabs.map((st) => (
          <button
            key={st.key}
            type="button"
            className={`emile-subnav-tab${activeSubtab === st.key ? " active" : ""}`}
            onClick={() => setActiveSubtab(st.key)}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* ===== STATUS ===== */}
      {status && (
        <div className="emile-status" style={{ padding: "0.4rem 1rem 0" }}>
          <StatusAlert status={status} />
        </div>
      )}

      {/* ===== CORPS ===== */}
      <div className="emile-body">
        {!selected || !docApi ? (
          <div className="fr-alert fr-alert--info">
            <p className="fr-alert__title">En attente</p>
            <p>Sélectionne un candidat dans Grist pour afficher son dossier.</p>
          </div>
        ) : !isTabMapped ? (
          <div className="fr-alert fr-alert--info">
            <p className="fr-alert__title">Onglet non mappé</p>
            <p>
              Pour l'instant, seul <b>Administratif</b> est mappé sur des colonnes Grist.
              <br />Prochaine étape : on mappe <b>{activeTabObj.label}</b>.
            </p>
          </div>
        ) : (
          <div className="emile-form-card">
            <div className="emile-field-grid">
              {subtabFields.map((c) => (
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
          </div>
        )}
      </div>

    </div>
  );
}

/* =======================
   FieldRenderer compact
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

  const labelCls = `emile-field__label${disabled ? " emile-field__label--readonly" : ""}`;
  const wrapCls = useTextarea ? "emile-field emile-field--wide" : "emile-field";

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
      <div className={wrapCls}>
        <div className={labelCls}>{col.label}</div>
        <input
          className="emile-input"
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
      <div className={wrapCls}>
        <div className={labelCls}>{col.label}</div>
        <SearchDropdown
          options={choiceOptions}
          valueId={valueId}
          onChange={(id) => onChange(id ? choiceLabelById.get(id) ?? null : null)}
          placeholder="—"
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
      <div className={wrapCls}>
        <div className={labelCls}>{col.label}</div>
        <SearchMultiDropdown
          options={choiceOptions}
          valueIds={selectedIds}
          onChange={(nextIds) => {
            const nextLabels = nextIds.map((id) => choiceLabelById.get(id)).filter((s): s is string => !!s);
            onChange(encodeListCell(nextLabels));
          }}
          placeholder="—"
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
        <div className={wrapCls}>
          <div className={labelCls}>{col.label}</div>
          <SearchDropdown
            options={refOptions}
            valueId={valueId}
            onChange={(id) => onChange(id)}
            placeholder={loading ? "…" : "—"}
            disabled={disabled || loading}
          />
        </div>
      );
    }

    const ids = decodeListCell(value).filter((x) => typeof x === "number") as number[];
    return (
      <div className={wrapCls}>
        <div className={labelCls}>{col.label}</div>
        <SearchMultiDropdown
          options={refOptions}
          valueIds={ids}
          onChange={(nextIds) => onChange(encodeListCell(nextIds))}
          placeholder={loading ? "…" : "—"}
          disabled={disabled || loading}
        />
      </div>
    );
  }

  if (useTextarea) {
    return (
      <div className={wrapCls}>
        <div className={labelCls}>{col.label}</div>
        <textarea
          className="emile-textarea"
          rows={3}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className={wrapCls}>
      <div className={labelCls}>{col.label}</div>
      <input
        className="emile-input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

