"use client";

import { useEffect, useState } from "react";
import { initGristOrMock } from "@/lib/grist/init";
import { postApplyUserActions, postLog } from "@/lib/grist/logChannel";

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
  (async () => {
    try {
      const { grist, mode } = await initGristOrMock({
        requiredAccess: "full",
        onRecord: (rec: any, mapping: any) => {
          setRecord(rec ?? null);
          setColumns(mapping ?? null);
          setReady(true);

          if (mode === "mock") {
            setStatus("Mode mock (localStorage)");
            postLog("emile: running in mock mode");
          }
        },
        onApplyUserActions: (actions: any) => {
          postApplyUserActions(actions);
        },
      });

      // si tu avais un else/if après, on le met ici proprement
      if (mode === "none") {
        setStatus("En attente de Grist (ouvre dans Grist ou /dev/harness)");
        setDocApi(null);
      } else {
        setDocApi((grist as any)?.docApi ?? null);
      }
    } catch (e: any) {
      setStatus(`Init error: ${e?.message ?? String(e)}`);
      setDocApi(null);
    }
  })();
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
              rows={6}
              style={{ width: "100%", minHeight: 120 }}
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