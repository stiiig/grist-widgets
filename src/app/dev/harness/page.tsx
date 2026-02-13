"use client";

import { useEffect, useMemo, useState } from "react";
import { listenDevChannel } from "@/lib/grist/logChannel";

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
  record_ref_array: {
    id: 12,
    Commentaire: "Ref as [rowId, display]",
    Commune: [123, "Paris"],
  },
  record_choiceList_cellValue: {
    id: 12,
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

  useEffect(() => {
    writeLS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockEnabled, recordText, mappingText]);

  useEffect(() => {
    const stop = listenDevChannel((p) => {
      if (!p?.type) return;
      if (p.type === "log") addLog(`(channel) ${p.msg}`);
      if (p.type === "applyUserActions")
        addLog(`(channel) applyUserActions: ${JSON.stringify(p.actions)}`);
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(name: keyof typeof PRESETS) {
    const preset = PRESETS[name];
    if (name.startsWith("record_")) setRecordText(JSON.stringify(preset, null, 2));
    if (name.startsWith("mapping_")) setMappingText(JSON.stringify(preset, null, 2));
    addLog(`preset applied: ${name}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Dev harness v2</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label>
          <input
            type="checkbox"
            checked={mockEnabled}
            onChange={(e) => setMockEnabled(e.target.checked)}
          />{" "}
          Mock enabled
        </label>

        <button onClick={() => applyPreset("record_basic")}>Basic</button>
        <button onClick={() => applyPreset("record_ref_array")}>Ref [id,name]</button>
        <button onClick={() => applyPreset("record_choiceList_cellValue")}>
          ChoiceList ["L",..]
        </button>

        <a href="/grist-widgets/emile/" style={{ marginLeft: "auto" }}>
          Open widget → /emile/
        </a>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3>Record</h3>
          <textarea
            value={recordText}
            onChange={(e) => setRecordText(e.target.value)}
            rows={14}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          {!recordParsed.ok && (
            <p style={{ color: "crimson" }}>Invalid JSON: {recordParsed.error}</p>
          )}
        </div>

        <div>
          <h3>Mapping</h3>
          <textarea
            value={mappingText}
            onChange={(e) => setMappingText(e.target.value)}
            rows={14}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          {!mappingParsed.ok && (
            <p style={{ color: "crimson" }}>Invalid JSON: {mappingParsed.error}</p>
          )}
        </div>
      </section>

      <hr style={{ margin: "16px 0" }} />

      <section>
        <h3>Logs (applyUserActions channel)</h3>
        <div
          style={{
            background: "#f5f5f5",
            padding: 12,
            maxHeight: 240,
            overflow: "auto",
            fontFamily: "monospace",
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