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


function tableUrl(tableId: string, params?: Record<string, string>): string {
  const base = `${server()}/api/docs/${docId()}/tables/${encodeURIComponent(tableId)}/records`;
  // On injecte toujours ?auth=KEY pour éviter le header Authorization qui
  // déclenche un preflight CORS bloqué par docs.getgrist.com.
  const allParams = new URLSearchParams({ auth: apiKey(), ...params });
  return `${base}?${allParams.toString()}`;
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

async function gristFetch(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch { /* ignore */ }
    throw new Error(`Grist API ${res.status}: ${detail}`);
  }
  return res.json();
}

async function fetchTableRest(tableId: string): Promise<Record<string, any[]>> {
  const url = tableUrl(tableId);
  const { records } = (await gristFetch(url, {})) as { records: RestRecord[] };
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
  const url = tableUrl(tableId, { filter: JSON.stringify({ id: [rowId] }) });
  const { records } = (await gristFetch(url, {})) as { records: RestRecord[] };
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
    const url = tableUrl(tableId);

    if (type === "UpdateRecord") {
      await gristFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: [{ id: rowId, fields }] }),
      });
    } else if (type === "AddRecord") {
      return gristFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: [{ fields }] }),
      });
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
