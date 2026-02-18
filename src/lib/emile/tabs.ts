// src/lib/emile/tabs.ts

export type L1TabKey =
  | "administratif"
  | "dls"
  | "emploi_formation"
  | "finances"
  | "foyer"
  | "habitat"
  | "lec"
  | "mobilite"
  | "numerique"
  | "sante";

export type L2Tab = { key: string; label: string };

export type L1Tab = {
  key: L1TabKey;
  label: string;
  icon: string; // FontAwesome class, e.g. "fa-solid fa-building"
  subtabs: L2Tab[];
};

// ⚠️ mapping colonnes viendra juste après (A10.1)
export const EMILE_TABS: L1Tab[] = [
  {
    key: "administratif",
    label: "Administratif",
    icon: "fa-solid fa-building",
    subtabs: [
      { key: "infos_perso", label: "Informations personnelles" },
      { key: "coordonnees", label: "Coordonnées" },
      { key: "situation_admin", label: "Situation administrative" },
      { key: "besoins", label: "Besoins particuliers" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "dls",
    label: "DLS",
    icon: "fa-solid fa-key",
    subtabs: [
      { key: "status", label: "Status de la demande" },
      { key: "pieces_admin", label: "Pièces administratives" },
      { key: "revenus", label: "Justificatifs de revenus" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "emploi_formation",
    label: "Emploi-Formation",
    icon: "fa-solid fa-briefcase",
    subtabs: [
      { key: "situation", label: "Situation actuelle" },
      { key: "projet", label: "Projet candidat.e" },
      { key: "demarches", label: "Démarches engagées" },
      { key: "cv", label: "CV et attestations" },
      { key: "besoins", label: "Besoins particuliers" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "finances",
    label: "Finances",
    icon: "fa-solid fa-euro-sign",
    subtabs: [
      { key: "situation", label: "Situation actuelle" },
      { key: "france_travail", label: "France Travail" },
      { key: "avis", label: "Avis et attestations" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "foyer",
    label: "Foyer",
    icon: "fa-solid fa-users",
    subtabs: [
      { key: "composition", label: "Composition" },
      { key: "couple_famille", label: "Couple/Famille" },
      { key: "besoins", label: "Besoin particuliers" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "habitat",
    label: "Habitat",
    icon: "fa-solid fa-house",
    subtabs: [
      { key: "infos", label: "Informations générales" },
      { key: "etapes", label: "Situation par étape" },
      { key: "attestations", label: "Attestation, avis et quittances" },
      { key: "colocation", label: "Colocation" },
      { key: "besoins", label: "Besoins particuliers" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "lec",
    label: "Lecture-Écriture-Calcul",
    icon: "fa-solid fa-graduation-cap",
    subtabs: [
      { key: "infos", label: "Informations générales" },
      { key: "francais", label: "Maitrise du français" },
      { key: "calcul", label: "Calcul" },
      { key: "apprentissages", label: "Apprentissages" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "mobilite",
    label: "Mobilité",
    icon: "fa-solid fa-car",
    subtabs: [
      { key: "vehicules", label: "Véhicules, code et permis" },
      { key: "besoins", label: "Besoins particuliers" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "numerique",
    label: "Numérique",
    icon: "fa-solid fa-desktop",
    subtabs: [
      { key: "materiel", label: "Matériel et capacités" },
      { key: "besoins", label: "Besoins particuliers" },
      { key: "complements", label: "Compléments" },
    ],
  },
  {
    key: "sante",
    label: "Santé",
    icon: "fa-solid fa-heart-pulse",
    subtabs: [
      { key: "situation", label: "Situation actuelle" },
      { key: "documents", label: "Documents" },
      { key: "besoins", label: "Besoins particuliers" },
      { key: "complements", label: "Compléments" },
    ],
  },
];