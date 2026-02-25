import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EMILE – Inscription candidat",
};

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
