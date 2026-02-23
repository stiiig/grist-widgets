"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { initGristOrMock } from "@/lib/grist/init";
import {
  loadColumnsMetaFor,
  encodeListCell,
  isoDateToUnixSeconds,
  ColMeta,
  GristDocAPI,
} from "@/lib/grist/meta";
import { SearchDropdown, SearchMultiDropdown, Option } from "@/components/SearchDropdown";

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
  Precarite_de_logement: string[];      // ChoiceList
  Consentement_volontaire: boolean | null;
  Niveau_de_langue: number | null;   // Ref:NIVEAU_LANGUE → rowId
  Foyer: string;
  Regularite_situation: string;
  Primo_arrivant: boolean;
  Bpi: string;
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
  TelCode: "+33",
  Tel: "",
  Departement_domicile_inscription: null,
  Adresse: "",
  Precarite_de_logement: [],
  Consentement_volontaire: null,
  Niveau_de_langue: null,
  Foyer: "",
  Regularite_situation: "",
  Primo_arrivant: false,
  Bpi: "",
  Pret_a_se_former: [],
  Engagement_orienteur: null,
};

/* ─── Helpers ────────────────────────────────────────────────── */
function computeAge(dateIso: string): number | null {
  if (!dateIso) return null;
  const birth = new Date(dateIso);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

function choicesToOptions(choices: string[]): Option[] {
  return choices.map((label, i) => ({ id: i + 1, label, q: label.toLowerCase() }));
}

/* ─── Pays ───────────────────────────────────────────────────── */
type PaysOption = Option & { typeNationalite: string };

const PINNED_PAYS = [
  "France",
  "Afghanistan", "Algérie", "Cameroun",
  "Congo (la République démocratique du)", "Côte d'Ivoire",
  "Guinée", "Haïti", "Maroc", "Sénégal", "Tunisie",
];

const TYPE_TAG: Record<string, { bg: string; color: string }> = {
  "France":           { bg: "#dbeafe", color: "#1d4ed8" },
  "UE (hors France)": { bg: "#dcfce7", color: "#166534" },
  "Extra-UE":         { bg: "#fef3c7", color: "#92400e" },
};

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

function FieldWrap({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="ins-field">
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
      </label>
      {children}
    </div>
  );
}

/* Choice → SearchDropdown (valeur string) */
function ChoiceField({
  label, choices, value, onChange, required = false,
}: {
  label: string; choices: string[]; value: string;
  onChange: (v: string) => void; required?: boolean;
}) {
  const options = useMemo(() => choicesToOptions(choices), [choices]);
  const valueId = value ? (options.find((o) => o.label === value)?.id ?? null) : null;
  return (
    <FieldWrap label={label} required={required}>
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
  label, choices, value, onChange, required = false,
}: {
  label: string; choices: string[]; value: string[];
  onChange: (v: string[]) => void; required?: boolean;
}) {
  const options  = useMemo(() => choicesToOptions(choices), [choices]);
  const valueIds = useMemo(
    () => value.map((l) => options.find((o) => o.label === l)?.id).filter((id): id is number => id !== undefined),
    [value, options],
  );
  return (
    <FieldWrap label={label} required={required}>
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

/* ─── Picker indicatif téléphonique ─────────────────────── */
const DIAL_CODES: { flag: string; name: string; code: string }[] = [
  { flag: "🇫🇷", name: "France",           code: "+33"  },
  { flag: "🇩🇿", name: "Algérie",           code: "+213" },
  { flag: "🇲🇦", name: "Maroc",             code: "+212" },
  { flag: "🇹🇳", name: "Tunisie",           code: "+216" },
  { flag: "🇨🇲", name: "Cameroun",          code: "+237" },
  { flag: "🇨🇩", name: "Congo (RDC)",       code: "+243" },
  { flag: "🇨🇮", name: "Côte d'Ivoire",     code: "+225" },
  { flag: "🇬🇳", name: "Guinée",            code: "+224" },
  { flag: "🇭🇹", name: "Haïti",             code: "+509" },
  { flag: "🇸🇳", name: "Sénégal",           code: "+221" },
  { flag: "🇦🇫", name: "Afghanistan",       code: "+93"  },
  { flag: "🇧🇪", name: "Belgique",          code: "+32"  },
  { flag: "🇨🇭", name: "Suisse",            code: "+41"  },
  { flag: "🇬🇧", name: "Royaume-Uni",       code: "+44"  },
  { flag: "🇩🇪", name: "Allemagne",         code: "+49"  },
  { flag: "🇪🇸", name: "Espagne",           code: "+34"  },
  { flag: "🇮🇹", name: "Italie",            code: "+39"  },
  { flag: "🇵🇹", name: "Portugal",          code: "+351" },
];

function TelField({
  value, onValueChange, code, onCodeChange, required = false,
}: {
  value: string; onValueChange: (v: string) => void;
  code: string; onCodeChange: (c: string) => void; required?: boolean;
}) {
  const [open, setOpen]           = useState(false);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const rootRef                   = useRef<HTMLDivElement | null>(null);
  const selected = DIAL_CODES.find((d) => d.code === code) ?? DIAL_CODES[0];

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
              width: "13.5rem", border: "1px solid #c8c8e8", borderRadius: 6,
              background: "#fff", boxShadow: "0 6px 20px rgba(0,0,145,.1)",
              maxHeight: 260, overflowY: "auto",
            }}>
              {DIAL_CODES.map((d) => (
                <button
                  key={d.code}
                  type="button"
                  onMouseEnter={() => setHoveredCode(d.code)}
                  onMouseLeave={() => setHoveredCode(null)}
                  onClick={() => { onCodeChange(d.code); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    width: "100%", padding: "0.35rem 0.6rem",
                    border: 0, borderBottom: "1px solid #f5f5f5",
                    background: d.code === code ? "#f0f0ff" : hoveredCode === d.code ? "#f5f5ff" : "white",
                    cursor: "pointer", fontSize: "0.82rem",
                    fontFamily: "inherit", textAlign: "left",
                    fontWeight: d.code === code ? 700 : 400,
                  }}
                >
                  <span style={{ fontSize: "1.1rem" }}>{d.flag}</span>
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <span style={{ color: "#888", fontSize: "0.78rem" }}>{d.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Numéro */}
        <input
          type="tel"
          className="ins-input"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Numéro"
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}

function TextField({
  label, value, onChange, type = "text", required = false,
  placeholder = "", readOnly = false, wide = false,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string; readOnly?: boolean; wide?: boolean;
}) {
  return (
    <div className={wide ? "ins-field ins-field--wide" : "ins-field"}>
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
      </label>
      <input
        type={type}
        className={`ins-input${readOnly ? " ins-input--readonly" : ""}`}
        value={value}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
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
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const age = computeAge(value);

  return (
    <div className="ins-field">
      <label className="ins-label">
        Date de naissance{required && <span className="ins-required"> *</span>}
      </label>
      <div className="ins-date-row">
        <select
          className="ins-select ins-date-select ins-date-select--day"
          value={selD}
          onChange={(e) => { setSelD(e.target.value); commit(selY, selM, e.target.value); }}
        >
          <option value="">Jour</option>
          {days.map((d) => (
            <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
          ))}
        </select>
        <select
          className="ins-select ins-date-select"
          value={selM}
          onChange={(e) => { setSelM(e.target.value); commit(selY, e.target.value, selD); }}
        >
          <option value="">Mois</option>
          {MONTHS_FR.map((name, i) => (
            <option key={i + 1} value={String(i + 1).padStart(2, "0")}>{name}</option>
          ))}
        </select>
        <select
          className="ins-select ins-date-select ins-date-select--year"
          value={selY}
          onChange={(e) => { setSelY(e.target.value); commit(e.target.value, selM, selD); }}
        >
          <option value="">Année</option>
          {BIRTH_YEARS.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
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
        <button type="button" className={`ins-ouinon-btn${value === "Femme" ? " ins-ouinon-btn--active" : ""}`} onClick={() => onChange("Femme")}>Femme</button>
        <button type="button" className={`ins-ouinon-btn${value === "Homme" ? " ins-ouinon-btn--active" : ""}`} onClick={() => onChange("Homme")}>Homme</button>
      </div>
    </div>
  );
}

function OuiNonField({
  label, value, onChange, required = false, description,
}: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; description?: string;
}) {
  return (
    <div className="ins-field ins-field--wide">
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
      </label>
      {description && <p className="ins-field-desc">{description}</p>}
      <div className="ins-ouinon">
        <button type="button" className={`ins-ouinon-btn${value === "Oui" ? " ins-ouinon-btn--active" : ""}`} onClick={() => onChange("Oui")}>Oui</button>
        <button type="button" className={`ins-ouinon-btn${value === "Non" ? " ins-ouinon-btn--active" : ""}`} onClick={() => onChange("Non")}>Non</button>
      </div>
    </div>
  );
}

function ToggleOuiNon({
  label, value, onChange, required = false, description,
}: {
  label: string; value: boolean | null; onChange: (v: boolean) => void;
  required?: boolean; description?: string;
}) {
  return (
    <div className="ins-field ins-field--wide">
      <label className="ins-label">
        {label}{required && <span className="ins-required"> *</span>}
      </label>
      {description && <p className="ins-field-desc">{description}</p>}
      <div className="ins-ouinon">
        <button type="button" className={`ins-ouinon-btn${value === true ? " ins-ouinon-btn--active" : ""}`} onClick={() => onChange(true)}>Oui</button>
        <button type="button" className={`ins-ouinon-btn${value === false ? " ins-ouinon-btn--active" : ""}`} onClick={() => onChange(false)}>Non</button>
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

/* ─── Page principale ────────────────────────────────────────── */

export default function InscriptionPage() {
  const [mode, setMode]       = useState<string>("boot");
  const [docApi, setDocApi]   = useState<GristDocAPI | null>(null);
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

  /* ── Init Grist ── */
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
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error("Impossible de charger grist-plugin-api.js"));
            document.head.appendChild(s);
          });
        }
        const result = await initGristOrMock({ requiredAccess: "full" });
        setMode(result.mode);
        setDocApi(result.docApi);
      } catch (e: any) {
        setSubmitError(`Erreur init: ${e?.message ?? String(e)}`);
        setMode("none");
      }
    })();
  }, []);

  /* ── Chargement départements depuis table DPTS_REGIONS ── */
  useEffect(() => {
    if (!docApi) return;
    setDptsLoading(true);
    docApi.fetchTable("DPTS_REGIONS")
      .then((table: any) => {
        const ids = table.id as number[];
        const opts: Option[] = [];
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const label = String(table["Numero_et_nom"]?.[i] ?? "").trim();
          if (!label) continue;
          opts.push({ id, label, q: label.toLowerCase() });
        }
        opts.sort((a, b) => a.label.localeCompare(b.label, "fr"));
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
        // Prend la première colonne non-système comme label
        const labelCol = Object.keys(table).find((c) => c !== "id" && c !== "manualSort") ?? "";
        const opts: Option[] = [];
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const label = String(table[labelCol]?.[i] ?? "").trim();
          if (!label) continue;
          opts.push({ id, label, q: label.toLowerCase() });
        }
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
      .catch(() => {});
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
      if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(form.Email.trim()))
                                       return "L'adresse email n'est pas valide.";
      if (!form.Tel.trim())            return "Le téléphone est requis.";
      if (form.Tel.replace(/\D/g, "").length < 6)
                                       return "Le téléphone doit contenir au moins 6 chiffres.";
    }
    if (s === 2) {
      if (form.Departement_domicile_inscription === null) return "Le département est requis.";
      if (!form.Adresse.trim())                   return "L'adresse est requise.";
      if (form.Precarite_de_logement.length === 0) return "La situation de précarité est requise.";
      if (form.Consentement_volontaire === null)   return "Le consentement EMILE est requis.";
      if (form.Niveau_de_langue === null)          return "Le niveau de langue est requis.";
      if (!form.Foyer)                            return "La composition du foyer est requise.";
      if (!form.Regularite_situation)             return "La situation régulière est requise.";
    }
    if (s === 3) {
      if (form.Engagement_orienteur === null) return "Veuillez confirmer votre engagement avant de soumettre.";
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
        "Foyer",
        "Regularite_situation", "Bpi",
      ] as const;
      for (const k of strFields) {
        if (form[k]) fields[k] = form[k];
      }

      // Téléphone : indicatif + numéro
      if (form.Tel.trim()) fields.Tel = `${form.TelCode} ${form.Tel}`.trim();

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
      fields.Primo_arrivant = form.Primo_arrivant;

      // ChoiceLists
      if (form.Precarite_de_logement.length > 0) {
        fields.Precarite_de_logement = encodeListCell(form.Precarite_de_logement);
      }
      if (form.Pret_a_se_former.length > 0) {
        fields.Pret_a_se_former = encodeListCell(form.Pret_a_se_former);
      }

      await docApi.applyUserActions([["AddRecord", TABLE_ID, null, fields]]);
      setDone(true);
    } catch (e: any) {
      setSubmitError(e?.message ?? "Une erreur est survenue.");
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
          <div className="ins-header__logo"><i className="fa-solid fa-landmark" aria-hidden="true" />DDT31</div>
          <span className="ins-header__appname">EMILE — Inscription</span>
        </header>
        <div className="ins-body ins-body--center">
          <div className="ins-confirm">
            <h2 className="ins-confirm__title">Merci pour votre confiance&nbsp;!</h2>
            <p className="ins-confirm__text">
              L&apos;inscription est bien enregistrée et l&apos;équipe EMILE va procéder à l&apos;analyse de
              l&apos;éligibilité du dossier pour le / la candidat·e.
            </p>
            <p className="ins-confirm__text">
              D&apos;ici quelques instants, vous recevrez un email avec le statut du dossier de votre
              candidat·e (éligible ou non-éligible) ainsi que les instructions, le cas échéant, pour la
              suite du traitement du dossier.
            </p>
            <button type="button" className="ins-btn ins-btn--primary"
              onClick={() => { setForm(INITIAL); setDone(false); setStep(1); setValidError(""); setSubmitError(""); }}>
              <i className="fa-solid fa-circle-plus" aria-hidden="true" /> Nouvelle inscription
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ins-shell">
      <header className="ins-header">
        <div className="ins-header__logo"><i className="fa-solid fa-landmark" aria-hidden="true" />DDT31</div>
        <span className="ins-header__appname">EMILE — Inscription</span>
      </header>

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

                <TextField label="Prénom" value={form.Prenom} onChange={(v) => set("Prenom", v)} required />
                <TextField label="Nom" value={form.Nom_de_famille} onChange={(v) => set("Nom_de_famille", v)} required />
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
                <TextField label="Adresse de domiciliation" value={form.Adresse} onChange={(v) => set("Adresse", v)} required placeholder="Description" />
                <MultiChoiceField label="Situation de précarité du logement" choices={ch("Precarite_de_logement")} value={form.Precarite_de_logement} onChange={(v) => set("Precarite_de_logement", v)} required />
                <InfoBox>
                  <strong>À NOTER :</strong>
                  <br />- Pour bien comprendre les différentes situations de précarité du logement, cf. FAQ &gt; "Inscrire un·e candidat·e"
                  <br />- Une pièce justificative pourra vous être demandée, cf. page FAQ "Les étapes du programme EMILE" &gt; "Justificatifs de la situation d'hébergement"
                </InfoBox>

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
                  label="En situation régulière (personne française ou étrangère en situation régulière. Les papiers administratifs des personnes accompagnatrices majeures doivent également être valides.)"
                  value={form.Regularite_situation}
                  onChange={(v) => set("Regularite_situation", v)}
                  required
                />

                <CheckboxField
                  label="Personne primo-arrivante"
                  value={form.Primo_arrivant}
                  onChange={(v) => set("Primo_arrivant", v)}
                  description="(toute personne extra-européenne résidant pour la première fois et depuis moins de 5 ans en France)"
                />
                <CheckboxField
                  label="Bénéficiaire de la Protection Internationale (BPI)"
                  value={form.Bpi === "Oui"}
                  onChange={(v) => set("Bpi", v ? "Oui" : "")}
                />

                <MultiChoiceField
                  label="La personne serait-elle prête à se former sur l'un de ces secteurs d'activité ?"
                  choices={ch("Pret_a_se_former")}
                  value={form.Pret_a_se_former}
                  onChange={(v) => set("Pret_a_se_former", v)}
                />
                <InfoBox>
                  Si le / la candidat·e est intéressé·e par un autre secteur d'activité, vous pourrez renseigner les informations dans son dossier après l'inscription.
                </InfoBox>
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
                <button type="submit" className="ins-btn ins-btn--primary" disabled={submitting}>
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
