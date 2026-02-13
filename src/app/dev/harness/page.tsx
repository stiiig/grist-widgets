"use client";

import { useEffect, useMemo, useState } from "react";

type LogItem = { ts: string; msg: string };

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function safeParseJson<T>(raw: string, fallback: T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

const LS = {
  enabled: "GRIST_MOCK_ENABLED",
  record: "GRIST_MOCK_RECORD",
  mapping: "GRIST_MOCK_MAPPING",
} as const;

const PRESETS = {
  record_basic: {
    id: 12,
    Commentaire: "Exemple commentaire depuis mock",
    Commune: 123,
  },
  record_ref_number: {
    id: 12,
    Commentaire: "Commune ref as rowId number",
    Commune: 123,
  },
  record_ref_string: {
    id: 12,
    Commentaire: "Commune ref as display string",
    Commune: "Paris",
  },
  record_ref_array: {
    id: 12,
    Commentaire: "Commune ref as [rowId, display]",
    Commune: [123, "Paris"],
  },
  record_choiceList_cellValue: {
    id: 12,
    Commentaire: "ChoiceList stored as cellValue",
    MN_Motifs_de_selection: ["L", "Motif A", "Motif B"],
  },
  mapping_basic: {
    Commentaire: "Commentaire",
    Commune: "Commune",
    MN_Motifs_de_selection: "MN_Motifs_de_selection",
  },
};

export default function HarnessV2() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [mockEnabled, setMockEnabled] = useState(true);

  const [recordText, setRecordText] = useState(() => JSON.stringify(PRESETS.record_basic, null, 2));
  const [mappingText, setMappingText] = useState(() => JSON.stringify(PRESETS.mapping_basic, null, 2));

  const recordParsed = useMemo(() => safeParseJson<any>(recordText, null), [recordText]);
  const mappingParsed = useMemo(() => safeParseJson<any>(mappingText, null), [mappingText]);

  function addLog(msg: string) {
    setLogs((l) => [{ ts: now(), msg }, ...l].slice(0, 200));
  }

  function writeLS() {
    localStorage.setItem(LS.enabled, mockEnabled ? "1" : "0");
    localStorage.setItem(LS.record, recordText);
    localStorage.setItem(LS.mapping, mappingText);
    addLog(`localStorage updated (enabled=${mockEnabled ? "1" : "0"})`);
  }

  function loadLS() {
    const enabled = localStorage.getItem(LS.enabled);
    const rec = localStorage.getItem(LS.record);
    const map = localStorage.getItem(LS.mapping);

    if (enabled != null) setMockEnabled(enabled === "1");
    if (rec) setRecordText(rec);
    if (map) setMappingText(map);

    addLog("localStorage loaded");
  }

  function resetToDefaults() {
    setMockEnabled(true);
    setRecordText(JSON.stringify(PRESETS.record_basic, null, 2));
    setMappingText(JSON.stringify(PRESETS.mapping_basic, null, 2));
    addLog("reset to defaults (not yet saved)");
  }

  // Installer un mock direct dans CET onglet, pour tester applyUserActions logs
  function installWindowMock() {
    if (!recordParsed.ok || !mappingParsed.ok) {
      addLog("Cannot install window.grist mock: invalid JSON");
      return;
    }

    (window as any).grist = {
      ready: ({ requiredAccess }: any) => addLog(`grist.ready(requiredAccess=${requiredAccess})`),
      onRecord: (cb: any) => {
        addLog("grist.onRecord(handler)");
        setTimeout(() => cb(recordParsed.value, mappingParsed.value), 50);
      },
      docApi: {
        applyUserActions: async (actions: any[]) => {
          addLog(`docApi.applyUserActions: ${JSON.stringify(actions)}`);
          return [];
        },
      },
    };

    addLog("window.grist mock installed in this tab");
  }

  // Au chargement : on charge LS si présent
  useEffect(() => {
    loadLS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quand on change enabled/record/mapping : on sauvegarde en LS
  useEffect(() => {
    writeLS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockEnabled, recordText, mappingText]);

  function applyPreset(presetName: keyof typeof PRESETS) {
    const preset = PRESETS[presetName] as any;
    if (presetName.startsWith("record_")) setRecordText(JSON.stringify(preset, null, 2));
    if (presetName.startsWith("mapping_")) setMappingText(JSON.stringify(preset, null, 2));
    addLog(`preset applied: ${presetName}`);
  }

  function pushRecordToWidget() {
    // Ici, on ne peut pas “pousser” dans un autre onglet sans channel,
    // mais on peut réinstaller le mock dans cet onglet et te dire de refresh le widget.
    installWindowMock();
    addLog("Now refresh /emile/ (or open it) — it will read localStorage mock");
  }

  function clearSiteDataHint() {
    addLog("Tip: if Grist caches, change Custom URL query (?v=...) or open in private window.");
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ marginTop: 0 }}>Dev harness v2 (Mock Grist)</h1>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={mockEnabled}
            onChange={(e) => setMockEnabled(e.target.checked)}
          />
          Mock enabled (localStorage)
        </label>

        <button onClick={pushRecordToWidget}>Push mock + instructions</button>
        <button onClick={resetToDefaults}>Reset defaults</button>
        <button
          onClick={() => {
            localStorage.removeItem(LS.enabled);
            localStorage.removeItem(LS.record);
            localStorage.removeItem(LS.mapping);
            addLog("localStorage cleared (mock disabled unless re-enabled)");
          }}
        >
          Clear localStorage
        </button>

        <a href="/grist-widgets/emile/" style={{ marginLeft: "auto" }}>
          Open widget sandbox → /emile/
        </a>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 8px" }}>Record (JSON)</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button onClick={() => applyPreset("record_basic")}>Basic</button>
            <button onClick={() => applyPreset("record_ref_number")}>Ref=number</button>
            <button onClick={() => applyPreset("record_ref_string")}>Ref=string</button>
            <button onClick={() => applyPreset("record_ref_array")}>Ref=[id,name]</button>
            <button onClick={() => applyPreset("record_choiceList_cellValue")}>ChoiceList ["L",..]</button>
          </div>

          <textarea
            value={recordText}
            onChange={(e) => setRecordText(e.target.value)}
            rows={18}
            style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          {!recordParsed.ok && (
            <p style={{ color: "crimson" }}>Invalid JSON: {recordParsed.error}</p>
          )}
        </div>

        <div>
          <h2 style={{ margin: "0 0 8px" }}>Mapping (JSON)</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button onClick={() => applyPreset("mapping_basic")}>Basic mapping</button>
          </div>

          <textarea
            value={mappingText}
            onChange={(e) => setMappingText(e.target.value)}
            rows={18}
            style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          {!mappingParsed.ok && (
            <p style={{ color: "crimson" }}>Invalid JSON: {mappingParsed.error}</p>
          )}
        </div>
      </section>

      <hr style={{ margin: "16px 0" }} />

      <section>
        <h2 style={{ margin: "0 0 8px" }}>applyUserActions logs</h2>
        <p style={{ marginTop: 0 }}>
          Les logs apparaissent ici quand tu testes dans cet onglet ou via le widget sandbox.
          <button style={{ marginLeft: 8 }} onClick={clearSiteDataHint}>
            Cache hint
          </button>
        </p>

        <div
          style={{
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 8,
            maxHeight: 260,
            overflow: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
          }}
        >
          {logs.length === 0 ? (
            <div>(no logs yet)</div>
          ) : (
            logs.map((l, i) => (
              <div key={i}>
                [{l.ts}] {l.msg}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}