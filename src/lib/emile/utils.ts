// src/lib/emile/utils.ts
import type { Option } from "@/components/SearchDropdown";

/** Convertit un tableau de libellés en options pour SearchDropdown */
export function choicesToOptions(choices: string[]): Option[] {
  return choices.map((label, i) => ({ id: i + 1, label, q: label.toLowerCase() }));
}

/** Tri des départements : numérique, 2A→20.1, 2B→20.2, inconnu→9999 */
export function deptSortKey(numero: string | undefined): number {
  if (!numero) return 9999;
  const n = numero.toUpperCase();
  if (n === "2A") return 20.1;
  if (n === "2B") return 20.2;
  const p = parseFloat(n);
  return isNaN(p) ? 9999 : p;
}

/** Calcule l'âge à partir d'une date ISO (YYYY-MM-DD) */
export function computeAge(dateIso: string): number | null {
  if (!dateIso) return null;
  const birth = new Date(dateIso);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}
