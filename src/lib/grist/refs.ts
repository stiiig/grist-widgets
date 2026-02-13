/**
 * Normalise une valeur de ref Grist (rowId number, ou display string, ou [rowId, display]).
 */
export function normalizeRef(input: any): { rowId: number | null; display: string | null } {
  if (input == null) return { rowId: null, display: null };

  if (typeof input === "number") return { rowId: input, display: null };

  if (typeof input === "string") return { rowId: null, display: input };

  if (Array.isArray(input)) {
    const [a, b] = input;
    const rowId = typeof a === "number" ? a : null;
    const display = typeof b === "string" ? b : typeof a === "string" ? a : null;
    return { rowId, display };
  }

  return { rowId: null, display: null };
}