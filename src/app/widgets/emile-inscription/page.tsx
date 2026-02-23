"use client";

import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { initGristOrMock } from "@/lib/grist/init";
import {
  loadColumnsMetaFor,
  buildColRowIdMap,
  ensureRefCache,
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
  Tel: string;
  // Étape 2 — Situation
  Departement_domicile_inscription: string;
  Adresse: string;
  Precarite_de_logement: string;
  Consentement_volontaire: boolean | null;
  Niveau_de_langue: string;
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
  Tel: "",
  Departement_domicile_inscription: "",
  Adresse: "",
  Precarite_de_logement: "",
  Consentement_volontaire: null,
  Niveau_de_langue: "",
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
  const [colRowIdMap, setColRowIdMap] = useState<Map<number, { colId: string }>>(new Map());

  // Options pour Nationalite (Ref:pays)
  const [paysOptions, setPaysOptions]   = useState<Option[]>([]);
  const [paysLoading, setPaysLoading]   = useState(false);

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

  /* ── Chargement colonnes + colRowIdMap ── */
  useEffect(() => {
    if (!docApi) return;
    Promise.all([
      loadColumnsMetaFor(docApi, TABLE_ID),
      buildColRowIdMap(docApi),
    ]).then(([meta, map]) => {
      setCols(meta);
      setColRowIdMap(map);
    }).catch(() => {});
  }, [docApi]);

  /* ── Chargement pays (Ref:pays) ── */
  useEffect(() => {
    if (!docApi || cols.length === 0 || colRowIdMap.size === 0) return;
    const nationaliteCol = cols.find((c) => c.colId === "Nationalite");
    if (!nationaliteCol) return;

    setPaysLoading(true);
    ensureRefCache(docApi, nationaliteCol, colRowIdMap)
      .then((cache) => {
        const opts: Option[] = (cache?.rows ?? []).map((r) => ({
          id: r.id,
          label: r.label,
          q: r.q,
        }));
        setPaysOptions(opts);
      })
      .catch(() => {})
      .finally(() => setPaysLoading(false));
  }, [docApi, cols, colRowIdMap]);

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
      if (!form.Majeur)                return "Veuillez indiquer si le/la candidat·e est majeur·e.";
      if (!form.Email.trim())          return "L'email est requis.";
      if (!form.Tel.trim())            return "Le téléphone est requis.";
    }
    if (s === 2) {
      if (!form.Departement_domicile_inscription) return "Le département est requis.";
      if (!form.Adresse.trim())                   return "L'adresse est requise.";
      if (!form.Precarite_de_logement)            return "La situation de précarité est requise.";
      if (form.Consentement_volontaire === null)   return "Le consentement EMILE est requis.";
      if (!form.Niveau_de_langue)                 return "Le niveau de langue est requis.";
      if (!form.Foyer)                            return "La composition du foyer est requise.";
      if (!form.Regularite_situation)             return "La situation régulière est requise.";
    }
    if (s === 3) {
      if (form.Engagement_orienteur === null) return "Veuillez indiquer votre engagement.";
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
        "Email", "Tel", "Departement_domicile_inscription", "Adresse",
        "Precarite_de_logement", "Niveau_de_langue", "Foyer",
        "Regularite_situation", "Bpi",
      ] as const;
      for (const k of strFields) {
        if (form[k]) fields[k] = form[k];
      }

      // Nationalite (Ref → rowId)
      if (form.Nationalite !== null) fields.Nationalite = form.Nationalite;

      // Date → unix seconds
      if (form.Date_de_naissance) {
        const unix = isoDateToUnixSeconds(form.Date_de_naissance);
        if (unix) fields.Date_de_naissance = unix;
      }

      // Toggles (booléens)
      if (form.Consentement_volontaire !== null) fields.Consentement_volontaire = form.Consentement_volontaire;
      if (form.Engagement_orienteur   !== null) fields.Engagement_orienteur   = form.Engagement_orienteur;
      fields.Primo_arrivant = form.Primo_arrivant;

      // ChoiceList
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
            <i className="fa-solid fa-circle-check ins-confirm__icon" aria-hidden="true" />
            <h2 className="ins-confirm__title">Dossier créé !</h2>
            <p className="ins-confirm__text">Le candidat a bien été ajouté dans Grist.</p>
            <button type="button" className="ins-btn ins-btn--secondary"
              onClick={() => { setForm(INITIAL); setDone(false); setStep(1); setValidError(""); setSubmitError(""); }}>
              <i className="fa-solid fa-rotate-left" aria-hidden="true" /> Nouveau candidat
            </button>
          </div>
        </div>
      </div>
    );
  }

  const age = computeAge(form.Date_de_naissance);

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

                <TextField label="Prénom" value={form.Prenom} onChange={(v) => set("Prenom", v)} required placeholder="Jean" />
                <TextField label="Nom" value={form.Nom_de_famille} onChange={(v) => set("Nom_de_famille", v)} required placeholder="Dupont" />
                <ChoiceField label="Genre" choices={ch("Genre")} value={form.Genre} onChange={(v) => set("Genre", v)} required />
                <RefField
                  label="Nationalité"
                  options={paysOptions}
                  valueId={form.Nationalite}
                  onChange={(id) => set("Nationalite", id)}
                  loading={paysLoading}
                  required
                />

                <div className="ins-row-2">
                  <TextField label="Date de naissance" value={form.Date_de_naissance} onChange={(v) => set("Date_de_naissance", v)} type="date" required />
                  <TextField label="Âge" value={age !== null ? String(age) : ""} readOnly placeholder="—" />
                </div>

                <OuiNonField label="Candidat·e majeur·e" value={form.Majeur} onChange={(v) => set("Majeur", v)} required />

                <SectionTitle title="Coordonnées du / de la candidat·e" />
                <TextField label="Email" value={form.Email} onChange={(v) => set("Email", v)} type="email" required placeholder="prenom.nom@exemple.fr" />
                <TextField label="Téléphone" value={form.Tel} onChange={(v) => set("Tel", v)} type="tel" required placeholder="06XXXXXXXX" />
              </>
            )}

            {/* ══ ÉTAPE 2 — Situation ══ */}
            {step === 2 && (
              <>
                <StepHeader step={2} title="Situation du / de la candidat·e" subtitle="Informations obligatoires *" />

                <SectionTitle title="Domiciliation" />
                <ChoiceField label="Département du domicile actuel" choices={ch("Departement_domicile_inscription")} value={form.Departement_domicile_inscription} onChange={(v) => set("Departement_domicile_inscription", v)} required />
                <TextField label="Adresse de domiciliation" value={form.Adresse} onChange={(v) => set("Adresse", v)} required placeholder="Description" />
                <ChoiceField label="Situation de précarité du logement" choices={ch("Precarite_de_logement")} value={form.Precarite_de_logement} onChange={(v) => set("Precarite_de_logement", v)} required />
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
                <ChoiceField label="Niveau de langue" choices={ch("Niveau_de_langue")} value={form.Niveau_de_langue} onChange={(v) => set("Niveau_de_langue", v)} required />
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
