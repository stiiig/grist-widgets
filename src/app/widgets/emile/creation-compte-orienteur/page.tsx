"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const [validationLink, setValidationLink] = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
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

    if (!docApi) { setError("Grist non disponible — ce formulaire nécessite une connexion."); return; }

    setSubmitting(true);
    try {
      const result = await docApi.applyUserActions([
        ["AddRecord", TABLE_ID, null, {
          Etablissement:  form.Etablissement,
          Fonction:       form.Fonction,
          Prenom:         form.Prenom.trim(),
          Nom:            form.Nom.trim(),
          Tel:            form.Tel.trim(),
          Email:          form.Email.trim(),
          Compte_valide:  "En attente",
        }],
      ]);
      const newRowId = result?.retValues?.[0] as number | undefined;

      // Génération du lien de validation orienteur (non bloquant)
      if (newRowId) {
        try {
          const occUrl = process.env.NEXT_PUBLIC_OCC_GENERATE_URL;
          if (occUrl) {
            const url = `${occUrl.replace(/\/$/, "")}?rowId=${newRowId}`;
            const genRes = await fetch(url);
            if (genRes.ok) {
              const genData = await genRes.json();
              if (genData?.url) {
                const link = genData.url as string;
                setValidationLink(link);
                try {
                  await docApi.applyUserActions([["UpdateRecord", TABLE_ID, newRowId, { Lien_validation: link }]]);
                } catch { /* non bloquant */ }
              }
            }
          }
        } catch { /* non bloquant */ }
      }

      setStep(3);
    } catch {
      setError("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Mode non disponible (pas de proxy n8n, pas d'iframe Grist) ── */
  if (mode === "none") {
    return (
      <div className="occ-shell">
        <header className="occ-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
          <span className="occ-header__appname">Création compte orienteur·ice</span>
        </header>
        <main className="occ-body">
          <div className="fr-alert fr-alert--warning">
            <p className="fr-alert__title">Non disponible</p>
            <p>Ce widget doit être ouvert dans Grist ou via une URL configurée.</p>
          </div>
        </main>
      </div>
    );
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

  /* ── Étape 3 — Confirmation ─────────────────────────────────── */
  if (step === 3) {
    return (
      <div className="occ-shell">
        <header className="occ-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
          <span className="occ-header__appname">Création compte orienteur·ice</span>
        </header>
        <main className="occ-body">

          {/* Barre de progression — toutes les étapes complètes */}
          <div className="occ-progress">
            <div className="occ-progress__bar">
              <div className="occ-progress__fill" style={{ width: "100%" }} />
            </div>
            {[
              { num: 1, label: "Établissement" },
              { num: 2, label: "Profil" },
              { num: 3, label: "Confirmation" },
            ].map(({ num, label }) => (
              <div key={num} className="occ-progress__step done">
                <div className="occ-progress__dot">
                  <i className="fa-solid fa-check" />
                </div>
                <span className="occ-progress__label">{label}</span>
              </div>
            ))}
          </div>

          {/* Carte de confirmation */}
          <div className="occ-form">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <i className="fa-solid fa-circle-check" style={{ fontSize: "2rem", color: "#18753c", flexShrink: 0 }} />
              <h1 className="occ-step-title" style={{ margin: 0 }}>Compte créé — validation en attente</h1>
            </div>

            <ul className="occ-done__list">
              <li>Un email de validation a été envoyé à <strong>{form.Email}</strong></li>
              <li>Cliquez sur le lien dans cet email pour activer le compte</li>
              <li>Sans validation, le compte restera en statut <em>En attente</em></li>
            </ul>

            {/* Lien de validation */}
            {validationLink && (
              <div style={{
                background: "#fafafa", border: "1px dashed #c8c8e8",
                borderRadius: "0.5rem", padding: "0.7rem 1rem",
              }}>
                <div style={{
                  fontSize: "0.65rem", fontWeight: 700, color: "#888",
                  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.45rem",
                  display: "flex", alignItems: "center", gap: "0.35rem",
                }}>
                  <i className="fa-solid fa-link" style={{ fontSize: "0.7rem" }} />
                  Lien de validation (test)
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    readOnly
                    value={validationLink}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      flex: 1, fontSize: "0.72rem", fontFamily: "monospace",
                      border: "1px solid #d0d0d0", borderRadius: 4,
                      padding: "0.3rem 0.5rem", background: "#fff",
                      color: "#333", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", cursor: "text", outline: "none",
                      height: "1.9rem", boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(validationLink).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                    }}
                    style={{
                      flexShrink: 0, height: "1.9rem", padding: "0 0.75rem",
                      border: "1px solid",
                      borderColor: copied ? "#16a34a" : "#000091",
                      borderRadius: 4,
                      background: copied ? "#f0fdf4" : "#000091",
                      color: copied ? "#15803d" : "#fff",
                      cursor: "pointer", fontSize: "0.75rem", fontFamily: "inherit", fontWeight: 600,
                      display: "flex", alignItems: "center", gap: "0.3rem",
                      transition: "all 0.15s",
                    }}
                  >
                    {copied
                      ? <><i className="fa-solid fa-check" /> Copié !</>
                      : <><i className="fa-solid fa-copy" /> Copier</>
                    }
                  </button>
                </div>
              </div>
            )}

            <div className="occ-done__warning">
              <i className="fa-solid fa-triangle-exclamation" />
              <span>
                Vérifiez le dossier <strong>spam</strong> si l&apos;email n&apos;arrive pas dans quelques minutes.
              </span>
            </div>

            <div className="occ-nav-row" style={{ justifyContent: "flex-start" }}>
              <button
                type="button"
                className="occ-btn occ-btn--secondary"
                style={{ marginLeft: 0 }}
                onClick={() => {
                  setForm(INITIAL);
                  setStep(1);
                  setValidationLink(null);
                  setCopied(false);
                  setError(null);
                }}
              >
                <i className="fa-solid fa-plus" />
                Ajouter un autre compte
              </button>
            </div>
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
            <div className="occ-progress__fill" style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }} />
          </div>
          {[
            { num: 1, label: "Établissement" },
            { num: 2, label: "Profil" },
            { num: 3, label: "Confirmation" },
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
                <span className="occ-step-badge">Étape 1 sur 3</span>
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
                  Si votre établissement n&apos;apparaît pas dans la liste,{" "}
                  <Link
                    href="/widgets/emile/ajout-etablissement/"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#000091", fontWeight: 600,
                      textDecoration: "none",
                      borderBottom: "1px solid #000091", paddingBottom: "1px",
                    }}
                  >
                    ajoutez-le maintenant
                  </Link>.
                </span>
              </div>
            </>
          )}

          {/* ── Étape 2 — Contexte professionnel ────────────── */}
          {step === 2 && (
            <>
              <div className="occ-step-header">
                <h2 className="occ-step-title">Mon contexte professionnel</h2>
                <span className="occ-step-badge">Étape 2 sur 3</span>
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
                    placeholder="Votre prénom"
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
                    placeholder="Votre nom de famille"
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
                    inputMode="numeric"
                    value={form.Tel}
                    onChange={(e) => set("Tel", e.target.value.replace(/\D/g, ""))}
                    autoComplete="tel"
                    style={{ flex: 1 }}
                    placeholder="Votre numéro de téléphone"
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
                  placeholder="Votre email professionnel"
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
