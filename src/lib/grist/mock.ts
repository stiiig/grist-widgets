import { safeJsonParse, safeJsonStringify } from "./safeJson";

export const MOCK_KEYS = {
  enabled: "GRIST_MOCK_ENABLED",
  record: "GRIST_MOCK_RECORD",
  mapping: "GRIST_MOCK_MAPPING",
} as const;

export type MockState = {
  enabled: boolean;
  record: any;
  mapping: any;
};

export function readMockState(): MockState {
  const enabled = localStorage.getItem(MOCK_KEYS.enabled) === "1";
  const record = safeJsonParse<any>(localStorage.getItem(MOCK_KEYS.record), null);
  const mapping = safeJsonParse<any>(localStorage.getItem(MOCK_KEYS.mapping), null);
  return { enabled, record, mapping };
}

export function writeMockState(state: Partial<MockState>) {
  if (typeof state.enabled === "boolean") {
    localStorage.setItem(MOCK_KEYS.enabled, state.enabled ? "1" : "0");
  }
  if ("record" in state) {
    localStorage.setItem(MOCK_KEYS.record, safeJsonStringify(state.record));
  }
  if ("mapping" in state) {
    localStorage.setItem(MOCK_KEYS.mapping, safeJsonStringify(state.mapping));
  }
}

export function resetMockState() {
  localStorage.removeItem(MOCK_KEYS.enabled);
  localStorage.removeItem(MOCK_KEYS.record);
  localStorage.removeItem(MOCK_KEYS.mapping);
}

export function installMockGrist(opts: {
  record: any;
  mapping: any;
  onApplyUserActions?: (actions: any[]) => void;
}) {
  const onApply = opts.onApplyUserActions ?? (() => {});

  (window as any).grist = {
    ready: () => {},
    onRecord: (cb: any) => setTimeout(() => cb(opts.record, opts.mapping), 30),
    docApi: {
      applyUserActions: async (actions: any[]) => {
        onApply(actions);
        return [];
      },
    },
  };
}