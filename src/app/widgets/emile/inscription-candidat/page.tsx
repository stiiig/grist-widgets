"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./styles.css";
import logoEmile from "./logo-emile-white.png";
import {
  loadColumnsMetaFor,
  encodeListCell,
  isoDateToUnixSeconds,
  ColMeta,
  GristDocAPI,
} from "@/lib/grist/meta";
import { SearchDropdown, SearchMultiDropdown, Option } from "@/components/SearchDropdown";
import { useGristInit } from "@/lib/grist/hooks";
import { choicesToOptions, deptSortKey, computeAge } from "@/lib/emile/utils";
import { DIAL_CODES, PINNED_PAYS, TYPE_TAG, FALLBACK_COLS } from "@/lib/emile/constants";
import { EMAIL_REGEX, validatePhone } from "@/lib/emile/validators";

const TABLE_ID    = "CANDIDATS";
const TOTAL_STEPS = 3;

/* ─── Types ─────────────────────────────────────────────────── */
type FormData = {
  // Étape 1 — Identité
  Prenom: string;
  Nom_de_famille: string;
  Date_de_naissance: string;
  Genre: string;
  Nationalite: number | null;        // Ref:pays → rowId
  Majeur: string;
  Email: string;
  TelCode: string;   // indicatif pays, ex: "+33"
  Tel: string;
  // Étape 2 — Situation
  Departement_domicile_inscription: number | null;  // Ref:DPTS_REGIONS → rowId
  Adresse: string;
  Precarite_de_logement: string;
  Consentement_volontaire: boolean | null;
  Niveau_de_langue: number | null;   // Ref:NIVEAU_LANGUE → rowId
  Foyer: string;
  Regularite_situation: string;
  Primo_arrivant: boolean | null;
  Bpi: boolean | null;
  Pret_a_se_former: string[];
  // Étape 3 — Engagement
  Engagement_orienteur: boolean | null;
};

const INITIAL: FormData = {
  Prenom: "",
  Nom_de_famille: "",
  Date_de_naissance: "",
  Genre: "",
  Nationalite: null,
  Majeur: "",
  Email: "",
  TelCode: "France",   // nom du pays (clé unique)
  Tel: "",
  Departement_domicile_inscription: null,
  Adresse: "",
  Precarite_de_logement: "",
  Consentement_volontaire: null,
  Niveau_de_langue: null,
  Foyer: "",
  Regularite_situation: "",
  Primo_arrivant: null,
  Bpi: null,
  Pret_a_se_former: [],
  Engagement_orienteur: null,
};

/* ─── Pays ───────────────────────────────────────────────────── */
type PaysOption = Option & { typeNationalite: string };

/* Styles partagés avec SearchDropdown */
const SD_TRIGGER: React.CSSProperties = {
  width: "100%", textAlign: "left", height: "1.875rem",
  padding: "0 1.75rem 0 0.5rem", borderRadius: 4,
  border: "1px solid #d0d0d0", background: "#f9f9f9",
  cursor: "pointer", fontSize: "0.82rem",
  fontFamily: "Marianne, arial, sans-serif", color: "#1e1e1e",
  position: "relative", display: "flex", alignItems: "center",
  boxSizing: "border-box", whiteSpace: "nowrap",
  overflow: "hidden", textOverflow: "ellipsis",
};
const SD_PANEL: React.CSSProperties = {
  position: "absolute", zIndex: 500, top: "calc(100% + 3px)", left: 0,
  minWidth: "100%", border: "1px solid #c8c8e8", borderRadius: 6,
  background: "#fff", boxShadow: "0 6px 20px rgba(0,0,145,.1)", overflow: "hidden",
};
const SD_SEARCH: React.CSSProperties = {
  width: "100%", padding: "0.3rem 0.5rem", border: "none",
  borderBottom: "1px solid #eee", fontSize: "0.8rem",
  fontFamily: "Marianne, arial, sans-serif", outline: "none",
  boxSizing: "border-box",
};

