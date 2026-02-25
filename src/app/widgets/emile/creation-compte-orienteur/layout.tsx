import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EMILE – Création compte orienteur",
};

export default function OrienteurLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
