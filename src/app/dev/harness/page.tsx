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

    // Mock minimal de l’API utilisée
    window.grist = {
      ready: ({ requiredAccess }: any) => addLog(`grist.ready(requiredAccess=${requiredAccess})`),
      onRecord: (cb: any) => {
        addLog("grist.onRecord(handler)");
        // On “pousse” un record fake
        setTimeout(() => {
          cb(
            {
              id: 12,
              Table: "EMILE",
              Commentaire: "Exemple commentaire",
              Commune: 123,
            },
            { Commentaire: "Commentaire", Commune: "Commune" }
          );
        }, 100);
      },
      docApi: {
        applyUserActions: async (actions: any[]) => {
          addLog(`docApi.applyUserActions: ${JSON.stringify(actions)}`);
          return [];
        },
      },
    };

    addLog("Mock grist installé. Ouvre /emile dans un nouvel onglet.");
  }, []);

  return (
    <main className="fr-container fr-py-4w">
      <h1 className="fr-h3">Dev harness (mock Grist)</h1>
      <p className="fr-text--sm">
        Ce harness installe <code>window.grist</code> et simule un record.
      </p>

      <p>
        Ouvre ensuite : <a href="../emile">/emile</a>
      </p>

      <div className="fr-callout fr-mt-3w">
        <p className="fr-callout__title">Logs</p>
        <pre style={{ overflow: "auto", margin: 0 }}>
          {log.join("\n")}
        </pre>
      </div>
    </main>
  );
}