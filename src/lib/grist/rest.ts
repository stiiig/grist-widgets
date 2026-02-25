// src/lib/grist/rest.ts
// Client REST Grist — implémente la même interface que grist.docApi (Plugin API)
// Utilisé en mode standalone (hors iframe Grist) avec NEXT_PUBLIC_GRIST_API_KEY.

import type { GristDocAPI } from "./meta";

function server(): string {
  return (process.env.NEXT_PUBLIC_GRIST_SERVER ?? "https://docs.getgrist.com").replace(/\/$/, "");
}

function docId(): string {
  return process.env.NEXT_PUBLIC_GRIST_DOC_ID ?? "";
}

function apiKey(): string {
  return process.env.NEXT_PUBLIC_GRIST_API_KEY ?? "";
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

type RestRecord = { id: number; fields: Record<string, any> };

/**
 * Convertit [{id, fields: {col: val}}] → format columnar {id:[], col:[]}
 * (même format que le Plugin API grist.docApi.fetchTable)
 */
function toColumnar(records: RestRecord[]): Record<string, any[]> {
  const result: Record<string, any[]> = { id: records.map((r) => r.id) };
  if (!records.length) return result;
  for (const key of Object.keys(records[0].fields)) {
    result[key] = records.map((r) => r.fields[key] ?? null);
  }
  return result;
}

async function fetchTableRest(tableId: string): Promise<Record<string, any[]>> {
  const url = `${server()}/api/docs/${docId()}/tables/${encodeURIComponent(tableId)}/records`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`REST fetchTable(${tableId}): ${res.status} ${res.statusText}`);
  const { records } = (await res.json()) as { records: RestRecord[] };
  return toColumnar(records);
}

/**
 * Récupère un seul enregistrement par rowId (plus efficace que fetchTable entier).
 * Retourne {id, col1, col2, ...} ou null si non trouvé.
 */
export async function fetchSingleRowRest(
  tableId: string,
  rowId: number
): Promise<{ id: number; [k: string]: any } | null> {
  const filter = encodeURIComponent(JSON.stringify({ id: [rowId] }));
  const url = `${server()}/api/docs/${docId()}/tables/${encodeURIComponent(tableId)}/records?filter=${filter}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`REST fetchRecord(${tableId}, ${rowId}): ${res.status} ${res.statusText}`);
  const { records } = (await res.json()) as { records: RestRecord[] };
  const rec = records.find((r) => r.id === rowId) ?? null;
  if (!rec) return null;
  return { id: rec.id, ...rec.fields };
}

async function applyUserActionsRest(actions: any[]): Promise<any> {
  for (const action of actions) {
    const [type, tableId, rowId, fields] = action as [
      string,
      string,
      number | null,
      Record<string, any>
    ];
    const url = `${server()}/api/docs/${docId()}/tables/${encodeURIComponent(tableId)}/records`;

    if (type === "UpdateRecord") {
      const res = await fetch(url, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ records: [{ id: rowId, fields }] }),
      });
      if (!res.ok) throw new Error(`REST UpdateRecord(${tableId}, ${rowId}): ${res.status} ${res.statusText}`);
    } else if (type === "AddRecord") {
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ records: [{ fields }] }),
      });
      if (!res.ok) throw new Error(`REST AddRecord(${tableId}): ${res.status} ${res.statusText}`);
      return res.json();
    } else {
      throw new Error(`REST applyUserActions: action "${type}" non supportée`);
    }
  }
}

/** Crée un objet GristDocAPI utilisant l'API REST Grist. */
export function createRestDocApi(): GristDocAPI {
  return {
    fetchTable: fetchTableRest,
    applyUserActions: applyUserActionsRest,
  };
}
