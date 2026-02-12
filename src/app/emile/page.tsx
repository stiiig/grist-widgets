"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    grist: any;
  }
}

type WidgetColumnMap = Record<string, any>;
type GristDocAPI = { applyUserActions: (actions: any[]) => Promise<any> };
type RowRecord = Record<string, any>;

function getGristDocApi(): GristDocAPI | null {
  return window?.grist?.docApi ?? null;
}

export default function WidgetEmile() {
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState<RowRecord | null>(null);
  const [columns, setColumns] = useState<WidgetColumnMap | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const grist = window.grist;
    if (!grist?.ready) {
      setStatus("grist-plugin-api non détecté (utilise /dev/harness pour simuler).");
      return;
    }

    grist.ready({ requiredAccess: "full" });
    grist.onRecord((rec: any, mapping: any) => {
      setRecord(rec ?? null);
      setColumns(mapping ?? null);
      setReady(true);
    });

    setStatus("");
  }, []);

const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

useEffect(() => {
  setDocApi(getGristDocApi());
}, []);

  async function updateField(field: string, value: any) {
    if (!docApi || !record?.id) return;

    // record.id est l’ID Grist de la ligne.
    // Ici on fait simple : UpdateRecord sur la table courante via applyUserActions
    // (dans ton widget final, tu as déjà ta logique AddRecord/UpdateRecord etc.)
    try {
      await docApi.applyUserActions([
        ["UpdateRecord", record.__tableId || "EMILE", record.id, { [field]: value }],
      ]);
      setStatus("✅ Enregistré");
    } catch (e: any) {
      setStatus(`❌ Erreur: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <main className="fr-container fr-py-4w">
      <h1 className="fr-h3">Widget EMILE (Next)</h1>

      {!ready && (
        <div className="fr-alert fr-alert--info fr-mt-2w">
          <p className="fr-alert__title">En attente de Grist</p>
          <p>Ouvre ce widget dans Grist, ou utilise le harness de dev.</p>
          {status ? <p className="fr-mt-1w">{status}</p> : null}
        </div>
      )}

      {ready && (
        <>
          <div className="fr-callout fr-mt-2w">
            <p className="fr-callout__title">Record courant</p>
            <pre style={{ overflow: "auto", margin: 0 }}>
              {JSON.stringify({ record, columns }, null, 2)}
            </pre>
          </div>

          <div className="fr-mt-3w">
            <label className="fr-label" htmlFor="commentaire">
              Commentaire
            </label>
            <textarea
              id="commentaire"
              className="fr-input"
              rows={3}
              defaultValue={record?.Commentaire ?? ""}
              onBlur={(e) => updateField("Commentaire", e.target.value)}
            />
            <p className="fr-hint-text">On enregistre au blur (exemple).</p>
          </div>

          {status ? (
            <div className="fr-alert fr-alert--success fr-mt-2w">
              <p className="fr-alert__title">Statut</p>
              <p>{status}</p>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}