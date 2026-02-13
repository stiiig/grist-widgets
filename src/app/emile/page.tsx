"use client";

import { useEffect, useState } from "react";
import { initGristOrMock } from "@/lib/grist/init";

type WidgetColumnMap = Record<string, any>;
type GristDocAPI = { applyUserActions: (actions: any[]) => Promise<any> };
type RowRecord = Record<string, any>;

export default function WidgetEmile() {
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState<RowRecord | null>(null);
  const [columns, setColumns] = useState<WidgetColumnMap | null>(null);
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const { grist, mode } = initGristOrMock({
      requiredAccess: "full",
      onRecord: (rec, mapping) => {
        setRecord(rec ?? null);
        setColumns(mapping ?? null);
        setReady(true);
        setStatus(mode === "mock" ? "Mode mock (localStorage)" : "");
      },
      onApplyUserActions: (actions) => {
        // visible en console quand mock
        console.log("MOCK applyUserActions", actions);
      },
    });

    if (mode === "none") {
      setStatus("grist-plugin-api non détecté (active le mock via /dev/harness).");
      return;
    }

    setDocApi((grist?.docApi as any) ?? null);
  }, []);

  async function updateField(field: string, value: any) {
    if (!docApi || !record?.id) return;

    try {
      await docApi.applyUserActions([["UpdateRecord", "AN_PC", record.id, { [field]: value }]]);
      setStatus("✅ Enregistré");
    } catch (e: any) {
      setStatus(`❌ Erreur: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>Widget Emile (React sandbox)</h1>

      {!ready && (
        <div style={{ marginTop: 20 }}>
          <strong>En attente de Grist</strong>
          <p>{status}</p>
        </div>
      )}

      {ready && (
        <>
          <h3>Record courant</h3>
          <pre style={{ background: "#f5f5f5", padding: 16, overflow: "auto" }}>
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