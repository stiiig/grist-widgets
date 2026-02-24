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
  Nom:                    string;
  Dispositif:             string;
  Departement:            number | null;   // Ref:DPTS_REGIONS → rowId
  Organisme_gestionnaire: string;
};

const INITIAL: FormData = {
  Nom:                    "",
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
  const [mode, setMode]             = useState<string>("boot");
  const [docApi, setDocApi]         = useState<GristDocAPI | null>(null);
  const [form, setForm]             = useState<FormData>(INITIAL);
  const [done, setDone]             = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  /* Options */
  const [dispositifOptions, setDispositifOptions] = useState<Option[]>([]);
  const [deptOptions,        setDeptOptions]      = useState<Option[]>([]);
  const [organismeOptions,   setOrganismeOptions] = useState<Option[]>([]);
  const [dptsLoading,        setDptsLoading]      = useState(true);
  const [colsLoading,        setColsLoading]      = useState(true);

  /* ── Init Grist (même pattern que emile-inscription) ──────── */
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
        setError(`Erreur init: ${e?.message ?? String(e)}`);
        setMode("none");
      }
    })();
  }, []);

  /* ── Chargement départements depuis table DPTS_REGIONS ──────── */
  useEffect(() => {
    if (!docApi) return;
    setDptsLoading(true);
    docApi.fetchTable("DPTS_REGIONS")
      .then((dpts: any) => {
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
      })
      .catch(() => {})
      .finally(() => setDptsLoading(false));
  }, [docApi]);

  /* ── Chargement colonnes Choice (Dispositif + Organisme) ────── */
  useEffect(() => {
    if (!docApi) return;
    setColsLoading(true);
    loadColumnsMetaFor(docApi, TABLE_ID)
      .then((cols) => {
        const dispCol = cols.find((c) => c.colId === "Dispositif");
        const orgaCol = cols.find((c) => c.colId === "Organisme_gestionnaire");
        if (dispCol) {
          const choices = normalizeChoices(dispCol.widgetOptionsParsed?.choices);
          setDispositifOptions(choicesToOptions(choices));
        }
        if (orgaCol) {
          const choices = normalizeChoices(orgaCol.widgetOptionsParsed?.choices);
          setOrganismeOptions(choicesToOptions(choices));
        }
      })
      .catch(() => {})
      .finally(() => setColsLoading(false));
  }, [docApi]);

  /* ── Mise à jour du formulaire ──────────────────────────────── */
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* ── Validation ─────────────────────────────────────────────── */
  function validate(): string | null {
    if (!form.Nom.trim())             return "Le nom de l'établissement est requis.";
    if (!form.Dispositif)             return "Le dispositif est requis.";
    if (!form.Departement)            return "Le département est requis.";
    if (!form.Organisme_gestionnaire) return "L'organisme gestionnaire est requis.";
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
          Nom:                    form.Nom.trim(),
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

  /* ── Spinner boot ───────────────────────────────────────────── */
  if (mode === "boot") {
    return (
      <div className="ae-shell">
        <header className="ae-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoEmile.src} alt="EMILE" style={{ height: "2rem", width: "auto" }} />
          <span className="ae-header__appname">Ajout d&apos;un établissement</span>
        </header>
        <main className="ae-body ae-body--center">
          <div style={{ color: "#bbb", fontSize: "1.5rem" }}><i className="fa-solid fa-spinner fa-spin" /></div>
        </main>
      </div>
    );
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
            <h1 className="ae-done__title">Enregistrement réussi&nbsp;!</h1>
            <p className="ae-done__subtitle">
              L&apos;entrée suivante a bien été ajoutée dans EMILE&nbsp;:
            </p>
            <div className="ae-done__name">
              <i className="fa-solid fa-school" style={{ marginRight: "0.5rem" }} />
              {form.Nom}
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

  const dataLoading = dptsLoading || colsLoading;

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

          {/* Nom */}
          <div className="ae-field">
            <label className="ae-label">
              Nom de l&apos;établissement <span className="ae-required">*</span>
            </label>
            <input
              className="ae-input"
              type="text"
              value={form.Nom}
              onChange={(e) => set("Nom", e.target.value)}
              autoFocus
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
              placeholder={dptsLoading ? "Chargement…" : "Rechercher un département"}
              disabled={dptsLoading}
            />
          </div>

          {/* Dispositif / Type */}
          <div className="ae-field">
            <label className="ae-label">
              Dispositif / Type <span className="ae-required">*</span>
            </label>
            <SearchDropdown
              options={dispositifOptions}
              valueId={dispositifOptions.find((o) => o.label === form.Dispositif)?.id ?? null}
              onChange={(id) => {
                const found = dispositifOptions.find((o) => o.id === id);
                set("Dispositif", found?.label ?? "");
              }}
              placeholder={colsLoading ? "Chargement…" : "Sélectionner le dispositif"}
              disabled={colsLoading}
            />
          </div>

          {/* Organisme gestionnaire */}
          <div className="ae-field">
            <label className="ae-label">
              Organisme gestionnaire <span className="ae-required">*</span>
            </label>
            <SearchDropdown
              options={organismeOptions}
              valueId={organismeOptions.find((o) => o.label === form.Organisme_gestionnaire)?.id ?? null}
              onChange={(id) => {
                const found = organismeOptions.find((o) => o.id === id);
                set("Organisme_gestionnaire", found?.label ?? "");
              }}
              placeholder={colsLoading ? "Chargement…" : "Sélectionner l'organisme"}
              disabled={colsLoading}
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
            <button type="submit" className="ae-btn ae-btn--primary" disabled={submitting || dataLoading}>
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
