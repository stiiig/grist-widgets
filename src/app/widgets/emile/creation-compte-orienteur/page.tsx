"use client";

import { useEffect, useState } from "react";
import "./styles.css";
import logoEmile from "../assets/logo-emile-white.png";
import {
  loadColumnsMetaFor,
  normalizeChoices,
} from "@/lib/grist/meta";
import { SearchDropdown, Option } from "@/components/SearchDropdown";
import { useGristInit } from "@/lib/grist/hooks";
import { choicesToOptions } from "@/lib/emile/utils";
import { FALLBACK_FONCTION_OPTIONS } from "@/lib/emile/constants";
import { EMAIL_REGEX, validatePhone } from "@/lib/emile/validators";

const TABLE_ID = "ACCOMPAGNANTS";

/* ─── Types ──────────────────────────────────────────────────── */
type FormData = {
  Etablissement: number | null;  // Ref:ETABLISSEMENTS → rowId
  Fonction: string;
  Prenom: string;
  Nom: string;
  Tel: string;
  Email: string;
};

const INITIAL: FormData = {
  Etablissement: null,
  Fonction: "",
  Prenom: "",
  Nom: "",
  Tel: "",
  Email: "",
};

/* ─── Page principale ────────────────────────────────────────── */
export default function OrienteurPage() {
  const { mode, docApi } = useGristInit();
  const [step, setStep]             = useState(1);
  const [form, setForm]             = useState<FormData>(INITIAL);
  const [done, setDone]             = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  /* Options chargées depuis Grist */
  const [etablOptions,    setEtablOptions]    = useState<Option[]>([]);
  const [fonctionOptions, setFonctionOptions] = useState<Option[]>([]);
  const [etablLoading,    setEtablLoading]    = useState(true);
  const [colsLoading,     setColsLoading]     = useState(true);

  /* ── Effet : ETABLISSEMENTS → colonne Nom_etablissement ────── */
  useEffect(() => {
    if (!docApi) return;
    setEtablLoading(true);
    docApi.fetchTable("ETABLISSEMENTS")
      .then((table: any) => {
        const ids = table.id as number[];
        const opts: Option[] = [];
        for (let i = 0; i < ids.length; i++) {
          const id  = ids[i];
          const nom = String(table.Nom_etablissement?.[i] ?? "").trim();
          if (!nom) continue;
          opts.push({ id, label: nom, q: nom.toLowerCase() });
        }
        opts.sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
        setEtablOptions(opts);
      })
      .catch((e: any) => setError(`[ETABLISSEMENTS] ${e?.message ?? String(e)}`))
      .finally(() => setEtablLoading(false));
  }, [docApi]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Effet 3 : colonne Choice Fonction ───────────────────────── */
  useEffect(() => {
    if (!docApi) return;
    setColsLoading(true);
    loadColumnsMetaFor(docApi, TABLE_ID)
      .then((cols) => {
        const fonctionCol = cols.find((c) => c.colId === "Fonction");
        if (fonctionCol) setFonctionOptions(choicesToOptions(normalizeChoices(fonctionCol.widgetOptionsParsed?.choices)));
      })
      .catch((e: any) => setError(`[colonnes] ${e?.message ?? String(e)}`))
      .finally(() => setColsLoading(false));
  }, [docApi]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Mise à jour du formulaire ──────────────────────────────── */
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* ── Validation ─────────────────────────────────────────────── */
  function validateStep1(): string | null {
    if (!form.Etablissement) return "Veuillez sélectionner votre établissement.";
    return null;
  }

  function validateStep2(): string | null {
    if (!form.Fonction.trim()) return "La fonction est requise.";
    if (!form.Prenom.trim())   return "Le prénom est requis.";
    if (!form.Nom.trim())      return "Le nom de famille est requis.";
    if (!form.Email.trim())    return "L'adresse email est requise.";
    if (!EMAIL_REGEX.test(form.Email.trim()))
                               return "L'adresse email n'est pas valide.";
    const telErr = validatePhone(form.Tel);
    if (telErr) return telErr;
    return null;
  }

  /* ── Navigation ─────────────────────────────────────────────── */
  function handleNext() {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError(null);
    setStep(2);
  }

  /* ── Soumission ─────────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateStep2();
    if (err) { setError(err); return; }
    setError(null);

    if (!docApi) {
      setDone(true);
      return;
    }

    setSubmitting(true);
    try {
      await docApi.applyUserActions([
        ["AddRecord", TABLE_ID, null, {
          Etablissement:  form.Etablissement,
          Fonction: form.Fonction,
          Prenom:   form.Prenom.trim(),
          Nom:      form.Nom.trim(),
          Tel:      form.Tel.trim(),
          Email:    form.Email.trim(),
        }],
      ]);
      setDone(true);
    } catch {
      setError("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Spinner boot ───────────────────────────────────────────── */
  if (mode === "boot") {
    return (
      <div className="occ-shell">
        <header className="occ-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
          <span className="occ-header__appname">Création compte orienteur·ice</span>
        </header>
        <main className="occ-body occ-body--center">
          <div style={{ color: "#bbb", fontSize: "1.5rem" }}><i className="fa-solid fa-spinner fa-spin" /></div>
        </main>
      </div>
    );
  }

  /* ── Écran de confirmation ──────────────────────────────────── */
  if (done) {
    return (
      <div className="occ-shell">
        <header className="occ-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
          <span className="occ-header__appname">Création compte orienteur·ice</span>
        </header>
        <main className="occ-body occ-body--center">
          <div className="occ-done">
            <i className="fa-solid fa-circle-check" style={{ fontSize: "2.5rem", color: "#18753c" }} />
            <h1 className="occ-done__title">Votre compte EMILE est créé&nbsp;!</h1>
            <ul className="occ-done__list">
              <li>
                Un email de confirmation vient d&apos;être envoyé à{" "}
                <strong>{form.Email}</strong>
              </li>
              <li>
                En cas de problème, contactez votre équipe via l&apos;adresse indiquée dans l&apos;email
              </li>
            </ul>
            <div className="occ-done__warning">
              <i className="fa-solid fa-triangle-exclamation" />
              <span>
                Vérifiez votre dossier <strong>spam</strong> si vous ne recevez pas l&apos;email de confirmation.
              </span>
            </div>
            <p className="occ-done__thanks">🙏 Merci de rejoindre le réseau EMILE</p>
          </div>
        </main>
      </div>
    );
  }

  /* ── Libellé de l'établissement sélectionné (recap étape 2) ── */
  const etablLabel = etablOptions.find((o) => o.id === form.Etablissement)?.label ?? "";

  /* ── Rendu principal ────────────────────────────────────────── */
  return (
    <div className="occ-shell">
      <header className="occ-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
        <span className="occ-header__appname">Création compte orienteur·ice</span>
      </header>
      <main className="occ-body">

        {/* Barre de progression */}
        <div className="occ-progress">
          <div className="occ-progress__bar">
            <div className="occ-progress__fill" style={{ width: step === 1 ? "0%" : "100%" }} />
          </div>
          {[
            { num: 1, label: "Établissement" },
            { num: 2, label: "Profil" },
          ].map(({ num, label }) => (
            <div
              key={num}
              className={`occ-progress__step${step === num ? " active" : step > num ? " done" : ""}`}
            >
              <div className="occ-progress__dot">
                {step > num ? <i className="fa-solid fa-check" /> : num}
              </div>
              <span className="occ-progress__label">{label}</span>
            </div>
          ))}
        </div>

        {/* Formulaire */}
        <form
          className="occ-form"
          onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}
        >
          {/* ── Étape 1 — Établissement ─────────────────────── */}
          {step === 1 && (
            <>
              <div className="occ-step-header">
                <h2 className="occ-step-title">Mon établissement</h2>
                <span className="occ-step-badge">Étape 1 sur 2</span>
              </div>

              <div className="occ-field">
                <label className="occ-label">
                  Établissement <span className="occ-required">*</span>
                </label>
                <p className="occ-field-desc">La structure dans laquelle vous travaillez.</p>
                <SearchDropdown
                  options={etablOptions}
                  valueId={form.Etablissement}
                  onChange={(id) => set("Etablissement", id)}
                  placeholder={etablLoading ? "Chargement…" : "Rechercher un établissement…"}
                  disabled={etablLoading}
                />
              </div>

              <div className="occ-infobox">
                <i className="fa-solid fa-circle-info occ-infobox__icon" />
                <span>
                  Si votre établissement n&apos;apparaît pas dans la liste, ajoutez-le maintenant.
                </span>
              </div>
            </>
          )}

          {/* ── Étape 2 — Contexte professionnel ────────────── */}
          {step === 2 && (
            <>
              <div className="occ-step-header">
                <h2 className="occ-step-title">Mon contexte professionnel</h2>
                <span className="occ-step-badge">Étape 2 sur 2</span>
              </div>

              {/* Recap établissement */}
              {etablLabel && (
                <div className="occ-recap">
                  <i className="fa-solid fa-school" />
                  <span>{etablLabel}</span>
                </div>
              )}

              {/* Fonction */}
              <div className="occ-field">
                <label className="occ-label">
                  Fonction <span className="occ-required">*</span>
                </label>
                {fonctionOptions.length > 0 ? (
                  <SearchDropdown
                    options={fonctionOptions}
                    valueId={fonctionOptions.find((o) => o.label === form.Fonction)?.id ?? null}
                    onChange={(id) => {
                      const found = fonctionOptions.find((o) => o.id === id);
                      set("Fonction", found?.label ?? "");
                    }}
                    placeholder="Sélectionner votre fonction"
                    searchable={fonctionOptions.length > 6}
                  />
                ) : (
                  <input
                    className="occ-input"
                    type="text"
                    value={form.Fonction}
                    onChange={(e) => set("Fonction", e.target.value)}
                    placeholder="Votre fonction"
                  />
                )}
              </div>

              {/* Prénom + Nom */}
              <div className="occ-row">
                <div className="occ-field">
                  <label className="occ-label">
                    Prénom <span className="occ-required">*</span>
                  </label>
                  <input
                    className="occ-input"
                    type="text"
                    value={form.Prenom}
                    onChange={(e) => set("Prenom", e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="occ-field">
                  <label className="occ-label">
                    Nom de famille <span className="occ-required">*</span>
                  </label>
                  <input
                    className="occ-input"
                    type="text"
                    value={form.Nom}
                    onChange={(e) => set("Nom", e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              {/* Téléphone */}
              <div className="occ-field">
                <label className="occ-label">Téléphone</label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "0.3rem",
                    height: "2.25rem", padding: "0 0.6rem",
                    background: "#f0f0f0", border: "1px solid #c1c1c1", borderRadius: "4px",
                    fontSize: "0.85rem", color: "#333", flexShrink: 0, whiteSpace: "nowrap",
                  }}>
                    🇫🇷 +33
                  </span>
                  <input
                    className="occ-input"
                    type="tel"
                    value={form.Tel}
                    onChange={(e) => set("Tel", e.target.value)}
                    autoComplete="tel"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="occ-field">
                <label className="occ-label">
                  Email professionnel <span className="occ-required">*</span>
                </label>
                <input
                  className="occ-input"
                  type="email"
                  value={form.Email}
                  onChange={(e) => set("Email", e.target.value)}
                  autoComplete="email"
                />
              </div>
            </>
          )}

          {/* Erreur de validation */}
          {error && (
            <div className="occ-validation-error">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{error}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="occ-nav-row">
            {step === 2 && (
              <button
                type="button"
                className="occ-btn occ-btn--secondary"
                onClick={() => { setStep(1); setError(null); }}
              >
                <i className="fa-solid fa-chevron-left" />
                Précédent
              </button>
            )}
            <button
              type="submit"
              className="occ-btn occ-btn--primary"
              disabled={submitting}
            >
              {step === 1 ? (
                <>Suivant <i className="fa-solid fa-chevron-right" /></>
              ) : submitting ? (
                "Enregistrement…"
              ) : (
                <>Créer mon compte <i className="fa-solid fa-check" /></>
              )}
            </button>
          </div>
        </form>

      </main>
    </div>
  );
}
