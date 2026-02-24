"use client";

import { useEffect, useState } from "react";
import "./styles.css";
import logoEmile from "../emile-inscription/logo-emile-white.png";
import { initGristOrMock } from "@/lib/grist/init";
import {
  loadColumnsMetaFor,
  normalizeChoices,
  GristDocAPI,
} from "@/lib/grist/meta";
import { SearchDropdown, Option } from "@/components/SearchDropdown";

const TABLE_ID = "ETABLISSEMENTS";

/* ─── Types ──────────────────────────────────────────────────── */
type FormData = {
  Nom:         string;
  Type:        string;
  Adresse:     string;
  Ville:       string;
  Code_postal: string;
  Email:       string;
  Tel:         string;
};

const INITIAL: FormData = {
  Nom:         "",
  Type:        "",
  Adresse:     "",
  Ville:       "",
  Code_postal: "",
  Email:       "",
  Tel:         "",
};

/* ─── Helpers ────────────────────────────────────────────────── */
function choicesToOptions(choices: string[]): Option[] {
  return choices.map((label, i) => ({ id: i + 1, label, q: label.toLowerCase() }));
}

/* ─── Page principale ────────────────────────────────────────── */
export default function EtablissementPage() {
  const [docApi, setDocApi]       = useState<GristDocAPI | null>(null);
  const [form, setForm]           = useState<FormData>(INITIAL);
  const [done, setDone]           = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  /* Options */
  const [typeOptions, setTypeOptions] = useState<Option[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  /* ── Init Grist ─────────────────────────────────────────────── */
  useEffect(() => {
    initGristOrMock({ requiredAccess: "full" }).then(({ docApi: api }) => {
      setDocApi(api);
    });
  }, []);

  /* ── Chargement des métadonnées ─────────────────────────────── */
  useEffect(() => {
    if (!docApi) return;

    async function load() {
      try {
        const cols = await loadColumnsMetaFor(docApi!, TABLE_ID);
        const typeCol = cols.find((c) => c.colId === "Type");
        if (typeCol) {
          const choices = normalizeChoices(typeCol.widgetOptionsParsed?.choices);
          setTypeOptions(choicesToOptions(choices));
        }
      } catch (err) {
        console.error("[EtablissementPage] Erreur chargement:", err);
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
  function validate(): string | null {
    if (!form.Nom.trim()) return "Le nom de l'établissement est requis.";
    if (form.Email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email.trim()))
      return "L'adresse email n'est pas valide.";
    return null;
  }

  /* ── Soumission ─────────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
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
          Nom:         form.Nom.trim(),
          Type:        form.Type,
          Adresse:     form.Adresse.trim(),
          Ville:       form.Ville.trim(),
          Code_postal: form.Code_postal.trim(),
          Email:       form.Email.trim(),
          Tel:         form.Tel.trim(),
        }],
      ]);
      setDone(true);
    } catch {
      setError("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Réinitialiser ──────────────────────────────────────────── */
  function handleReset() {
    setForm(INITIAL);
    setError(null);
    setDone(false);
  }

  /* ── Écran de confirmation ──────────────────────────────────── */
  if (done) {
    return (
      <div className="ae-shell">
        <header className="ae-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
          <span className="ae-header__appname">Ajout d&apos;un établissement</span>
        </header>
        <main className="ae-body ae-body--center">
          <div className="ae-done">
            <i className="fa-solid fa-circle-check" style={{ fontSize: "2.5rem", color: "#18753c" }} />
            <h1 className="ae-done__title">Établissement ajouté&nbsp;!</h1>
            <p className="ae-done__subtitle">
              L&apos;établissement suivant a bien été enregistré dans EMILE&nbsp;:
            </p>
            <div className="ae-done__name">
              <i className="fa-solid fa-school" style={{ marginRight: "0.5rem" }} />
              {form.Nom}
            </div>
            <div className="ae-done__actions">
              <button
                type="button"
                className="ae-btn ae-btn--secondary"
                onClick={handleReset}
              >
                <i className="fa-solid fa-plus" />
                Ajouter un autre établissement
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Rendu principal ────────────────────────────────────────── */
  return (
    <div className="ae-shell">
      <header className="ae-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
        <span className="ae-header__appname">Ajout d&apos;un établissement</span>
      </header>
      <main className="ae-body">

        {/* Formulaire */}
        <form className="ae-form" onSubmit={handleSubmit}>

          {/* ── Identification ────────────────────────────────── */}
          <p className="ae-section-title">Identification</p>

          <div className="ae-field">
            <label className="ae-label">
              Nom de l&apos;établissement <span className="ae-required">*</span>
            </label>
            <input
              className="ae-input"
              type="text"
              value={form.Nom}
              onChange={(e) => set("Nom", e.target.value)}
              placeholder="Ex : Collège Jean Moulin"
            />
          </div>

          <div className="ae-field">
            <label className="ae-label">Type d&apos;établissement</label>
            {typeOptions.length > 0 ? (
              <SearchDropdown
                options={typeOptions}
                valueId={typeOptions.find((o) => o.label === form.Type)?.id ?? null}
                onChange={(id) => {
                  const found = typeOptions.find((o) => o.id === id);
                  set("Type", found?.label ?? "");
                }}
                placeholder="Sélectionner le type"
                searchable={typeOptions.length > 6}
              />
            ) : (
              <input
                className="ae-input"
                type="text"
                value={form.Type}
                onChange={(e) => set("Type", e.target.value)}
                placeholder={dataLoading ? "Chargement…" : "Ex : Collège, Lycée, CFA…"}
                disabled={dataLoading}
              />
            )}
          </div>

          {/* ── Adresse ───────────────────────────────────────── */}
          <p className="ae-section-title">Adresse</p>

          <div className="ae-field">
            <label className="ae-label">Adresse</label>
            <input
              className="ae-input"
              type="text"
              value={form.Adresse}
              onChange={(e) => set("Adresse", e.target.value)}
              placeholder="N° et nom de la voie"
              autoComplete="street-address"
            />
          </div>

          <div className="ae-row">
            <div className="ae-field">
              <label className="ae-label">Ville</label>
              <input
                className="ae-input"
                type="text"
                value={form.Ville}
                onChange={(e) => set("Ville", e.target.value)}
                placeholder="Ville"
                autoComplete="address-level2"
              />
            </div>
            <div className="ae-field">
              <label className="ae-label">Code postal</label>
              <input
                className="ae-input"
                type="text"
                value={form.Code_postal}
                onChange={(e) => set("Code_postal", e.target.value)}
                placeholder="Ex : 31000"
                autoComplete="postal-code"
                maxLength={10}
              />
            </div>
          </div>

          {/* ── Contact ───────────────────────────────────────── */}
          <p className="ae-section-title">Contact</p>

          <div className="ae-row">
            <div className="ae-field">
              <label className="ae-label">Email</label>
              <input
                className="ae-input"
                type="email"
                value={form.Email}
                onChange={(e) => set("Email", e.target.value)}
                placeholder="contact@etablissement.fr"
                autoComplete="email"
              />
            </div>
            <div className="ae-field">
              <label className="ae-label">Téléphone</label>
              <input
                className="ae-input"
                type="tel"
                value={form.Tel}
                onChange={(e) => set("Tel", e.target.value)}
                placeholder="05 xx xx xx xx"
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="ae-infobox">
            <i className="fa-solid fa-circle-info ae-infobox__icon" />
            <span>
              Une fois ajouté, cet établissement sera disponible dans les formulaires
              d&apos;inscription des orienteur·ices.
            </span>
          </div>

          {/* Erreur de validation */}
          {error && (
            <div className="ae-validation-error">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{error}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="ae-nav-row">
            <button
              type="submit"
              className="ae-btn ae-btn--primary"
              disabled={submitting}
            >
              {submitting ? (
                "Enregistrement…"
              ) : (
                <>
                  <i className="fa-solid fa-floppy-disk" />
                  Enregistrer l&apos;établissement
                </>
              )}
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}
