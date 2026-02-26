// src/lib/grist/rest.ts
// Client REST Grist — implémente la même interface que grist.docApi (Plugin API)
// Utilisé en mode standalone (hors iframe Grist) via le proxy n8n (NEXT_PUBLIC_GRIST_PROXY_URL).

import type { GristDocAPI } from "./meta";

function proxyUrl(): string {
  return (process.env.NEXT_PUBLIC_GRIST_PROXY_URL ?? "").replace(/\/$/, "");
}

/**
 * Construit l'URL du proxy n8n.
 * GET /webhook/grist?table=TABLE[&filter=JSON]
 */
function tableUrl(tableId: string, params?: Record<string, string>): string {
  const allParams = new URLSearchParams({ table: tableId, ...params });
  return `${proxyUrl()}?${allParams.toString()}`;
}

type RestRecord = { id: number; fields: Record<string, any> };

/**
 * Convertit le format REST Grist [{id, fields: {col: val}}]
 * → format columnar {id:[], col:[]} (même format que grist.docApi.fetchTable).
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

/**
 * Récupère tous les enregistrements d'une table (format columnar).
 * Utilisé pour DPTS_REGIONS, ETABLISSEMENTS, _grist_Tables, _grist_Tables_column…
 */
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
  const filter = JSON.stringify({ id: [rowId] });
  const url = tableUrl(tableId, { filter });
  const { records } = (await gristFetch(url, {})) as { records: RestRecord[] };
  const rec = records.find((r) => r.id === rowId) ?? null;
  if (!rec) return null;
  return { id: rec.id, ...rec.fields };
}

/**
 * Applique des actions Grist via le proxy n8n (POST / PATCH).
 *
 * ⚠️  n8n doit accepter POST et PATCH (pas seulement GET) et gérer
 *     le preflight CORS OPTIONS pour les requêtes avec Content-Type JSON.
 *
 * Actions supportées :
 *   ["AddRecord",    tableId, null, fields] → POST   /webhook/grist?table=TABLE
 *   ["UpdateRecord", tableId, rowId, fields] → PATCH /webhook/grist?table=TABLE
 */
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

/**
 * Upload des fichiers via le proxy n8n.
 * n8n doit router POST ?action=upload vers POST /attachments de Grist.
 * Retourne les rowIds des nouvelles pièces jointes.
 */
async function uploadAttachmentsRest(files: FileList): Promise<number[]> {
  // POST vers le même proxy mais méthode POST (workflow n8n séparé).
  // Pas de header custom → multipart/form-data = "simple CORS request" → pas de preflight OPTIONS.
  const url = proxyUrl();
  const newIds: number[] = [];
  for (const file of Array.from(files)) {
    const fd = new FormData();
    fd.append("upload", file, file.name);
    const res = await fetch(url, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { const b = await res.json(); if (b?.error) detail = b.error; } catch { /* ignore */ }
      throw new Error(`Upload ${res.status}: ${detail}`);
    }
    const body = await res.json();
    // n8n peut renvoyer [42], 42, ou {"0":42} selon la version — on normalise
    const ids: number[] = Array.isArray(body)
      ? body.filter((v: any) => typeof v === "number")
      : typeof body === "number"
        ? [body]
        : Object.values(body as object).filter((v): v is number => typeof v === "number");
    newIds.push(...ids);
  }
  return newIds;
}

/** Crée un objet GristDocAPI utilisant le proxy n8n. */
export function createRestDocApi(): GristDocAPI {
  return {
    fetchTable:               fetchTableRest,
    applyUserActions:         applyUserActionsRest,
    getAttachmentDownloadUrl: (attachId: number) =>
      `${proxyUrl()}?attachId=${attachId}`,
    uploadAttachments:        uploadAttachmentsRest,
  };
}
