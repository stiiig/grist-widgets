"use client";

import { useEffect, useRef, useState } from "react";
import "./styles.css";
import logoEmile from "../emile-inscription/logo-emile-white.png";
import { initGristOrMock } from "@/lib/grist/init";
import {
  loadColumnsMetaFor,
  normalizeChoices,
  GristDocAPI,
} from "@/lib/grist/meta";
import { SearchDropdown, Option } from "@/components/SearchDropdown";

const TABLE_ID = "ACCOMPAGNANTS";

/* ─── Types ──────────────────────────────────────────────────── */
type FormData = {
  Etablissement: number | null;  // Ref:ETABLISSEMENTS → rowId
  Fonction: string;
  Prenom: string;
  Nom_de_famille: string;
  Tel: string;
  Email: string;
};

const INITIAL: FormData = {
  Etablissement: null,
  Fonction: "",
  Prenom: "",
  Nom_de_famille: "",
  Tel: "",
  Email: "",
};

/* ─── Helpers ────────────────────────────────────────────────── */
function choicesToOptions(choices: string[]): Option[] {
  return choices.map((label, i) => ({ id: i + 1, label, q: label.toLowerCase() }));
}

/* ─── Page principale ────────────────────────────────────────── */
export default function OrienteurPage() {
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);
  const [step, setStep]     = useState(1);
  const [form, setForm]     = useState<FormData>(INITIAL);
  const [done, setDone]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  /* Options chargées depuis Grist */
  const [etablOptions,    setEtablOptions]    = useState<Option[]>([]);
  const [fonctionOptions, setFonctionOptions] = useState<Option[]>([]);
  const [dataLoading,     setDataLoading]     = useState(true);

  /* ── Init Grist ─────────────────────────────────────────────── */
  useEffect(() => {
    initGristOrMock({ requiredAccess: "full" }).then(({ docApi: api }) => {
      setDocApi(api);
    });
  }, []);

  /* ── Chargement des données ─────────────────────────────────── */
  useEffect(() => {
    if (!docApi) return;

    async function load() {
      try {
        /* Table ETABLISSEMENTS → dropdown */
        const etablTable = await docApi!.fetchTable("ETABLISSEMENTS");
        const opts: Option[] = [];
        for (let i = 0; i < etablTable.id.length; i++) {
          const id  = etablTable.id[i];
          const nom = etablTable.Nom?.[i] ?? `Établissement ${id}`;
          if (nom) opts.push({ id, label: String(nom), q: String(nom).toLowerCase() });
        }
        opts.sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
        setEtablOptions(opts);

        /* Colonne Fonction → choices */
        const cols = await loadColumnsMetaFor(docApi!, TABLE_ID);
        const fonctionCol = cols.find((c) => c.colId === "Fonction");
        if (fonctionCol) {
          const choices = normalizeChoices(fonctionCol.widgetOptionsParsed?.choices);
          setFonctionOptions(choicesToOptions(choices));
        }
      } catch (err) {
        console.error("[OrienteurPage] Erreur chargement:", err);
      } finally {
        setDataLoading(false);
      }
    }

    load();
  }, [docApi]);

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
    if (!form.Fonction.trim())       return "La fonction est requise.";
    if (!form.Prenom.trim())         return "Le prénom est requis.";
    if (!form.Nom_de_famille.trim()) return "Le nom est requis.";
    if (!form.Email.trim())          return "L'adresse email est requise.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email.trim()))
      return "L'adresse email n'est pas valide.";
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
          Fonction:       form.Fonction,
          Prenom:         form.Prenom.trim(),
          Nom_de_famille: form.Nom_de_famille.trim(),
          Tel:            form.Tel.trim(),
          Email:          form.Email.trim(),
        }],
      ]);
      setDone(true);
    } catch {
      setError("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
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
                Vos identifiants de connexion vous seront communiqués d&apos;ici quelques minutes
              </li>
              <li>
                En cas de problème, contactez notre équipe via l&apos;adresse indiquée dans l&apos;email
              </li>
            </ul>
            <div className="occ-done__warning">
              <i className="fa-solid fa-triangle-exclamation" />
              <span>
                Vérifiez votre dossier <strong>spam</strong> si vous ne recevez pas l&apos;email de confirmation.
              </span>
            </div>
            <p className="occ-done__thanks">🙏 Merci de rejoindre le réseau EMILE</p>
            <button type="button" className="occ-btn occ-btn--primary" style={{ marginLeft: 0 }}>
              <i className="fa-solid fa-right-to-bracket" />
              Connexion
            </button>
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
                <SearchDropdown
                  options={etablOptions}
                  valueId={form.Etablissement}
                  onChange={(id) => set("Etablissement", id)}
                  placeholder={dataLoading && etablOptions.length === 0 ? "Chargement…" : "Rechercher un établissement…"}
                  disabled={dataLoading && etablOptions.length === 0}
                />
              </div>

              <div className="occ-infobox">
                <i className="fa-solid fa-circle-info occ-infobox__icon" />
                <span>
                  Si votre établissement n&apos;apparaît pas dans la liste, contactez votre DDT
                  pour qu&apos;il soit ajouté dans EMILE.
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
                    placeholder="Prénom"
                    autoComplete="given-name"
                  />
                </div>
                <div className="occ-field">
                  <label className="occ-label">
                    Nom <span className="occ-required">*</span>
                  </label>
                  <input
                    className="occ-input"
                    type="text"
                    value={form.Nom_de_famille}
                    onChange={(e) => set("Nom_de_famille", e.target.value)}
                    placeholder="Nom de famille"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              {/* Téléphone */}
              <div className="occ-field">
                <label className="occ-label">Téléphone</label>
                <input
                  className="occ-input"
                  type="tel"
                  value={form.Tel}
                  onChange={(e) => set("Tel", e.target.value)}
                  placeholder="06 xx xx xx xx"
                  autoComplete="tel"
                />
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
                  placeholder="prenom.nom@education.gouv.fr"
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
