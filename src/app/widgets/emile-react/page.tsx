"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { initGristOrMock } from "@/lib/grist/init";

const TABLE_ID = "CANDIDATS"; // comme dans ton HTML  [oai_citation:6‡index.html](sediment://file_00000000c8307246a79ff09ceabb26c4)

type CandidateItem = { id: number; label: string; extra: string; q: string };
type GristDocAPI = {
  fetchTable: (tableId: string) => Promise<any>;
  applyUserActions: (actions: any[]) => Promise<any>;
};

function buildCandidateIndexFromTable(t: any): CandidateItem[] {
  const ids: number[] = t?.id ?? [];
  const nomCol: any[] = t?.["Nom_de_famille"] ?? [];
  const prenomCol: any[] = t?.["Prenom"] ?? [];
  const id2Col: any[] = t?.["ID2"] ?? [];

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
  return res;
}

export default function EmileReactV1() {
  const [status, setStatus] = useState<string>("");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  const [tableCache, setTableCache] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const matches = useMemo(() => {
    const qq = search.toLowerCase().trim();
    const list = qq ? candidates.filter((c) => c.q.includes(qq)) : candidates;
    return list.slice(0, 25);
  }, [search, candidates]);

  // Init Grist (ou mock)
  useEffect(() => {
    const { grist, mode } = initGristOrMock({
      requiredAccess: "full",
      onRecord: () => {
        // on ne se base pas sur le record courant ici : on pilote via recherche/sélection
      },
    });

    if (mode === "none") {
      setStatus("En attente de Grist — ouvre /dev/harness pour activer le mock.");
      return;
    }

    const raw = (grist?.docApi as any) ?? null;
    if (!raw?.fetchTable || !raw?.applyUserActions) {
      setStatus("docApi indisponible.");
      return;
    }

    setDocApi(raw as GristDocAPI);
    setStatus(mode === "mock" ? "Mode mock (localStorage)" : "");
  }, []);

  // Charger table + index candidats
  useEffect(() => {
    (async () => {
      if (!docApi) return;
      setStatus("Indexation des candidats…");
      const t = await docApi.fetchTable(TABLE_ID);
      setTableCache(t);
      setCandidates(buildCandidateIndexFromTable(t));
      setStatus("");
    })().catch((e) => setStatus(`Erreur chargement table: ${e?.message ?? String(e)}`));
  }, [docApi]);

  // Charger un record complet depuis le cache table
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
      {/* DSFR JS (comme ton HTML) */}
      <Script
        type="module"
        src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14/dist/dsfr.module.min.js"
        strategy="afterInteractive"
      />

      <div className="sticky" style={{ position: "sticky", top: 0, background: "white", paddingBottom: 4, zIndex: 200 }}>
        <div className="toolbar" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <h2 className="fr-h5" style={{ margin: 0, paddingLeft: 8, paddingRight: 8 }}>EMILE (React)</h2>

          <div style={{ flex: "1 1 320px", minWidth: 220 }}>
            <div className="fr-input-group" style={{ margin: 0 }}>
              <input
                className="fr-input"
                placeholder="Rechercher un candidat…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Liste matches */}
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

          <div className="fr-tags-group" aria-label="Sélection" style={{ margin: 0 }}>
            <p className="fr-tag fr-tag--sm fr-tag--icon-left fr-icon-user-line" role="status" aria-live="polite">
              {selectedId ? `Sélection : ${selectedLabel}` : "Aucun candidat sélectionné"}
            </p>
          </div>

          <span style={{ color: "var(--text-mention-grey)", fontSize: 12 }}>{status}</span>
        </div>

        <hr style={{ margin: "6px 0 0 0" }} />
      </div>

      <div style={{ marginTop: 16 }}>
        {!selectedId && (
          <div className="fr-callout">
            <p className="fr-callout__title">Sélectionne un candidat</p>
            <p className="fr-callout__text">Utilise la recherche en haut pour afficher la fiche.</p>
          </div>
        )}

        {selectedId && (
          <div className="main" style={{ border: "1px solid var(--border-default-grey)", borderRadius: 10, padding: 8 }}>
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