export default function EmileReactLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* DSFR (comme ton HTML) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14/dist/dsfr.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14/dist/icons/icons.min.css"
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}