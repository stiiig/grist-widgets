// src/lib/emile/groups.ts

export const GROUPS_ORDER = ["perso", "coord", "admin", "besoins", "complements"] as const;
export type GroupKey = (typeof GROUPS_ORDER)[number];

export const GROUPS: Record<GroupKey, string[]> = {
  perso: [
    "Prenom",
    "Nom_de_famille",
    "Date_de_naissance",
    "Genre",
    "Nationalite",
    "AIE",
    "Niveau_de_langue",
    "Niveau_etudes_reconnu_en_France",
    "PMR",
    "RQTH",
  ],
  coord: ["Adresse", "Email", "Tel", "Departement_domicile_inscription"],
  admin: [
    "Regularite_situation",
    "Date_validite_titre_sejour",
    "Numero_unique_enregistrement",
    "Attestation_MSA_CAF",
    "Document_identite_sejour_candidats",
    "Document_identite_sejour_autres_personnes",
  ],
  besoins: [
    "Precarite_de_logement",
    "Situation_hebergement",
    "Situation_financiere",
    "Situation_face_emploi",
    "Besoin_divers",
    "Difficultes_diverses",
    "Besoin_mise_a_l_abri",
    "Besoin_prise_en_charge_enfant_s_",
    "Besoin_accompagner_conjoint_e_vers_emploi_formation",
  ],
  complements: [
    "Motivation_candidat",
    "Autres_initiatives_perso",
    "Complement_info_Emploi_Formation",
    "Complement_info_Finances",
    "Complement_info_Mobilite",
    "Vehicule",
    "Permis",
    "Commentaire_du_statut",
  ],
};

export const GROUP_TITLES: Record<GroupKey, string> = {
  perso: "Informations personnelles",
  coord: "Coordonnées",
  admin: "Situation administrative",
  besoins: "Besoins particuliers",
  complements: "Compléments",
};

export const GROUP_ANCHORS: Record<GroupKey, string> = {
  perso: "sec-perso",
  coord: "sec-coord",
  admin: "sec-admin",
  besoins: "sec-besoins",
  complements: "sec-complements",
};