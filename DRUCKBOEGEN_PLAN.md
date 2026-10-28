# Druckbögen — Plan (Mehrseitendruck, DIN-Schriftfeld)

Stand: 2026-10-13. Entscheidungen per Review bestätigt (siehe unten).

## Entscheidungen

- **Schriftfeld DIN-konform unten rechts** (ISO 7200), nicht links.
- **Volle 8 ISO-Pflichtfelder**: Firma (Eigentümer), Sachnummer, Ausgabedatum,
  Blattnummer (Blatt n/N), Titel/Benennung, Genehmigt (Name + Datum), Erstellt
  (Name + Datum), Dokumentenart. Maßstab fix „—“ (Schaltplan, nicht maßstäblich).
- **Deckblatt/Inhaltsverzeichnis**: ja, **default an, per Häkchen abwählbar**.
- **Formate**: A4 hoch, A4 quer, A3 quer (Großformate nur quer).

## Datenmodell

- `doc.titleBlock?: { title, docNo, owner, drawnBy, drawnDate, approvedBy,
  approvedDate, docType }` — reist in der Projektdatei mit (wie `pages`).
- Defaults (Name/Firma) in `localStorage` (`multispice.titleDefaults`, Muster
  `lib/settings.ts`); Datum default = heute.
- Leere Felder drucken als „—“, nie leer (kein Loch im Block).

## Bausteine

1. **`TitleBlock`** (neu, `src/components/print/TitleBlock.tsx`): druckreine
   HTML-Tabelle, **eine Quelle** für Browser-Druck, SVG-Rahmen, Desktop-PDF.
2. **`PrintDialog`** (neu): Format (A4h/A4q/A3q), Seiten (alle/aktiv),
   Inhaltsverzeichnis an/aus, alle Schriftfeld-Zellen editierbar
   (ui/Field-Primitives), Übernehmen → `window.print()` (Browser-Vorschau gratis).
   Menü „Drucken …“ + Strg+P öffnen den Dialog statt direkt zu drucken.
3. **`PrintSheet`** (Umbau): rendert N `.print-sheet`-Blätter + `break-after`,
   je Blatt: Rahmen (10 mm, links 20 mm), eigene Statistik,
   „Blatt n/N“; `@page`-Größe dynamisch per injiziertem `<style>` (Formatwahl).
4. **Desktop-Bridge** (`desktop/main.cjs`, `preload.cjs` + Typ in
   `DesktopTitleBar.tsx`): `printSvg` nimmt `pages: string[]` + `pageSize`/
   `landscape`; verstecktes Fenster rendert alle Blätter, `printToPDF`/`print`
   mehrseitig. Im Repo — kein Fremd-Repo nötig.
5. **Querverweise** (61082): pro Blatt eine Zeile „→ VCC: Seite 2“ aus
   `offpageGroups` (Daten vorhanden); Inhaltsverzeichnis = Projekt + Seitenliste.
6. **Exporte**: `exportSvg/exportPng` behalten Mehrseiten-Einzeldateien, bekommen
   den DIN-Rahmen + Schriftfeld-Inhalt statt Mini-Stempel; `exportPdf` (Browser)
   läuft über den Druckdialog („Als PDF sichern“).

## Phasen

- **① Kern**: Daten + TitleBlock + PrintDialog + Browser-Mehrseitendruck.
- **② Desktop**: Bridge mehrseitig + Formate; Exporte auf DIN-Rahmen umstellen.
- **③ Kür** (später): Zonenraster A–D/1–4 mit Bauteil-Fundstellen, Faltmarken
  (DIN 824), Deckblatt-Gestaltung, Stückliste als Druckseite.

## Akzeptanz (Phase ①)

- 3-seitiger Entwurf druckt 4 Blätter (Verzeichnis + 3), jedes mit Rahmen,
  „Blatt n/N“, eigener Statistik, ausgefülltem Schriftfeld.
- Abwählen des Verzeichnisses → 3 Blätter; „aktive Seite“ → 1 Blatt (n/N bleibt!).
- Felder editieren → Druck + Projektdatei übernehmen; Reload behält alles.
- `tsc` + `npm test` grün; e2e: Dialog öffnen, Feld setzen, PrintSheet-Blätter
  zählen (ohne echten Druck: DOM-Abfrage der `.print-sheet`-Knoten).

## Status

- **① Kern — umgesetzt (2026-10-13, uncommittet auf Session-Branch):**
  `titleBlock` in `model.ts` + `resolveTitleBlock`/`sheetCrossRefs`, `printTicket`
  im Store, Vorgaben/Setup in `settings.ts`, `TitleBlock.tsx`, `print/PrintSheet.tsx`
  (Portal-Root, Verzeichnis, Blätter, `@page`), `PrintDialog.tsx`, Verdrahtung
  (Menü ×2, Strg+P, 3 Layouts), neues Druck-CSS (mm-exakt, ISO-Fuß).
  `tsc` grün, `npm test` grün (963 PASS, inkl. neuem `scripts/printtest.ts`
  mit 23 Checks), ESLint sauber. Neu: `e2e/steve/s17-print.spec.ts` (S17.1–S17.5,
  läuft in CI — Sandbox hat keine Playwright-Browser).
- **② Desktop — umgesetzt (2026-10-13, uncommittet):** `print-svg`-Kanal
  (verstecktes Fenster, 1 SVG, A4-quer fix) ersetzt durch `print-pdf`: nativer
  Speicher­dialog + Selbst-Druck des Fensters (`printToPDF`,
  `preferCSSPageSize` — Format/Blätter aus Ticket via `@page`/Portal, keine
  zweite Quelle). Preload + Bridge-Typen (`DesktopPrintPdfOptions`) angepasst,
  totes `printSchematicSheet` entfernt. `exportPdf` Desktop→`printPdf`,
  Browser→`window.print()` (Ticket-Bögen). SVG/PNG-Stempel mit echten
  Schriftfeld-Daten + Blatt n/N (`SvgFrameInfo`); `formatDeDate` nach
  `lib/format.ts` (eine Quelle). `tsc`/`npm test` (968 PASS, +5 E-Checks)/
  ESLint/`node --check` grün. Neu: e2e S17.6 (läuft in CI).
- **③ Kür — umgesetzt (2026-10-13, uncommittet):** Zonenraster A–D/1–4 im
  SVG (`zones`-Opt, Druck + SVG/PNG) mit `zoneAt`-Helfer; Stückliste als
  paginierte Druckseite(n) — gruppiert wie am Bildschirm, plus Fundstellen
  „Blatt·Zone“, Ticket-Schalter `bom` (Standard an, entfällt lautlos bei leeren
  Seiten); Nummerierungs-Kern `buildPrintPlan` (eine Quelle für Dialog,
  Portal, Tests); Deckblatt mit Fakten-Raster (Erstellt/Genehmigt) + Format im
  Kicker; Faltmarken DIN 824 nur auf A3 (Falz mittig, A4 faltet nicht).
  `tsc`/`npm test` (979 PASS, +11 F-Checks)/ESLint grün. Neu: e2e S17.7
  (Stückliste, Zonenlinien, A3-Faltmarken via Print-Media — läuft in CI).
