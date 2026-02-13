import { installMockGrist, readMockState } from "./mock";

export type GristLike = {
  ready: (opts: { requiredAccess: "none" | "read table" | "full" }) => void;
  onRecord: (cb: (record: any, mapping: any) => void) => void;
  docApi?: { applyUserActions: (actions: any[]) => Promise<any> };
};

export function getGrist(): GristLike | null {
  return (window as any)?.grist ?? null;
}

/**
 * Initialise Grist, avec fallback mock via localStorage si absent.
 */
export function initGristOrMock(opts: {
  requiredAccess: "none" | "read table" | "full";
  onRecord: (record: any, mapping: any) => void;
  onApplyUserActions?: (actions: any[]) => void;
}): { grist: GristLike | null; mode: "grist" | "mock" | "none" } {
  const existing = getGrist();

  if (existing?.ready && existing?.onRecord) {
    existing.ready({ requiredAccess: opts.requiredAccess });
    existing.onRecord(opts.onRecord);
    return { grist: existing, mode: "grist" };
  }

  // fallback mock
  const mock = readMockState();
  if (mock.enabled) {
    installMockGrist({
      record: mock.record,
      mapping: mock.mapping,
      onApplyUserActions: opts.onApplyUserActions,
    });
    const g = getGrist();
    g?.ready({ requiredAccess: opts.requiredAccess });
    g?.onRecord(opts.onRecord);
    return { grist: g, mode: "mock" };
  }

  return { grist: null, mode: "none" };
}