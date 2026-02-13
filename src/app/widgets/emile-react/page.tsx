"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { initGristOrMock } from "@/lib/grist/init";

const TABLE_ID = "CANDIDATS"; // à confirmer dans ton doc Grist
const [gristApiLoaded, setGristApiLoaded] = useState(false);

type CandidateItem = { id: number; label: string; extra: string; q: string };
type GristDocAPI = {
  fetchTable: (tableId: string) => Promise<any>;
  applyUserActions: (actions: any[]) => Promise<any>;
};

function pickFirstCol(table: any, preferred: string[]): string | null {
  const keys = Object.keys(table || {}).filter((k) => k !== "id");
  for (const p of preferred) if (keys.includes(p)) return p;
  return keys[0] ?? null;
}

function buildCandidateIndexFromTable(t: any): { items: CandidateItem[]; used: any } {
  const ids: number[] = t?.id ?? [];

  const nomKey = pickFirstCol(t, ["Nom_de_famille", "Nom", "NOM"]);
  const prenomKey = pickFirstCol(t, ["Prenom", "Prénom", "PRENOM"]);
  const id2Key = pickFirstCol(t, ["ID2", "Id2", "Identifiant", "ID"]);

  const nomCol: any[] = nomKey ? t[nomKey] ?? [] : [];
  const prenomCol: any[] = prenomKey ? t[prenomKey] ?? [] : [];
  const id2Col: any[] = id2Key ? t[id2Key] ?? [] : [];

  const res: CandidateItem[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const nom = (nomCol[i] ?? "").toString();
    const prenom = (prenomCol[i] ?? "").toString();
    const id2 = (id2Col[i] ?? "").toString().trim();
    const label = `${prenom} ${nom}`.trim() || `#${id}`;
    const q = `${nom} ${prenom} ${id2} ${id}`.toLowerCase().trim();
    res.push({ id, label, extra: id2 || "", q });
  }
  res.sort((a, b) => a.label.localeCompare(b.label));

  return { items: res, used: { nomKey, prenomKey, id2Key } };
}

