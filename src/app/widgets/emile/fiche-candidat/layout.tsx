import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EMILE – Fiche candidat",
};

export default function EmileReactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}