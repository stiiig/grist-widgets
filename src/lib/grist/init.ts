// src/lib/grist/init.ts
type InitResult = {
  mode: "grist" | "mock" | "none";
  grist: any | null;
  docApi: any | null;
};

export async function initGristOrMock(
  opts: { requiredAccess?: "read table" | "full"; onRecord?: (r: any) => void } = {}
): Promise<InitResult> {
  const requiredAccess = opts.requiredAccess ?? "full";

  // 1) Grist réel : window.grist est fourni dans l'iframe Grist
  const grist = (typeof window !== "undefined" ? (window as any).grist : null) ?? null;
  if (grist?.ready) {
    grist.ready({ requiredAccess });

    if (typeof opts.onRecord === "function") {
      try {
        grist.onRecord((rec: any) => opts.onRecord?.(rec));
      } catch {
        // ignore
      }
    }

    return { mode: "grist", grist, docApi: grist.docApi ?? null };
  }

  // 2) Mock (optionnel) : si tu as déjà un mock installé dans window.__GRIST_MOCK__
  const mock = (typeof window !== "undefined" ? (window as any).__GRIST_MOCK__ : null) ?? null;
  if (mock?.docApi) {
    if (typeof opts.onRecord === "function") {
      try {
        mock.onRecord?.((rec: any) => opts.onRecord?.(rec));
      } catch {
        // ignore
      }
    }
    return { mode: "mock", grist: mock, docApi: mock.docApi };
  }

  // 3) Rien
  return { mode: "none", grist: null, docApi: null };
}