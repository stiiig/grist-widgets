"use client";

import { useEffect, useMemo, useState } from "react";
import * as gristModule from "grist-plugin-api";

const TABLE_ID = "CANDIDATS";

type CandidateItem = {
  id: number;
  label: string;
  extra: string;
  q: string;
};

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

export default function EmileReact() {
  const [status, setStatus] = useState("");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState("");
  const [debug, setDebug] = useState<any>({});

  // INIT GRIST (bundled)
  useEffect(() => {
    const grist: any =
      (gristModule as any).grist ??
      (gristModule as any).default ??
      gristModule;

    if (!grist?.ready) {
      setDebug({ mode: "none" });
      setStatus("grist-plugin-api non détecté (bundled)");
      return;
    }

    setDebug({ mode: "grist(bundled)" });

    grist.ready({ requiredAccess: "full" });

    const raw = grist.docApi ?? null;

    if (!raw?.fetchTable) {
      setStatus("docApi.fetchTable indisponible");
      return;
    }

    setDocApi(raw as GristDocAPI);
    setStatus("Mode grist");
  }, []);

  // LOAD TABLE
  useEffect(() => {
    if (!docApi) return;

    (async () => {
      try {
        setStatus(`Chargement ${TABLE_ID}...`);
        const t = await docApi.fetchTable(TABLE_ID);

        setCandidates(buildCandidateIndexFromTable(t));

        setDebug((d: any) => ({
          ...d,
          rows: t?.id?.length ?? 0,
          keys: Object.keys(t || {}),
        }));

        setStatus("");
      } catch (e: any) {
        setStatus(`Erreur fetchTable: ${e?.message ?? e}`);
      }
    })();
  }, [docApi]);

  const matches = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? candidates.filter((c) => c.q.includes(q)) : candidates;
    return list.slice(0, 25);
  }, [search, candidates]);

  return (
    <main style={{ padding: 16 }}>
      <h2>EMILE React</h2>

      <input
        placeholder={`Rechercher (${candidates.length})`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%", padding: 8 }}
      />

      <div style={{ marginTop: 10 }}>
        {matches.map((m) => (
          <div key={m.id} style={{ padding: 6 }}>
            {m.label}
          </div>
        ))}
      </div>

      <details style={{ marginTop: 20 }}>
        <summary>Debug</summary>
        <pre>{JSON.stringify(debug, null, 2)}</pre>
      </details>

      <p>{status}</p>
    </main>
  );
}