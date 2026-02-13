"use client";

import { useEffect, useMemo, useState } from "react";

const TABLE_ID = "CANDIDATS";

// essaie d'abord ces colonnes (tu peux en ajouter)
const EDITABLE_TEXT_CANDIDATES = [
  "Commentaire",
  "Commentaires",
  "Notes",
  "Note",
  "Observation",
  "Observations",
  "Remarques",
];

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

function inferEditableField(keys: string[]): string | null {
  for (const k of EDITABLE_TEXT_CANDIDATES) if (keys.includes(k)) return k;
  // fallback: premier champ string-ish (hors id + ceux utilisés)
  const blacklist = new Set(["id", "Nom_de_famille", "Prenom", "ID2"]);
  const other = keys.find((k) => !blacklist.has(k));
  return other ?? null;
}

export default function EmileReact() {
  const [status, setStatus] = useState("Initialisation…");
  const [debug, setDebug] = useState<any>({});

  const [tableCache, setTableCache] = useState<any | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const [editableField, setEditableField] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");

  const [docApi, setDocApi] = useState<any | null>(null);

  // Charger grist-plugin-api dynamiquement (compatible CSP/iframe)
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

          const inferred = inferEditableField(k);
          setEditableField(inferred);

          setDebug((d: any) => ({
            ...d,
            tableId: TABLE_ID,
            rows: t?.id?.length ?? 0,
            keys: k,
            editableFieldInferred: inferred,
          }));

          setStatus("");
        })
        .catch((e: any) => setStatus("Erreur fetchTable: " + (e?.message ?? String(e))));
    };

    script.onerror = () => setStatus("Impossible de charger grist-plugin-api");
    document.head.appendChild(script);
  }, []);

  // Matches
  const matches = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? candidates.filter((c) => c.q.includes(q)) : candidates;
    return list.slice(0, 25);
  }, [search, candidates]);

  // Record sélectionné depuis cache
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

  // Sync draft when selection changes / editableField changes
  useEffect(() => {
    if (!selectedRecord || !editableField) {
      setDraftValue("");
      return;
    }
    const v = selectedRecord[editableField];
    setDraftValue(v == null ? "" : String(v));
  }, [selectedRecord, editableField]);

  async function saveDraft() {
    if (!docApi || !selectedId || !editableField) return;

    try {
      setStatus("Enregistrement…");
      await docApi.applyUserActions([
        ["UpdateRecord", TABLE_ID, selectedId, { [editableField]: draftValue }],
      ]);
      setStatus("✅ Enregistré");

      // refresh table (simple et safe)
      const t = await docApi.fetchTable(TABLE_ID);
      setTableCache(t);
      setCandidates(buildCandidateIndexFromTable(t));
    } catch (e: any) {
      setStatus("❌ Erreur: " + (e?.message ?? String(e)));
    }
  }

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
            <h3 style={{ marginTop: 0 }}>Fiche</h3>
            <p style={{ margin: "6px 0" }}>
              <strong>Nom :</strong> {String(selectedRecord["Nom_de_famille"] ?? "")}
            </p>
            <p style={{ margin: "6px 0" }}>
              <strong>Prénom :</strong> {String(selectedRecord["Prenom"] ?? "")}
            </p>
            <p style={{ margin: "6px 0" }}>
              <strong>ID2 :</strong> {String(selectedRecord["ID2"] ?? "")}
            </p>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "#666" }}>
                Champ éditable (détecté) :
              </label>
              <select
                value={editableField ?? ""}
                onChange={(e) => setEditableField(e.target.value || null)}
                style={{ width: "100%", padding: 8, marginTop: 4 }}
              >
                <option value="">(aucun)</option>
                {keys
                  .filter((k) => k !== "id")
                  .map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "#666" }}>
                Valeur :
              </label>
              <textarea
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                rows={6}
                style={{ width: "100%", padding: 8, marginTop: 4 }}
                disabled={!editableField}
              />
              <button
                type="button"
                onClick={saveDraft}
                disabled={!editableField}
                style={{ marginTop: 8, padding: "8px 10px" }}
              >
                Enregistrer
              </button>
            </div>
          </section>

          <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Record brut (debug)</h3>
            <pre style={{ background: "#f5f5f5", padding: 10, overflow: "auto", maxHeight: 380 }}>
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}