"use client";

import { useState } from "react";
import "./styles.css";

/* ─── Config Grist (variables d'env Next.js) ──────────────── */
const GRIST_BASE_URL = process.env.NEXT_PUBLIC_GRIST_BASE_URL ?? "";
const GRIST_DOC_ID   = process.env.NEXT_PUBLIC_GRIST_DOC_ID ?? "";
const GRIST_API_KEY  = process.env.NEXT_PUBLIC_GRIST_SERVICE_KEY ?? "";

/* ─── Types ────────────────────────────────────────────────── */
type FormData = {
  Prenom: string;
  Nom_de_famille: string;
  Date_de_naissance: string;   // "YYYY-MM-DD" → converti en unixSeconds avant envoi
  Genre: string;
  Nationalite: string;
  Adresse: string;
  Email: string;
  Tel: string;
  Regularite_situation: string;
  Niveau_de_langue: string;
  Niveau_etudes_reconnu_en_France: string;
  Situation_face_emploi: string;
  Situation_financiere: string;
  Situation_hebergement: string;
  Vehicule: string;
  Permis: string;
  PMR: string;
  RQTH: string;
  Motivation_candidat: string;
};

const INITIAL: FormData = {
  Prenom: "",
  Nom_de_famille: "",
  Date_de_naissance: "",
  Genre: "",
  Nationalite: "",
  Adresse: "",
  Email: "",
  Tel: "",
  Regularite_situation: "",
  Niveau_de_langue: "",
  Niveau_etudes_reconnu_en_France: "",
  Situation_face_emploi: "",
  Situation_financiere: "",
  Situation_hebergement: "",
  Vehicule: "",
  Permis: "",
  PMR: "",
  RQTH: "",
  Motivation_candidat: "",
};

/* ─── Choix (à adapter selon vos données Grist réelles) ────── */
const CHOICES: Partial<Record<keyof FormData, string[]>> = {
  Genre: ["Homme", "Femme", "Autre", "Non renseigné"],
  Regularite_situation: ["Régulier", "Irrégulier", "En cours de régularisation", "Non renseigné"],
  Niveau_de_langue: ["A1", "A2", "B1", "B2", "C1", "C2", "Francophone natif", "Non renseigné"],
  Niveau_etudes_reconnu_en_France: [
    "Aucun diplôme", "CAP/BEP", "Bac", "Bac+2", "Bac+3", "Bac+4", "Bac+5 et plus", "Non renseigné",
  ],
  Situation_face_emploi: [
    "Sans emploi", "En emploi", "En formation", "En recherche d'emploi", "Inactif", "Non renseigné",
  ],
  Situation_financiere: [
    "RSA", "ARE", "AAH", "Sans ressources", "Revenus d'activité", "Autre", "Non renseigné",
  ],
  Situation_hebergement: [
    "Propriétaire", "Locataire", "Hébergé par un tiers", "Sans domicile fixe",
    "Hébergement d'urgence", "Non renseigné",
  ],
  Vehicule: ["Oui", "Non", "Non renseigné"],
  Permis: ["Oui", "Non", "En cours", "Non renseigné"],
  PMR: ["Oui", "Non", "Non renseigné"],
  RQTH: ["Oui", "Non", "En cours", "Non renseigné"],
};

/* ─── Helper : date ISO → unix seconds ─────────────────────── */
function isoToUnix(iso: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return isNaN(ms) ? null : Math.floor(ms / 1000);
}

/* ─── Envoi vers Grist REST API ────────────────────────────── */
async function submitToGrist(data: FormData): Promise<void> {
  if (!GRIST_BASE_URL || !GRIST_DOC_ID || !GRIST_API_KEY) {
    throw new Error("Variables d'environnement Grist non configurées (NEXT_PUBLIC_GRIST_*).");
  }

  // Construire l'objet de champs à envoyer
  // On omet les champs vides pour ne pas écraser des valeurs par défaut
  const fields: Record<string, any> = {};

  for (const [key, val] of Object.entries(data) as [keyof FormData, string][]) {
    if (key === "Date_de_naissance") {
      const unix = isoToUnix(val);
      if (unix !== null) fields[key] = unix;
    } else if (val !== "") {
      fields[key] = val;
    }
  }

  const url = `${GRIST_BASE_URL}/api/docs/${GRIST_DOC_ID}/tables/CANDIDATS/records`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GRIST_API_KEY}`,
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erreur Grist ${res.status}${txt ? ` : ${txt}` : ""}`);
  }
}

/* ─── Composants UI ────────────────────────────────────────── */

