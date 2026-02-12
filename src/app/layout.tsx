import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grist Widgets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* DSFR (optionnel) - tu peux remplacer par ton bundle DSFR si besoin */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14/dist/dsfr.min.css"
        />
        <script
          defer
          src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.0/dist/dsfr.module.min.js"
          type="module"
        />
        <script
          defer
          src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.0/dist/dsfr.nomodule.min.js"
          noModule
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}