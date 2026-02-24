// src/lib/grist/init.ts

export type InitResult = {
  mode: "grist" | "mock" | "none";
  grist: any | null;
  docApi: any | null;
};

export async function initGristOrMock(
  opts: {
    requiredAccess?: "read table" | "write table" | "full";
    onRecord?: (rec: any, mapping?: any) => void;
    onApplyUserActions?: (actions: any[]) => void;
  } = {}
): Promise<InitResult> {
  const requiredAccess = opts.requiredAccess ?? "full";

  // --------------------------------------------------
  // 1️⃣ Mode GRIST réel (iframe)
  // --------------------------------------------------
  const grist =
    typeof window !== "undefined" ? (window as any).grist ?? null : null;

  if (grist?.ready) {
    try {
      grist.ready({ requiredAccess });
    } catch {
      // ignore
    }

    // onRecord
    if (typeof opts.onRecord === "function") {
      try {
        grist.onRecord((rec: any, mapping: any) => {
          opts.onRecord?.(rec, mapping);
        });
      } catch {
        // ignore
      }
    }

    // onApplyUserActions
    if (typeof opts.onApplyUserActions === "function") {
      try {
        if (typeof grist.onApplyUserActions === "function") {
          grist.onApplyUserActions((actions: any[]) => {
            opts.onApplyUserActions?.(actions);
          });
        }
      } catch {
        // ignore
      }
    }

    return {
      mode: "grist",
      grist,
      docApi: grist.docApi ?? null,
    };
  }

  // --------------------------------------------------
  // 2️⃣ Mode MOCK (si présent dans window)
  // --------------------------------------------------
  const mock =
    typeof window !== "undefined"
      ? (window as any).__GRIST_MOCK__ ?? null
      : null;

  if (mock?.docApi) {
    if (typeof opts.onRecord === "function") {
      try {
        mock.onRecord?.((rec: any, mapping: any) => {
          opts.onRecord?.(rec, mapping);
        });
      } catch {
        // ignore
      }
    }

    if (typeof opts.onApplyUserActions === "function") {
      try {
        mock.onApplyUserActions?.((actions: any[]) => {
          opts.onApplyUserActions?.(actions);
        });
      } catch {
        // ignore
      }
    }

    return {
      mode: "mock",
      grist: mock,
      docApi: mock.docApi,
    };
  }

  // --------------------------------------------------
  // 3️⃣ Aucun contexte Grist
  // --------------------------------------------------
  return {
    mode: "none",
    grist: null,
    docApi: null,
  };
}