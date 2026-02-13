// src/lib/emile/fieldmap.ts
import type { L1TabKey } from "@/lib/emile/tabs";
import { GROUPS } from "@/lib/emile/groups";

export type SubtabKey = string;

/**
 * Mapping de colonnes (colId Grist) par (tab L1, subtab L2).
 * Pour A10.1 : on mappe uniquement "Administratif" à partir des groups legacy déjà existants.
 * Les autres tabs : tableau vide => on affichera un message "à mapper".
 */
export const FIELD_MAP: Record<L1TabKey, Record<SubtabKey, string[]>> = {
  administratif: {
    infos_perso: GROUPS.perso,
    coordonnees: GROUPS.coord,
    situation_admin: GROUPS.admin,
    besoins: GROUPS.besoins,
    complements: GROUPS.complements,
  },

  dls: {
    status: [],
    pieces_admin: [],
    revenus: [],
    complements: [],
  },

  emploi_formation: {
    situation: [],
    projet: [],
    demarches: [],
    cv: [],
    besoins: [],
    complements: [],
  },

  finances: {
    situation: [],
    france_travail: [],
    avis: [],
    complements: [],
  },

  foyer: {
    composition: [],
    couple_famille: [],
    besoins: [],
    complements: [],
  },

  habitat: {
    infos: [],
    etapes: [],
    attestations: [],
    colocation: [],
    besoins: [],
    complements: [],
  },

  lec: {
    infos: [],
    francais: [],
    calcul: [],
    apprentissages: [],
    complements: [],
  },

  mobilite: {
    vehicules: [],
    besoins: [],
    complements: [],
  },

  numerique: {
    materiel: [],
    besoins: [],
    complements: [],
  },

  sante: {
    situation: [],
    documents: [],
    besoins: [],
    complements: [],
  },
};