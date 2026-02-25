// src/lib/grist/hooks.ts
"use client";

import { useEffect, useState } from "react";
import { initGristOrMock } from "./init";
import type { GristDocAPI } from "./meta";
import type { Option } from "@/components/SearchDropdown";
import { deptSortKey } from "@/lib/emile/utils";

/* ─────────────────────────────────────────────────────────────────
   useGristInit
   Charge grist-plugin-api.js et initialise la connexion Grist.
   Remplace le boilerplate répété dans chaque widget.
───────────────────────────────────────────────────────────────── */
export function useGristInit(opts?: { requiredAccess?: "read table" | "full" }) {
  const [mode, setMode]     = useState<"boot" | "grist" | "mock" | "rest" | "none">("boot");
  const [docApi, setDocApi] = useState<GristDocAPI | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (typeof window !== "undefined" && !(window as any).grist) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector('script[data-grist-plugin-api="1"]');
            if (existing) return resolve();
            const s = document.createElement("script");
            s.src = "https://docs.getgrist.com/grist-plugin-api.js";
            s.async = true;
            s.setAttribute("data-grist-plugin-api", "1");
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error("Impossible de charger grist-plugin-api.js"));
            document.head.appendChild(s);
          });
        }
        const result = await initGristOrMock({
          requiredAccess: opts?.requiredAccess ?? "full",
        });
        setMode(result.mode);
        setDocApi(result.docApi);
      } catch {
        setMode("none");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { mode, docApi };
}

/* ─────────────────────────────────────────────────────────────────
   useDepartementOptions
   Charge et trie les départements depuis DPTS_REGIONS.
───────────────────────────────────────────────────────────────── */
export type DeptOption = Option & { tagLeft: string; tag: string };

export function useDepartementOptions(docApi: GristDocAPI | null) {
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([]);
  const [dptsLoading, setDptsLoading] = useState(true);

  useEffect(() => {
    if (!docApi) return;
    setDptsLoading(true);
    docApi.fetchTable("DPTS_REGIONS")
      .then((table: any) => {
        const ids = table.id as number[];
        const opts: DeptOption[] = [];
        for (let i = 0; i < ids.length; i++) {
          const id     = ids[i];
          const nom    = String(table.Nom_departement?.[i] ?? "").trim();
          const numero = String(table.Numero?.[i] ?? "").trim();
          const region = String(table.Nom_region?.[i] ?? "").trim();
          if (!nom) continue;
          opts.push({
            id, label: nom, tagLeft: numero, tag: region,
            q: `${numero} ${nom} ${region}`.toLowerCase(),
          });
        }
        opts.sort((a, b) => deptSortKey(a.tagLeft) - deptSortKey(b.tagLeft));
        setDeptOptions(opts);
      })
      .catch(() => {})
      .finally(() => setDptsLoading(false));
  }, [docApi]); // eslint-disable-line react-hooks/exhaustive-deps

  return { deptOptions, dptsLoading };
}