function TextInput({
  label, name, value, onChange, type = "text", required = false, placeholder = "",
}: {
  label: string; name: keyof FormData; value: string;
  onChange: (k: keyof FormData, v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div className="ins-field">
      <label className="ins-label" htmlFor={name}>
        {label}{required && <span className="ins-required"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        className="ins-input"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

function SelectInput({
  label, name, value, onChange, required = false,
}: {
  label: string; name: keyof FormData; value: string;
  onChange: (k: keyof FormData, v: string) => void;
  required?: boolean;
}) {
  const options = CHOICES[name] ?? [];
  return (
    <div className="ins-field">
      <label className="ins-label" htmlFor={name}>
        {label}{required && <span className="ins-required"> *</span>}
      </label>
      <select
        id={name}
        name={name}
        className="ins-select"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
      >
        <option value="">— Choisir —</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function Textarea({
  label, name, value, onChange, rows = 4,
}: {
  label: string; name: keyof FormData; value: string;
  onChange: (k: keyof FormData, v: string) => void;
  rows?: number;
}) {
  return (
    <div className="ins-field ins-field--wide">
      <label className="ins-label" htmlFor={name}>{label}</label>
      <textarea
        id={name}
        name={name}
        className="ins-textarea"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        rows={rows}
      />
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="ins-section-title">
      <i className={`${icon} ins-section-icon`} aria-hidden="true" />
      <span>{title}</span>
    </div>
  );
}

/* ─── Page principale ──────────────────────────────────────── */

export default function InscriptionPage() {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function set(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await submitToGrist(form);
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Écran de confirmation ── */
  if (done) {
    return (
      <div className="ins-shell">
        <header className="ins-header">
          <div className="ins-header__logo">
            <i className="fa-solid fa-landmark" aria-hidden="true" />
            DDT31
          </div>
          <span className="ins-header__appname">EMILE — Inscription</span>
        </header>
        <div className="ins-body ins-body--center">
          <div className="ins-confirm">
            <i className="fa-solid fa-circle-check ins-confirm__icon" aria-hidden="true" />
            <h2 className="ins-confirm__title">Dossier envoyé !</h2>
            <p className="ins-confirm__text">
              Votre dossier de candidature a bien été transmis à l'équipe DDT31.
              <br />Vous serez contacté prochainement.
            </p>
            <button
              type="button"
              className="ins-btn ins-btn--secondary"
              onClick={() => { setForm(INITIAL); setDone(false); }}
            >
              <i className="fa-solid fa-rotate-left" aria-hidden="true" />
              Nouveau dossier
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ins-shell">

      {/* ── Header ── */}
      <header className="ins-header">
        <div className="ins-header__logo">
          <i className="fa-solid fa-landmark" aria-hidden="true" />
          DDT31
        </div>
        <span className="ins-header__appname">EMILE — Inscription</span>
      </header>

      {/* ── Intro ── */}
      <div className="ins-intro">
        <p>
          Remplissez ce formulaire pour initier votre dossier de candidature au dispositif EMILE.
          Les champs marqués <span className="ins-required">*</span> sont obligatoires.
        </p>
      </div>

      {/* ── Formulaire ── */}
      <div className="ins-body">
        <form className="ins-form" onSubmit={handleSubmit} noValidate>

          {/* ── Identité ── */}
          <SectionTitle icon="fa-solid fa-user" title="Identité" />
          <div className="ins-grid">
            <TextInput label="Prénom" name="Prenom" value={form.Prenom} onChange={set} required />
            <TextInput label="Nom de famille" name="Nom_de_famille" value={form.Nom_de_famille} onChange={set} required />
            <TextInput label="Date de naissance" name="Date_de_naissance" value={form.Date_de_naissance} onChange={set} type="date" required />
            <SelectInput label="Genre" name="Genre" value={form.Genre} onChange={set} />
            <TextInput label="Nationalité" name="Nationalite" value={form.Nationalite} onChange={set} placeholder="Ex: Française, Marocaine…" />
            <SelectInput label="Régularité de la situation" name="Regularite_situation" value={form.Regularite_situation} onChange={set} />
          </div>

          {/* ── Coordonnées ── */}
          <SectionTitle icon="fa-solid fa-address-card" title="Coordonnées" />
          <div className="ins-grid">
            <TextInput label="Adresse" name="Adresse" value={form.Adresse} onChange={set} placeholder="Numéro, rue, ville, code postal" />
            <TextInput label="Email" name="Email" value={form.Email} onChange={set} type="email" placeholder="exemple@mail.fr" />
            <TextInput label="Téléphone" name="Tel" value={form.Tel} onChange={set} type="tel" placeholder="06 XX XX XX XX" />
          </div>

          {/* ── Situation ── */}
          <SectionTitle icon="fa-solid fa-briefcase" title="Situation" />
          <div className="ins-grid">
            <SelectInput label="Situation face à l'emploi" name="Situation_face_emploi" value={form.Situation_face_emploi} onChange={set} />
            <SelectInput label="Situation financière" name="Situation_financiere" value={form.Situation_financiere} onChange={set} />
            <SelectInput label="Situation d'hébergement" name="Situation_hebergement" value={form.Situation_hebergement} onChange={set} />
            <SelectInput label="Niveau de langue" name="Niveau_de_langue" value={form.Niveau_de_langue} onChange={set} />
            <SelectInput label="Niveau d'études (reconnu en France)" name="Niveau_etudes_reconnu_en_France" value={form.Niveau_etudes_reconnu_en_France} onChange={set} />
          </div>

          {/* ── Mobilité & Santé ── */}
          <SectionTitle icon="fa-solid fa-car" title="Mobilité &amp; Santé" />
          <div className="ins-grid">
            <SelectInput label="Véhicule" name="Vehicule" value={form.Vehicule} onChange={set} />
            <SelectInput label="Permis de conduire" name="Permis" value={form.Permis} onChange={set} />
            <SelectInput label="PMR (Personne à Mobilité Réduite)" name="PMR" value={form.PMR} onChange={set} />
            <SelectInput label="RQTH" name="RQTH" value={form.RQTH} onChange={set} />
          </div>

          {/* ── Motivation ── */}
          <SectionTitle icon="fa-solid fa-star" title="Motivation" />
          <div className="ins-grid">
            <Textarea
              label="Décrivez votre motivation et votre projet (optionnel)"
              name="Motivation_candidat"
              value={form.Motivation_candidat}
              onChange={set}
              rows={5}
            />
          </div>

          {/* ── Erreur ── */}
          {error && (
            <div className="fr-alert fr-alert--error" style={{ marginTop: "1rem" }}>
              <p className="fr-alert__title">Erreur</p>
              <p>{error}</p>
            </div>
          )}

          {/* ── Submit ── */}
          <div className="ins-submit-row">
            <button
              type="submit"
              className="ins-btn ins-btn--primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                  Envoyer mon dossier
                </>
              )}
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}
