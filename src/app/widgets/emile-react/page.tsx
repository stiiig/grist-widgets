"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { initGristOrMock } from "@/lib/grist/init";

const TABLE_ID = "CANDIDATS";

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

function buildCandidateIndexFromTable(t: any) {
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

  return {
    items: res,
    used: { nomKey, prenomKey, id2Key },
  };
}

export default function EmileReact() {
  const [gristApiLoaded, setGristApiLoaded] = useState(false);

  const [status, setStatus] = useState("");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  const [tableCache, setTableCache] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const [debug, setDebug] = useState<any>({});

  const matches = useMemo(() => {
    const qq = search.toLowerCase().trim();
    const list = qq ? candidates.filter((c) => c.q.includes(qq)) : candidates;
    return list.slice(0, 25);
  }, [search, candidates]);

  // Init après chargement grist-plugin-api
  useEffect(() => {
    if (!gristApiLoaded) return;

    const { grist, mode } = initGristOrMock({
      requiredAccess: "full",
      onRecord: () => {},
    });

    setDebug((d: any) => ({ ...d, mode }));

    if (mode === "none") {
      setStatus("grist-plugin-api chargé mais window.grist absent.");
      return;
    }

    const raw = (grist?.docApi as any) ?? null;

    setDebug((d: any) => ({
      ...d,
      hasDocApi: !!raw,
      hasFetchTable: !!raw?.fetchTable,
      hasApply: !!raw?.applyUserActions,
    }));

    if (!raw?.fetchTable) {
      setStatus("docApi.fetchTable indisponible (accès pas full ?)");
      return;
    }

    setDocApi(raw as GristDocAPI);
    setStatus(mode === "mock" ? "Mode mock (localStorage)" : "");
  }, [gristApiLoaded]);

  // Charger la table
  useEffect(() => {
    if (!docApi) return;

    (async () => {
      try {
        setStatus(`Chargement table "${TABLE_ID}"…`);
        const t = await docApi.fetchTable(TABLE_ID);

        setTableCache(t);

        const built = buildCandidateIndexFromTable(t);
        setCandidates(built.items);

        setDebug((d: any) => ({
          ...d,
          tableId: TABLE_ID,
          keys: Object.keys(t || {}),
          rows: Array.isArray(t?.id) ? t.id.length : 0,
          usedColumns: built.used,
          candidateCount: built.items.length,
        }));

        setStatus("");
      } catch (e: any) {
        setStatus(`Erreur fetchTable: ${e?.message ?? String(e)}`);
        setDebug((d: any) => ({
          ...d,
          fetchError: String(e?.message ?? e),
        }));
      }
    })();
  }, [docApi]);

  // Charger record sélectionné
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
    for (const k of Object.keys(tableCache)) {
      rec[k] = tableCache[k]?.[idx];
    }

    setSelectedRecord(rec);
  }, [tableCache, selectedId]);

  const selectedLabel = useMemo(() => {
    if (!selectedId) return "";
    const c = candidates.find((x) => x.id === selectedId);
    return c?.label || `#${selectedId}`;
  }, [selectedId, candidates]);

  return (
    <main className="container" style={{ padding: 6 }}>
      {/* grist-plugin-api */}
      <Script
        src="https://unpkg.com/grist-plugin-api/dist/grist-plugin-api.js"
        strategy="afterInteractive"
        onLoad={() => setGristApiLoaded(true)}
      />

      {/* DSFR JS */}
      <Script
        type="module"
        src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14/dist/dsfr.module.min.js"
        strategy="afterInteractive"
      />

      <h2 className="fr-h5">EMILE (React)</h2>

      <div className="fr-input-group">
        <input
          className="fr-input"
          placeholder={`Rechercher… (${candidates.length} candidats)`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {matches.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: 6,
                border: "1px solid #eee",
                marginTop: 4,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <p style={{ marginTop: 12 }}>
        {selectedId ? `Sélection : ${selectedLabel}` : "Aucun candidat sélectionné"}
      </p>

      <details style={{ marginTop: 12 }}>
        <summary>Debug</summary>
        <pre style={{ background: "#f5f5f5", padding: 10 }}>
          {JSON.stringify(debug, null, 2)}
        </pre>
      </details>

      {selectedRecord && (
        <pre style={{ background: "#f5f5f5", padding: 10, marginTop: 12 }}>
          {JSON.stringify(selectedRecord, null, 2)}
        </pre>
      )}

      <p style={{ marginTop: 8, fontSize: 12, color: "#666" }}>{status}</p>
    </main>
  );
}