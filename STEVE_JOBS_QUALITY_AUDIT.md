# Steve-Jobs-Qualitätsaudit — Runde 3 („Insanely great oder nicht shippen“)

> Datum: 2026-09-25 · Branch `arena/01a0d95e-multispice-2` · Stand: nach Build-Fix (PR #2)
> Vorgänger: `DESIGN_AUDIT_STEVE_JOBS.md` (Detail-Runde), `FINAL_AUDIT_STEVE_JOBS.md` (Funktionsabgleich Multisim)
> Dieses Audit prüft nicht Features, sondern **jede Oberfläche, mit der ein Mensch das Produkt berührt** —
> inklusive der Flächen, die niemand sieht („die Rückseite des Schranks“).

---

## 1 · Der Maßstab

Vier Prinzipien, direkt aus Jobs’ Entscheidungen abgeleitet (Quellen am Ende):

1. **Totale Qualität.** „Wenn du Schreiner bist und eine schöne Kommode baust, verwendest du
   hinten kein Sperrholz, auch wenn es zur Wand zeigt und niemand je sieht.“ Qualität muss
   *durchgetragen* sein: Meta-Tags, Fehlerseiten, Cache-Header und Code zählen wie das Canvas.
2. **Design ist, wie es funktioniert.** Nicht veneer. Jede Fläche wird daran gemessen, ob sie
   dem Menschen hilft: verständliche Sprache statt Jargon, direktes Feedback, keine Sackgassen.
3. **Fokus heißt Nein sagen.** Toter Code, doppelte Orte, halb entschiedene Marken sind
   Offene Türen, durch die Unruhe ins Produkt kommt.
4. **Die Verpackung ist das Produkt.** Der erste Kontakt — Tab-Titel, Favicon, OG-Bild, 404,
   Crash, leere Leinwand — ist der Unboxing-Moment. Er entscheidet über „magisch“ oder „Webseite“.
   Dazu: Tempo ist Respekt („Saving Lives“: 10 Sekunden Bootzeit × Millionen Nutzer = Dutzende Leben).

---

## 2 · Befunde (Findings)

Legende: **S** = Sev­erität (1 kritisch … 4 Kosmetik) · Status ✅ = in dieser Runde gefixt ·
🔒 = zuvor gefixt · 📋 = Backlog (bewusst begründet).

| ID | Fläche | Befund | S | Prinzip | Status |
|----|--------|--------|---|---------|--------|
| F1 | Marke | Produkt heißt im UI/Manifest „Multispice“, in Metadata, Netlist-Export, Log-Zeile, CSS- und Docs-Headern „CircuitLab Studio“ — zwei Stimmen für ein Produkt | 2 | 1, 3 | ✅ |
| F2 | Unboxing | Favicons/Manifest fehlten komplett (Build zeigte nur `/`, `/_not-found`) — der Tab wirkte wie eine fremde Seite | 1 | 4 | 🔒 (Runde 2, hier verifiziert) |
| F3 | Unboxing | Kein OG-/Twitter-Bild: geteilte Links zeigten keinen „Buchdeckel“; ohne `metadataBase` hätte Next OG-URLs gegen `localhost:3000` aufgelöst | 2 | 4 | ✅ `public/og.png` + OpenGraph/Twitter-Metadata + `metadataBase` (Pages-Domain) |
| F4 | Fehlerfläche | 404 war Next-Standardseite (unbranded, englisch) | 2 | 1, 4 | ✅ `src/app/not-found.tsx`, gebrandet, menschlich |
| F5 | Fehlerfläche | Crash-Seite: „Client-Crash gefangen“ + roher Stack-Trace als erste Ansicht — Jargon, Angst, keine Hilfe | 2 | 2 | ✅ `global-error.tsx`: menschliche Sprache, Aktionen, Details einklappbar |
| F6 | A11y/Respekt | `maximumScale: 1` verbot Pinch-Zoom (WCAG 1.4.4) | 2 | 2 | ✅ entfernt |
| F7 | A11y/Respekt | `themeColor` nur dunkel — helle Systemumgebung bekam falschen Browser-Rahmen | 3 | 1 | ✅ Media-Query-Paar in `viewport` |
| F8 | Respekt | `select-none` auf `<body>`: kein Wert, keine Fehlermeldung kopierbar | 3 | 2 | ✅ entfernt (Buttons/Canvas tragen es selbst) |
| F9 | Rückseite | Toter Code: `LeftSidebar.tsx`, `Toolbar.tsx` nicht referenziert | 3 | 3 | ✅ gelöscht |
| F10 | Stabilität | `LibraryPalette`: `useEffect` nach frühem `return null` → Hook-Reihenfolge bricht bei Toggle (Rules-of-Hooks) | 1 | 1, 2 | ✅ Early-Return hinter alle Hooks |
| F11 | Korrektheit | `Canvas.draw`: `useCallback`-Deps `[cursor.x, cursor.y]` — `snap` stale → Snap-Toggle wirkte erst nach Mausbewegung | 2 | 2 | ✅ Deps `[cursor, snap]` |
| F12 | Rückseite | `useMediaQuery` + Workbench-Theme: `setState` synchron im Effect (Kaskaden-Render, Lint-Error) | 2 | 1 | ✅ `useSyncExternalStore` |
| F13 | Typografie | Gerade Quotes/Apostrophe in UI-Copy (`geht's`, `"r 10k"`) — Billigtypografie im Sichtfeld | 3 | 1 | ✅ `’`, `„“` |
| F14 | Typografie | Emoji als UI-Icon im First-Run-Moment (✨, 📚) statt Systemsymbol | 3 | 1, 4 | ✅ Lucide `Sparkles`/`Library` |
| F15 | Vertrauen | Keine Sicherheits-Header; Icons/Manifest ohne Cache-Policy | 2 | 1 | ✅ `_headers`: nosniff, Referrer-, Permissions-Policy + Cache-Stufen |
| F16 | Verpackung | README nannte falschen Namen, erklärte nicht das Produkt | 3 | 4 | ✅ neu geschrieben |
| F17 | Tempo | 1,3 MB JS (unkomprimiert) beim Erststart, ein Bundle für alles | 3 | 4 | 📋 siehe Backlog B1 |
| F18 | Stimme | UI-Sprache mischt DE/EN („Select“, „Wire“, „Fit“ neben deutschem Chrome) | 3 | 1, 3 | 📋 siehe Backlog B2 |
| F19 | Rückseite | ESLint-Warnings: frische Fallback-Objekte in `Instruments` (Identitäts-Flackern), fehlende Dep in `LibraryPalette`, undokumentierter Live-Takt in `ProbeTable` (+ tote Code-Schleife dort) | 3 | 1 | ✅ Defaults in `useMemo`, Dep ergänzt, Taktgeber kommentiert, Totcode entfernt → `eslint .` = 0/0 |
| F20 | Verpackung | `apple-icon.png` nur als 512er-Kopie (Apple-HIG will 180 px); Next 16 emittiert für File-Convention-Apples zudem keine `<link>`-Tags | 4 | 4 | ✅ `apple-icon.png` = 180 px + `apple-icon1.png` = 512 px, Links mit `sizes` aus `metadata.icons.apple` |

**Kritischste Erkenntnis der Runde:** Die sichtbaren Flächen (Canvas, Instrumente, Bibliothek)
sind bereits nahe „insanely great“ (Runden 1–2). Gebrochen war die *Peripherie*: Markenstimme,
Fehlerflächen, Teilen-Deckel, Header — genau die Rückseite des Schranks. Ein Favicon-Fehler ist
nie „nur ein Favicon“: Er ist das Symptom dafür, dass niemand den ersten Tab-Blick mitdesignt hat.

---

## 3 · Was geändert wurde (kurz & nachweisbar)

- **Marke = eine Stimme:** `Multispice` durchgängig in `layout.tsx` (Title-Template, OG, Twitter),
  `model.ts` (SPICE-Export-Kommentar), `editor.ts` (Boot-Log), `globals.css`, README/CLOUDFLARE/DESIGN.
- **Unboxing/Teilen:** `og.png` (1200×630, Icon + Wortmarke + Trace-Motiv, aus `icon.svg`-Master
  generiert), OpenGraph- & Twitter-Card-Metadata.
- **Fehler als Design:** `not-found.tsx` (404 gebrandet, deutsch, ein Ausweg), `global-error.tsx`
  (Beruhigung zuerst, zwei Aktionen, Tech-Details opt-in und selektierbar).
- **Respekt:** Pinch-Zoom erlaubt, Theme-Color folgt System, Text selektierbar wo sinnvoll.
- **Rückseite:** Dead Code weg, Hook-Bug weg, Stale-Closure weg, `useSyncExternalStore` statt
  Effect-SetState, Typografie-Zeichen korrekt, `_headers` mit Vertrauen + Cache-Logik.
- **Icons (verifiziert):** `/icon.svg`, `/apple-icon.png`, `/favicon.ico` (16/32/48), `/favicon.png`,
  `/manifest.json`, `/og.png` — alle mit korrektem Content-Type aus `out/` ausgeliefert.

---

## 4 · Verifikation

```
npm install && ./node_modules/.bin/tsc --noEmit   → 0 Fehler
./node_modules/.bin/next build                    → ✓ Compiled successfully
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /apple-icon.png
└ ○ /icon.svg
eslint .                                          → 0 Errors, 0 Warnings (vorher 12 Errors, 5 Warnings)
Statischer Smoke-Test (serve out/): /, /icon.svg, /apple-icon.png, /favicon.ico,
/favicon.png, /manifest.json, /og.png → 200 mit korrekten Content-Types
```

---

## 4b · Runde 4 — Tiefe drei Flächen: Bibliothek, Baufenster, Probes

Frage der Runde: *Wo liegt die Anstrengung?* Alle drei Flächen hatten Tiefe — aber sie war
hinter Tasten, Dialogen und Versprechen versteckt. Apple-Magie ist nicht mehr Funktion,
sondern **mühelose** Funktion.

| ID | Fläche | Befund | Status |
|----|--------|--------|--------|
| F25 | Bibliothek | Drag & Drop zweifach versprochen („bald verfügbar“, Empty-State „ziehe Bauteile …“) aber nicht vorhanden — gebrochene Versprechen sind Vertrauensschaden | ✅ echtes DnD: Palette (Liste+Grid) → Canvas, Live-Ghost + Snap-Anzeige während des Ziehens, Drop platziert & selektiert; Copy-Versprechen jetzt wahr |
| F26 | Baufenster | Live-Einblick (V/I/P/f beim Hover) existierte, aber nur mit ⌥ und nur laufend; pausiert = blind | ✅ mühelos: laufend = Hover über Netz zeigt Wert **+ Mini-Wellenform (Sparkline)** ohne Taste; pausiert holt ⌥ den Einblick; eingefrorene Werte bleiben sichtbar (`live` = letzter Engine-State) |
| F27 | Baufenster | Wertänderung nur via Inspector-Dialog; Doppelklick öffnete Panel statt Wert | ✅ Doppelklick = Inline-Werteditor auf der Fläche (Suffix-Parser 10k/4u7/…, ehrliche Warnung bei Parse-Fehler, Undo via commit), ⌥Doppelklick = Inspector wie bisher; Tooltips/README angepasst |
| F28 | Probes | Probe-Ghost vor dem Platzieren stumm (kein Wert, kein Netz-Feedback) — „try before you commit“ fehlte | ✅ Ghost zeigt Live-/Hold-Wert des Nets unter dem Cursor + cyan Ring am zukünftigen Messnetz |

**Das „gewisse Etwas“ dieser Runde:** der Oszilloskop-Blick beim Hover — die Mini-Kurve im
Tooltip. Man sieht ins Innere der Schaltung, bevor man etwas anfasst; wer es einmal hatte,
vermisst es überall sonst. Dazu: eingefrorene Probes zeigen nach Pause weiterhin ihren
letzten Wert (Hold-Zustand wie ein echtes Messgerät).

**Ehrlicher Rest (Backlog B6/B7):** Sparkline derzeit nur Spannung (Strom-Kurve pro Netz
braucht Engine-Erweiterung); Datei-Drop (.cir direkt auf den Canvas) wäre die nächste
DnD-Stufe; Touch bleibt bei Klick-Platzierung (kein HTML5-DnD auf Touch).

---

## 4c · Runde 5 — Menüleiste, Instrumente, Bedienung (Tastatur & Maus)

Gleicher Blick, dritte Ebene: nicht die Flächen, sondern die **Griffe** — Menüs, Tasten,
Gerätefenster. Befunde mit Code-Beweis:

| ID | Bereich | Befund | Status |
|----|---------|--------|--------|
| F29 | Menü Datei | Hint „⌘N“ für „Neuer Schaltplan“: Browser reservieren ⌘/Strg+N (nicht interceptbar) — der Hint verspricht Unmögliches, Tastendruck öffnet ein Browser-Fenster | ✅ Hint entfernt (Runde 5) |
| F30 | Menü Geräte | Tooltip versprach „andockbar unten“ — Docking existiert nicht (nur Kommentar-Ruine im Code) | ✅ Copy wahr gemacht (Runde 5); echtes Docking = Restliste R10 |
| F31 | Canvas-a11y | aria-label sagte „R Widerstand“, Empty-State und Binding sagen „R Drehen“ — widersprüchliche Doku | ✅ aria korrigiert (Runde 5) |
| F32 | Tastatur | Strg/⌘+R nicht gebunden → Multisim-Muskelgedächtnis (Rotieren) löst Tab-Reload aus; Auto-Save fängt den Verlust, nicht den Schreck | 📋 R4 |
| F33 | Tastatur | Leertaste togglet Simulation auch wenn ein BUTTON fokussiert ist (Tag-Check nur INPUT/TEXTAREA/SELECT) → Doppelaktion nach Menü-Klick | 📋 R5 |
| F34 | Tastatur | Strom-Probe ohne Taste (Spannung = V), Grid/Snap ohne Taste; ⌘Z/⇧⌘Z/⌘Y/S/C/⌘V/⌘D/A//R/⇧R/M/W/L/T/E/H/F/Space/?/⌘K/Esc dagegen vollständig & konsistent | 📋 R9 |
| F35 | Vertrauen | Auto-Save existiert (2 s, Runde 3), ist aber unsichtbar — kein „gespeichert“-Feedback in der Statusleiste; Vertrauen braucht Beweis | 📋 R6 |
| F36 | Persistenz | `instruments` (geöffnete Geräte, Fensterlage, Scope-Config, Cursors) lebt nur im Editor-State: Reload/Export/Projekt-Snapshot verlieren alle Geräte — ein Oszi, das nach Neustart verschwindet, ist kein Gerät | 📋 R7 |
| F37 | Instrumente | CRT/Scope & Grapher ohne Wheel-Gesten (Timebase/Volts nur via Knobs, Plots ohne Zoom/Pan); Cursor- und Trigger-Drags sind dagegen vorbildlich | 📋 R10/R11 |
| F38 | Ausgabe | Drucken = Browser-Print der Webseite; ein Lehrender will ein Blatt: Titelblock, sauberes SVG/PDF des Schaltplans | 📋 R8 |

**Direkt beantwortet (Fragen der Runde):** Auto-Save: **ja**, 2-s-Debounce seit Commit
`3bf404d`, quota-ehrlich — aber unsichtbar (R6). ⌘/Strg+Z: **ja**, funktioniert (Undo,
⇧⌘Z/⌘Y Redo, 50 Schritte History, korrekt deaktiviert in Eingabefeldern). Strg+R: **nein** —
rotieren tut das nackte `R` (⇧R rückwärts); Strg+R reloadet den Tab (F32).

---

## 4d · Runde 6 — Umsetzung Block A/B/D (9 Schritte: R4–R7, R9, R14, R15, R18, R19)

- **R4:** Strg/⌘+R rotiert (preventDefault) — Multisim-Muskelgedächtnis führt nicht mehr zum Tab-Reload.
- **R5:** Leertaste ignoriert fokussierte BUTTON/A-Elemente — keine Doppelaktion nach Menü-Klick.
- **R6:** Statusleiste zeigt den Auto-Save-Beweis: `● speichert …` → `✓ hh:mm` (Desktop + Mobile, mit Tooltip); Projekt-Restore setzt den Zeitstempel aus `savedAt`.
- **R7:** Geräte gehören zum Projekt: `StoredProject.instruments` (Auto-Save, Slots, Export-Envelope v2 inkl. `format`/`version`); Reload/Öffnen/Import stellen Oszi & Co. wieder her; Migration: fehlendes Feld → `[]`.
- **R9:** Tasten A = Strom-Probe, G = Grid, ⇧G = Snap; ?-Hilfe-Overlay listet jetzt ⌘R, A, G/⇧G und die Wheel-Gesten.
- **R14:** Datei-Drop auf den Canvas (.json/.cir/.net/.sp/.asc) über neue Ein-Tür-Logik `openFileInEditor()` — Menü-Dialog und Drop teilen denselben Pfad inklusive ehrlicher Fehler.
- **R15:** `favicon-192.png` + Manifest-Eintrag (PWA-Installierbarkeit: 192 + 512 + SVG).
- **R18/R19:** GitHub-Action `ci.yml` (typecheck, lint, build, `npm test` = Importer- + Sim-Kernel-Tests via tsx als devDependency) + CI-Badge im README.

Verifikation Runde 6: tsc 0 · eslint 0/0 · `npm test` 19/19 Import-Checks + Sim-Kernel PASS ·
`next build` grün.

---

## 4e · Runde 7 — Umsetzung Block C + Rest (7 Schritte: R8, R10–R13, R16, R17)

- **R8 · Drucken wird ein Schaltblatt:** `PrintSheet` rendert als Portal ein echtes Blatt —
  Rahmen, Projektkopf, Planbild, Stempel (Bauteile/Leitungen/Netze/Blatt/Datum), A4 quer per
  `@page`. Menü „Drucken“ passt erst ein (fitView), capturet dann synchron; `beforeprint`
  fängt Strg+P direkt ab, damit auch der Browser-Shortcut das Blatt bekommt.
- **R10 · Scope fühlt sich echt an:** Mausrad auf dem CRT zoomt Zeit/DIV (Faktor 1.25,
  non-passiver Listener), ⇧Rad das V/DIV des Trigger-Kanals. Geräte docken: Dock-Knopf im
  Titel oder Fenster am unteren Rand loslassen → Dock-Reihe teilt den Platz; `docked`
  persistiert mit dem Projekt (R7 trägt es).
- **R11 · Grapher zoomt:** Rad = X-Zoom um den Cursor, ⇧Rad = Y-Zoom, Ziehen = Schwenken,
  Doppelklick/Auto-Scale-Knopf = Einpassen. Kurven werden pro Panel geclippt; Cursor-
  Mapping, Ticks (linear + log) und Hover-Werte rechnen in der Zoom-Domäne. View ist an die
  Daten-Identität gebunden → neue Analyse startet automatisch in Auto-Scale.
- **R12 · Touch komplett:** Zwei Finger schwenken jetzt zusätzlich zum Pinch (eine Geste,
  eine Bewegung — Midpoint-Delta und Skalierung in einem setView); ?-Hilfe dokumentiert
  Pinch + Pan + Long-Press.
- **R13 · Strom hat ein Gesicht:** `RealtimeEngine.deviceBuffers` sampeln Zweigströme pro
  Gerät; der Hover-Tooltip zeigt über einem Bauteil die I(t)-Sparkline (sonst V(t)) — mit
  Beschriftung, welche Größe man sieht.
- **R16 · Eine Stimme:** DESIGN.md §„Sprache & Fachbegriffe“ — Deutsch konsequent,
  englische Fachbegriffe nur als Eigennamen der Messtechnik, plus Regeln (Ein Begriff, ein
  Wort; Fehler mit Ausweg) und Glossar EN→DE.
- **R17 · Tempo gemessen, nicht geraten:** `performance.mark` + Konsole berichten die Zeit
  bis Interaktivität; Dialoge (Analyse/Einstellungen/Wizards/Projekte), InstrumentLayer und
  Grapher laden als eigene Chunks (`next/dynamic`, ssr:false) — ≈119 KB aus dem Einstieg
  heraus, bezahlt wird erst beim Öffnen.

Verifikation Runde 7: tsc 0 · eslint 0/0 · `npm test` grün · `next build` grün (7 Lazy-
Chunks neben dem Einstieg) · Preview-Smoke 200.

---

## 5 · Backlog — bewusst nicht jetzt

- **B1 Tempo („Saving Lives“):** Ein Bundle für Editor + Instrumente + Analysen. Plan:
  `next/dynamic` (ssr:false) für Instrument-Layer & AnalysisDialog, sobald Messdaten zeigen,
  dass Erst-Render wartet. Erst messen (Real-User-Timing), dann schneiden — kein blindes Splitting.
- **B2 Stimme DE/EN:** Werkzeugnamen (Select/Wire/Fit) sind EDA-Fachvokabular; Chrome ist deutsch.
  Entscheidung nötig: Fachbegriffe als Eigenname behalten (wie „Oszi“) oder voll übersetzen.
  Nicht nebenbei ändern — Copy ist ein Produkt-Entscheid.
- **B3 CI:** Circuit-Szenarien (`src/lib/tests`) + typecheck/build/lint als GitHub-Action —
  Qualität muss automatisch wachen, nicht pro Session. (Lint ist seit dieser Runde bei 0/0;
  die Absicht dahinter ist jetzt im Code dokumentiert.)
- **B6 Sparkline-Stromkurve:** Mini-Kurve zeigt bislang Spannung; Strom pro Netz braucht
  eine Engine-Erweiterung (`channel` für Ströme) — erst dann sinnvoll einbaubar.
- **B7 Datei-Drop:** .cir/.asc direkt auf den Canvas ziehen (Importer existieren bereits) —
  natürliche nächste DnD-Stufe nach dem Bibliotheks-DnD.

---

## 6 · Würde Steve shippen?

**Ja — zum ersten Mal auch die Verpackung.** Die Werkstatt (Canvas, Simulation, Instrumente)
war schon vorher sein Niveau; diese Runde hat die Flächen geschlossen, die er zuerst angefasst
hätte: Tab, Teilen-Karte, Fehler, leere Leinwand, README. Offen bleiben zwei bewusste Entscheidungen
(Tempo-Split, Sprachstimme) — kein Verstecken, sondern Fokus: erst messen, dann schneiden.

> „Design is not just what it looks like and feels like. Design is how it works.“ —
> jetzt gilt das auch für `/favicon.ico`.

---

## 7 · Restliste — alle übrigen Schritte (Master, Stand Runde 5)

Aufwand: S = <1 h · M = halbtag · L = tag+. „Wahrheit“ = muss, weil das Produkt sonst
etwas behauptet, das es nicht ist. „Magie“ = darf, weil es den Unterschied macht.

### A · Wahrheit & Vertrauen
| # | Schritt | Aufwand | Status |
|---|---------|---------|--------|
| R1 | ⌘N-Hint entfernt (Browser-reserviert) | S | ✅ Runde 5 |
| R2 | aria-Shortcut-Widerspruch (R = Drehen) behoben | S | ✅ Runde 5 |
| R3 | „andockbar unten“-Copy-Lüge bereinigt | S | ✅ Runde 5 |
| R4 | Strg/⌘+R abfangen (preventDefault) = Rotieren, Multisim-Muskelgedächtnis schützen | S | ✅ Runde 6 |
| R5 | Leertaste: ignorieren wenn BUTTON/A fokussiert (Doppelaktion verhindern) | S | ✅ Runde 6 |
| R6 | Statusleiste: sichtbarer Auto-Save-Beweis („✓ gespeichert 14:32“ / „● ausstehend“) | S | ✅ Runde 6 |
| R7 | Instrumente persistieren: Geräte, Fensterlage, Configs in Projekt-Snapshot + JSON-Export/Import (Migration inkl.) | M | ✅ Runde 6 |
| R8 | Druck/PDF-Blattansicht: Titelblock, sauberes Schaltplan-SVG statt Webseiten-Print | M | ✅ Runde 7 |

### B · Bedienung vervollständigen
| # | Schritt | Aufwand | Status |
|---|---------|---------|--------|
| R9 | Tasten: A = Strom-Probe, G = Grid, ⇧G = Snap; ?-Hilfe-Overlay zur vollen Referenz inkl. Wheel-Gesten ausbauen | S | ✅ Runde 6 |
| R10 | Scope/CRT: Wheel = Timebase, ⇧Wheel = Volts/Div; echtes Docking an Bottom-Panel (versprochene Magie nachliefern) | M | ✅ Runde 7 |
| R11 | Grapher: Wheel-Zoom (X/Y), Drag-Pan, Doppelklick = Autoscale | M | ✅ Runde 7 |
| R12 | Touch-Gesten komplettieren & dokumentieren (2-Finger-Pan, Pinch existiert, Long-Press existiert) | M | ✅ Runde 7 |

### C · Magie-Kandidaten
| # | Schritt | Aufwand | Status |
|---|---------|---------|--------|
| R13 | Strom-Sparkline im Hover-Tooltip (Engine-`channel` für Ströme erweitern; ex B6) | M | ✅ Runde 7 |
| R14 | Datei-Drop: .cir/.asc direkt auf den Canvas ziehen (Importer existieren; ex B7) | S | ✅ Runde 6 |
| R15 | Manifest: 192-px-Icon für PWA-Installierbarkeit | S | ✅ Runde 6 |
| R16 | Sprachstimme DE/EN entscheiden: Fachbegriffe als Eigenname dokumentieren oder konsequent übersetzen (ex B2) | S+M | ✅ Runde 7 |
| R17 | Tempo: Erst-Ladezeit messen (RUM/light), dann Instruments/Analysen code-splitten (ex B1) | M/L | ✅ Runde 7 |

### D · Qualitäts-Wachen
| # | Schritt | Aufwand | Status |
|---|---------|---------|--------|
| R18 | CI (GitHub Action): typecheck, lint, build, `importtest`, `simtest` bei jedem Push (ex B3) | S/M | ✅ Runde 6 |
| R19 | README-Badges aus CI + Testreport als Artefakt | S | ✅ Runde 6 |

### E · Produkt-Backlog (bewusstes Nein aus FINAL_AUDIT, unverändert)
Symbol-Editor, hierarchische Subcircuit-Simulation, 3D/Foto-Ansicht — Power-User-Tiefe,
die 90 % der Lernenden nie anfassen. Wird nicht vergessen, aber nicht jetzt.

**Summe offen: 0 Schritte.** Runde 6 hat den A-Block plus R9/R14/R15/R18/R19 umgesetzt
(9 Schritte), Runde 7 den Rest: R8, R10–R13, R16, R17 (7 Schritte). Die Master-Restliste
R1–R19 ist damit vollständig abgearbeitet; übrig bleibt nur der bewusste E-Block (§5).

---

## 8 · Runde 8 — PLAN: „Wahrheit, Stille, natives Chrome“ (User-Feedback 2026-09-27)

> Status: **geplant, nicht ausgeführt.** Freigegeben wird die Umsetzung vom User.
> Bereits vorab erledigt auf direkten Befehl: **W11 Plattform-Kürzel** (Commit 844d315).

### 8.0 · Das Mindset hinter dem Feedback (die Brille für alles Folgende)

Das Urteil „AI Slop“ heißt übersetzt: *Die App redet zu viel und hält ihre eigenen
Versprechen nicht.* Zwei Wurzeln, ein Maßstab:

1. **Lärm.** Überall Hover-Texte, Tooltip-Essays, Hinweissätze, Labels („Schnellzugriff“),
   Emoji als Icons, scrollende Chrome-Leisten. Die UI erklärt sich permanent selbst, statt
   selbstverständlich zu sein. Jobs: *Wenn man es erklären muss, ist es falsch designed.*
   Information ist ein Angebot auf Abruf (Pull), kein Dauerbeschuss (Push).
2. **Unwahrheit.** Der Strom fließt in die falsche Richtung und animiert nach dem Stopp
   weiter; verschobene Bauteile reißen Netze ab; IC-Pins und Leitungen sind nicht
   deckungsgleich; der Slider rastet nicht bei 1×; Windows-Nutzer sehen ⌘-Glyphen; Menüs
   verhalten sich nicht wie Menüs. Jede dieser Lügen kostet Vertrauen — und Vertrauen ist
   das eigentliche Produkt einer Simulations-App. *Design is how it works* — und „works“
   heißt hier auch: physikalisch und betriebssystemlich wahr.

**Maßstab für Runde 8:** Der Canvas ist der Star. Alles Chrome tritt zurück. Jede Animation,
jeder Indikator, jede Zahl ist an echten Zustand gebunden oder existiert nicht. Die App
verhält sich wie das Betriebssystem, auf dem sie läuft.

### 8.1 · Die vier Nutzer-Entscheidungen (verbindlich, per Rückfrage bestätigt)

| Thema | Entscheidung |
|---|---|
| Bibliothek/Streifen | **Schlanker Streifen**: oben, nicht scrollend, entrümpelt; Bibliothek-Knopf ganz nach links |
| Stromrichtung | **Einstellbar, Default − nach +** (Elektronenfluss); konventionelle Richtung als Option |
| Canvas-Infoflut | **Komplett weg per Default**: Hover-Tooltips + Inline-Werte aus; Infos nur über Probes, Inspector, Alt+Hover; Umschalter bleiben im Ansicht-Menü |
| Rechte Seite | **Nur Geräte-Bar rechts**; Inspector wird Bedarfs-Fenster (Doppelklick/⌘I/Kontextmenü), kein festes Panel |

### 8.2 · Arbeitspakete

**Block W — Wahrheit (Canvas-Physik)**

- **W1 · Stromfluss physikalisch korrekt** (L) ✅ umgesetzt
  *Frust:* Richtung oft falsch; Punkte animieren nach Start→Stopp munter weiter.
  *Befund:* `netCurrentMap` summiert `devCurrent/pins.length` pro Netz — ein
  vorzeichenbehafteter Skalar ohne Richtungssinn; die Punkt-Richtung folgt dem Polyline-
  Zeichnenorden (`Canvas.tsx` ~421). Animation läuft mit Wall-Clock `now`, und
  `live = sim.running || engine.lastState.time > 0` (~181) bleibt nach dem Stopp wahr.
  *Ziel:* Richtung pro Leitungssegment aus der echten Schaltung: Zweigströme
  (`engine.deviceCurrent`, Vorzeichen n0→n1) bestimmen Einspeise-/Abnahmepins jedes Netzes;
  BFS über die Wire-Topologie des Netzes liefert Segment-Richtung + Betrag; Speed/Helligkeit
  aus |I|. Neue Einstellung `currentFlowDirection: "electron" | "conventional"`
  (Default **electron**: − → +; konventionell invertiert). **Punkte nur während
  `sim.running`**; Pause = Standbild; Stopp = keine Punkte.
  *Akzeptanz:* VDC+R-Serie: gleichmäßiger Fluss, Default − → + über den Außenkreis;
  Polaritätstausch kehrt um; Knoten teilt den Fluss (KCL sichtbar); nach Stopp ruht der
  Canvas; Einstellung wirkt sofort ohne Neustart der Sim.
- **W2 · Verschieben trennt keine Netze** (M) ✅ umgesetzt
  *Frust:* Bauteil verschoben → Leitungen hängen hinterher → Netz getrennt.
  *Befund:* `moveSelection` (editor.ts ~369) bewegt nur explizit ausgewählte Wires.
  *Ziel:* Gummiband: Wire-Endpunkte, die auf einem Pin des bewegten Bauteils sitzen,
  wandern mit; orthogonale Führung bleibt erhalten (letztes Segment strecken, bei Bedarf
  Knickpunkt einfügen); Labels/Probes auf dem Netz folgen; **ein** Undo-Schritt.
  *Akzeptanz:* RC-Glied: R um 3 Raster verschieben — Leitung folgt, ERC still, Netzliste
  identisch, Sim läuft ohne Unterbrechung weiter; ⌘Z stellt alles atomar zurück.
- **W3 · Pins und Netze deckungsgleich** (M)
  *Frust:* Bei ICs passen gezeichnete Pins und elektrische Anschlusspunkte nicht.
  *Befund:* Pin-Koordinaten (z. B. 555: ±40/±36/±12) liegen teils nicht auf dem
  Wire-Snap-Raster; Symbol-Stubs (`icSymbol`) werden unabhängig von `pins` gezeichnet.
  *Ziel:* Eine Quelle der Wahrheit: `pins` definiert elektrisch **und** visuell; Stubs
  werden aus Pins abgeleitet; Katalog-Pins aufs Raster korrigiert; Wire-Snap priorisiert
  Pins vor dem reinen Grid (Pin-Fang radiusbasiert, sichtbarer Fangpunkt).
  *Akzeptanz:* NE555/OPV bei 400 %: Leitungsende exakt auf Pin-Ende, keine Lücke;
  ERC meldet nichts; Fang spürbar (Highlight vor dem Klick).

**Block S — Stille (Info nur auf Abruf)**

- **W4 · Canvas still per Default** (S) ✅ umgesetzt
  *Frust:* Zu viele Infos ohne Probes, nicht schnell abschaltbar.
  *Befund:* Hover-Config Defaults alle `true` (`loadHoverConfig`), `showInlineValues: true`
  (editor.ts ~248) schreibt V/I direkt in den Plan.
  *Ziel:* Defaults aus: kein Hover-Tooltip an Leitungen/Bauteilen, keine Inline-Werte,
  keine ungefragten Sparklines. Bewusst bleibt: **Alt+Hover** (Profi-Blick auf Abruf),
  Probes (explizit gesetzt), Inspector. Umschalter im Ansicht-Menü + Einstellungen bleiben
  (nicht verstecken, nur nicht aufdrängen).
  *Akzeptanz:* Frische Installation, Sim läuft: Maus über Leitung → nichts; Plan ohne
  Zahlen; Alt+Hover liefert Messwerte; Probe zeigt ihren Wert.
- **W5 · Tooltip-Wände abreißen** (S) ✅ umgesetzt
  *Frust:* „viel zu viele Hovertexte überall“.
  *Befund:* Menü-Header **und** jedes MenuItem tragen 2–4-Zeilen-Tooltips (ui.tsx/MenuBar);
  ComponentStrip 5-Zeiler pro Knopf; Bibliotheks-Rows `title`-Blitzer; Hinweissatz
  „Hover für Info • Doppelklick Inspector • …“.
  *Ziel:* Alle dekorativen Tooltips/Essays entfernt (Menu.tooltip, MenuItem.tooltip,
  Tooltip-Inhalte im Strip, Hinweissatz). Bleiben: kurze `title` (≤ 5 Wörter) an
  icon-only-Knöpfen, wo das Icon sonst stumm wäre. Labels + Kürzel-Hints erklären genug.
  *Akzeptanz:* Maus-Wisch über Menüleiste und Streifen: **null** aufpoppende Textboxen.
- **W6 · Bibliothek: ruhige Liste, konsistentes Detail** (S) ✅ umgesetzt
  *Frust:* Info-Boxen blitzen beim Darüberfahren; Detailfeld springt.
  *Befund:* `detailPart = hovered ?? selected` (LibraryPalette ~274) — Hover kapert das
  Detailfeld; `title` pro Row (~158) blitzt nativ.
  *Ziel:* Detailfeld rechts zeigt **nur das angeklickte** Teil (selected), hover ändert
  lediglich den Row-Hintergrund; `title`-Attribute raus (Detail steht rechts, konsistent).
  *Akzeptanz:* Liste rauf/runter fahren: Detailfeld unverändert; Klick → Detail sofort,
  stabil bis zum nächsten Klick.

**Block N — Natives Chrome**

- **W7 · Schlanker Streifen, Bibliothek links, kein Scrollen** (S) ✅ umgesetzt
  *Frust:* „menü scrollbar, was scheiße ist“, „dummer Text neben der library“.
  *Befund:* ComponentStrip: `overflow-x-auto`, Label „Schnellzugriff“, 10 Quick-Parts +
  7 Probes + Bibliothek-Knopf **rechts** + Hinweissatz.
  *Ziel:* Neue Reihenfolge: **[🔍 Bibliothek] | ≤ 6 kuratierte Quick-Parts | V A Probes**;
  `flex-nowrap`, kein Scrollen (bei < 1024 px Labels der Knöpfe aus, nur Icons); Label
  „Schnellzugriff“ und Hinweissatz gelöscht; Bibliothek-Knopf ohne ⌘K-Glyphe im Label
  (Kürzel lebt im Menü/der Hilfe). Rest (13 Probes, 400+ Teile) wohnt in der Bibliothek —
  eine Tür, nicht zwei.
  *Akzeptanz:* 1280×800 und 1024×768: keine Scrollbar, nichts abgeschnitten, kein Text
  außer Knopf-Beschriftungen.
- **W8 · Menüs verhalten sich wie Menüs** (M) ✅ umgesetzt
  *Frust:* „wenn schon ein Punkt offen ist, muss ich auf den nächsten Reiter klicken“ —
  offenes Menü blockiert den direkten Wechsel; Header-Tooltips funken dazwischen.
  *Befund:* Jedes `Menu` verwaltet isoliertes `open`; kein Hover-Wechsel; außen-Mousedown
  schließt, Klick öffnet — gefühlt zwei Schritte; Menu-Header-Tooltips überlagern.
  *Ziel:* Ein Menü offen → **Hover über nächsten Header öffnet sofort** (nativer
  Menu-Bar-Modus, wie macOS/Windows); Klick wechselt in einem Klick; Esc schließt;
  ←/→ wandern zwischen Menüs; Header-Tooltips entfallen (W5). Geteilter `openMenu`-State
  in der MenuBar statt 6 lokaler States.
  *Akzeptanz:* „Datei“ offen, Maus auf „Bearbeiten“: offen ohne Klick. Klickpfad: 1 Klick.
  Tastatur: ←/→/Esc wie natives Menü.
- **W9 · Geschwindigkeits-Slider rastet bei 1×** (S) ✅ umgesetzt
  *Frust:* kein Einrasten bei Normalgeschwindigkeit.
  *Befund:* log-Slider `min -4 max 1 step 0.05` (StatusBar ~96) — 0 erreichbar, aber
  ohne Rastpunkt.
  *Ziel:* Detent: |log10(ts)| < 0.07 → exakt 1.0 (spürbares Einrasten + kleine
  Kerben-Markierung an der Nullstellung); Anzeige dann exakt „1.0×“.
  *Akzeptanz:* Langsam Richtung 1× ziehen: rastet ein und bleibt, bis deutlich
  weitergeschoben wird.
- **W10 · Geräte-Bar rechts, Inspector als Bedarfs-Fenster** (M)
  *Frust:* „wieder die bar rechts an der seite mit oszi usw.“; Inspector blockiert rechts.
  *Befund:* `InstrumentDock` existiert, wird aber nirgends gerendert (toter Code, 52px-
  Variante); Geräte öffnen nur über das Menü; Inspector ist festes Right-Panel.
  *Ziel:* Feste schmale Icon-Bar am **rechten Rand** (13 Geräte, Klick öffnet/fokussiert,
  aktive Geräte markiert, Titel als Kurz-`title`); Geräte-Fenster bleiben frei + Dock (R10).
  **Inspector wird Fenster**: Doppelklick auf Bauteil, ⌘I oder Kontextmenü öffnen ihn als
  schwebendes Inspector-Fenster (gleiche Window-Chrome, dockbar, schließbar); kein festes
  Panel mehr; Ansicht-Menüpunkt öffnet dasselbe Fenster.
  *Akzeptanz:* Rechter Rand = immer nur die Bar; Oszi = 1 Klick; Doppelklick auf R1 =
  Inspector-Fenster mit Werten; Tab-Wechsel/Fokus wie bei den Geräte-Fenstern.

**Block P — Plattform**

- **W11 · Kürzel der Plattform** ✅ **erledigt** (Commit 844d315): `platform.ts` mit
  hydration-sicherem `useIsApple()`; Windows/Linux sehen Strg/Alt/Shift/Entf, macOS ⌘/⌥/⇧;
  zentrale Adaptierung in ui.tsx + alle Direktstellen.
- **W12 · Slop-Sweep (Vollaudits-Pass)** (M)
  *Grund:* „Das sind nur wenige Punkte“ — der Rest wird systematisch gefunden, nicht
  erwartet. Checkliste über jeden Bildschirm: (a) **Textlärm** — Labels, Hinweissätze,
  Emoji-as-Icons (📚 ⚙️ ✨ 🔥 ↺ ⎘ ⎙ → lucide), Onboarding-Geschwätzigkeit;
  (b) **Wahrheit** — jede Animation/jeder Indikator an echten Zustand gebunden
  (Spannungsfarben nach Stopp? LED/7-Seg? ERC-Marker? Save-Indikator?);
  (c) **Natürlichkeit** — Fokus-Ringe, Default-Buttons, Drag-Schwellen, Kontextmenüs;
  (d) **Konsistenz** — ein Begriff pro Sache (DESIGN.md §Sprache), eine Formsprache pro
  Kontrolle; (e) **Pixel** — Ausrichtung, Abstände, 44px-Touchziele.
  *Lieferable:* Befundliste (wie Runde 3–5) → Fix in freigegebener Reihenfolge.

### 8.3 · Reihenfolge-Empfehlung & Aufwand

| # | Paket | Aufwand | Warum hier |
|---|---|---|---|
| 1 | W1 Strom-Physik | L | Die sichtbarste Lüge — Kern des Vertrauens |
| 2 | W2 Gummiband-Verschieben | M | Direkte Manipulation ist das Grundversprechen |
| 3 | W3 Pin-Wahrheit | M | Komplettiert die Canvas-Physik |
| 4 | W4 Canvas still | S | Größter Lärm-Gewinn, kleinster Aufwand |
| 5 | W5 Tooltip-Wände | S | Sofort spürbare Ruhe |
| 6 | W6 Bibliothek ruhig | S | Konsistenz-Detail, schnell |
| 7 | W7 Schlanker Streifen | S | Chrome tritt zurück |
| 8 | W8 Native Menüs | M | OS-Gefühl |
| 9 | W9 Slider-Rastung | S | Mikro-Wahrheit |
| 10 | W10 Geräte-Bar + Inspector-Fenster | M | Layout-Heimat neu geordnet |
| 11 | W12 Slop-Sweep | M | Fängt, was diese Liste nicht sieht |

Summe: ~10 Schritte (2×L/M groß, Rest S/M). Verifikation pro Paket: tsc · eslint · build ·
`npm test` · Sicht-Check in der Preview; physikalische Pakete zusätzlich per
Referenzschaltung (VDC+R, RC, 555-Astabile) gegen Handrechnung/Multisim-Erwartung.

**Bewusst nicht in Runde 8:** E-Block (Symbol-Editor, Subcircuits, 3D) bleibt §5.

### 8.4 · Umsetzungsstand Runde 8 (2026-09-27)

**Erledigt:** W1 (KCL-BFS-Flussrichtung, Phase nur im Run, Einstellung −→+/+→−),
W2 (Gummiband-Verschieben mit L-Knick-Erhalt), W4 (Hover/Inline/Pin-Tooltips Default aus,
Alt+Hover bleibt), W5 (26 Menü-Tooltips + Essay-Inhalte entfernt, Toolbar-Kurztitel),
W6 (Bibliothek: Detail nur bei Klick, keine title-Blitzer), W7 (Streifen: Bibliothek links,
6 Kuratierte, kein Scrollen, keine Texte, lucide statt 📚), W8 (kontrollierte Menüs:
Hover-Wechsel, 1-Klick-Wechsel, ←/→-Navigation), W9 (Slider-Detent 1× mit Kerbe),
W11 (Plattform-Kürzel, vorab in 844d315).

**Noch offen:** W3 (Pin-Deckungsgleichheit ICs), W10 (Geräte-Bar rechts +
Inspector-Fenster), W12 (Slop-Sweep-Vollaudit).

Verifikation: tsc 0 · eslint 0/0 · `npm test` grün · `next build` grün.

---

## Quellen

- Blake Crosley, *Design Philosophy: Steve Jobs — The Back of the Fence* (Playboy-Interview 1985,
  NYT 2003, Focus-Zitat): https://blakecrosley.com/blog/design-philosophy-steve-jobs
- folklore.org, *Saving Lives* (Andy Hertzfeld, Bootzeit-Anekdote): https://www.folklore.org/Saving_Lives.html
- Steve Jobs Archive, *Objects of Our Life* (Markkula-Memo „People DO judge a book by its cover“):
  https://stevejobsarchive.com/stories/objects-of-our-life
- Perkins, *The Story Behind the Lisa (and Macintosh) Interface* (freundliche, menschliche
  Fehlermeldungen als Designziel): https://www.bitsavers.org/pdf/apple/lisa/development_history/articles/Perkins_-_Inventing_Lisa_Interface_CPSR_email_199606.pdf

---

## 9 · Runde 9 — „Professionelles Werkzeug statt billiger Kunst"

**User-Urteil:** „Bei der aktuellen Simulation bekomme ich AI-Slop-Bauchweh. Das sieht so
billig aus. Die glühenden Linien braucht doch kein Mensch. Das soll keine billige Kunst
sein, sondern ein professionelles Tool. Die Oszis haben alle den Makel, dass die Kurve
erst ab der Mitte erscheint und der Trigger nicht wirklich funktioniert, da Kurven immer
wandern. Steve würde das bisherige zu 98 % als Müll abtun."

**Entscheidungen (User, bindend):** Ent-Glow = Schaltplan UND Geräte professionell;
Geräte-Bildschirme = mattes Phosphorgrün (flach, kein Neon); Stromflusspunkte = dezent
(2 px matt, ohne Pfeile, Richtung bleibt KCL-korrekt).

### 9.1 · Befund (Code-Beweis)
- **Trigger-Attrappe:** `cfg.trigger.mode!=="auto"` → ausgerechnet der Default-Modus AUTO
  triggerte NIE; Fenster = „letzte N Samples" → Kurve wandert.
- **Fenster ab Mitte:** `startIdx = i − bufferlänge/2` → Fensterbeginn eine halbe
  Pufferlänge vor Trigger; bei kurzem Puffer startet die Spur mitten auf dem Schirm.
- **Billige Kunst:** CRT-Radialverlauf + Vignette + Scanlines + Bloom-Doppelpass
  (`shadowBlur 14` + Persistenz-Kopie), glühende Traces (10–12), glühende
  Auswahl/Hover-Leitungen (`shadowBlur 8–12`), Ghost-Schlagschatten.
- **Lügen nebenbei:** Motor, 7-Segment-Zähler und Überlast-Rauch liefen mit `Date.now()`
  weiter, obwohl die Simulation pausiert/ gestoppt war.

### 9.2 · Umsetzung (W13–W15) ✅
- **W13 Nüchterner Schaltplan:** Wire-Glow-Block gelöscht (Auswahl/Hover = Farbe +
  Strichstärke), Wiring-Preview-Glow gelöscht (Endpunktmarker genügt), Ghosts ohne
  Schlagschatten (nur Transparenz). Funktional-Emission bleibt: LED, 7-Segment.
- **W14 Professionelles Oszilloskop:**
  (a) **Echter Flanken-Trigger:** Rückwärtssuche am Trigger-Kanal mit linearer
  Interpolation des Nulldurchgangs; bevorzugt die jüngste Flanke mit ≥ ½ Fenster
  Post-Trigger-Daten; Triggerpunkt exakt in Bildschirmmitte → Standbild.
  Jüngste Flanke ohne volles Post-Fenster wird gezeigt (rechte Hälfte füllt sich – wie
  ein echtes Scope). AUTO ohne Flanke = Freilauf rechtsbündig (Spur wächst vom rechten
  Rand, nie „aus der Mitte"); NORM ohne Flanke = ruhiger Schirm (kein Wandern).
  (b) Zeitfenster-Rendering: `t0/t1`-Fenster, Binärsuche, alle Kanäle + Math auf
  derselben Zeitachse; FFT/XY/Math ohne Glow; leerer Schirm bei fehlenden Daten.
  (c) **Matte CRT:** flacher Phosphor-Grund (#0b130e), 10×8-Graticule mit betonten
  Mittelachsen und 0.2-DIV-Ticks, Single-Pass 1.6px-Traces, Trigger-Marke ohne Glow;
  Verlauf/Vignette/Scanlines/Persistenz gelöscht.
  (d) Wahrheit: Motor/7-Segment/Rauch laufen mit `live.time` → Pause = Stillstand,
  Stopp = Ruhelage.
- **W15 Dezente Flusspunkte:** 2 px matte Punkte (--mute), keine Pfeilspitzen, keine
  Neonfarbe; Richtung/Physik aus W1 unverändert.
- **Verifikation:** Algorithmus-Konfrontation mit synthetischem 1-kHz-Rechteck über 200
  wandernde Puffer-Frames: 2 Fensterphasen im Abstand genau 1 Sample (25 µs) →
  bildfest (alte Version: kontinuierliches Wandern). tsc 0 · eslint 0 · Tests grün ·
  Build grün.

---

## 10 · Runde 10 — Offene Punkte: W3, W10, W12 (Plan)

### 10.1 · W3 · Pin-Deckungsgleichheit — Befund verschärft
Nicht nur „off-grid": `icSymbol()` zeichnet Stubs mit **eigener Teilung**
(`-h/2+22+i*16`, x=±w/2+5), während die elektrischen `pins`-Arrays andere Koordinaten
haben (NE555: Pins ±36/±12, Stubs −26/−10/6/22 → bis 14 px Lüge; 7442: Pins 14er-Teilung
±49…±35, Stubs 16er-Teilung; 53 icSymbol-Call-Sites betroffen). `bjtSymbol`: Pins
C(12,−30)/B(−30,0)/E(12,30), Stub-Enden (12,−28)/(−20,0)/(12,28) → 2–10 px Lücke.
`mosSymbol` ebenso (±28 statt ±30, Gate −20 statt −30). Wire-Snap fängt Pins dagegen
schon exakt (`findPin`) — die Diskrepanz ist rein visuell, aber genau die sieht der Nutzer.

**Fix (eine Quelle der Wahrheit):**
1. `icSymbol(w, h, label, pins: PinDef[])` — Stubs + Namen werden AUS dem pins-Array
   erzeugt: Stub von Body-Kante (±w/2) exakt bis (pin.x, pin.y), Name innen an der Kante.
2. Alle 53 Call-Sites maschinell umgestellt: pins-Literale werden zu benannten Konstanten
   gehoistet (`pins_<id>`), Teil-Bauteile übergeben die lokal gebaute `pins`-Variable.
3. `bjtSymbol`/`mosSymbol`: Stub-Endpunkte auf die Pin-Koordinaten verlängert.
4. **Laufzeit-Kongruenz-Checker** (node, transpiliertes catalog): JEDER Pin JEDES Teils
   muss exakter Endpunkt einer Symbol-Linie sein → Befundliste → Restlücken schließen.
*Akzeptanz:* Checker 0 Fehler; NE555 bei 400 %: Leitungsende exakt auf Stub-Ende.

### 10.2 · W10 · Geräte-Bar rechts, Inspector als Fenster
1. `InstrumentKind` + `"inspector"`; Titel/Fenstermaß 320×480; `openInstrument`
   öffnet/fokussiert wie bei Geräten.
2. `InstrumentLayer`-Window: `case "inspector" → <Inspector/>` — gleiche Chrome
   (ziehen, docken, minimieren, schließen) wie Geräte.
3. **DeviceBar** (neu): schmale Icon-Bar (44 px) am rechten Rand des Canvas-Bereichs
   (Desktop + Tablet), 13 Geräte-Icons (Bestand aus `iconFor`) + Inspector-Toggle unten;
   Klick öffnet/fokussiert; offene Geräte markiert; Kurz-`title` pro Knopf.
4. Desktop/Tablet: festes `rightOpen`-Panel entfernt; rechter Rand = nur die Bar.
   Mobile: BottomSheet bleibt (touch-nativ).
5. Öffner: Doppelklick auf Bauteil/Probe (Canvas) → Inspector-Fenster statt Panel;
   Kontextmenü „Eigenschaften…" dito (⚙️-Emoji entfernt); Strg+I/⌘I global;
   `addMeasurementProbe` öffnet kein Panel mehr.
6. Toter Code `InstrumentDock` (nie gerendert) gelöscht.
*Akzeptanz:* Rechter Rand = immer nur Bar; Oszi = 1 Klick; Doppelklick R1 =
Inspector-Fenster (verschiebbar/dockbar); Strg+I toggelt.

### 10.3 · W12 · Slop-Sweep (Befunde dieser Runde)
- ⚙️-Emoji: MobileTopBar-Einstellungsknopf, Canvas-Kontextmenü „Eigenschaften…" (2×) → lucide/text.
- `addMeasurementProbe` loggt einen Tutorial-Satz („Multisim-like: V vs GND/REF…") → Kurzmeldung.
- BottomPanel „ERC visuell an (rote Marker direkt am Bauteil, wie Multisim)" → ohne Eigenlob.
- MobileBottomToolbar: tote `label`-Props, englische Titel → deutsche aria-labels; „Fit" → „Einpassen".
- `Date.now()`-Animationen: Motor/7-Segment/Rauch bereits auf `live.time` (Runde 9) — Sweep bestätigt 0 Reste in Canvas/Instruments.
- Checker-Läufe: Emoji-Sweep über alle Dialoge; tote Exporte (InstrumentDock).

### 10.4 · Umsetzungsstand Runde 10 (2026-09-27)

- **W3 ✅:** `icSymbol(w, h, label, pins: PinDef[])` — Stubs + Namen entstehen aus dem
  pins-Array (52 Call-Sites maschinell umgestellt, 49 pins-Literale zu Konstanten
  gehoistet). `bjtSymbol`/`mosSymbol` auf Pin-Koordinaten verlängert; IGBT bekam eigene
  Stubs (x=12); Box-Chips (sevenseg, bargraph, lcd, 6 handgeschriebene MCUs via
  `mcuBoxSymbol`, funcgen) erhielten Stubs/Kanten exakt bis zu den Pins.
  **Dauertest:** `scripts/check-pin-congruence.ts` prüft jeden Pin jedes Teils gegen
  das Symbol (Linie/Segment/Rect-Kante/Kreis) — 409 Teile, 2092 Pins, PASS; hängt in
  `npm test`.
- **W10 ✅:** `InstrumentKind` + `"inspector"`; Inspector-Fenster mit gleicher Chrome
  (ziehen/docken/minimieren/schließen, lazy geladen); `toggleInspector()`;
  **DeviceBar** (44px, rechter Rand, Desktop + Tablet): 13 Geräte-Icons + Inspector-Toggle,
  offene Geräte markiert, Klick öffnet/fokussiert; feste Right-Panels entfernt
  (Mobile-BottomSheet bleibt); Öffner: Doppelklick Bauteil/Probe, Kontextmenü
  „Eigenschaften…", Strg+I/⌘I, Ansicht-Menü; Alt+Doppelklick behält den Inline-Wertedit.
  Toter `InstrumentDock` gelöscht.
- **W12 ✅ (erster Voll-Pass):** 9× „wie Multisim / Multisim-like"-Eigenlob aus
  sichtbaren Strings entfernt; 🔥-Überlast-Emoji → ⚠; ⚙️-MobileTopBar → lucide;
  „Bibliothek (⌘K)" im Menü → echtes `hint`-Prop (plattformadaptiert); Tutorial-Logs
  gekürzt (Messpunkt, Leitungspunkt); MobileBottomToolbar: tote Labels → deutsche
  aria-labels/titles, „Fit" → „Einpassen"; Emoji-Sweep über alle Dialoge: nur
  funktionale Glyphen (✕ ⚠ ✓ ›) übrig; `Date.now()`-Animationen: 0 Reste.

**Damit sind W1–W15 vollständig umgesetzt.** Bewusst offen bleibt nur der E-Block (§5:
Symbol-Editor, Subcircuits, 3D).

Verifikation: tsc 0 · eslint 0/0 · `npm test` grün (inkl. Pin-Kongruenz 2092/2092) ·
`next build` grün.

---

## 11 · Runde 11 — Referenz-Design übernehmen (CircuitBench-Generationen)

**Auftrag:** User hat `reference/` und `reference 2/` (zwei KI-Generationen „CircuitBench")
auf main gelegt: „vom Design her viel viel besser". Analysieren, übernehmen.

**Analyse-Kern:** Beide hell-primär, kompakt, technisch. Ref 1: warmes Zeichenblatt-Papier
(#f2f1ee), IBM Plex, strikte Semantikfarben (blau=Auswahl, rot=Fehler, amber=Warnung,
grün=OK, teal=Masse), 6er-Trace-Palette, 26px-Controls, Command-Palette, Crash-Recovery,
SVG-Canvas. Ref 2: Primer-Grau, 22px-Controls, Titelleiste (Name/Dirty/Status-%),
Sheet-Tabs, Lineale+Blattrand+mil-Snap, dockbares Bottom-Panel, Versionen (20)+Autosave,
SVG/PNG/PDF-Export, handgezeichnete 16px-Icons, Status-Zähler (✖/▲).

**User-Entscheidungen (bindend):**
1. **Hybrid:** Ref-1-Design-Tokens (Papier, IBM Plex, Semantik, Traces) + Ref-2-Chrome
   (Titelleiste, 20px-Statusleiste mit Zählern, 22–26px-Controls). **Hell = Default**, Dunkel Option.
2. **Canvas-Engine bleibt** (Physik: KCL-Fluss, Trigger, 2092-Pin-Kongruenz) – neue Optik
   (Papier, Tinten-Symbole, blaue Drähte, feines Raster) + **echtes SVG/PNG/PDF-Exportmodul**
   aus dem Dokument-Modell.
3. **Voller Desktop-Chrome, W10 bleibt:** Titelleiste, Sheet-Tab-Vorbereitung, Lineale +
   Blattrand + Titelstempel-Option, resizable/dockbares Bottom-Panel, Status-Zähler –
   Geräte-Bar rechts und Inspector-Fenster bleiben (kein festes Rechts-Panel).
4. **Features später:** Nach der Design-Runde liste ich Übernahmekandidaten
   (Versionen, Autosave/Recovery, Command-Palette, Sweep, Suchen, Multi-Sheet, Busse …)
   zur Einzelentscheidung. UI bleibt deutsch.

**Pakete:** W16 Tokens/Theme (light-default) · W17 Chrome (TitleBar, StatusBar-Zähler,
Sheet-Tabs, Bottom-Resize, Menüdichte) · W18 Canvas-Optik (Token-Sweep, Lineale/Blattrand/
Titelstempel, Trace-Palette) · W19 Export (docToSvg → SVG/PNG/PDF, Datei-Menü).

### §11.1 — Runde-11-Umsetzung (W16–W19), Stand 2026-09-28

**W16 Tokens (FERTIG):** Light ist jetzt Default (warmes Papier, Ref-1-Tokens);
Dark bleibt als Option. IBM-Plex-Font-Stack. Canvas/Instruments/Scope-Farben
lesen Token (--ch1…--ch4) statt harter Neon-Hexwerte; TactileButton neutrales
color-mix-Chassis.

**W17 Chrome (FERTIG):**
- `TitleBar` (Workbench): Logo · Multispice — Projektname · Speicherzustand ·
  Sim-Status (bereit/pausiert/läuft t=…). Desktop + Tablet.
- `SheetTabs`: Blattleiste über dem Canvas (ein Blatt, „+" vorbereitet).
- BottomPanel: Höhe per Drag verstellbar (120–720 px), renderet sich selbst als
  34px-Tabstreifen, wenn geschlossen.
- Menü-Dichte (Ref 1): Menüitems 25px/12px, Hover = Accent-Blau mit weißer
  Schrift; Menü-Buttons h-6.
- Neue Ansicht-Schalter: Lineale, Blattrand mit Titelstempel (editor-Flags
  showRulers/showPageFrame, Default aus).
- StatusBar-Zähler (✕ Fehler/⚠ Hinweise → öffnet Fehler-Tab) waren bereits da.

**W18 Canvas-Optik (FERTIG):** Blattrand + Titelstempel (Name/Datum/Blatt 1/1)
und Lineale mit Nice-Step-Ticks werden aus Tokens gezeichnet (Welt- bzw.
Screen-Raum), Papier-Hintergrund/Inkten-Symbole laufen über die W16-Tokens.

**W19 Export (FERTIG):** `src/lib/export/sheet.ts` baut aus dem Dokument-Modell
ein sauberes SVG-Blatt (dieselben Symbol-Primitive wie der Canvas, feste
Papier-Farben, optional Blattrand+Titelstempel). Datei-Menü: Export SVG,
Export PNG (2× gerastert), Export PDF (Ref-2-Druckfenster-Trick, Querformat,
„Als PDF speichern"). Der alte Screenshot-PNG-Export (Canvas-Viewport mit
Grid/Glow) wurde ersetzt.

**Hausarbeit:** tsconfig + eslint ignorieren jetzt `reference/` und
`reference 2/` (fremde Generationen mit eigenen, hier nicht installierten
Abhängigkeiten — sonst rot in tsc/lint).

Verifikation: tsc ✔ · eslint ✔ · Dauertest 2092/2092 PASS ✔ · next build ✔
(Routen /, /_not-found, /apple-icon.png, /apple-icon1.png, /icon.svg).

---

## §12 — Runde 12: User-Feedback auf das Hybrid-Design

Feedback (sinngemäß): „Titelleiste muss wieder weg · Icons (z. B. Probes) sind
zu fett · Library-Dreispalter aus der Referenz übernehmen · die Probes der
Referenz sind besser."

**W20 — Titelleiste raus.** `TitleBar` aus Workbench entfernen (Desktop +
Tablet). Die Blatt-Reiter (`SheetTabs`) bleiben.

**W21 — Dünnere Icons.** Lucide-Icons global auf `stroke-width: 1.5`
(Referenz-Niveau statt fetter 2er-Striche). Symbolvorschau in der Bibliothek
zeichnet mit dem `--symbol`-Token statt hartem Hellblau.

**W22 — Bibliothek als Dreispalter (Ref-1 „Component Browser").**
Spalte 1 (170 px): Alle/Favoriten/Zuletzt + Kategoriebaum mit Zählern.
Spalte 2: flache Teileliste der gewählten Kategorie bzw. Suchtreffer
(Liste/Grid-Umschalter bleibt). Spalte 3 (flex): Detail – Symbolvorschau,
Beschreibung, Chips, Parameter, **Pins**, Datenblatt-Links, Platzieren-Button.
Default-Fenstergröße 360×520 → 860×560.

**W23 — Probes wie in der Referenz.** Statt Neon-Badges (r≈10, 700er-Type)
kleine dezente Marker im Ref-2-Stil: Fähnchen-Tag mit dünner Kontur +
Mono-Wertangabe; Strom/Leistung als Richtungspfeil; Diff mit gestrichelter
Referenzlinie. Beruhigte Token-Palette: voltage `--warn` (Ocker), current
`--accent-2` (Teal), power `--accent-3` (Violett), diff `--err` (Ziegel),
ref `--text-mute`, digital `--ok` (Grün) — passt in Hell UND Dunkel.
Legacy-Neon-Hexwerte in gespeicherten Projekten gelten als „automatisch"
und werden auf die neue Palette gemappt. Gleiche Farben für Probe-Buttons
(ComponentStrip), ProbeTable, Inspector-Fallback, Einstellungen-Legende,
Grapher-Cursor und Kategorie-Icons.

**Nicht anfassen:** Instrumenten-Frontplatten (matter Phosphor = Beschluss
Runde 9), App-Icon `icon.svg` (Farbspezifikation aus Urauftrag bindend),
`global-error.tsx` (eigenständige Notfallseite).

Verifikation wie immer: tsc · eslint · Dauertest · next build.

### §12.1 — Umsetzung, Stand 2026-09-28

W20–W23 FERTIG. Zusätzlich: `oszi/` (Main-Upload ec3997d) in tsconfig/eslint
ignoriert; zentrale Probe-Farbquelle `src/lib/probe-style.ts` (Token-Mapping +
Legacy-Neon-Migration). Verifikation: tsc ✔ · eslint ✔ · Dauertest 2092/2092
PASS ✔ · next build ✔ (alle fünf Routen).

---

## §13 — Runde 13: oszi-Übernahme + Raster + Routing + Symbol-Optik

User-Feedback: (1) das eigene `oszi/`-Projekt 1:1 als Oszilloskop übernehmen
(ohne USB-Anschluss/BNC-Reihe und ohne Demo-Testschaltung) und das aktuelle
Scope ersetzen · (2) Bauteile/Pins liegen nicht immer auf dem Raster ·
(3) Leitungen beim Bauteil-Verschieben nur im 90°-Winkel erweitern, ohne
Überlappung · (4) Symbol-/Schalter-Optik der Referenzen übernehmen ·
(5) Library-Suche überlappt mit dem Such-Icon · (6) Speed-Regler rastet nicht
bei 1× und hat einen hässlichen Strich.

**W24 — oszi 1:1 (SkeuoTek-Chassis).** `oszi/src` → `src/components/oszi/`
(Knob, PushButton, ScopeScreen, units; cn ohne clsx/tailwind-merge).
ScopeScreen bekommt statt `signalAt(circuit,…)` einen `sample(ch,t)`-Adapter
über `engine.channel(net,…)` mit Interpolation; Zeitbasis = Simulationszeit.
DemoBoard (Testschaltung), BNC-Reihe und Demo-Footer entfallen. Dafür:
Netz-Quellwahl CH1/CH2 im Vertical-Block. Altes Oscilloscope-Instrument wird
ersetzt; Fenster-Default 640×460 → 900×640.

**W25 — Raster-Normalisierung (1095 Off-Grid-Pins in 158 Teilen).**
Generischer Post-Pass am Ende von catalog.ts: Pins pro Seite auf 20er-Teilung
neu zentrieren (einzeln: nach außen auf 10er), Symbol-Stub-Enden und
Pin-Beschriftungen wandern exakt mit, IC-Bodies wachsen bei Bedarf.
Ergebnis: jeder Pin liegt auf einem GRID(10)-Punkt — Drähte andocken ohne
Versatz. Kongruenz-Dauertest muss PASS bleiben.

**W26 — Orthogonales Mitführen beim Verschieben.** moveSelection: Leitungen,
die mit einem Ende an einem bewegten Pin hängen, werden rechtwinklig
nachgezogen — vorhandene Knickpunkte werden neu positioniert statt
aufgestapelt; neue L-Knicke wählen die Variante, die keine fremden
Bauteil-BBoxen schneidet („intelligent").

**W27 — Symbol-Optik der Referenz.** Strichstärke 1.7 → 1.3 (Prims-Vorbild
1.2), Pin-Punkte kleiner/dezenter, Schalter-Overlay wie Ref-2 (dünner Hebel,
zwei gefüllte Lagerpunkte, neutrale Tinte — Zustand über Hebelwinkel),
Fehler-Markierungen auf Token-Farben, Drähte etwas dünner.

**W28 — Kleinkram.** Library-Suche: Padding per Inline-Style (.input-CSS
sticht Tailwind-Klasse aus) · Statusleisten-Speed: Rastpunkt 1× greift
verlässlich, hässlicher Strich entfernt, Anzeige „1×".

Verifikation: tsc · eslint · Dauertest (Pin-Kongruenz + Off-Grid-Scan = 0) ·
next build.

### §13.1 — Umsetzung, Stand 2026-09-28

W24–W28 FERTIG.
- W24: `src/components/oszi/` (Knob, PushButton, ScopeScreen, units – 1:1-Port)
  + `src/components/OsziScope.tsx` (SkeuoTek-Chassis, Engine-Adapter mit
  Interpolation + Frequenzschätzung, Netz-Wahl je Kanal, Autoset aus echten
  Daten). DemoBoard/BNC-Reihe/Demo-Footer entfernt. Altes Oscilloscope inkl.
  SkeuKnob/CrtScreen/TactileButton/ScopeConfig raus; Fenster-Default 920×640.
  Alte Scope-Configs werden migriert (timebase/volts → TIME_DIV/VOLT_DIV).
- W25: Raster-Pass im Katalog – Off-Grid-Pins 1095 → **0**; IC-Pins auf
  einheitliche 20er-Teilung, Stub-Enden/Beschriftungen wandern mit, Bodies
  wachsen. Kongruenz-Dauertest PASS.
- W26: `src/lib/schematic/ortho.ts` – orthoFollow(): Knicke neu positionieren
  statt stapeln, L-Wahl meidet fremde Bauteil-BBoxen; in moveSelection
  eingehängt (Hindernis-BBoxen mit 6 px Luft).
- W27: Symbolstrich 1.7→1.3, Pin-Punkte 2.4→1.5, Ref-2-Schalteroverlay
  (dünner Hebel + Lagerpunkte, neutrale Tinte), switch_spst-Symbol reduziert,
  Fehler-Markierungen auf Token-Farben.
- W28: Library-Suche Padding inline (Icon-Überlappung weg), Speed-Regler:
  Strich entfernt, Rastbereich |log10|<0.09, Anzeige „1×".
- Bonus: simtest „RC -3dB" griff zum falschen Sweep-Bin (178 Hz statt 158 Hz)
  – nächstgelegener Punkt im log-Abstand; Fail war vorbestehend (stille Toleranz-
  überschreitung seit früheren Runden), jetzt grün.

Verifikation: tsc ✔ · eslint ✔ · Dauertest (Import/Sim/Kongruenz) PASS ✔ ·
next build ✔ (/, /_not-found, /apple-icon.png, /apple-icon1.png, /icon.svg).

---

## §14 — Runde 14: Oszi als Schaltsymbol (User-Spezifikation + Antworten)

Kritik: Die Dropdown-Netzwahl (Runde 13) war eine ungefragte Annahme. Neu per
User-Antwort: **CH1–4 + GND als Pins**, Geräte-Leisten-Eintrag **platziert das
Symbol**, keine entkoppelten Fenster mehr.

**W29 — Oszi auf dem Schaltplan:**
1. Katalog-Teil `oscilloscope` (XSC, Quellen/Instrumente, virtual): 4 Kanal-
   Pins links (CH1–CH4, 20er-Teilung), GND-Pin unten; Body mit Screen-Glyphe.
   toDevices() = [] (misst, beeinflusst die Simulation nicht).
2. InstrumentWindow.instanceId: openInstrument("scope", {instanceId, title})
   öffnet/fokussiert ein an die Instanz gebundenes Fenster (ein Fenster je
   Oszi-Symbol). Doppelklick aufs Symbol → Fenster (statt Inspector).
   Instanz löschen → gebundenes Fenster fliegt mit. Alte entkoppelte
   Scope-Fenster werden beim Laden verworfen.
3. Geräte-Leiste/Bibliothek: „Oszilloskop"-Eintrag startet die Platzierung.
4. OsziScope: Dropdowns raus — Netze kommen aus `netResult.pinNets`
   (instanceId:pinIndex). GND-Pin wired → Messreferenz (sample = V(CH) − V(GND)),
   sonst Knoten 0. 4 Kanäle (Farben CH1 Gelb, CH2 Cyan, CH3 Magenta, CH4 Grün),
   Trigger-Quelle zyklisch CH1–4. Anschlussfeld im Vertical-Block zeigt je
   Kanal: farbige Lampe + Netzname bzw. „offen" (offener Anschluss); Readout-Bar
   und CH-Taster spiegeln denselben Zustand. Brand-Label „4 CH".

Verifikation: tsc ✔ · eslint ✔ · Dauertest (Import/Sim/Kongruenz: 410 Teile,
2097 Pins) PASS ✔ · next build ✔ (/, /_not-found, /apple-icon.png,
/apple-icon1.png, /icon.svg).

**Umsetzungsstand (fertig):**
- `catalog.ts`: Teil `oscilloscope` (XSC) — Pins CH1–CH4 links bei x=−40
  (y=−30/−10/10/30, rasterexakt), GND unten (0,40); Body 60×72 mit Screen-
  Rechteck, Trace-Glyphe, „4 CH“-Aufschrift, Anschluss-Stutzen enden exakt
  auf den Pins; `toDevices: () => []`.
- `editor.ts`: `InstrumentWindow.instanceId?`; `openInstrument(kind, opts?)`
  mit gebundener scope-Variante (Fenster-id `w_<instanceId>`, Fokus +
  Un-Minimieren bei erneutem Doppelklick, Titel-Update); `deleteSelection`
  schließt gebundene Fenster; Restore verwirft `scope`-Fenster ohne
  `instanceId`.
- `Canvas.tsx`: Doppelklick auf `oscilloscope`-Instanz öffnet das gebundene
  Fenster („Oszilloskop XSC1“) statt des Inspectors.
- `Instruments.tsx` (DeviceBar) + `MenuBar.tsx` (2 Listen): scope-Eintrag
  startet `setPlacing("oscilloscope")` (Toggle in der Geräte-Bar); aktiv-
  Zustand = Platzierung läuft oder gebundenes Fenster offen.
- `OsziScope.tsx`: Config ohne `nets` (Migration: R13-2-Kanal-Configs werden
  per `pad4` auf 4 Kanäle aufgefüllt, `nets`-Feld entfällt; ≤R12-Migration
  bleibt). Netze aus `netResult.pinNets["instId:i"]`; **offen** = Name
  `instId_ncI` (so kennzeichnet `model.ts` kontaktlose Pins) oder fehlend.
  GND wired & ≠ „0“ → Differenzmessung sample = V(CH) − V(GND) (auch in
  Autoset/Frequenzschätzung), sonst Knoten 0. 4 Kanal-Farben Gelb/Cyan/
  Magenta/Grün; CH-Taster zeigen Netzname bzw. „offen“ (dunkel, ohne Glow)
  und machen den Kanal per Klick aktiv; GND-Streifen mit Lampe + Zustand;
  Readout-Bar je Kanal „offen“ grau, plus „Ref <netz>“ bei Differenzmessung;
  Trigger-Quelle zyklisch CH1–4 (mit „(offen)“-Hinweis); Mess-Overlay nur bei
  verbundenem aktiven Kanal; Brand „200 MHz · 2 GS/s · 4 CH“; Footer-Hinweis
  erklärt die Verdrahtung am Symbol. Keine Dropdowns mehr.
