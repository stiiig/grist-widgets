"use client";

import { useEffect, useMemo, useState } from "react";

const TABLE_ID = "CANDIDATS";

// Premier groupe (à ajuster ensuite avec ton vrai mapping)
const PERSO_FIELDS = [
  "Nom_de_famille",
  "Prenom",
  "ID2",
  "Date_de_naissance",
  "Lieu_de_naissance",
  "Nationalite",
] as const;

type CandidateItem = { id: number; label: string; extra: string; q: string };

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

function isProbablyLongText(v: any) {
  if (typeof v !== "string") return false;
  return v.length > 80 || v.includes("\n");
}

export default function EmileReact() {
  const [status, setStatus] = useState("Initialisation…");
  const [debug, setDebug] = useState<any>({});

  const [docApi, setDocApi] = useState<any | null>(null);
  const [tableCache, setTableCache] = useState<any | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  // drafts
  const [draft, setDraft] = useState<Record<string, any>>({});

  // init grist-plugin-api
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://docs.getgrist.com/grist-plugin-api.js";
    script.async = true;

    script.onload = () => {
      const grist: any = (window as any).grist;
      if (!grist) {
        setStatus("window.grist absent");
        setDebug({ mode: "none" });
        return;
      }

      grist.ready({ requiredAccess: "full" });

      if (!grist.docApi?.fetchTable || !grist.docApi?.applyUserActions) {
        setStatus("docApi indisponible (fetchTable/applyUserActions)");
        setDebug({ mode: "grist", hasDocApi: !!grist.docApi });
        return;
      }

      setDocApi(grist.docApi);
      setDebug({ mode: "grist" });
      setStatus("Chargement table…");

      grist.docApi
        .fetchTable(TABLE_ID)
        .then((t: any) => {
          const k = Object.keys(t || {});
          setKeys(k);
          setTableCache(t);
          setCandidates(buildCandidateIndexFromTable(t));

          setDebug((d: any) => ({
            ...d,
            tableId: TABLE_ID,
            rows: t?.id?.length ?? 0,
            keys: k,
          }));

          setStatus("");
        })
        .catch((e: any) => setStatus("Erreur fetchTable: " + (e?.message ?? String(e))));
    };

    script.onerror = () => setStatus("Impossible de charger grist-plugin-api");
    document.head.appendChild(script);
  }, []);

  // matches
  const matches = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? candidates.filter((c) => c.q.includes(q)) : candidates;
    return list.slice(0, 25);
  }, [search, candidates]);

  // selected record from cache
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

  // init drafts when selection changes
  useEffect(() => {
    if (!selectedRecord) {
      setDraft({});
      return;
    }
    const next: Record<string, any> = {};
    for (const f of PERSO_FIELDS) {
      if (keys.includes(f)) next[f] = selectedRecord[f] ?? "";
    }
    setDraft(next);
  }, [selectedRecord, keys]);

  function setField(colId: string, value: any) {
    setDraft((d) => ({ ...d, [colId]: value }));
  }

  function computeDiff(): Record<string, any> {
    if (!selectedRecord) return {};
    const diff: Record<string, any> = {};
    for (const [k, v] of Object.entries(draft)) {
      const old = selectedRecord[k];
      const oldNorm = old == null ? "" : String(old);
      const newNorm = v == null ? "" : String(v);
      if (oldNorm !== newNorm) diff[k] = v;
    }
    return diff;
  }

  async function saveAll() {
    if (!docApi || !selectedId) return;
    const diff = computeDiff();
    const keysDiff = Object.keys(diff);
    if (keysDiff.length === 0) {
      setStatus("Rien à enregistrer.");
      return;
    }

    try {
      setStatus(`Enregistrement (${keysDiff.length})…`);
      await docApi.applyUserActions([["UpdateRecord", TABLE_ID, selectedId, diff]]);
      setStatus("✅ Enregistré");

      // refresh table
      const t = await docApi.fetchTable(TABLE_ID);
      setTableCache(t);
      setCandidates(buildCandidateIndexFromTable(t));
    } catch (e: any) {
      setStatus("❌ Erreur: " + (e?.message ?? String(e)));
    }
  }

  const diffCount = useMemo(() => Object.keys(computeDiff()).length, [draft, selectedRecord]);

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <h2 style={{ marginTop: 0 }}>EMILE (React) — migration progressive</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder={`Rechercher (${candidates.length})`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 320px", minWidth: 240, padding: 8 }}
        />
        <button type="button" onClick={saveAll} disabled={!selectedId || diffCount === 0}>
          Enregistrer ({diffCount})
        </button>

        <span style={{ fontSize: 12, color: "#666" }}>{status}</span>

        <details style={{ marginLeft: "auto" }}>
          <summary style={{ cursor: "pointer" }}>Debug</summary>
          <pre style={{ background: "#f5f5f5", padding: 10, overflow: "auto" }}>
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      </div>

      {matches.length > 0 && (
        <div style={{ marginTop: 10, border: "1px solid #eee", borderRadius: 8, maxHeight: 240, overflow: "auto" }}>
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                border: 0,
                borderBottom: "1px solid #f0f0f0",
                background: selectedId === m.id ? "#f6f6f6" : "transparent",
                cursor: "pointer",
              }}
            >
              <div>{m.label}</div>
              {m.extra ? <small style={{ color: "#666" }}>{m.extra}</small> : null}
            </button>
          ))}
        </div>
      )}

      {!selectedRecord && (
        <div style={{ marginTop: 16, padding: 12, background: "#fafafa", border: "1px solid #eee", borderRadius: 8 }}>
          Sélectionne un candidat.
        </div>
      )}

      {selectedRecord && (
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Groupe — Informations personnelles</h3>

            {PERSO_FIELDS.filter((f) => keys.includes(f)).map((colId) => {
              const v = draft[colId] ?? "";
              const useTextarea = isProbablyLongText(v);

              return (
                <div key={colId} style={{ marginTop: 10 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#666" }}>{colId}</label>
                  {useTextarea ? (
                    <textarea
                      value={String(v)}
                      onChange={(e) => setField(colId, e.target.value)}
                      rows={4}
                      style={{ width: "100%", padding: 8, marginTop: 4 }}
                    />
                  ) : (
                    <input
                      value={String(v)}
                      onChange={(e) => setField(colId, e.target.value)}
                      style={{ width: "100%", padding: 8, marginTop: 4 }}
                    />
                  )}
                </div>
              );
            })}

            <p style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
              Champs présents : {PERSO_FIELDS.filter((f) => keys.includes(f)).length} / {PERSO_FIELDS.length}
            </p>
          </section>

          <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Record brut (debug)</h3>
            <pre style={{ background: "#f5f5f5", padding: 10, overflow: "auto", maxHeight: 520 }}>
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}