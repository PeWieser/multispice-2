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
