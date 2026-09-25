# Multispice

EDA-Arbeitsplatz mit SPICE-Simulationskern: Schaltplan-Editor, Echtzeitsimulation,
virtuelle Messgeräte, Monte-Carlo- und Rauschanalyse. Läuft vollständig im Browser —
kein Server, keine Datenbank, kein Konto. Projekte leben im localStorage.

## Warum

Multispice ist ein Liebesbrief an Werkzeuge, die sich wie Geräte anfühlen:
Direkte Manipulation statt Dialoge, sofortiges Feedback statt Wartebalken,
Typografie und Farbe als Information. Der Maßstab: „Insanely great“ oder nicht shippen.

## Funktionen (Auszug)

- **Schematic Capture**: Grid/Snap, Zoom zum Cursor, Rubber-Banding, Auto-Routing (Manhattan + A*), Junctions, Busse, On-/Off-Page-Connectors, ERC mit Zoom-to-Error
- **Bibliothek**: 400+ kuratierte Bauteile, Command Palette (⌘K), Favoriten, Suche wie „r 10k“, handgezeichnete farbcodierte Symbole
- **Simulation**: Transientenanalyse im Browser (MNA + Newton-Raphson), OP, AC, Sweep, Monte-Carlo, Rauschen, FFT
- **Messgeräte**: 4-Kanal-Oszilloskop, Multimeter, Funktionsgenerator, Bode-Plotter — live während der Simulation
- **Probes**: Spannungs-/Strom-Messpunkte mit Live-Werten, skalieren unabhängig vom Zoom
- **Import**: SPICE-Netzlisten (.cir/.net/.sp) mit echter Auto-Verdrahtung (Netz → orthogonale
  Leitung, GND-Symbol, Netz-Labels), LTspice-Schaltpläne (.asc mit Geometrie, Drähten, Flags),
  Projekt-JSON (validiert)
- **Projekt-Manager**: benannte Snapshots im Browser (öffnen/umbenennen/löschen) plus
  Auto-Save-Arbeitskopie (2 s nach jeder Änderung)
- **Qualität**: 100+ Circuit-Szenarien als Testmatrix, Importer-Smoke-Tests (`npx tsx scripts/importtest.ts`),
  TypeScript strict, statischer Export

## Entwickeln

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # statischer Export nach out/
npx serve out      # Build lokal prüfen
```

## Deploy (Cloudflare Pages)

| Einstellung     | Wert              |
| --------------- | ----------------- |
| Build command   | `npm run build`   |
| Output directory| `out`             |
| Node.js-Version | 22 (`.node-version`) |

Keine Umgebungsvariablen nötig. Details: [CLOUDFLARE.md](CLOUDFLARE.md) ·
Design: [DESIGN.md](DESIGN.md) · Grundsätze: [MANIFEST.md](MANIFEST.md) ·
Qualitätsaudits: [STEVE_JOBS_QUALITY_AUDIT.md](STEVE_JOBS_QUALITY_AUDIT.md)

## Struktur

```
src/app          Routen, Layout, Metadata, Icons, Fehlerseiten
src/components   Workbench, Canvas, Bibliothek, Instrumente, Dialoge
src/lib/sim      SPICE-Kernel: MNA, Newton-Raphson, Analysen, FFT
src/lib/schematic Modell, Netliste, Routing, SPICE-Export
src/lib/library  Katalog, Symbole, Datasheets
src/state        Editor-Store (Zustand), Persistenz, Undo
```
