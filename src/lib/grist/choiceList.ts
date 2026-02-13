/**
 * Grist ChoiceList: stocké en "cellValue" sous forme ["L", ...values]
 */
export function encodeChoiceList(values: string[]): any {
  return ["L", ...values];
}

export function decodeChoiceList(cellValue: any): string[] {
  if (!cellValue) return [];
  if (Array.isArray(cellValue)) {
    // format attendu: ["L", ...]
    if (cellValue[0] === "L") return cellValue.slice(1).filter((v) => typeof v === "string");
    // parfois on reçoit juste ["a","b"] dans certains mocks/exports
    return cellValue.filter((v) => typeof v === "string");
  }
  // parfois un string unique
  if (typeof cellValue === "string") return [cellValue];
  return [];
}