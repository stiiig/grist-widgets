import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EMILE – Mes candidats",
};

export default function ListeCandidatsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
