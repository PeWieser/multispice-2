import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statischer Export: `npm run build` erzeugt `out/` und ist ohne Server
  // direkt auf Cloudflare Pages deploybar (Build-Command: `npm run build`,
  // Output-Verzeichnis: `out`). Die Simulation läuft vollständig im Browser,
  // Projekte liegen in localStorage — es gibt keine Server-Komponente mehr.
  output: "export",
  images: {
    // Pages hat keine Next.js-Image-Optimierung; Assets werden 1:1 ausgeliefert.
    unoptimized: true,
  },
};

export default nextConfig;
