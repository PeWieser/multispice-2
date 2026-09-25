# CircuitLab Studio

EDA-Arbeitsplatz mit SPICE-Simulationskern: Schaltplan-Editor, Echtzeitsimulation,
virtuelle Messgeräte. Läuft vollständig im Browser — kein Server, keine Datenbank,
kein Konto.

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # statischer Export nach out/
npx serve out    # Build lokal prüfen
```

## Deploy (Cloudflare Pages)

| Einstellung        | Wert            |
| ------------------ | --------------- |
| Build command      | `npm run build` |
| Output directory   | `out`           |
| Node.js-Version    | 22 (`.node-version`) |

Keine Umgebungsvariablen nötig. Details: [CLOUDFLARE.md](CLOUDFLARE.md) ·
Design: [DESIGN.md](DESIGN.md) · Grundsätze: [MANIFEST.md](MANIFEST.md)
