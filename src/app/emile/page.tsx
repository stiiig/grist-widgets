"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    grist: any;
  }
}

type WidgetColumnMap = Record<string, any>;
type GristDocAPI = {
  applyUserActions: (actions: any[]) => Promise<any>;
};

type RowRecord = Record<string, any>;

export default function WidgetEmile() {
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState<RowRecord | null>(null);
  const [columns, setColumns] = useState<WidgetColumnMap | null>(null);
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    // --- Si on est hors Grist mais mock activé ---
    if (!window.grist?.ready) {
      if (
        typeof window !== "undefined" &&
        localStorage.getItem("GRIST_MOCK_ENABLED") === "1"
      ) {
        const mockRecord = JSON.parse(
          localStorage.getItem("GRIST_MOCK_RECORD") || "null"
        );
        const mockMapping = JSON.parse(
          localStorage.getItem("GRIST_MOCK_MAPPING") || "null"
        );

        window.grist = {
          ready: () => {},
          onRecord: (cb: any) =>
            setTimeout(() => cb(mockRecord, mockMapping), 50),
          docApi: {
            applyUserActions: async (actions: any[]) => {
              console.log("MOCK applyUserActions", actions);
              return [];
            },
          },
        };
      } else {
        setStatus(
          "grist-plugin-api non détecté (utilise /dev/harness pour simuler)."
        );
        return;
      }
    }

    const grist = window.grist;

    grist.ready({ requiredAccess: "full" });

    grist.onRecord((rec: any, mapping: any) => {
      setRecord(rec ?? null);
      setColumns(mapping ?? null);
      setReady(true);
    });

    setDocApi(grist.docApi);
  }, []);

  async function updateField(field: string, value: any) {
    if (!docApi || !record?.id) return;

    try {
      await docApi.applyUserActions([
        ["UpdateRecord", "AN_PC", record.id, { [field]: value }],
      ]);
      setStatus("✅ Enregistré");
    } catch (e: any) {
      setStatus(`❌ Erreur: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>Widget Emile</h1>

      {!ready && (
        <div style={{ marginTop: 20 }}>
          <strong>En attente de Grist</strong>
          <p>{status}</p>
        </div>
      )}

      {ready && (
        <>
          <h3>Record courant</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: 16,
              overflow: "auto",
            }}
          >
            {JSON.stringify({ record, columns }, null, 2)}
          </pre>

          <div style={{ marginTop: 20 }}>
            <label>Commentaire</label>
            <br />
            <textarea
              rows={3}
              defaultValue={record?.Commentaire ?? ""}
              onBlur={(e) => updateField("Commentaire", e.target.value)}
            />
          </div>

          {status && <p style={{ marginTop: 20 }}>{status}</p>}
        </>
      )}
    </main>
  );
}