export default function EmileReactV1() {
  const [status, setStatus] = useState<string>("");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  const [tableCache, setTableCache] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  // debug
  const [debug, setDebug] = useState<any>({});

  const matches = useMemo(() => {
    const qq = search.toLowerCase().trim();
    const list = qq ? candidates.filter((c) => c.q.includes(qq)) : candidates;
    return list.slice(0, 25);
  }, [search, candidates]);

useEffect(() => {
  if (!gristApiLoaded) return;

  const { grist, mode } = initGristOrMock({
    requiredAccess: "full",
    onRecord: () => {},
  });

  setDebug((d: any) => ({ ...d, mode }));

  if (mode === "none") {
    setStatus("grist-plugin-api chargé mais window.grist absent (rare) — vérifie la console.");
    return;
  }

  const raw = (grist?.docApi as any) ?? null;
  setDebug((d: any) => ({
    ...d,
    mode,
    hasDocApi: !!raw,
    hasFetchTable: !!raw?.fetchTable,
    hasApply: !!raw?.applyUserActions,
  }));

  if (!raw?.fetchTable) {
    setStatus("docApi.fetchTable indisponible → vérifie requiredAccess='full'.");
    return;
  }

  setDocApi(raw as any);
  setStatus(mode === "mock" ? "Mode mock (localStorage)" : "");
}, [gristApiLoaded]);

  useEffect(() => {
    (async () => {
      if (!docApi) return;
      setStatus(`Chargement table "${TABLE_ID}"…`);

      try {
        const t = await docApi.fetchTable(TABLE_ID);
        const keys = Object.keys(t || {});
        setDebug((d: any) => ({
          ...d,
          tableId: TABLE_ID,
          keys,
          rows: Array.isArray(t?.id) ? t.id.length : null,
        }));

        setTableCache(t);

        const built = buildCandidateIndexFromTable(t);
        setCandidates(built.items);
        setDebug((d: any) => ({ ...d, usedColumns: built.used, candidateCount: built.items.length }));

        setStatus("");
      } catch (e: any) {
        setStatus(`Erreur fetchTable("${TABLE_ID}") : ${e?.message ?? String(e)}`);
        setDebug((d: any) => ({ ...d, fetchError: String(e?.message ?? e) }));
      }
    })();
  }, [docApi]);

  useEffect(() => {
    if (!tableCache || !selectedId) {
      setSelectedRecord(null);
      return;
    }
    const idx = (tableCache.id ?? []).findIndex((x: any) => x === selectedId);
    if (idx < 0) {
      setSelectedRecord(null);
      return;
    }
    const rec: any = { id: selectedId };
    for (const k of Object.keys(tableCache)) rec[k] = tableCache[k]?.[idx];
    setSelectedRecord(rec);
  }, [tableCache, selectedId]);

  const selectedLabel = useMemo(() => {
    if (!selectedId) return "";
    const c = candidates.find((x) => x.id === selectedId);
    return c?.label || `#${selectedId}`;
  }, [selectedId, candidates]);

  return (
    <main className="container" style={{ padding: 6 }}>
      <Script
  src="https://unpkg.com/grist-plugin-api/dist/grist-plugin-api.js"
  strategy="afterInteractive"
  onLoad={() => setGristApiLoaded(true)}
/>
      <Script
        type="module"
        src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14/dist/dsfr.module.min.js"
        strategy="afterInteractive"
      />

      <div style={{ position: "sticky", top: 0, background: "white", paddingBottom: 4, zIndex: 200 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <h2 className="fr-h5" style={{ margin: 0, paddingLeft: 8, paddingRight: 8 }}>EMILE (React)</h2>

          <div style={{ flex: "1 1 320px", minWidth: 220 }}>
            <div className="fr-input-group" style={{ margin: 0 }}>
              <input
                className="fr-input"
                placeholder={`Rechercher… (${candidates.length} candidats)`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {matches.length > 0 && (
              <div style={{ marginTop: 6, border: "1px solid var(--border-default-grey)", borderRadius: 8, background: "white", maxHeight: 220, overflow: "auto" }}>
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: 0, background: "transparent", cursor: "pointer" }}
                  >
                    <div>{m.label}</div>
                    {m.extra ? <small style={{ display: "block", color: "var(--text-mention-grey)", fontSize: "0.74rem" }}>{m.extra}</small> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="fr-tag fr-tag--sm fr-tag--icon-left fr-icon-user-line" role="status" aria-live="polite" style={{ margin: 0 }}>
            {selectedId ? `Sélection : ${selectedLabel}` : "Aucun candidat sélectionné"}
          </p>

          <span style={{ color: "var(--text-mention-grey)", fontSize: 12 }}>{status}</span>
        </div>

        <hr style={{ margin: "6px 0 0 0" }} />
      </div>

      <div style={{ marginTop: 16 }}>
        <details>
          <summary style={{ cursor: "pointer" }}>Debug</summary>
          <pre style={{ background: "#f5f5f5", padding: 12, overflow: "auto" }}>
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>

        {!selectedId && candidates.length === 0 && (
          <div className="fr-callout">
            <p className="fr-callout__title">Aucun candidat chargé</p>
            <p className="fr-callout__text">
              Ouvre “Debug” et regarde :
              <br />• si <code>hasFetchTable</code> est true
              <br />• la valeur <code>fetchError</code> si erreur
              <br />• <code>keys</code> (colonnes reçues)
            </p>
          </div>
        )}

        {selectedId && (
          <div style={{ border: "1px solid var(--border-default-grey)", borderRadius: 10, padding: 8 }}>
            <h3 className="fr-h6" style={{ marginTop: 0 }}>Record courant (debug)</h3>
            <pre style={{ background: "#f5f5f5", padding: 12, overflow: "auto" }}>
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <footer style={{ marginTop: 14, borderTop: "1px solid var(--border-default-grey)", padding: "10px 0", textAlign: "center", color: "var(--text-mention-grey)", fontSize: "0.85rem" }}>
        Programme EMILE
      </footer>
    </main>
  );
}