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
  Dispositif:             string;
  Departement:            number | null;   // Ref:DPTS_REGIONS → rowId
  Organisme_gestionnaire: string;
};

const INITIAL: FormData = {
  Dispositif:             "",
  Departement:            null,
  Organisme_gestionnaire: "",
};

/* ─── Helpers ────────────────────────────────────────────────── */
function choicesToOptions(choices: string[]): Option[] {
  return choices.map((label, i) => ({ id: i + 1, label, q: label.toLowerCase() }));
}

/* 2A → 20.1, 2B → 20.2  (Corse entre 19 et 21) */
function deptSortKey(numero: string | undefined): number {
  if (!numero) return 9999;
  const n = numero.toUpperCase();
  if (n === "2A") return 20.1;
  if (n === "2B") return 20.2;
  const p = parseFloat(n);
  return isNaN(p) ? 9999 : p;
}

/* ─── Page principale ────────────────────────────────────────── */
export default function EtablissementPage() {
  const [docApi, setDocApi]         = useState<GristDocAPI | null>(null);
  const [form, setForm]             = useState<FormData>(INITIAL);
  const [done, setDone]             = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  /* Options */
  const [dispositifOptions, setDispositifOptions]             = useState<Option[]>([]);
  const [deptOptions,        setDeptOptions]                  = useState<Option[]>([]);
  const [organismeOptions,   setOrganismeOptions]             = useState<Option[]>([]);
  const [dataLoading,        setDataLoading]                  = useState(true);

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
        /* Colonnes Choice de la table ETABLISSEMENTS */
        const cols = await loadColumnsMetaFor(docApi!, TABLE_ID);

        const dispCol  = cols.find((c) => c.colId === "Dispositif");
        const orgaCol  = cols.find((c) => c.colId === "Organisme_gestionnaire");

        if (dispCol) {
          const choices = normalizeChoices(dispCol.widgetOptionsParsed?.choices);
          setDispositifOptions(choicesToOptions(choices));
        }
        if (orgaCol) {
          const choices = normalizeChoices(orgaCol.widgetOptionsParsed?.choices);
          setOrganismeOptions(choicesToOptions(choices));
        }

        /* Table DPTS_REGIONS → dropdown département */
        const dpts = await docApi!.fetchTable("DPTS_REGIONS");
        const opts: Option[] = [];
        for (let i = 0; i < dpts.id.length; i++) {
          const id     = dpts.id[i];
          const nom    = String(dpts.Nom?.[i]    ?? "");
          const numero = String(dpts.Numero?.[i] ?? "");
          const region = String(dpts.Region?.[i] ?? "");
          if (!nom) continue;
          opts.push({
            id,
            label:   nom,
            tagLeft: numero,
            tag:     region,
            q:       `${numero} ${nom} ${region}`.toLowerCase(),
          });
        }
        opts.sort((a, b) => deptSortKey(a.tagLeft) - deptSortKey(b.tagLeft));
        setDeptOptions(opts);
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
    if (!form.Dispositif)  return "Le dispositif est requis.";
    if (!form.Departement) return "Le département est requis.";
    return null;
  }

  /* ── Soumission ─────────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);

    if (!docApi) { setDone(true); return; }

    setSubmitting(true);
    try {
      await docApi.applyUserActions([
        ["AddRecord", TABLE_ID, null, {
          Dispositif:             form.Dispositif,
          Departement:            form.Departement,
          Organisme_gestionnaire: form.Organisme_gestionnaire,
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

  /* ── Libellés pour l'écran done ─────────────────────────────── */
  const deptOpt = deptOptions.find((o) => o.id === form.Departement);

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
            <h1 className="ae-done__title">Enregistrement réussi&nbsp;!</h1>
            <p className="ae-done__subtitle">
              L&apos;entrée suivante a bien été ajoutée dans EMILE&nbsp;:
            </p>
            <div className="ae-done__name">
              {form.Dispositif}
              {deptOpt && (
                <span style={{ fontWeight: 400, marginLeft: "0.5rem", opacity: 0.8 }}>
                  — {deptOpt.tagLeft} {deptOpt.label}
                </span>
              )}
            </div>
            <div className="ae-done__actions">
              <button type="button" className="ae-btn ae-btn--secondary" onClick={handleReset}>
                <i className="fa-solid fa-plus" />
                Ajouter un autre
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

        <form className="ae-form" onSubmit={handleSubmit}>

          {/* Dispositif */}
          <div className="ae-field">
            <label className="ae-label">
              Dispositif <span className="ae-required">*</span>
            </label>
            <SearchDropdown
              options={dispositifOptions}
              valueId={dispositifOptions.find((o) => o.label === form.Dispositif)?.id ?? null}
              onChange={(id) => {
                const found = dispositifOptions.find((o) => o.id === id);
                set("Dispositif", found?.label ?? "");
              }}
              placeholder={dataLoading && dispositifOptions.length === 0 ? "Chargement…" : "Sélectionner le dispositif"}
              disabled={dataLoading && dispositifOptions.length === 0}
            />
          </div>

          {/* Département */}
          <div className="ae-field">
            <label className="ae-label">
              Département <span className="ae-required">*</span>
            </label>
            <SearchDropdown
              options={deptOptions}
              valueId={form.Departement}
              onChange={(id) => set("Departement", id)}
              placeholder={dataLoading && deptOptions.length === 0 ? "Chargement…" : "Rechercher un département"}
              disabled={dataLoading && deptOptions.length === 0}
            />
          </div>

          {/* Organisme gestionnaire */}
          <div className="ae-field">
            <label className="ae-label">Organisme gestionnaire</label>
            <SearchDropdown
              options={organismeOptions}
              valueId={organismeOptions.find((o) => o.label === form.Organisme_gestionnaire)?.id ?? null}
              onChange={(id) => {
                const found = organismeOptions.find((o) => o.id === id);
                set("Organisme_gestionnaire", found?.label ?? "");
              }}
              placeholder={dataLoading && organismeOptions.length === 0 ? "Chargement…" : "Sélectionner l'organisme"}
              disabled={dataLoading && organismeOptions.length === 0}
            />
          </div>

          {/* Erreur de validation */}
          {error && (
            <div className="ae-validation-error">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{error}</span>
            </div>
          )}

          {/* Bouton */}
          <div className="ae-nav-row">
            <button type="submit" className="ae-btn ae-btn--primary" disabled={submitting}>
              {submitting ? (
                "Enregistrement…"
              ) : (
                <>
                  <i className="fa-solid fa-floppy-disk" />
                  Enregistrer
                </>
              )}
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}