function NationaliteDropdown({
  options, valueId, onChange, loading = false, required = false,
}: {
  options: PaysOption[]; valueId: number | null;
  onChange: (id: number | null) => void; loading?: boolean; required?: boolean;
}) {
  const [open, setOpen]         = useState(false);
  const [q, setQ]               = useState("");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const rootRef                 = useRef<HTMLDivElement | null>(null);

  const selected = valueId != null ? options.find((o) => o.id === valueId) ?? null : null;

  /* Pays épinglés (dans l'ordre PINNED_PAYS) */
  const pinnedOptions = useMemo(() =>
    PINNED_PAYS.map((name) => options.find((o) => o.label === name)).filter((o): o is PaysOption => !!o),
    [options],
  );
  const pinnedIds = useMemo(() => new Set(pinnedOptions.map((o) => o.id)), [pinnedOptions]);
  const otherOptions = useMemo(() => options.filter((o) => !pinnedIds.has(o.id)), [options, pinnedIds]);

  /* Filtrage selon recherche */
  const qq = q.trim().toLowerCase();
  const filteredPinned = qq ? pinnedOptions.filter((o) => (o.q ?? o.label).toLowerCase().includes(qq)) : pinnedOptions;
  const filteredOther  = qq ? otherOptions.filter((o) => (o.q ?? o.label).toLowerCase().includes(qq)).slice(0, 80) : otherOptions.slice(0, 80);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setQ(""); }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function renderOption(o: PaysOption) {
    const tag = TYPE_TAG[o.typeNationalite];
    const isSelected = valueId === o.id;
    return (
      <button
        key={o.id}
        type="button"
        onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
        onMouseEnter={() => setHoveredId(o.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", textAlign: "left", padding: "0.35rem 0.6rem",
          border: 0, borderBottom: "1px solid #f5f5f5",
          background: isSelected ? "#f0f0ff" : hoveredId === o.id ? "#f5f5ff" : "white",
          cursor: "pointer", fontSize: "0.82rem",
          fontFamily: "Marianne, arial, sans-serif", color: "#1e1e1e",
          fontWeight: isSelected ? 700 : 400,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
        {o.typeNationalite && (
          <span style={{
            fontSize: "0.62rem", fontWeight: 700, padding: "0.1rem 0.35rem",
            borderRadius: 3, marginLeft: "0.5rem", flexShrink: 0,
            background: tag?.bg ?? "#f3f4f6", color: tag?.color ?? "#555",
            whiteSpace: "nowrap",
          }}>
            {o.typeNationalite}
          </span>
        )}
      </button>
    );
  }

  function Divider() {
    return (
      <div style={{
        padding: "0.2rem 0.6rem", fontSize: "0.7rem", fontWeight: 600,
        color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em",
        background: "#f9f9f9", borderBottom: "1px solid #eee",
      }}>
        Autres pays
      </div>
    );
  }

  return (
    <div className="ins-field">
      <label className="ins-label">
        Nationalité{required && <span className="ins-required"> *</span>}
      </label>
      <div ref={rootRef} style={{ position: "relative" }}>
        <button
          type="button"
          style={loading && options.length === 0 ? { ...SD_TRIGGER, background: "#f3f3f3", color: "#999", cursor: "default" } : SD_TRIGGER}
          onClick={() => { if (!(loading && options.length === 0)) setOpen((v) => !v); }}
        >
          {selected
            ? <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{selected.label}</span>
            : <span style={{ opacity: 0.5 }}>{loading && options.length === 0 ? "Chargement…" : "Sélectionner"}</span>
          }
          <span style={{ position: "absolute", right: "0.4rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.65rem", color: "#888", pointerEvents: "none" }}>▾</span>
        </button>

        {open && (
          <div style={SD_PANEL}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un pays…"
              style={SD_SEARCH}
              autoFocus
            />
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {filteredPinned.map(renderOption)}
              {filteredPinned.length > 0 && filteredOther.length > 0 && <Divider />}
              {filteredOther.map(renderOption)}
              {filteredPinned.length === 0 && filteredOther.length === 0 && (
                <div style={{ padding: "0.5rem 0.6rem", fontSize: "0.8rem", color: "#999" }}>Aucun résultat.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Style inline appliqué sur le bouton actif (priorité absolue sur tout CSS externe) */
const OUINON_ACTIVE: React.CSSProperties = {
  background: "#000091", borderColor: "#000091", color: "#fff",
};

/* ─── InfoPopover (portal → jamais coupé par overflow) ──────── */
function InfoPopover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<{ top: number; left: number } | null>(null);
  const btnRef  = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function calcPos() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
  }

  return (
    <span ref={rootRef} onMouseLeave={() => setOpen(false)} style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: "0.35rem" }}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={() => { calcPos(); setOpen(true); }}
        onClick={(e) => { e.preventDefault(); if (!open) { calcPos(); setOpen(true); } else setOpen(false); }}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#000091", fontSize: "0.9rem", padding: "0 0.1rem", display: "inline-flex", alignItems: "center", lineHeight: 1 }}
      >
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div style={{
          position: "fixed", zIndex: 9999, top: pos.top, left: pos.left,
          width: "22rem", maxWidth: "calc(100vw - 2rem)",
          background: "#fff", border: "1px solid #c8c8e8", borderRadius: 6,
          boxShadow: "0 6px 20px rgba(0,0,145,.12)",
          padding: "0.75rem 1rem",
          fontSize: "0.82rem", lineHeight: 1.55, color: "#1e1e1e", fontWeight: 400,
        }}>
          {children}
        </div>,
        document.body
      )}
    </span>
  );
}

/* ─── FAQ Panel ──────────────────────────────────────────────── */
type FAQItem = {
  id: number;
  titre: string;
  contenu: string;
  section: string;
  obligatoire: string;
};

function FAQPanel({ docApi, onClose }: { docApi: GristDocAPI; onClose: () => void }) {
  const [items, setItems]               = useState<FAQItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds]   = useState<Set<number>>(new Set());

  useEffect(() => {
    docApi.fetchTable("FAQ").then((table: any) => {
      const ids = table.id as number[];
      const next: FAQItem[] = [];
      for (let i = 0; i < ids.length; i++) {
        const titre = String(table["Titre"]?.[i] ?? "").trim();
        if (!titre) continue;
        next.push({
          id:          ids[i],
          titre,
          contenu:     String(table["Contenu"]?.[i] ?? "").trim(),
          section:     String(table["Section_de_la_question"]?.[i] ?? "Général").trim() || "Général",
          obligatoire: String(table["Obligatoire_ou_non"]?.[i] ?? "").trim(),
        });
      }
      setItems(next);
      setOpenSections(new Set(next.map((x) => x.section)));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [docApi]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((x) =>
        x.titre.toLowerCase().includes(q) ||
        x.contenu.toLowerCase().includes(q) ||
        x.section.toLowerCase().includes(q)
      )
    : items;

  const grouped = useMemo(() => {
    const map = new Map<string, FAQItem[]>();
    for (const item of filtered) {
      if (!map.has(item.section)) map.set(item.section, []);
      map.get(item.section)!.push(item);
    }
    return map;
  }, [filtered]);

  function toggleSection(s: string) {
    setOpenSections((prev) => { const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next; });
  }
  function toggleItem(id: number) {
    setExpandedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  const isObligatoire = (v: string) =>
    v.toLowerCase().includes("oui") || v.toLowerCase().includes("obligatoire");

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 8000, background: "rgba(0,0,0,0.28)", display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 400, maxWidth: "100vw", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 28px rgba(0,0,0,0.18)", height: "100%" }}>

        <div style={{ background: "#000091", color: "#fff", padding: "0 1.2rem", height: "3rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <i className="fa-solid fa-circle-question" style={{ fontSize: "1rem" }} />
            <span style={{ fontWeight: 700, fontSize: "0.95rem", letterSpacing: "0.02em" }}>FAQ EMILE</span>
            {!loading && (
              <span style={{ fontSize: "0.7rem", opacity: 0.75, background: "rgba(255,255,255,0.18)", borderRadius: 99, padding: "0.1rem 0.5rem" }}>
                {items.length} fiche{items.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1.15rem", padding: "0.2rem", display: "flex", alignItems: "center", lineHeight: 1 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ padding: "0.65rem 1rem", borderBottom: "1px solid #eee", flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "0.6rem", top: "50%", transform: "translateY(-50%)", color: "#bbb", fontSize: "0.78rem", pointerEvents: "none" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une fiche…" autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "0.42rem 0.6rem 0.42rem 2rem", border: "1px solid #d0d0d0", borderRadius: 6, fontSize: "0.83rem", fontFamily: "Marianne, arial, sans-serif", outline: "none" }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#bbb" }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "1.2rem" }} />
            </div>
          ) : grouped.size === 0 ? (
            <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "#999", fontSize: "0.85rem" }}>
              {q ? <>Aucun résultat pour <b>« {search} »</b></> : "Aucune fiche disponible."}
            </div>
          ) : (
            Array.from(grouped.entries()).map(([section, secItems]) => (
              <div key={section}>
                <button type="button" onClick={() => toggleSection(section)}
                  style={{ width: "100%", textAlign: "left", padding: "0.55rem 1rem", background: "#f4f4f8", border: 0, borderBottom: "1px solid #e5e5f0", borderTop: "1px solid #e5e5f0", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "Marianne, arial, sans-serif" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "#000091" }}>{section}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.68rem", color: "#888", background: "#e8e8f0", borderRadius: 99, padding: "0.1rem 0.4rem", fontWeight: 600 }}>{secItems.length}</span>
                    <i className={`fa-solid fa-chevron-${openSections.has(section) ? "up" : "down"}`} style={{ fontSize: "0.68rem", color: "#888" }} />
                  </span>
                </button>
                {openSections.has(section) && secItems.map((item) => {
                  const expanded = expandedIds.has(item.id);
                  const oblig    = isObligatoire(item.obligatoire);
                  return (
                    <div key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <button type="button" onClick={() => toggleItem(item.id)}
                        style={{ width: "100%", textAlign: "left", padding: "0.65rem 1rem", background: expanded ? "#f6f6ff" : "#fff", border: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem", cursor: "pointer", fontFamily: "Marianne, arial, sans-serif", transition: "background 0.1s" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "0.28rem", flex: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: "0.84rem", color: "#1e1e1e", lineHeight: 1.4 }}>{item.titre}</span>
                          {item.obligatoire && (
                            <span style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: "0.62rem", fontWeight: 700, padding: "0.1rem 0.45rem", borderRadius: 3, background: oblig ? "#fef2f2" : "#f3f4f6", color: oblig ? "#dc2626" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              {oblig ? "● Obligatoire" : `○ ${item.obligatoire}`}
                            </span>
                          )}
                        </span>
                        <i className={`fa-solid fa-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: "0.68rem", color: "#aaa", marginTop: "0.3rem", flexShrink: 0 }} />
                      </button>
                      {expanded && item.contenu && (
                        <div style={{ padding: "0.5rem 1rem 0.9rem 1rem", background: "#f6f6ff", fontSize: "0.82rem", lineHeight: 1.65, color: "#333", whiteSpace: "pre-wrap", borderTop: "1px solid #eeeeff" }}>
                          {item.contenu}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Composants UI génériques ───────────────────────────────── */

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="ins-step-header">
      <h2 className="ins-step-title">
        {title} <span className="ins-step-badge">(étape {step}/{TOTAL_STEPS})</span>
      </h2>
      {subtitle && <p className="ins-step-subtitle">{subtitle}</p>}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="ins-section-title">{title}</h3>;
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="ins-infobox">
      <i className="fa-solid fa-circle-info ins-infobox__icon" aria-hidden="true" />
      <div className="ins-infobox__text">{children}</div>
    </div>
  );
}

function FieldWrap({ label, required, info, children }: { label: string; required?: boolean; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="ins-field">
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
        {info && <InfoPopover>{info}</InfoPopover>}
      </label>
      {children}
    </div>
  );
}

/* Choice → SearchDropdown (valeur string) */
function ChoiceField({
  label, choices, value, onChange, required = false, info,
}: {
  label: string; choices: string[]; value: string;
  onChange: (v: string) => void; required?: boolean; info?: React.ReactNode;
}) {
  const options = useMemo(() => choicesToOptions(choices), [choices]);
  const valueId = value ? (options.find((o) => o.label === value)?.id ?? null) : null;
  return (
    <FieldWrap label={label} required={required} info={info}>
      <SearchDropdown
        options={options}
        valueId={valueId}
        onChange={(id) => onChange(id ? (options.find((o) => o.id === id)?.label ?? "") : "")}
        placeholder="Sélectionner"
        searchable={options.length > 6}
      />
    </FieldWrap>
  );
}

/* Ref → SearchDropdown (valeur rowId number) */
function RefField({
  label, options, valueId, onChange, required = false, loading = false,
}: {
  label: string; options: Option[]; valueId: number | null;
  onChange: (id: number | null) => void; required?: boolean; loading?: boolean;
}) {
  return (
    <FieldWrap label={label} required={required}>
      <SearchDropdown
        options={options}
        valueId={valueId}
        onChange={onChange}
        placeholder={loading ? "Chargement…" : "Sélectionner"}
        disabled={loading && options.length === 0}
        searchable={true}
      />
    </FieldWrap>
  );
}

/* ChoiceList → SearchMultiDropdown (valeur string[]) */
function MultiChoiceField({
  label, choices, value, onChange, required = false, info,
}: {
  label: string; choices: string[]; value: string[];
  onChange: (v: string[]) => void; required?: boolean; info?: React.ReactNode;
}) {
  const options  = useMemo(() => choicesToOptions(choices), [choices]);
  const valueIds = useMemo(
    () => value.map((l) => options.find((o) => o.label === l)?.id).filter((id): id is number => id !== undefined),
    [value, options],
  );
  return (
    <FieldWrap label={label} required={required} info={info}>
      <SearchMultiDropdown
        options={options}
        valueIds={valueIds}
        onChange={(ids) => onChange(ids.map((id) => options.find((o) => o.id === id)?.label ?? "").filter(Boolean))}
        placeholder="Sélectionner"
        searchable={options.length > 6}
      />
    </FieldWrap>
  );
}


function TelField({
  value, onValueChange, code, onCodeChange, required = false,
}: {
  value: string; onValueChange: (v: string) => void;
  code: string; onCodeChange: (c: string) => void; required?: boolean;
}) {
  const [open, setOpen]               = useState(false);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [dialSearch, setDialSearch]   = useState("");
  const rootRef                       = useRef<HTMLDivElement | null>(null);

  // code stocke le NOM du pays (clé unique) pour éviter l'ambiguïté de +1
  const selected = DIAL_CODES.find((d) => d.name === code) ?? DIAL_CODES[0];

  const filteredDial = useMemo(() => {
    const q = dialSearch.trim().toLowerCase();
    if (!q) return DIAL_CODES;
    return DIAL_CODES.filter((d) => d.name.toLowerCase().includes(q) || d.code.includes(q));
  }, [dialSearch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setDialSearch(""); }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="ins-field">
      <label className="ins-label">
        Téléphone{required && <span className="ins-required"> *</span>}
      </label>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        {/* Picker drapeau */}
        <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              height: "2.25rem", padding: "0 0.5rem",
              border: "1px solid #c1c1c1", borderRadius: 4,
              background: "#f8f8f8", cursor: "pointer",
              fontFamily: "inherit", fontSize: "0.85rem",
              display: "flex", alignItems: "center", gap: "0.3rem",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>{selected.flag}</span>
            <span style={{ color: "#444", fontSize: "0.8rem", fontWeight: 600 }}>{selected.code}</span>
            <span style={{ fontSize: "0.6rem", color: "#888" }}>▾</span>
          </button>
          {open && (
            <div style={{
              position: "absolute", zIndex: 500, top: "calc(100% + 3px)", left: 0,
              width: "16rem", border: "1px solid #c8c8e8", borderRadius: 6,
              background: "#fff", boxShadow: "0 6px 20px rgba(0,0,145,.1)",
            }}>
              <input
                value={dialSearch}
                onChange={(e) => setDialSearch(e.target.value)}
                placeholder="Rechercher un pays…"
                style={SD_SEARCH}
                autoFocus
              />
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {filteredDial.map((d) => (
                  <button
                    key={d.name}
                    type="button"
                    onMouseEnter={() => setHoveredName(d.name)}
                    onMouseLeave={() => setHoveredName(null)}
                    onClick={() => { onCodeChange(d.name); setOpen(false); setDialSearch(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      width: "100%", padding: "0.35rem 0.6rem",
                      border: 0, borderBottom: "1px solid #f5f5f5",
                      background: d.name === code ? "#f0f0ff" : hoveredName === d.name ? "#f5f5ff" : "white",
                      cursor: "pointer", fontSize: "0.82rem",
                      fontFamily: "inherit", textAlign: "left",
                      fontWeight: d.name === code ? 700 : 400,
                    }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>{d.flag}</span>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span style={{ color: "#888", fontSize: "0.78rem" }}>{d.code}</span>
                  </button>
                ))}
                {filteredDial.length === 0 && (
                  <div style={{ padding: "0.5rem 0.6rem", fontSize: "0.8rem", color: "#999" }}>Aucun résultat.</div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Numéro */}
        <input
          type="tel"
          className="ins-input"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}

function TextField({
  label, value, onChange, type = "text", required = false,
  placeholder = "", readOnly = false, wide = false, rows = 1,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string; readOnly?: boolean; wide?: boolean; rows?: number;
}) {
  return (
    <div className={wide ? "ins-field ins-field--wide" : "ins-field"}>
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
      </label>
      {rows > 1 ? (
        <textarea
          className={`ins-input${readOnly ? " ins-input--readonly" : ""}`}
          rows={rows}
          value={value}
          onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          style={{ height: "auto", resize: "vertical", paddingTop: "0.4rem", paddingBottom: "0.4rem" }}
        />
      ) : (
        <input
          type={type}
          className={`ins-input${readOnly ? " ins-input--readonly" : ""}`}
          value={value}
          onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

/* ─── Sélecteur de date de naissance ────────────────────── */
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MAX_BIRTH_YEAR = new Date().getFullYear() - 15;
const MIN_BIRTH_YEAR = new Date().getFullYear() - 100;
const BIRTH_YEARS = Array.from(
  { length: MAX_BIRTH_YEAR - MIN_BIRTH_YEAR + 1 },
  (_, i) => MAX_BIRTH_YEAR - i,
);

function DateNaissanceField({
  value, onChange, required = false, genre = "",
}: {
  value: string; onChange: (v: string) => void; required?: boolean; genre?: string;
}) {
  // État interne pour chaque partie — indépendant du prop value
  // (permet de sélectionner jour/mois/année dans n'importe quel ordre)
  const init = value ? value.split("-") : ["", "", ""];
  const [selY, setSelY] = useState(init[0] ?? "");
  const [selM, setSelM] = useState(init[1] ?? "");
  const [selD, setSelD] = useState(init[2] ?? "");

  // Sync depuis le parent uniquement quand value change de l'extérieur (reset)
  useEffect(() => {
    const p = value ? value.split("-") : ["", "", ""];
    setSelY(p[0] ?? "");
    setSelM(p[1] ?? "");
    setSelD(p[2] ?? "");
  }, [value]);

  function commit(y: string, m: string, d: string) {
    if (y && m && d) {
      const maxDay = new Date(parseInt(y), parseInt(m), 0).getDate();
      const clampedDay = Math.min(parseInt(d), maxDay);
      onChange(`${y}-${m}-${String(clampedDay).padStart(2, "0")}`);
    } else {
      onChange("");
    }
  }

  const daysInMonth = selY && selM
    ? new Date(parseInt(selY), parseInt(selM), 0).getDate()
    : 31;

  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => ({ id: i + 1, label: String(i + 1) })),
    [daysInMonth],
  );
  const monthOptions = useMemo(
    () => MONTHS_FR.map((name, i) => ({ id: i + 1, label: name })),
    [],
  );
  const yearOptions = useMemo(
    () => BIRTH_YEARS.map((y) => ({ id: y, label: String(y) })),
    [],
  );

  const dayId   = selD ? parseInt(selD, 10)  : null;
  const monthId = selM ? parseInt(selM, 10)  : null;
  const yearId  = selY ? parseInt(selY, 10)  : null;

  const age = computeAge(value);

  return (
    <div className="ins-field">
      <label className="ins-label">
        Date de naissance{required && <span className="ins-required"> *</span>}
      </label>
      <div className="ins-date-row">
        {/* Jour */}
        <div style={{ flex: "1 1 0%" }}>
          <SearchDropdown
            options={dayOptions}
            valueId={dayId}
            onChange={(id) => {
              if (!id) return;
              const d = String(id).padStart(2, "0");
              setSelD(d); commit(selY, selM, d);
            }}
            placeholder="Jour"
            searchable={true}
          />
        </div>
        {/* Mois */}
        <div style={{ flex: "1 1 0%" }}>
          <SearchDropdown
            options={monthOptions}
            valueId={monthId}
            onChange={(id) => {
              if (!id) return;
              const m = String(id).padStart(2, "0");
              setSelM(m); commit(selY, m, selD);
            }}
            placeholder="Mois"
            searchable={true}
          />
        </div>
        {/* Année */}
        <div style={{ flex: "1 1 0%" }}>
          <SearchDropdown
            options={yearOptions}
            valueId={yearId}
            onChange={(id) => {
              if (!id) return;
              const y = String(id);
              setSelY(y); commit(y, selM, selD);
            }}
            placeholder="Année"
            searchable={true}
          />
        </div>
      </div>
      {age !== null && (
        <div className="ins-age-badge-row">
          <span className="ins-age-badge ins-age-badge--age">
            {age} ans
          </span>
          <span className={`ins-age-badge ins-age-badge--${age >= 18 ? "majeur" : "mineur"}`}>
            {age >= 18
              ? (genre === "Femme" ? "Majeure ✓" : genre === "Homme" ? "Majeur ✓" : "Majeur·e ✓")
              : (genre === "Femme" ? "Mineure" : genre === "Homme" ? "Mineur" : "Mineur·e")
            }
          </span>
        </div>
      )}
    </div>
  );
}

function GenreField({
  value, onChange, required = false,
}: {
  value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div className="ins-field ins-field--wide">
      <label className="ins-label">
        Genre{required && <span className="ins-required"> *</span>}
      </label>
      <div className="ins-ouinon">
        <button type="button" className={`ins-ouinon-btn${value === "Femme" ? " ins-ouinon-btn--active" : ""}`} style={value === "Femme" ? OUINON_ACTIVE : undefined} onClick={() => onChange("Femme")}>Femme</button>
        <button type="button" className={`ins-ouinon-btn${value === "Homme" ? " ins-ouinon-btn--active" : ""}`} style={value === "Homme" ? OUINON_ACTIVE : undefined} onClick={() => onChange("Homme")}>Homme</button>
      </div>
    </div>
  );
}

function OuiNonField({
  label, value, onChange, required = false, description, info,
}: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; description?: string; info?: React.ReactNode;
}) {
  return (
    <div className="ins-field ins-field--wide">
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
        {info && <InfoPopover>{info}</InfoPopover>}
      </label>
      {description && <p className="ins-field-desc">{description}</p>}
      <div className="ins-ouinon">
        <button type="button" className={`ins-ouinon-btn${value === "Oui" ? " ins-ouinon-btn--active" : ""}`} style={value === "Oui" ? OUINON_ACTIVE : undefined} onClick={() => onChange("Oui")}>Oui</button>
        <button type="button" className={`ins-ouinon-btn${value === "Non" ? " ins-ouinon-btn--active" : ""}`} style={value === "Non" ? OUINON_ACTIVE : undefined} onClick={() => onChange("Non")}>Non</button>
      </div>
    </div>
  );
}

function ToggleOuiNon({
  label, value, onChange, required = false, description, info,
}: {
  label: string; value: boolean | null; onChange: (v: boolean) => void;
  required?: boolean; description?: string; info?: React.ReactNode;
}) {
  return (
    <div className="ins-field ins-field--wide">
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
        {info && <InfoPopover>{info}</InfoPopover>}
      </label>
      {description && <p className="ins-field-desc">{description}</p>}
      <div className="ins-ouinon">
        <button type="button" className={`ins-ouinon-btn${value === true ? " ins-ouinon-btn--active" : ""}`} style={value === true ? OUINON_ACTIVE : undefined} onClick={() => onChange(true)}>Oui</button>
        <button type="button" className={`ins-ouinon-btn${value === false ? " ins-ouinon-btn--active" : ""}`} style={value === false ? OUINON_ACTIVE : undefined} onClick={() => onChange(false)}>Non</button>
      </div>
    </div>
  );
}

function CheckboxField({
  label, value, onChange, description,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; description?: string;
}) {
  return (
    <div className="ins-field ins-field--wide">
      <label className="ins-checkbox-label">
        <input type="checkbox" className="ins-checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span className="ins-checkbox-text">
          {label}
          {description && <span className="ins-field-desc"> {description}</span>}
        </span>
      </label>
    </div>
  );
}

function ValidationError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="ins-validation-error">
      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      {message}
    </div>
  );
}

/* ─── Ecran d'éligibilité (écran final) ─────────────────────── */
function EligibilityScreen({
  form,
  dptsOptions,
  dptsIsDepart,
  niveauOptions,
  niveauEligibilite,
  paysOptions,
  id2,
  onNew,
}: {
  form: FormData;
  dptsOptions: Option[];
  dptsIsDepart: Map<number, boolean>;
  niveauOptions: Option[];
  niveauEligibilite: Map<number, string>;
  paysOptions: PaysOption[];
  id2?: string | null;
  onNew: () => void;
}) {
  const age      = computeAge(form.Date_de_naissance);
  const deptOpt  = form.Departement_domicile_inscription != null
    ? dptsOptions.find((o) => o.id === form.Departement_domicile_inscription) ?? null
    : null;
  const deptLabel = deptOpt?.label ?? null;

  const niveauLabel      = form.Niveau_de_langue != null
    ? niveauOptions.find((o) => o.id === form.Niveau_de_langue)?.label ?? null
    : null;
  const nationaliteLabel = form.Nationalite != null
    ? paysOptions.find((o) => o.id === form.Nationalite)?.label ?? null
    : null;

  const isFemme = form.Genre === "Femme";
  const isHomme = form.Genre === "Homme";
  const e = isFemme ? "e" : isHomme ? "" : "·e";

  type Criterion = { id: string; label: string; ok: boolean | null; detail?: string };
  const criteria: Criterion[] = [
    {
      id: "engagement",
      label: "Orienteur·se co-accompagnant·e engagé·e",
      ok: form.Engagement_orienteur === null ? null : form.Engagement_orienteur,
    },
    {
      id: "territoire",
      label: "Territoire de départ",
      ok: form.Departement_domicile_inscription == null
        ? null
        : dptsIsDepart.get(form.Departement_domicile_inscription) === true,
      detail: deptLabel
        ? [deptLabel, deptOpt?.tag ?? null].filter(Boolean).join(" — ")
        : undefined,
    },
    {
      id: "majeur",
      label: age != null && age < 18 ? `Candidat${e} mineur${e}` : `Candidat${e} majeur${e}`,
      ok: age == null ? null : age >= 18,
      detail: age != null ? `${age} an${age > 1 ? "s" : ""}` : undefined,
    },
    {
      id: "langue",
      label: "Niveau de langue",
      ok: form.Niveau_de_langue == null
        ? null
        : (niveauEligibilite.get(form.Niveau_de_langue) ?? "").toLowerCase() === "oui",
      detail: niveauLabel || undefined,
    },
    {
      id: "logement",
      label: "Situation de précarité du logement avérée",
      ok: !form.Precarite_de_logement
        ? null
        : form.Precarite_de_logement !== "Aucun des choix ne correspond à la situation",
      detail: form.Precarite_de_logement || undefined,
    },
    {
      id: "regularite",
      label: "En situation régulière",
      ok: !form.Regularite_situation
        ? null
        : form.Regularite_situation === "Oui",
    },
    {
      id: "volontariat",
      label: "Volontariat pour le programme EMILE",
      ok: form.Consentement_volontaire === null ? null : form.Consentement_volontaire,
    },
  ];

  const failingCount = criteria.filter((c) => c.ok === false).length;
  const unknownCount = criteria.filter((c) => c.ok === null).length;
  const eligible     = failingCount === 0 && unknownCount === 0;

  const fullName = [form.Prenom, form.Nom_de_famille]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .toUpperCase() || "CANDIDAT·E";

  const W: React.CSSProperties = { maxWidth: 560, width: "100%", margin: "0 auto" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>

      {/* ── Carte candidat·e ── */}
      <div style={{
        ...W,
        background: "#000091", borderRadius: "0.75rem",
        padding: "1rem 1.25rem", color: "#fff",
        display: "flex", alignItems: "center", gap: "0.9rem",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(255,255,255,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontSize: "1.2rem",
        }}>
          <i className="fa-solid fa-user" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.3rem", letterSpacing: "0.03em" }}>
            {fullName}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {age != null && (
              <span style={{
                background: "rgba(255,255,255,0.18)", borderRadius: 99,
                padding: "0.1rem 0.55rem", fontSize: "0.72rem", fontWeight: 600,
              }}>
                <i className="fa-solid fa-cake-candles" style={{ marginRight: "0.3rem", fontSize: "0.65rem" }} />
                {age} an{age > 1 ? "s" : ""}
              </span>
            )}
            {form.Genre && (
              <span style={{
                background: "rgba(255,255,255,0.18)", borderRadius: 99,
                padding: "0.1rem 0.55rem", fontSize: "0.72rem", fontWeight: 600,
              }}>
                <i className="fa-solid fa-venus-mars" style={{ marginRight: "0.3rem", fontSize: "0.65rem" }} />
                {form.Genre}
              </span>
            )}
            {nationaliteLabel && (
              <span style={{
                background: "rgba(255,255,255,0.18)", borderRadius: 99,
                padding: "0.1rem 0.55rem", fontSize: "0.72rem", fontWeight: 600,
              }}>
                <i className="fa-solid fa-passport" style={{ marginRight: "0.3rem", fontSize: "0.65rem" }} />
                {nationaliteLabel}
              </span>
            )}
          </div>
        </div>
        {id2 && (
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: "0.6rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>
              Référence
            </div>
            <div style={{
              fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.04em",
              background: "rgba(255,255,255,0.18)", borderRadius: 4,
              padding: "0.2rem 0.55rem",
            }}>
              {id2}
            </div>
          </div>
        )}
      </div>

      {/* ── Critères ── */}
      <div style={W}>
        <div style={{
          fontSize: "0.72rem", fontWeight: 700, color: "#888",
          textTransform: "uppercase", letterSpacing: "0.07em",
          marginBottom: "0.55rem",
        }}>
          Vérification des critères d&apos;éligibilité
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {criteria.map((c) => {
            const isOk  = c.ok === true;
            const isNok = c.ok === false;
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: "0.7rem",
                background: isOk ? "#f0fdf4" : isNok ? "#fef2f2" : "#fff",
                border: `1px solid ${isOk ? "#bbf7d0" : isNok ? "#fecaca" : "#e5e5e5"}`,
                borderRadius: "0.5rem",
                padding: "0.55rem 0.8rem",
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem",
                  background: isOk ? "#16a34a" : isNok ? "#dc2626" : "#d1d5db",
                  color: "#fff",
                }}>
                  {isOk
                    ? <i className="fa-solid fa-check" />
                    : isNok
                    ? <i className="fa-solid fa-xmark" />
                    : <i className="fa-solid fa-minus" />
                  }
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.82rem", color: "#1e1e1e", lineHeight: 1.3 }}>{c.label}</div>
                  {c.detail && (
                    <div style={{
                      fontSize: "0.7rem", color: "#777", marginTop: "0.1rem",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.detail}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: "0.65rem", fontWeight: 700, padding: "0.12rem 0.45rem",
                  borderRadius: 99, flexShrink: 0, textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  background: isOk ? "#dcfce7" : isNok ? "#fee2e2" : "#f3f4f6",
                  color: isOk ? "#15803d" : isNok ? "#b91c1c" : "#9ca3af",
                }}>
                  {isOk ? "Éligible" : isNok ? "Non éligible" : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Résultat global ── */}
      <div style={{
        ...W,
        borderRadius: "0.75rem",
        padding: "1rem 1.2rem",
        background: eligible ? "#f0fdf4" : failingCount > 0 ? "#fef2f2" : "#f8fafc",
        border: `2px solid ${eligible ? "#16a34a" : failingCount > 0 ? "#dc2626" : "#cbd5e1"}`,
        display: "flex", alignItems: "center", gap: "0.85rem",
      }}>
        <span style={{
          width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.3rem",
          background: eligible ? "#16a34a" : failingCount > 0 ? "#dc2626" : "#94a3b8",
          color: "#fff",
        }}>
          <i className={`fa-solid ${eligible ? "fa-circle-check" : failingCount > 0 ? "fa-circle-xmark" : "fa-circle-question"}`} />
        </span>
        <div>
          <div style={{
            fontWeight: 700, fontSize: "1rem",
            color: eligible ? "#15803d" : failingCount > 0 ? "#b91c1c" : "#334155",
          }}>
            {eligible
              ? `Candidat${e} éligible au programme EMILE`
              : failingCount > 0
              ? `Candidat${e} non éligible au programme EMILE`
              : "Éligibilité incomplète"
            }
          </div>
          <div style={{ fontSize: "0.78rem", color: "#555", marginTop: "0.25rem", lineHeight: 1.4 }}>
            {eligible
              ? `Nous avons le plaisir de vous confirmer que l'inscription au programme EMILE pour ${[form.Prenom, form.Nom_de_famille.toUpperCase()].filter(Boolean).join(" ")}${id2 ? ` (référence ${id2})` : ""} a été validée comme éligible.`
              : failingCount > 0
              ? `${failingCount} critère${failingCount > 1 ? "s" : ""} non rempli${failingCount > 1 ? "s" : ""}. L'inscription au programme EMILE pour ${[form.Prenom, form.Nom_de_famille.toUpperCase()].filter(Boolean).join(" ")}${id2 ? ` (référence ${id2})` : ""} n'a malheureusement pas été validée et reste inéligible en l'état.`
              : "Certains critères n'ont pas pu être vérifiés automatiquement."
            }
          </div>
        </div>
      </div>

      {/* ── Message si éligible ── */}
      {eligible && (
        <div style={{
          ...W,
          display: "flex", alignItems: "flex-start", gap: "0.65rem",
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: "0.5rem", padding: "0.75rem 1rem",
        }}>
          <i className="fa-solid fa-envelope" style={{ color: "#2563eb", fontSize: "1rem", flexShrink: 0, marginTop: "0.05rem" }} />
          <div style={{ fontSize: "0.82rem", color: "#1e3a5f", lineHeight: 1.5 }}>
            Vous allez recevoir d&apos;ici quelques instants un email avec les instructions pour la suite.
          </div>
        </div>
      )}

      {/* ── Message si non éligible ── */}
      {failingCount > 0 && (
        <div style={{
          ...W,
          display: "flex", alignItems: "flex-start", gap: "0.65rem",
          background: "#fff7ed", border: "1px solid #fed7aa",
          borderRadius: "0.5rem", padding: "0.75rem 1rem",
        }}>
          <i className="fa-solid fa-envelope" style={{ color: "#ea580c", fontSize: "1rem", flexShrink: 0, marginTop: "0.05rem" }} />
          <div style={{ fontSize: "0.82rem", color: "#7c2d12", lineHeight: 1.5 }}>
            Pour avoir plus d&apos;explications sur cette situation, vous pouvez nous envoyer un message en répondant à l&apos;email que vous venez de recevoir.
          </div>
        </div>
      )}

      {/* ── Lien retour accueil ── */}
      <div style={{ ...W, textAlign: "center" }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#000091", fontSize: "0.83rem", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
            padding: "0.3rem 0", textDecoration: "underline", textUnderlineOffset: "3px",
          }}
        >
          <i className="fa-solid fa-arrow-left" style={{ fontSize: "0.7rem" }} />
          Revenir à l&apos;accueil
        </button>
      </div>

    </div>
  );
}

/* ─── Page principale ────────────────────────────────────────── */

export default function InscriptionPage() {
  const { mode, docApi }      = useGristInit();
  const [cols, setCols]       = useState<ColMeta[]>([]);

  // Options pour Nationalite (Ref:PAYS)
  const [paysOptions, setPaysOptions]   = useState<PaysOption[]>([]);
  const [paysLoading, setPaysLoading]   = useState(false);

  // Options pour Département (Ref:DPTS_REGIONS)
  const [dptsOptions, setDptsOptions]     = useState<Option[]>([]);
  const [dptsLoading, setDptsLoading]     = useState(false);

  // Options pour Niveau de langue (Ref:NIVEAU_LANGUE)
  const [niveauOptions, setNiveauOptions] = useState<Option[]>([]);
  const [niveauLoading, setNiveauLoading] = useState(false);

  const [form, setForm]               = useState<FormData>(INITIAL);
  const [step, setStep]               = useState(1);
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [validError, setValidError]   = useState("");
  const [showFaq, setShowFaq]         = useState(false);
  const [dptsIsDepart, setDptsIsDepart]           = useState<Map<number, boolean>>(new Map());
  const [niveauEligibilite, setNiveauEligibilite] = useState<Map<number, string>>(new Map());
  const [submittedId2, setSubmittedId2]           = useState<string | null>(null);

  /* ── Choix dynamiques depuis métadonnées Grist ── */
  const choicesMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of cols) {
      const raw = c.widgetOptionsParsed?.choices;
      if (Array.isArray(raw) && raw.length > 0) m.set(c.colId, raw.map(String));
    }
    return m;
  }, [cols]);

  function ch(colId: string): string[] {
    return choicesMap.get(colId) ?? [];
  }

  /* ── Chargement départements depuis table DPTS_REGIONS ── */
  useEffect(() => {
    if (!docApi) return;
    setDptsLoading(true);
    docApi.fetchTable("DPTS_REGIONS")
      .then((table: any) => {
        const ids = table.id as number[];
        const opts: Option[] = [];
        const departMap = new Map<number, boolean>();
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const label = String(table["Nom_departement"]?.[i] ?? "").trim();
          if (!label) continue;
          const numero   = String(table["Numero"]?.[i] ?? "").trim() || undefined;
          const region   = String(table["Nom_region"]?.[i] ?? "").trim() || undefined;
          const isDepart = table["Territoire_depart"]?.[i] === "Oui";
          departMap.set(id, isDepart);
          opts.push({ id, label, q: `${numero ?? ""} ${label}`.toLowerCase(), tagLeft: numero, tag: region });
        }
        opts.sort((a, b) => deptSortKey(a.tagLeft) - deptSortKey(b.tagLeft));
        setDptsIsDepart(departMap);
        setDptsOptions(opts);
      })
      .catch(() => {})
      .finally(() => setDptsLoading(false));
  }, [docApi]);

  /* ── Chargement niveaux de langue depuis table NIVEAU_LANGUE ── */
  useEffect(() => {
    if (!docApi) return;
    setNiveauLoading(true);
    docApi.fetchTable("NIVEAU_LANGUE")
      .then((table: any) => {
        const ids = table.id as number[];
        const opts: Option[] = [];
        const eligMap = new Map<number, string>();
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const label = String(table["Niveau_de_langue"]?.[i] ?? "").trim();
          if (!label) continue;
          const code = String(table["Code_langue"]?.[i] ?? "").trim() || undefined;
          const elig = String(table["Eligibilite"]?.[i] ?? "").trim();
          eligMap.set(id, elig);
          opts.push({ id, label, q: `${code ?? ""} ${label}`.toLowerCase(), tagLeft: code });
        }
        setNiveauEligibilite(eligMap);
        setNiveauOptions(opts);
      })
      .catch(() => {})
      .finally(() => setNiveauLoading(false));
  }, [docApi]);

  /* ── Auto-sélection Majeur selon date de naissance ── */
  useEffect(() => {
    if (!form.Date_de_naissance) return;
    const age = computeAge(form.Date_de_naissance);
    if (age === null) return;
    setForm((f) => ({ ...f, Majeur: age >= 18 ? "Oui" : "Non" }));
  }, [form.Date_de_naissance]);

  /* ── Chargement colonnes ── */
  useEffect(() => {
    if (!docApi) return;
    loadColumnsMetaFor(docApi, TABLE_ID)
      .then((meta) => setCols(meta))
      .catch(() => { setCols(FALLBACK_COLS); });
  }, [docApi]);

  /* ── Chargement pays depuis table PAYS ── */
  useEffect(() => {
    if (!docApi) return;
    setPaysLoading(true);
    docApi.fetchTable("PAYS")
      .then((table: any) => {
        const ids = table.id as number[];
        const opts: PaysOption[] = [];
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const label = String(table["Nom_du_pays"]?.[i] ?? "").trim();
          if (!label) continue;
          const typeNat = String(table["Type_de_nationalite"]?.[i] ?? "").trim();
          opts.push({ id, label, q: label.toLowerCase(), typeNationalite: typeNat });
        }
        opts.sort((a, b) => a.label.localeCompare(b.label, "fr"));
        setPaysOptions(opts);
      })
      .catch(() => {})
      .finally(() => setPaysLoading(false));
  }, [docApi]);

  /* ── Setters ── */
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setValidError("");
  }

  /* ── Validation par étape ── */
  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!form.Prenom.trim())         return "Le prénom est requis.";
      if (!form.Nom_de_famille.trim()) return "Le nom est requis.";
      if (!form.Date_de_naissance)     return "La date de naissance est requise.";
      if (!form.Genre)                 return "Le genre est requis.";
      if (!form.Nationalite)           return "La nationalité est requise.";
      if (!form.Email.trim())          return "L'email est requis.";
      if (!EMAIL_REGEX.test(form.Email.trim()))
                                       return "L'adresse email n'est pas valide.";
      const telErr = validatePhone(form.Tel, true);
      if (telErr) return telErr;
    }
    if (s === 2) {
      if (form.Departement_domicile_inscription === null) return "Le département est requis.";
      if (!form.Adresse.trim())                   return "L'adresse est requise.";
      if (!form.Precarite_de_logement)            return "La situation de précarité est requise.";
      if (form.Consentement_volontaire === null)   return "Le consentement au programme EMILE est requis.";
      if (form.Niveau_de_langue === null)          return "Le niveau de langue est requis.";
      if (!form.Foyer)                            return "La composition du foyer est requise.";
      if (!form.Regularite_situation)             return "La situation régulière est requise.";
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) { setValidError(err); return; }
    setValidError("");
    setStep((s) => s + 1);
    window.scrollTo(0, 0);
  }

  function prevStep() {
    setValidError("");
    setStep((s) => s - 1);
    window.scrollTo(0, 0);
  }

  /* ── Soumission ── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateStep(3);
    if (err) { setValidError(err); return; }
    if (!docApi) { setSubmitError("Grist non disponible."); return; }

    setSubmitting(true);
    setSubmitError("");
    try {
      const fields: Record<string, any> = {};

      // Champs texte / choice (string)
      const strFields = [
        "Prenom", "Nom_de_famille", "Genre", "Majeur",
        "Email", "Adresse",
        "Precarite_de_logement", "Foyer",
        "Regularite_situation",
      ] as const;
      for (const k of strFields) {
        if (form[k]) fields[k] = form[k];
      }

      // Téléphone : indicatif + numéro (TelCode = nom du pays → résoudre le +XX)
      if (form.Tel.trim()) {
        const dialCode = DIAL_CODES.find((d) => d.name === form.TelCode)?.code ?? "";
        fields.Tel = `${dialCode} ${form.Tel}`.trim();
      }

      // Refs (rowId)
      if (form.Nationalite !== null) fields.Nationalite = form.Nationalite;
      if (form.Departement_domicile_inscription !== null) fields.Departement_domicile_inscription = form.Departement_domicile_inscription;
      if (form.Niveau_de_langue !== null) fields.Niveau_de_langue = form.Niveau_de_langue;

      // Date → unix seconds
      if (form.Date_de_naissance) {
        const unix = isoDateToUnixSeconds(form.Date_de_naissance);
        if (unix) fields.Date_de_naissance = unix;
      }

      // Toggles (booléens)
      if (form.Consentement_volontaire !== null) fields.Consentement_volontaire = form.Consentement_volontaire;
      if (form.Engagement_orienteur   !== null) fields.Engagement_orienteur   = form.Engagement_orienteur;
      if (form.Primo_arrivant         !== null) fields.Primo_arrivant         = form.Primo_arrivant;
      if (form.Bpi                    !== null) fields.Bpi                    = form.Bpi;

      // ChoiceLists
      if (form.Pret_a_se_former.length > 0) {
        fields.Pret_a_se_former = encodeListCell(form.Pret_a_se_former);
      }

      const result = await docApi.applyUserActions([["AddRecord", TABLE_ID, null, fields]]);
      const newRowId = result?.retValues?.[0] as number | undefined;
      if (newRowId) {
        try {
          const table = await docApi.fetchTable(TABLE_ID);
          const ids = table.id as number[];
          const idx = ids.indexOf(newRowId);
          if (idx >= 0) setSubmittedId2(String(table["ID2"]?.[idx] ?? "").trim() || null);
        } catch { /* non bloquant */ }
      }
      setDone(true);
    } catch {
      setSubmitError("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ────────────────────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────────────────────── */

  if (done) {
    return (
      <div className="ins-shell">
        <header className="ins-header">
          <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
          <span className="ins-header__appname">Inscription candidat·e</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="ins-faq-btn" onClick={() => setShowFaq(true)}>
            <i className="fa-solid fa-circle-question" aria-hidden="true" />
            FAQ
          </button>
        </header>
        {showFaq && docApi && <FAQPanel docApi={docApi} onClose={() => setShowFaq(false)} />}
        <div className="ins-body">
          <EligibilityScreen
            form={form}
            dptsOptions={dptsOptions}
            dptsIsDepart={dptsIsDepart}
            niveauOptions={niveauOptions}
            niveauEligibilite={niveauEligibilite}
            paysOptions={paysOptions}
            id2={submittedId2}
            onNew={() => { setForm(INITIAL); setDone(false); setStep(1); setValidError(""); setSubmitError(""); setSubmittedId2(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ins-shell">
      <header className="ins-header">
        <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
        <span className="ins-header__appname">Inscription candidat·e</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="ins-faq-btn" onClick={() => setShowFaq(true)}>
          <i className="fa-solid fa-circle-question" aria-hidden="true" />
          FAQ
        </button>
      </header>
      {showFaq && docApi && <FAQPanel docApi={docApi} onClose={() => setShowFaq(false)} />}

      {mode === "boot" ? (
        <div className="ins-body ins-body--center">
          <div style={{ color: "#bbb", fontSize: "1.5rem" }}><i className="fa-solid fa-spinner fa-spin" /></div>
        </div>
      ) : mode === "none" || !docApi ? (
        <div className="ins-body">
          <div className="fr-alert fr-alert--warning">
            <p className="fr-alert__title">Non disponible</p>
            <p>Ce widget doit être ouvert dans Grist.</p>
          </div>
        </div>
      ) : (
        <div className="ins-body">

          {/* ── Barre de progression ── */}
          <div className="ins-progress">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`ins-progress__step${s === step ? " active" : s < step ? " done" : ""}`}>
                <div className="ins-progress__dot">
                  {s < step ? <i className="fa-solid fa-check" /> : s}
                </div>
                <span className="ins-progress__label">
                  {s === 1 ? "Identité" : s === 2 ? "Situation" : "Engagement"}
                </span>
              </div>
            ))}
            <div className="ins-progress__bar">
              <div className="ins-progress__fill" style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }} />
            </div>
          </div>

          <form className="ins-form" onSubmit={handleSubmit} noValidate>

            {/* ══ ÉTAPE 1 — Identité ══ */}
            {step === 1 && (
              <>
                <StepHeader step={1} title="Identité du / de la candidat·e" subtitle="Toutes les informations sont obligatoires." />

                <SectionTitle title="Informations administratives" />

                <TextField label="Prénom" value={form.Prenom} onChange={(v) => set("Prenom", v)} required placeholder="Prénom du candidat" />
                <TextField label="Nom de famille" value={form.Nom_de_famille} onChange={(v) => set("Nom_de_famille", v)} required placeholder="Nom de famille du candidat" />
                <GenreField value={form.Genre} onChange={(v) => set("Genre", v)} required />
                <NationaliteDropdown
                  options={paysOptions}
                  valueId={form.Nationalite}
                  onChange={(id) => set("Nationalite", id)}
                  loading={paysLoading}
                  required
                />
                <DateNaissanceField
                  value={form.Date_de_naissance}
                  onChange={(v) => set("Date_de_naissance", v)}
                  genre={form.Genre}
                  required
                />


                <SectionTitle title="Coordonnées du / de la candidat·e" />
                <TextField label="Email" value={form.Email} onChange={(v) => set("Email", v)} type="email" required />
                <TelField
                  value={form.Tel}
                  onValueChange={(v) => set("Tel", v)}
                  code={form.TelCode}
                  onCodeChange={(c) => set("TelCode", c)}
                  required
                />
              </>
            )}

            {/* ══ ÉTAPE 2 — Situation ══ */}
            {step === 2 && (
              <>
                <StepHeader step={2} title="Situation du / de la candidat·e" subtitle="Informations obligatoires *" />

                <SectionTitle title="Domiciliation" />
                <FieldWrap label="Département du domicile actuel" required>
                  <SearchDropdown
                    options={dptsOptions}
                    valueId={form.Departement_domicile_inscription}
                    onChange={(id) => set("Departement_domicile_inscription", id)}
                    placeholder={dptsLoading ? "Chargement…" : "Sélectionner"}
                    disabled={dptsLoading && dptsOptions.length === 0}
                    searchable
                  />
                </FieldWrap>
                <TextField label="Adresse de domiciliation" value={form.Adresse} onChange={(v) => set("Adresse", v)} required rows={3} />
                <ChoiceField
                  label="Situation de précarité du logement"
                  choices={ch("Precarite_de_logement")}
                  value={form.Precarite_de_logement}
                  onChange={(v) => set("Precarite_de_logement", v)}
                  required
                  info={<>
                    <strong>À NOTER :</strong><br />
                    — Pour bien comprendre les différentes situations de précarité du logement, cf. FAQ &gt; «&nbsp;Inscrire un·e candidat·e&nbsp;»<br />
                    — Une pièce justificative pourra vous être demandée, cf. FAQ «&nbsp;Les étapes du programme EMILE&nbsp;» &gt; «&nbsp;Justificatifs de la situation d'hébergement&nbsp;»
                  </>}
                />

                <SectionTitle title="Programme EMILE" />
                <ToggleOuiNon
                  label="Candidat·e volontaire pour une insertion professionnelle et une mobilité géographique via le programme EMILE, et d'accord pour que ses données personnelles soient partagées aux équipes du programme EMILE"
                  value={form.Consentement_volontaire}
                  onChange={(v) => set("Consentement_volontaire", v)}
                  required
                />

                <SectionTitle title="Autres informations" />
                <FieldWrap label="Niveau de langue" required>
                  <SearchDropdown
                    options={niveauOptions}
                    valueId={form.Niveau_de_langue}
                    onChange={(id) => set("Niveau_de_langue", id)}
                    placeholder={niveauLoading ? "Chargement…" : "Sélectionner"}
                    disabled={niveauLoading && niveauOptions.length === 0}
                    searchable={false}
                  />
                </FieldWrap>
                <ChoiceField label="Composition du foyer" choices={ch("Foyer")} value={form.Foyer} onChange={(v) => set("Foyer", v)} required />

                <OuiNonField
                  label="En situation régulière"
                  info="Personne française ou étrangère en situation régulière. Les papiers administratifs des personnes accompagnatrices majeures doivent également être valides."
                  value={form.Regularite_situation}
                  onChange={(v) => set("Regularite_situation", v)}
                  required
                />

                <ToggleOuiNon
                  label="Personne primo-arrivante"
                  info="Toute personne extra-européenne résidant pour la première fois et depuis moins de 5 ans en France."
                  value={form.Primo_arrivant}
                  onChange={(v) => set("Primo_arrivant", v)}
                />
                <ToggleOuiNon
                  label="Bénéficiaire de la Protection Internationale"
                  value={form.Bpi}
                  onChange={(v) => set("Bpi", v)}
                />

                <MultiChoiceField
                  label="Candidat·e prêt·e à se former à l'un ou plusieurs de ces secteurs d'activité ?"
                  choices={ch("Pret_a_se_former")}
                  value={form.Pret_a_se_former}
                  onChange={(v) => set("Pret_a_se_former", v)}
                  info="Si le / la candidat·e est intéressé·e par un autre secteur d'activité, vous pourrez renseigner les informations dans son dossier après l'inscription."
                />
              </>
            )}

            {/* ══ ÉTAPE 3 — Engagement ══ */}
            {step === 3 && (
              <>
                <StepHeader step={3} title="Engagement de l'orienteur / l'orienteuse" />
                <ToggleOuiNon
                  label="Je suis engagé·e et disponible pour co-accompagner le / la candidat·e"
                  value={form.Engagement_orienteur}
                  onChange={(v) => set("Engagement_orienteur", v)}
                  required
                />
              </>
            )}

            {/* ── Erreurs ── */}
            <ValidationError message={validError} />
            {submitError && (
              <div className="fr-alert fr-alert--error" style={{ marginTop: "1rem" }}>
                <p className="fr-alert__title">Erreur</p>
                <p>{submitError}</p>
              </div>
            )}

            {/* ── Navigation ── */}
            <div className="ins-nav-row">
              {step > 1 && (
                <button type="button" className="ins-btn ins-btn--secondary" onClick={prevStep}>
                  <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Précédent
                </button>
              )}
              {step < TOTAL_STEPS ? (
                <button type="button" className="ins-btn ins-btn--primary" onClick={nextStep}>
                  Suivant <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </button>
              ) : (
                <button type="submit" className="ins-btn ins-btn--primary" disabled={submitting || form.Engagement_orienteur === null}>
                  {submitting
                    ? <><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Enregistrement…</>
                    : <>Valider</>
                  }
                </button>
              )}
            </div>

          </form>
        </div>
      )}
    </div>
  );
}
