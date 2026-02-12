"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    grist: any;
  }
}

export default function Harness() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const addLog = (s: string) => setLog((l) => [s, ...l]);

    // --- Active le mock global ---
    localStorage.setItem("GRIST_MOCK_ENABLED", "1");

    localStorage.setItem(
      "GRIST_MOCK_RECORD",
      JSON.stringify({
        id: 12,
        Commentaire: "Exemple commentaire depuis mock",
        Commune: 123,
      })
    );

    localStorage.setItem(
      "GRIST_MOCK_MAPPING",
      JSON.stringify({
        Commentaire: "Commentaire",
        Commune: "Commune",
      })
    );

    addLog("Mock persistant activé via localStorage.");

    // Mock direct dans CET onglet aussi
    window.grist = {
      ready: ({ requiredAccess }: any) =>
        addLog(`grist.ready(requiredAccess=${requiredAccess})`),

      onRecord: (cb: any) => {
        addLog("grist.onRecord(handler)");
        const record = JSON.parse(
          localStorage.getItem("GRIST_MOCK_RECORD") || "null"
        );
        const mapping = JSON.parse(
          localStorage.getItem("GRIST_MOCK_MAPPING") || "null"
        );
        setTimeout(() => cb(record, mapping), 100);
      },

      docApi: {
        applyUserActions: async (actions: any[]) => {
          addLog(`docApi.applyUserActions: ${JSON.stringify(actions)}`);
          return [];
        },
      },
    };
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1>Dev harness (mock Grist)</h1>

      <p>
        Le mock est maintenant <strong>persistant</strong> (localStorage).
      </p>

      <p>
        Tu peux ouvrir ton widget ici :
        <br />
        <a href="/grist-widgets/emile/">
          https://stiiig.github.io/grist-widgets/emile/
        </a>
      </p>

      <pre
        style={{
          background: "#f5f5f5",
          padding: 16,
          marginTop: 20,
          maxHeight: 300,
          overflow: "auto",
        }}
      >
        {log.join("\n")}
      </pre>
    </main>
  );
}