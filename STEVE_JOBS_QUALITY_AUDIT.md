# Steve-Jobs-Qualitätsaudit — Runde 3 („Insanely great oder nicht shippen“)

> Datum: 2026-09-25 · Branch `arena/01a0d95e-multispice-2` · Stand: nach Build-Fix (PR #2)
> Vorgänger: `DESIGN_AUDIT_STEVE_JOBS.md` (Detail-Runde), `FINAL_AUDIT_STEVE_JOBS.md` (Funktionsabgleich Multisim)
> Für den schnellen Einstieg (Auftrag, Runden 15–18, Regeln, Lagekarte): **[UEBERGABE.md](UEBERGABE.md)**
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

---

## §15 — Runde 15: oszi v2 (OTX2074) komplett übernommen + main-Synchronisation

**User-Vorgabe:** Das falsche oszi-Paket war im Repo; das richtige (**oszi v2**,
„OSZITRON OTX2074") ist jetzt auf main (als Upload, der main auf einen neuen
Root-Commit stellte). Auftrag: (1) aktuellen Stand auf main pushen — aber erst
NACH der Umsetzung; (2) oszi v2 **komplett** übernehmen, funktional wie optisch;
(3) einzige erlaubte Änderungen: **USB-Port löschen** und **Anschlüsse ändern**
(kein Kabel, wenn nicht angeschlossen); (4) ein echtes Oszi zeichnet auch ohne
Signal eine **0-V-Kurve**.

**Ask-User-Entscheidungen (bindend):**
1. Testbench (Demo-Kippstufe, Funktionsgenerator, TP1–4): **weglassen** —
   Signale kommen ausschließlich aus der Schaltung (Verdrahtung an CH1–CH4/GND).
2. Tastkopf-Handling (BNC-Klick = aufnehmen, ⎍/⏚-Klemmen): **funktional
   behalten** — aufgenommen = Kabel abgezogen, Messung pausiert (0 V); zurück
   auf die BNC = Messung laut Verdrahtung.
3. Dämpfungsschalter (1X/10X) + Abgleich-Trimmer (saßen am Tastkopf neben der
   Testbench): **ins CH-Menü** (neue Menüpunkte „Schalter (Tastkopf)" und
   „Abgleich-Trimmer" mit Mehrzweckknopf).

**W30 — Port oszi v2 → src/components/oszi2/ (+ Adapter OsziScope.tsx):**
- 1:1 übernommen: types/signals/engine/render/menus/Knob/Button/HelpOverlay/
  Oscilloscope (4 CH, 15×8-Raster, Boot-Animation, Netzschalter, Softkeys,
  Menüs, Measure×16+Statistik, Cursor, Math, FFT (4 Fenster), Ref R1/R2,
  Zoom, Search/Mark, Acquire (Sample/Peak/Average/HiRes/XY/Roll), Trigger
  (Holdoff, Netz-50 Hz-Quelle, Force, 50 %), Display (Persistenz, Intensität,
  Rasterstile, Punkte/Vektoren, Backlight, Uhr), Save (PNG/CSV/Setup),
  Selbstkalibrierung, Systeminfo, Rauschsimulation, Tastkopf-Filterketten
  (Kompensation, 1X-Bandbreite, 20 MHz-BW-Limit), Autoset, Screen 800×480).
- Änderungen nur laut Vorgabe/Entscheidungen: USB-Port entfernt; Anschlüsse =
  Verdrahtung (BNC zeigt Stecker+Kabel nur bei verbundenem Kanal; offen =
  nackte Buchse + „offen"-Label); Testbench entfällt (sourceValue zieht die
  Netzspannung via env.sampler aus der Multispice-Engine; GND-Pin ≠ 0 →
  Differenzmessung); Dämpfung/Abgleich im CH-Menü; Anleitungstexte an die
  Schaltungs-Verdrahtung angepasst.
- Zeitebenen: Akquise/Trigger/Autoset laufen in **Simulationszeit**
  (engine.lastState.time, inkl. Reset-Resync), UI-Timer (Boot, Meldungen,
  Kalibrierung, Persistenz-Abklingen) in Wall-Time.
- Zustand: Settings + Tastkopf-Physik (atten/comp) persistieren debounced pro
  Gerätefenster in win.config.scope ({v:3,…}); alte R13/R14-Configs werden
  verworfen (Sanitize-Merge gegen defaultSettings). Gerät-interner
  Setup-Speicher (localStorage „otx2074-setup") bleibt wie im Original.
- 0-V-Kurve: Kanal EIN ohne Leitung → target null → channelRaw = 0 → flache
  Linie mit Grundrauschen (wie ein echtes Oszi ohne Signal).
- Adapter: Fit-Skalierung (1420 px-Chassis auf Fensterbreite), Labortisch-
  Hintergrund, „Tastkopf in der Hand"-Banner, Escape-Handling.
- CSS: oszi-v2-Klassen (case/bezel/panel/bnc/knob/sk-btn/power-btn …) unter
  `.otx-scope` gescoped in globals.css (Kollision mit `.panel` vermieden).
- react-hooks-Konformität: Ref-Writes (sRef/refsRef/itemsRef/turnRef) in
  Effekte verlegt; Boot-Guard von Refs auf State (power/booting) umgestellt;
  ref-lesende Handler direkt als Event-Handler statt via guard-Factory.
- Alter v1-Port entfernt: src/components/oszi/ + Wurzel-Paket oszi/ (falsches
  Paket, durch oszi v2 ersetzt); Toolbar.tsx/LeftSidebar.tsx (vom main-Upload
  wiederbelebt, stammen aus dem Vorknob-Design) wieder entfernt;
  tsconfig.exclude/eslint-Ignores auf „oszi v2" umgestellt.
- editor.ts: scope-Fenster-Default 1500×980 (Chassis-Breite 1420 + Luft).

**Main-Synchronisation:** origin/main war ein fremder Root-Commit (Upload =
alter main-Stand 79aeb89 + oszi v2 + reference/src, ohne die Runden 3–14).
Merge mit `--allow-unrelated-histories -X ours` → unser Stand gewinnt, Upload-
Neuzugänge (oszi v2) kommen dazu; danach Push auf arena **und main**.

Verifikation: tsc ✔ · eslint ✔ · Dauertest (Import/Sim/Kongruenz 410 Teile,
2097 Pins) PASS ✔ · next build ✔ (/, /_not-found, /apple-icon.png,
/apple-icon1.png, /icon.svg).

---

## §16 — Runde 16: Oszi-Port-Feinschliff (User-Rüge: „fehlerhafte Portierung")

**User-Auftrag:** Die Runde-15-Portierung des Oszilloskops ist fehlerhaft
(Störsignale/statisches Bild, Single-Trigger, Scrollbalken im Fenster, Fenster
lässt sich nicht weit genug nach oben verschieben, + weitere, noch unentdeckte
Fehler). Original liegt in `oszi v2/`. Bei Fragen immer fragen.

**Befund (Code-Analyse, Diff oszi v2 → Port):** `engine.ts`/`render.ts` sind
byte-identisch; die Fehler sitzen in der **Anbindung an die Multispice-Engine**
und der **Fenster-Chrome**:
1. **Statisches Bild:** Die Akquise hängt an der Simulationszeit
   (`eng.step(simEngine.lastState.time)`). Simulation pausiert (Default!) =
   Zeit friert ein → keine neuen Aufnahmen → Bild komplett tot (nicht mal das
   Rauschen erneuert sich).
2. **Störsignale/Garbage:** Ringpuffer deziert auf 40 kSa/s, Tiefe nur ~0,41 s
   Sim-Zeit; `interpAt` klammert außerhalb auf Randwerte → flache/garbage-
   Abschnitte ab ~27 ms/div, Roll-Modus (≥100 ms/div) fast komplett; negative
   Startzeiten (`tt = simT − postT` bei simT≈0) zeigen eingefrorenen Müll.
3. **Single-Trigger:** Bei pausierter Simulation findet `findTrigger` nie eine
   Flanke → Status „ready", LED leuchtet dauerhaft, keine Aufnahme. Zusätzlich:
   Auto+Single hat keinen Auto-Fallback (v2-Demo nie aufgefallen); Reset-Resync
   (`lastAcqTime = simT − 1`) würde eine Auto-Aufnahme sofort auslösen.
4. **Scrollbalken:** Gebundenes Oszi-Fenster öffnet mit **920×640** (alter
   R14-Stand im `instanceId`-Pfad von `openInstrument`; 1500×980 stehen nur im
   toten Fallback-Pfad); `OsziScope` hat `overflow-auto` + `pb-[170px]`
   (Testbench-Relikt) und `Fit` skaliert nur nach Breite → Scrollbalken immer.
5. **Nach oben:** Drag-Clamp `y ≥ 48` in `Instruments.tsx`.
6. Nebenbefunde: Autoset/AC-Mittel suchen 1,2–4 s Geschichte (Puffer: 0,41 s);
   Cursor-Crosshair beim Tastkopf fehlt; `startSim()` rebuilt stets,
   `stopSim()` = Pause+Reset.

**Ask-User-Entscheidungen (bindend, Runde 16):**
1. „Störsignale" = **statisches Bild** („die Signale bewegen sich nicht").
2. Single tut nichts, LED leuchtet dauerhaft. Bei pausierter Simulation:
   **Simulation automatisch starten, eine Aufnahme, dann wieder anhalten.**
3. Run-Modus + pausierte Simulation: Oszi tastet die Simulation **nie** an
   (Play/Pause bleibt allein beim Simulations-Button). Anzeige dann:
   **tote Schaltung, lebendes Bild** — alle Kanäle 0 V + Grundrauschen
   (wie an einer unbestromten Schaltung), Rauschen erneuert sich, Auto-Trigger
   feuert weiter. „Simulation an = Signal an; Simulation stopp = keine Spannung."
4. Fenster darf **teilweise unter die Menü-/Werkzeugleisten rutschen**, ein Rest
   muss sichtbar bleiben.
5. Kleine Fenster: Gerät skaliert **komplett** hinein (Breite + Höhe),
   **nie ein Scrollbalken**.

**W31 — Plan (Reihenfolge der Umsetzung):**
- **W31a Fenster-Chrome:** gebundenes Oszi-Fenster 1500×980 (clamp auf Viewport
  mit Mindestmaß 640×480); Drag-Y-Clamp `-(h−120)` bis untere Kante; Canvas-
  Container `overflow-hidden` (Fenster rutschen optisch unter die Leisten);
  Recall-Clamp beim Öffnen (`y < 0 → y = 24`), damit nie ein unrecoverable
  Zustand entsteht.
- **W31b Fit/Scrollbalken:** `Fit` skaliert auf Breite **und** Höhe des
  Containers (contain), `pb-[170px]`/`overflow-auto` → `overflow-hidden`,
  zentriert, kleiner Rand. Scrollbalken im Oszi-Fenster unmöglich.
- **W31c Oszi-Uhr (Bild beleben):** Scope-Clock im rAF-Loop: folgt
  Simulationszeit-Advances, läuft bei pausierter Simulation in Wall-Time weiter,
  rebaset bei Sim-Reset (bestehender Resync-Pfad). `sampler` liefert für
  Netz-Ziele **0 V, solange die Simulation nicht läuft** (tote Schaltung);
  comp/gnd-Klemmen bleiben als Geräte-Eigensignale lebendig.
- **W31d Signalpfad-Treue:** zweistufiger History-Puffer in `realtime.ts`
  (fast 16384 @ ~40 kSa/s = 0,41 s + slow 16384 @ ~3,2 kSa/s ≈ 5,1 s,
  Push alle 12. Fast-Sample; `channelSlow()`); tiered `interpAt` im Adapter
  (fast → slow → Hold/0; `t < 0` → 0). Schnellt-Basis bis ~27 ms/div sauber,
  langsam bis ~340 ms/div abgedeckt.
- **W31e Single-Trigger:** Single bei gestopfter Simulation → `startSim()`,
  nach `singleDone` → `pauseSim()` (nur wenn selbst gestartet);
  `lastAcqTime`-Resync ohne sofortige Auto-Aufnahme; Engine: Auto-Fallback auch
  für `run:'single'` (Timeout-Aufnahme + `singleDone`), damit Single in
  Auto-Modus immer abschließt (Normal-Modus wartet weiterhin auf echte Flanke —
  Instrumenten-Semantik).
- **W31f Kleinigkeiten:** Cursor `crosshair` bei „Tastkopf in der Hand" (v2).
- **Verifikation:** tsc ✔ · eslint ✔ · npm test (VOLLausgabe) ✔ · next build ✔
  mit Routen /, /_not-found, /apple-icon.png, /apple-icon1.png, /icon.svg;
  Live-Preview prüfen.

### §16.1 — Umsetzungsstand Runde 16 (2026-09-29) ✅

- **W31a Fenster-Chrome:** `scopeDefaultSize()` in editor.ts (1500×980,
  viewport-geclampt, min 640×480) für den `instanceId`-Pfad (alt: 920×640 —
  das war der Scrollbalken-Auslöser); Restore-Migration für gespeicherte
  920×640-Fenster; Recall-Clamp beim Öffnen (`y < 0 → 24`); Drag-Y-Clamp
  `-(h − min(120, h))` statt `y ≥ 48`; Canvas-Container `overflow-hidden`
  (Fenster rutschen optisch unter die Leisten).
- **W31b Fit:** skaliert auf Breite **und** Höhe (contain) gegen den
  Fensterkörper; `overflow-auto` + `pb-[170px]` (Testbench-Relikt) entfernt —
  Scrollbalken im Oszi-Fenster ist konstruktiv ausgeschlossen.
- **W31c Oszi-Clock:** Akquise auf einer eigenen Signal-Zeitachse, die der
  Simulationszeit folgt, bei pausierter Simulation in Wall-Time weiterläuft
  und bei Sprüngen (Sim-Reset/Weiterlauf) resynchronisiert; `sampler` liefert
  bei angehaltener Simulation **0 V** für Netz-Ziele (tote Schaltung,
  lebendiges Grundrauschen), comp/GND bleiben als Geräte-Eigensignale lebendig.
- **W31d Signalpfad:** zweistufiger History-Puffer (fast 16384 @ ~40 kSa/s
  ≈ 0,41 s; slow 8192 @ ~3,3 kSa/s ≈ 2,5 s, `channelSlow()`); tiered
  `interpAt` (fast → slow → Hold; `t < 0` → 0 V). Keine geklammerten
  Garbage-Abschnitte mehr im Normalbereich (bis ~170 ms/div vollständig).
- **W31e Single:** bei gestopfter Simulation startet Single die Simulation
  selbst (`startSim`), nach `singleDone` wieder `pauseSim` (nur wenn selbst
  gestartet; auch bei Abbruch/Power-Off/Schließen aufgelöst); Engine:
  Auto-Fallback auch für `run:'single'` (Timeout-Aufnahme, `singleDone`) —
  Single im Auto-Modus schließt jetzt immer ab; Normal-Modus wartet auf echte
  Flanke (Instrumenten-Semantik). Resync ohne sofortige Auto-Aufnahme, damit
  das Single-Arming nicht sofort eine 0-V-Rahmenaufnahme auslöst.
- **W31f:** Cursor `crosshair` bei „Tastkopf in der Hand" (v2-Parität).
- **Engine-Checks (Scratch, 7 Fälle, alle PASS):** Single+Auto ohne/mit Signal,
  Single+Normal wartet, Run+Auto lebendig (auch tote Schaltung: ~8 Aufnahmen/s),
  Reset-Resync, Level über Signal.
- **Verifikation:** tsc ✔ · eslint ✔ · npm test 26× PASS (Import/Sim/Kongruenz
  410 Teile, 2097 Pins) ✔ · next build ✔ (/, /_not-found, /apple-icon.png,
  /apple-icon1.png, /icon.svg).

**Offen/Grenzen (bewusst dokumentiert):** Zeiteinstellungen jenseits ~170 ms/div
zeigen links alte/„Hold"-Historie (Langzeit-Tier ≈ 2,5 s) — Roll-Modus damit
bis ~200 ms/div vollständig; tdiv > 2 s/div ist mit Simulations-Historie
prinzipiell limitiert. Single im **Normal**-Modus ohne Flanke wartet weiterhin
(echtes Oszi-Verhalten). Auto-Start der Simulation passiert ausschließlich für
Single (nicht für Run) — User-Entscheidung.

---

## §17 — Runde 17: Realismus, Messleitung per Klick, Fenster-Handling

**User-Auftrag:** (1) Oszi soll „so realistisch wie möglich" werden — meine
Realismus-Liste wurde komplett freigegeben, **nacheinander, so gut wie möglich**;
(2) Klick auf Anschluss (CH1) + Klick auf Leitung im Schaltplan → **Messleitung
wird hingelegt** (Ziel: Leitung ODER Bauteil-Pin, **Umstecken** ersetzt die
bestehende Leitung des Kanals); (3) Breite/Hintergrund: **Gerät bleibt 1:1**
(skaliert nur herunter), **Fenster klebt am Gerät** (Auto-Size beim Öffnen);
(4) Fenster dürfen über Titel-/Menüleiste und aus dem Screen gezogen werden,
**Rückholhilfe** zieht sie wieder hinein; (5) Fenster-Manager = **Sicherheitsnetz**
(kein Fenster geht verloren, Recall pro Fenster, keine Taskbar); (6) Library-
Drag ist zäh und bleibt außerhalb des Screens hängen → mitfixieren.

**Ask-User-Entscheidungen (bindend, Runde 17):**
1. Realismus: **alles** (Klick-Geräusche, 50-Hz-Netzbrummen auf offene Eingänge,
   Mess-/Trigger-Realismus, Tastkopf-Abgleich sichtbarer, sanftes Ein/Ausschalten)
   — nacheinander, je so gut wie möglich.
2. Messleitung: Klick auf Leitung **oder** Bauteil-Pin verbindet den angeklickten
   Kanal dorthin; bestehende Leitung des Kanals wird **ersetzt**.
3. Fenster-Zug: frei (über Leisten, aus dem Bildschirm); **Rückholhilfe** zieht
   Fenster wieder in den Screen zurück (kein hartes Clamping beim Ziehen).
4. Fenster-Manager: nur **Sicherheitsnetz** (griffig halten, Recall pro Fenster).
5. Breite: Gerät **1:1** (nur herunterskalieren, nie weich), Fenstergröße
   beim Öffnen **exakt am Gerät** (Rest = Fenster-Chrome).

**W32 — Plan:**
- **W32a Fenster-Zug & Recall:** Drag ohne Clamp (auch außerhalb des Screens),
  Transform-basiertes Ziehen (kein Ruckeln, kein Zurückspringen bei Store-
  Updates während des Ziehens — Bug: `saveScope`/`updateInstrument` ließen die
  Fenster-Position zurückschnappen); `recallInstrument` zieht Fenster per
  `openInstrument` (Symbol-Doppelklick, Geräte-Bar, Menü) wieder in den Screen;
  Library-Drag: gleicher Transform-Ansatz + Clamp in den Viewport (kein
  Hängenbleiben außerhalb).
- **W32b Auto-Size:** Oszi-Fenster misst Chassis-Höhe und setzt die Fenstergröße
  beim Öffnen exakt darauf (Chassis + Titelleiste); Fit bleibt contain,
  scale ≤ 1.
- **W32c Messleitung:** Editor-Aktion `connectProbeWire(instanceId, pinIndex,
  target)` (Pin-Punkt → L-förmige Rasterleitung → Treffer-Punkt, bestehende
  Pin-Leitungen entfernen, `refreshNets`); Oszi „Tastkopf in der Hand" + Canvas-
  Klick auf Leitung/Pin legt die Leitung; Banner/Escape angepasst.
- **W32d Realismus (nacheinander):**
  1. Klick-Geräusche (WebAudio-Synthese: Taster, Regler-Rasten, BNC stecken/
     ziehen, Netzschalter; Menü-Schalter „Tastenklick"; settings-persistiert).
  2. 50-Hz-Netzbrummen auf offene Eingänge (feste Amplitude ~mV, sichtbar nur
     bei hoher Empfindlichkeit; GND-Kopplung/⏚ unterdrücken; AC-Kopplung lässt
     es durch).
  3. Mess-/Trigger-Realismus: Messwerte-Update ~3 Hz (wie echte Geräte),
     Trigger sieht das verrauschte Signal (realistischer Jitter), HF-Rausch-
     filter im Trigger-Menü.
  4. Tastkopf-Abgleich: Über-/Unterkompensation am COMP-Rechteck deutlicher.
  5. Sanftes Ein-/Ausschalten (Screen-Fade ~0,5 s).
- **Verifikation:** tsc · eslint · npm test · next build · Preview-Check.

### §17.1 Umsetzung Runde 17 (Oszi Realismus + Messleitung + Fenster)

**Verifikation:** tsc OK · eslint sauber · `npm test` 26× PASS · `next build` OK · Engine-Scratch 16/16 PASS (Netzbrummen 75 mVss/50 Hz, Trigger deterministisch + verrauscht, BW-Limit dämpft/glättet, Abgleich-Überschwingen 9 V an 5-V-Kante, Messwerte plausibel) — danach gelöscht.

**W32a Fenster-Zug (Instruments.tsx, editor.ts, LibraryPalette.tsx):**
- Root Cause des „Fensters rutscht unter die Leisten/Springt": direkte DOM-Schreibungen auf left/top wurden von Store-Updates (saveScope → updateInstrument) überschrieben. Fix: Basis left/top bleibt im Store, das Ziehen läuft als `transform: translate3d`-Offset (GPU, kein Layout, von React nicht angerührt); bei Release wird die Endposition direkt in den DOM geschrieben, der Transform geleert und dann committet — kein Frame-Sprung.
- Keine Drag-Clamps mehr (freier Zug über Leisten/aus dem Screen, Nutzer-Entscheidung). Resize behält Mindestmaße 300×220 + `useLayoutEffect`-Repair gegen Mid-Resize-Überschreiben.
- Rückholhilfe: `recallPos()` in `openInstrument` (alle Fenster) — liegt ein Fenster außerhalb (sichtbar < 120×80 px), zieht ein Klick aufs Symbol/Device es an den Rand zurück.
- LibraryPalette: gleicher Transform-Ansatz + Viewport-Clamp (Titel bleibt greifbar) + Post-Render-Repair.
- Config-Archiv: `closeInstrument` merkt sich `win.config`; Wiederöffnen stellt die Geräteeinstellungen wieder her (kein Verlust durch Schließen).

**W32b Auto-Size (OsziScope.tsx):** `chassisRef` am `.otx-scope` misst die natürliche Chassis-Höhe (1420 breit, Fit skaliert nur herunter, nie weich/hoch); beim Öffnen (und erstmals nach Restore-Minimierung) bekommt das Fenster genau Chassis + Chrome-Rest (30/48 px), geklemmt auf den Viewport. `sized`-Flag in StoredScope erhält spätere Nutzer-Resizes.

**W32c Messleitung per Klick (Canvas.tsx, editor.ts, OsziScope.tsx):**
- `probeArmed` im Store (OsziScope leitet `held` daraus ab): BNC-Klick nimmt den Tastkopf auf, klick auf Leitung oder Bauteil-Pin im Schaltplan legt die Messleitung dorthin (Vorrang vor allen Werkzeugen, Crosshair-Cursor, Banner weist hin, Escape/„Zurückstecken" bricht ab).
- `connectProbeWire(instanceId, pinIndex, target)`: ersetzt die alte Leitung des Kanals (alles am Pin endende), legt eine Z-Route (erst aus dem Symbol heraus, dann auf Höhe des Ziels, dann hin) via `addWire`-Commit (undo-fähig); die Messung folgt automatisch über `nets[k]` = `pinNets` der Verdrahtung. `probeTarget()` bevorzugt Pins, dann Leitungsenden, sonst exakte Segment-Projektion (Verbindung über `pointOnSegment`).
- BNC-Klick auf einen verbundenen Kanal nimmt weiterhin auf (Kabel bleibt als Verdrahtung liegen, Umstecken ersetzt es beim nächsten Klick).

**W32d Realismus (oszi2 engine/render/signals/Oscilloscope/Button/Knob/sound.ts):**
1. **Klick-Geräusche** (`sound.ts`, Web-Audio-Synthese ohne Assets): Frontplatten-Tasten (Button.tsx), Menü-Bezel, Encoder-Rastung gedrosselt (Knob.tsx), BNC-Stecken (plug), Netzschalter-Relais (relay).
2. **50-Hz-Netzbrummen** (`mainsHum`, signals.ts): offene Eingänge = Antenne (ca. 75 mVss 50 Hz + Oberton + HF-Gerusch, Phasenlage pro Kanal) — auf 10 mV/div sichtbar, auf 1 V/div physikalisch unsichtbar; läuft auch bei pausierter Simulation (Netz ist „echt"); GND-Kopplung bleibt 0.
3. **Messwert-Update ~3 Hz** (render.ts `measHold`): die Messwert-Tabelle aktualisiert sich in Ruhe dreimal pro Sekunde statt bei jedem Frame, ungültig sofort bei geändertem Typ/Quelle.
4. **Trigger auf verrauschtem Signal** (`trigValue` + `noiseAt` 20-ns-Raster): die Triggerentscheidung fällt auf dem gestörten Signal — deterministisch, aber mit sichtbarem Trigger-Jitter bei ungünstigen Pegeln/Divisionen.
5. **HF-Rauschfilter physisch**: Eingangsrauschen liegt jetzt vor dem analogen Filter (Chain); das 20-MHz-BW-Limit dämpft empirisch (×0.55, wirkt auch bei langsamen Timebases, dt ≫ τ) **und** über das Tiefpass-Glied (wirkt bei schnellen Timebases). Spitzenwert-Hüllenmodell bleibt bei ×0.55.
6. **Pre-/Post-Trigger sichtbar**: Zeiten am Datenspeicher-Balken („Pre … · Post …"), Marker/Balken bestanden schon.
7. **Tastkopf-Abgleich sichtbarer**: Comp-Überschwingen ×1.6 (Fehlabgleich zeigt klar erkennbares Ringen, z. B. 9 V an der 5-V-Kalibrierkante statt flach).
8. **Sanftes Ein-/Ausschalten**: Relais-Klang + Bild-Freeze mit weicher Überblendung zu Schwarz (0,65 s) beim Ausschalten, Boot-Sequenz + weiches Aufblenden (0,45 s) beim Einschalten.

**Grenzen (dokumentiert):** Trigger-Rauschen nutzt ein deterministisches 20-ns-Rauschraster (kein Zufall pro Frame — reproducible Aufnahmen); Mess-Drossel betrifft die On-Scope-Messwert-Tabelle (die MSP-Messleiste unter dem Fenster liefert Live-Werte für die Bedienung); Library-Klemmung hält die Titelleiste im Viewport (im Gegensatz zu Fenstern, die frei ziehbar bleiben).

---

## Runde 18 – FG-2500 Funktionsgenerator (Portierung aus `function generator/`)

### §18 Plan (bindende Nutzer-Entscheidungen dieser Runde)
1. **Ton:** Audio-Monitor (Signal als Ton) entfällt komplett. Klick-Geräusche bleiben wie am Oszi (Runde 17), über Utility → Beep abschaltbar (`sys.beep`).
2. **Anschlüsse:** Symbol mit OUT1, OUT2, COM, SYNC (vollständige Belegung wie am Gerät).
3. **Alt:** „Funktionsgenerator (XFG)“ wird ersatzlos ersetzt (gleiche Bibliotheksposition, gleiche id `funcgen`); alte Projekte verlieren die XFG-Einstellungen (Nutzer-Entscheidung, keine Migration). AC-Quelle/Pulsquelle bleiben eigenständig.
4. **Platzierung/Nutzung wie das Oszi:** Symbol aus der Bibliothek platzieren, Pins verdrahten, Doppelklick öffnet das gebundene Gerätefenster, Fenster-Auto-Size/Recall wie W32. Keine Patchkabel, kein Mini-Scope-Monitor (Verdrahtung = Schaltplan, PORTING.md Abschnitt 6).

### §18.1 Architektur
- **Build-Fix (Cloudflare):** `tsconfig.json` `exclude` += `"function generator"` (wie `oszi v2`) – der nächste Build type-checked das Demo-Projekt nicht mehr (Fehler: `clsx` nicht gefunden).
- **Kern 1:1:** `function generator/src/generator/*` → `src/lib/fg/` (types/state/waveforms/fields/format/menu/reducer/core/spice), unverändert. Signalmodell bleibt analytisch/zustandslos (kein Phasenakkumulator).
- **Sim-Integration:** neuer `SourceKind` `"fg"`/`"fgSync"` in `src/lib/sim/engine.ts`; `SourceSpec.fg = { ch: Channel, power: boolean }`; `sourceValue` liefert die offene Thévenin-Spannung `rawVoltage(c,t) · (load==='50' ? 2 : 1)` bzw. TTL-Sync – die 50 Ω macht das Device (`rser: 50`), keine doppelte Lastanwendung.
- **Bauteil `funcgen`:** Pins OUT1/OUT2/COM/SYNC, Symbol als Geräteblock (Oszi-Stil), `toDevices` erzeugt 3 V-Quellen (OUT1, OUT2, SYNC je gegen COM). Zustand als `params.fgstate` (JSON von GenState).
- **Fenster:** InstrumentKind `funcgen`, gebunden an die Instanz (Doppelklick, DeviceBar-Recall). Frontpanel-Komponenten (FunctionGenerator/Lcd/Knob/Key/Bnc/Icons + CSS) mit Adapter `src/components/FgScope.tsx` (GeneratorCore pro Instanz, Spiegelung nach `fgstate` debounced). Ohne CableLayer/Scope/hooks/monitor/installBridge; Keyboard-Shortcuts nur bei fokussiertem Fenster; Panel skaliert nur herunter (1:1-Regel).
- **Verifikation:** tsc/eslint/npm test/next build + Kern-Selbsttests (`function generator/scripts/*`) + PORTING §8-Referenzwerte gegen die Kopie in `src/lib/fg`.

### 18.1 Umsetzung Runde 18 (FG-2500 + Cloudflare-Build)

**Ergebnis: alle Prüfungen grün.** Kern-Selbsttests der Demo (selftest/selftest2) unverändert (der dokumentierte „burst active"-FAIL bleibt Absicht), PORTING §8-Referenzwerte gegen die Kopie **15/15**, End-to-End (Bauteil → toDevices → Engine-Transient) **7/7** (Source-Knoten 0.953 Vpp = Theorie 0.953, RC-Mitte 0.150 Vpp = Theorie 0.150, SYNC 5,000 V TTL, OUT2 aus = 0 V), `npm test` **26× PASS** (410 Teile, 2098 Pins deckungsgleich), tsc/`next build` sauber (Cloudflare-Exclude `"function generator"` in `tsconfig.json`).

**Port-Entscheidungen (R18):**
- **Signalpfad (PORTING Weg B):** `toDevices` erzeugt 3 V-Quellen gegen COM (`params.rser: 50`, SYNC `rser: 0`) mit der offenen Thévenin-Spannung (`outputVoltage`); `sourceValue('fg')` = `outputVoltage(state, idx, t, ∞)`, `sourceValue('fgsync')` = `syncVoltage` (0/5 V TTL, folgt `state.active`).
- **Ohne Ton (Ask-User):** Audio-Monitor/`beep()` tot (nicht importiert), Klick-Geräusche wie am Oszi (`uiClick`, Utility→Beep abschaltbar), `noiseFor`/`setMonitor` werden nicht angeschlossen.
- **Bauteil/Pins (Ask-User):** OUT1, OUT2, COM, SYNC; altes XFG ersetzt ohne Migration (Params `freq/amplitude/kind` der Test-Szenarien werden ignoriert, Fallback `initialState()`).
- **Fenster:** `FgScope.tsx` = GeneratorCore pro Instanz + `params.fgstate`-Spiegel (structuredClone, typisiert gecastet, Kern unverändert), debounced 300 ms (Undo/engine.rebuild), Auto-Size 1160×545 geclampt beim ersten Öffnen (Fenster klebt am Gerät), Panel-Scale `min(1, w/1160)`, Keyboard-Capture mit Fokus-Guard + `stopImmediatePropagation`, Boot-Splash über `bootTick`-Prop (kein Render-Ref, RC-konform).
- **Platzierung wie am Oszi:** DeviceBar-Einträge `scope`+`funcgen` starten die Symbol-Platzierung; Doppelklick aufs Symbol öffnet das gebundene Gerät.
- **Lint-RC-Regeln:** keine `eslint-disable`; Demo-Copys wurden für refs-during-render/set-state-in-effect auf `bootTick`/`msgHidden`-State umgebaut.

**Verifikationsnotiz:** Der E2E-Scratch förderte einen Geometrie-Fallstrich zutage (schmale Bauteil-Pins liegen auf Leitungssegmenten — der SYNC-Pin berührte eine Diagonalleitung des RC-Tests); für die App irrelevant, da dort pin-genau verdrahtet wird.

---

## §19 — Runde 19: Fenstermanager & Geräte-Integration (Oszi + FG-2500)

**User-Auftrag (wörtlich):** „prüfe bitte einmal den Fenstermanager (verschieben ist
scheiße und fenster sind unter menüband von der hierarchie, was auch scheiße ist.
Ausserdem ist die oszi und funktionsgenerator integrations scheiße. also z.b. ist beim
oszi das fenster nicht an das oszi angepasst, genauso wie beim generator. ausserdem
funktioniert das mit dem anschließen vom funktionsgenerator nicht. Das soll so sein,
wie beim oszi, wo ich im oszi einen ch auswähle und dann im schaltplan eine leitung
oder pin."

**Befund (Code, vor der Umsetzung):**
1. **Hierarchie:** `InstrumentLayer` hing im Canvas-Container
   (`relative min-h-0 flex-1 overflow-hidden`, Workbench) → Fenster wurden an den
   Leisten abgeschnitten; ein Zug über das Menüband war unmöglich (W32a-Zusage
   „frei über Leisten ziehen" damit nicht eingehalten).
2. **Verschieben:** Magnet-Dock (Loslassen in den unteren ~56 px des Canvas = Docken),
   Drag nur an der 36-px-Titelzeile, Titel-Knöpfe starteten den Drag mit, Fenster
   konnte komplett aus dem Bild rutschen (Recall nur über Symbol-Doppelklick).
3. **Fenstergröße:** Oszi-Fenster startete mit 1500×980, das Chassis ist aber
   1420×688 (20/24/26-padding, Screen 800×480, Bezel 508, BNC-Zeile 110) → ~290 px
   toter Bench-Rand; FG-Fenster 1190×593 bei Bühne 1160×545, Panel skalierte nur
   über die Breite (Höhe nie) → bei flachen Fenstern Scrollbalken/Überstand.
4. **FG-Anschluss:** `fg2/Bnc.tsx` zeichnet die Buchsen OUT1/OUT2 (`data-jack`), es
   gab aber **keinen** Klick-Pfad in den Editor; Anschluss nur per manuellem
   Verdrahten am Symbol. Elektrisch ist der FG in Ordnung (Scratch-Test: OUT1→1 kΩ→GND
   gegen COM, 1 kHz, Vpp 1,905 V = Theorie) — es fehlte die Bedienung.

**Ask-User-Antworten (bindend, Runde 19):**
1. **Verschieben:** alles — ruckelfrei, Titelzeile bleibt immer greifbar, Magnet-Dock
   weg, Fenster auch am Rahmen/Hintergrund ziehbar.
2. **Hierarchie:** Fenster-Layer über der ganzen App (über Menüband/Leisten);
   Menü-Dropdowns, Dialoge, Toasts bleiben darüber.
3. **Fenstergröße:** Fenster = Gerät + Chrome (kein Leerraum); bei Platzmangel wird
   das Gerät maßstäblich heruntergerechnet (nie hochskaliert).
4. **FG-Anschluss:** wie Oszi — Klick auf die BNC-Buchse OUT1/OUT2, dann im Schaltplan
   Leitung/Pin anklicken; Messleitung wird von OUT1/OUT2 hingelegt (ersetzt die alte),
   Zielnetz steht danach an der Buchse. COM/SYNC bleiben manuell verdrahtet.

**W33 — Fenster-Layer (Portal):** `InstrumentLayer` rendert per `createPortal` auf
`document.body` (position: fixed, inset 0, z-index 40, pointer-events: none; Fenster
wieder auto). Menü-Dropdowns/Dialoge (z-50) und Toasts (z-100) bleiben darüber.
Dock-Zeile über der Statusleiste (bottom 26 px) statt im Canvas.

**W34 — Fenster-Zug:** Drag an Titelzeile **und** an leeren Flächen des Fenster-
Hintergrunds (Ziel-Check: Event-Target ist der Hintergrund, nicht das Gerät);
Titel-Knöpfe stoppen den Drag-Start. Kein Magnet-Dock mehr (nur Dock-Knopf); nach dem
Loslassen wird geklemmt, dass Titelzeile + ≥140 px Breite sichtbar bleiben (Rückholhilfe
`recallPos` zieht analog auf die neue Layer-Geometrie). Ruckelfrei bleibt der
Transform-Ansatz aus W32a; Ziehen an einem gedockten Fenster löst es und zieht es.

**W35 — Fenster am Gerät:** gemeinsames `DeviceFit` (aus OsziScope-Fit extrahiert,
contain, scale ≤ 1) misst Gerät und Platz; die Adapter setzen beim (ersten) Öffnen die
Fenstergröße exakt auf Gerät + Chrome (`w = Gerät + 8 + Fenster-Rahmen`,
`h = Gerät + 8 + Titelzeile+Rahmen`), geklemmt auf den Viewport. Oszi: Chassis
1420×688 → Fenster 1430×734 (statt 1500×980); FG: Bühne 1160×545 → Fenster 1170×591;
Panel skaliert jetzt auch über die Höhe (kein Scrollbalken). Nutzer-Resizes bleiben
(Flag `deviceFit` in der Fenster-Config).

**W36 — FG-Anschluss per Klick (wie Oszi):** `probeArmed` → generisches `leadArmed`
(`{instanceId, pinIndex, name?, color?}`, Oszi nutzt es unverändert); `connectProbeWire`
loggt den Gerätenamen; `FgScope` liest die Pin-Netze (`instId:0/1` = OUT1/OUT2),
Buchsen-Klick nimmt das Kabel auf (Banner `LeadBanner` wie am Oszi, Escape/„Zurück-
stecken" bricht ab), Canvas-Klick auf Leitung/Pin legt die Leitung, Zielnetz erscheint
an der Buchse („offen"/Netzname), Quelle-Pin wird auf dem Symbol markiert. Fenster
schließen/Bauteil löschen räumt `leadArmed` ab.

**Verifikation (Pflicht):** `./node_modules/.bin/tsc --noEmit` · `npx --no-install
eslint src` · `npm test` · `npx --no-install next build` + Dev-Server-Sichtprüfung +
Scratch-E2E für den Anschluss-Pfad (Store-Aktion → Leitung → Engine).

### §19.1 — Umsetzungsstand Runde 19 (2026-09-29) ✅

**W33 Fenster-Layer.** `InstrumentLayer` rendert per `createPortal(document.body)` in
eine `fixed inset-0`-Ebene (z-40, `pointer-events: none`, Fenster wieder `auto`), sodass
Gerätefenster nicht mehr im Canvas geclippt werden und Menüband/Leisten überdecken
dürfen; Menü-Dropdowns/Dialoge (z-50) und Toasts (z-100) liegen weiterhin darüber.
Die gedockten Fenster sitzen in einer Dock-Zeile über der Statusleiste
(`bottom: STATUS_BAR_H = 26px`) statt im Canvas. `Workbench.tsx` blieb unverändert
(Mountpunkt bleibt, nur ein Layout-Zweig rendert gleichzeitig → kein Doppel-Dock).

**W34 Fenster-Zug.** Drag an Titelzeile und an leeren Hintergrundflächen
(`isDragSurface` verschont Gerät/Bedienelemente via `data-no-drag`, Button, Input,
Canvas, SVG). Ruckelfrei per `transform` + `requestAnimationFrame` (W32a-Ansatz), beim
Loslassen wird die Endposition direkt ins DOM geschrieben und dann committet. Der
Dock-Magnet am unteren Rand ist entfernt; `clampWindowPos` hält Titelzeile + Greifbreite
im Bild. `recallPos` rechnet jetzt mit Viewport-Koordinaten der neuen Ebene. Der
laufende Zug liegt in `activeDrag` (modulweit), damit ein Zug an einem **gedockten**
Fenster auch nach dem Container-Wechsel weiter am Zeiger klebt.

**W35 Fenster am Gerät.** Gemeinsames `DeviceFit` (contain, `scale ≤ 1`) misst Gerät und
Platz; `useDeviceWindowFit` setzt beim ersten Öffnen die Fenstergröße auf
`Gerät + FIT_MARGIN(8) + Fenster-Chrome`, geklemmt auf den Viewport
(`SCOPE_CHASSIS 1420×688 + CHROME 10/46 = 10 px Breite, 46 px Titel+Rahmen`;
`FG_STAGE 1160×545` analog). Jedes Öffnen erzwingt `config.deviceFit = 0`, danach bleiben
Nutzer-Resizes unangetastet. Damit sitzt kein Leerraum mehr im Fenster und bei knappem
Bildschirm wird nur noch heruntergerechnet.

**W36 FG-Anschluss wie am Oszi.** `probeArmed` wurde generisch zu `leadArmed`
(`{instanceId, pinIndex, name?, color?}`) – das Oszi nutzt es unverändert. Die
FG-Buchsen OUT1/OUT2 (`JACK_PIN 0/1`) nehmen per Klick das Kabel auf (`held`-Ring,
`LeadBanner` mit Farbe/Hinweis/„Zurückstecken", Escape legt zurück), der Canvas-Klick
auf Leitung/Pin legt die Messleitung (ersetzt eine alte am selben Signalpin) und die
Buchse zeigt danach das Zielnetz. Der aufgenommene Quell-Pin wird im Schaltplan mit
pulsierendem Ring + Namenslabel markiert; die Statusleiste weist auf den nächsten Klick
hin (mobil in Kurzform). Verbindungsleitungen weichen dem Gerätesymbol aus
(`crossesBody` → Umwegpunkte über `instanceBounds`). Fenster schließen oder Bauteil
löschen räumt `leadArmed` ab. COM/SYNC bleiben manuell verdrahtet.

**Verifikation (Runde 19, alles grün):**
- `./node_modules/.bin/tsc --noEmit` — clean
- `npx --no-install eslint src` — clean (kein `eslint-disable`-Workaround)
- `npm test` — alle PASS (divider/diode/RC/BJT/opamp/MOSFET/555 + Pin-Kongruenz
  410 Teile / 2098 Pins)
- `npx --no-install next build` — ✓ (7/7 statisch prärendert, FG-Kern unverändert 1:1)
- Scratch-E2E (`tsx`, danach gelöscht): OUT1 → R1.1 ergibt Netz N001; Umstecken auf COM
  ersetzt die Leitung (genau 1 Leitung, 0 Fehler); Routenpunkte weichen dem Symbol aus
  (`[{160,180},{140,180},{140,150},{370,150},{370,200}]`); unverbundene Pins heißen
  `XFG1_nc<i>` → Buchse bleibt „offen“.
- DOM-Smoke (jsdom, danach gelöscht): Fenster liegt per Portal außerhalb des Canvas in
  der z-40-Ebene; Buchsenklick armiert `leadArmed{instanceId:"XFG1",pinIndex:0,name:"OUT1"}`,
  Banner sichtbar, zweiter Klick + Escape legen zurück; Zug über den Bildrand wird auf
  `980,760` geklemmt (800×… sichtbar), Zug aus dem Dock löst das Fenster und zieht es mit
  (+40 px Delta), Leitung liegt danach im Netz N001 am Symbolpin.

**Offene Sichtprüfung:** echte Browsersichtbarkeit (Fenster sitzt exakt am Gerät,
Dock-Zeile klickbar über der Statusleiste, Banner/Ring-Optik) ist hier nur im
Dev-Server-Live-Vorschau möglich – Headless-Browser ist in dieser Umgebung nicht
installierbar (Chromium ohne libnss3/libnspr4, Paketquellen gesperrt).

## §20 — Runde 20: Fenstermanager global (Ziehen ohne Sprung, kein Rand, Skalieren)

**Nutzer-Kritik (Runde 20):** „Verschieben ist immer noch scheiße – das Fenster springt
nach dem Verschieben an die Stelle des Cursors" · „beim Oszi ist immer noch links und
rechts etwas brauner Rand" · „man soll die Fenster leicht skalieren können" · „das soll
für alle Fenster gelten, also einen globalen Fenstermanager, basierend auf dem dann
gefixten von Oszi und Generator".

**Ursachenanalyse (belegt):**
1. *Sprung:* Die Fensterwurzel trägt `.rise` (`animation: rise 250ms both`), dessen
   Endzustand `transform: none` ist. Eine laufende/gefillte CSS-Animation schlägt jede
   Inline-Deklaration – der Zug-`transform` wurde also nie gezeichnet; das Fenster blieb
   stehen und sprang erst beim Loslassen in die neue Position („an die Cursor-Stelle").
2. *Brauner Rand:* Fensterbreite war mit Pauschal-Chrome (10 px) plus 8 px `FIT_MARGIN`
   gerechnet, das Chassis ist aber 1420 px breit → ~4–5 px Werkbank-Hintergrund
   (`BENCH_BG`, brauner Gradient) links und rechts; derselbe Rest oben/unten.
3. *Skalieren:* nur ein 14 px kleines Eck-Dreieck ohne sichtbaren Griff und ohne
   Seitenverhältnis-Sperre – Geräte dürfen nicht verzerren.

**Ask-User-Antworten (bindend, Runde 20):**
1. **Skalieren:** nur unten rechts, aber deutlich besserer Griff; **Geräte behalten die
   Proportionen**.
2. **Wachstum:** nur verkleinern – Maximum ist Gerät + Chrome (nie Leerraum); kleiner
   gezogen skaliert das Gerät maßstäblich mit (1:1 bleibt Obergrenze).
3. **Übrige Fenster:** global derselbe Manager; Größe beim Öffnen inhaltsbestimmt
   (Geräte exakt gemessen), danach frei skalierbar.

**W37 — Ziehen ohne Sprung.** Fenster bekommen eine eigene Einblendung ohne `transform`
(`.win-in`, nur Opacity). `.rise` bleibt für Dialoge. Damit greift der rAF-/Transform-Zug
ab dem ersten Pixel.

**W38 — Fenster exakt am Gerät (kein Rand).** `DeviceFit` rechnet ohne künstlichen Rand
(`avail = clientWidth/clientHeight`, `scale = min(1, …)`, 1-px-Epsilon gegen Subpixel-
Zittern). Das Fenster-Chrome (Rahmen + Titelzeile) wird per
`getBoundingClientRect`-Differenz gemessen (fraktional, kein Pauschalwert) und das
Fenster einmalig auf `Gerät + Chrome` gesetzt (Viewport-geklemmt) → Oszi und FG sitzen
kantenbündig.

**W39 — Skalieren (global, ein Griff).** Griff unten rechts, 20×20 Fangfläche, sichtbar
(drei Diagonalstriche, `cursor: nwse-resize`). Geräte-Fenster (Oszi, FG) skalieren
**proportionsgesperrt** über die Diagonale (Projektion auf die Ecke), Skala
`s ∈ [0,25 … 1]`, Maximum = Gerät + Chrome; Panel-Fenster frei, Minimum 300×220,
Maximum = Viewport. Vorschau live per DOM/rAF, Commit beim Loslassen (wie beim Ziehen).

**W40 — Ein Fenstermanager für alle Fenster.** `Window` behandelt Ziehen, Skalieren,
Dock, Minimieren, Ebene und Klemme für **alle** Instrumente gleich. `useWindowFit`
misst Chrome + Größe; Geräte nutzen `DeviceFit` (gemessen, aspect-locked, `scale ≤ 1`),
Panels eine Inhalts-Probe (`PanelProbe`: Inhalt einmal offscreen mit Entwurfsbreite
rendern → benötigte Höhe messen, Untergrenze je Art) und sind danach frei skalierbar.
`WINDOW_SPECS` (in `editor.ts`) bündelt Entwurfsbreite, Höhen-Untergrenze und
Mindestmaße je Instrument; `openInstrument` setzt für **jedes** Fenster
`config.deviceFit = 0`, damit beim Öffnen neu gemessen wird.

**W41 — Verifikation + Doku.** Pflicht-Checks plus DOM-Smoke: Fensterklasse ohne
`transform`-Animation, Griff vorhanden (nicht im Dock), Zug ändert Größe
(Seitenverhältnis erhalten, Obergrenze Gerät), Panel-Größe ≥ Inhaltsbedarf.

### §20.1 — Umsetzungsstand Runde 20 (2026-09-30) ✅

**W37 Sprung beim Verschieben behoben.** Ursache war die Eingangsanimation der
Fenster: `.rise` animiert `transform` und endet mit `transform: none` – eine
laufende/gefillte CSS-Animation gewinnt gegen den Inline-`transform` des Zugs, der
Zug-Transform wurde also nie gezeichnet und das Fenster sprang erst beim Loslassen
an die Cursor-Stelle. Fenster nutzen jetzt `.win-in` (nur Deckkraft, 150 ms);
`.rise` bleibt für Dialoge. Belegt im DOM-Smoke: Während des Ziehens steht
`transform: translate3d(120px, 100px, 0)`, nach dem Loslassen sitzt das Fenster
mit `+120/+100` an der Zeigerstelle.

**W38 Kein brauner Rand mehr.** Der „Werkbank"-Gradient aus oszi v2 (`BENCH_BG`,
`#5b4a3a → #4a3b2e`) ist aus dem Oszi-Adapter entfernt (der FG hatte seinerseits
einen selbst gebauten dunklen Verlauf – ebenfalls raus). Zusätzlich rechnet
`DeviceFit` jetzt **ohne** künstlichen Rand (`avail = clientWidth/clientHeight`,
`scale = min(1, …)`, 1-px-Epsilon), und `useWindowFit` misst das echte Fenster-
Chrome per `getBoundingClientRect`-Differenz statt Pauschal 10/46 px. Ergebnis:
Fenster = Gerät + 2 px Rahmen + Titelzeile, das Gehäuse füllt die Fläche bündig.

**W39 Skalieren am Griff (nur unten rechts, deutlich besserer Griff).** 20 × 20 px
Fangfläche mit sichtbaren Diagonalstrichen und `cursor: nwse-resize` (statt 14 px
Dreieck). Geräte-Fenster (Oszi, FG-2500) skalieren **proportionsgesperrt**
(Projektion des Zeigerdeltas auf die Diagonale, `fitAspect` = Fenstermaß im
1:1-Zustand), Panels frei. Grenzen: **Maximum = Startgröße am Inhalt** (Entscheidung
„nur verkleinern, max = Gerät" – kein Leerraum, Gerät bleibt ≤ 1:1), **Minimum**
640 × 480 (Geräte, darunter nichts mehr bedienbar) bzw. 320 × 220 (Panels); ein
teilweise außerhalb liegendes Fenster wird durch einen Zug nie ruckartig verkleinert.
Wie beim Ziehen läuft die Vorschau per DOM/rAF, committet wird beim Loslassen.

**W40 Globaler Fenstermanager für alle Fenster.** `Window` behandelt Ziehen,
Skalieren, Docken, Minimieren, Fokus-Ebene, Klemme und den Fenster-Fit für **jedes**
Instrument. `WINDOW_SPECS` (in `editor.ts`) bündelt je Art Entwurfsbreite + Höhen-
Untergrenze; `openInstrument` setzt für **alle** Fenster `config.deviceFit = 0`,
`minW`, `minH`, sodass beim Öffnen neu gemessen wird. Geräte melden ihr natürliches
Maß über `DeviceFit` (Kontext `WindowFitContext`), Panels rendert der Manager einmal
offscreen mit der Entwurfsbreite (`PanelProbe`, entfernt sich nach der Messung
selbst) und nimmt das Maximum aus Messung und Untergrenze – danach ist jedes Fenster
frei skalierbar. `restoreLocalProject` setzt Oszi-Fenster weiter auf das Gerätemaß
(1422 × 726).

**Verifikation (Runde 20, alles grün):**
- `./node_modules/.bin/tsc --noEmit` clean · `npx --no-install eslint src` clean
  (kein `eslint-disable`) · `npm test` alle PASS (410 Teile/2098 Pins) ·
  `npx --no-install next build` ✓ (7/7 statisch)
- DOM-Smoke (jsdom, danach gelöscht) – 8/8 PASS:
  1. Fensterklasse `win-in` **ohne** `transform`-Animation (Sprung-Ursache weg),
  2. Zug folgt live (`translate3d(120px, 100px, 0)`) und committet `+120/+100`,
  3. Griff vorhanden (`cursor: nwse-resize`),
  4. Zug nach außen gedeckelt auf exakt 1422 × 726 (Maximum = Gerät),
  5. Verkleinern: 940 × 480 – Untergrenze 640 × 480, Seitenverhältnis exakt
     1,9587 (Gerät),
  6. Panel bis zur Startgröße gedeckelt (322 × 318),
  7. Panel frei verkleinerbar bis 320 × 220,
  8. kein Griff im Dock.
- Dev-Server (Live-Vorschau) läuft auf Port 3000, `/` HTTP 200.

**Hinweis:** In der Sandbox wurde `node_modules` zwischen zwei Runden geleert
(Snapshot schließt `node_modules` aus); mit `npm ci` exakt aus `package-lock.json`
wiederhergestellt – `package.json`/`package-lock.json` bleiben unverändert.

## §21 — Runde 21: Fenstermanager nachgeschärft (Hintergrund, 4 Ecken, kein Aufblitzen)

**Nutzer-Kritik (Runde 21):** „den Hintergrund jeweils möchte ich doch wieder haben,
das sah schöner aus" · „doch eine 4 Ecken-Transformation" · „das Fenster blitzt nach
dem Loslassen kurz an einer anderen Stelle auf" · „beim Skalieren bleiben die Geräte
noch riesig, also eine minimale Größe scheint festgelegt zu sein" · „beim Oszi sind
trotz weißem Hintergrund immer noch links und rechts zwei große Abstände".

**Ursachenanalyse (belegt):**
1. *Große Abstände am Oszi:* Der Fenster-Fit setzte die Größe aus dem **Naturmaß**
   (1420×688). Ist der Bildschirm niedriger, begrenzt `DeviceFit` die Skalierung –
   das Fenster blieb aber auf Naturmaß-Breite stehen, sodass das heruntergerechnete
   Gehäuse zentriert in einer zu breiten Fläche saß (links/rechts Lücken).
2. *„Minimale Größe festgelegt":* Die Untergrenze war 640×480. Auf knappen
   Bildschirmen war das bereits die Startgröße; die Projektions-Untergrenze
   `lo = max(minW/w, minH/h)` ergab dann genau 1 – das Fenster ließ sich **nicht**
   mehr verkleinern.
3. *Aufblitzen nach dem Loslassen:* Der Zug schrieb `transform` und stellte beim
   Loslassen auf `left/top` um. In dem Moment, in dem `transform` geleert wurde,
   bevor React mit der neuen Position gerendert hatte, zeigte die Ebene noch die
   alte Position (klassisches Composited-Layer-Artefakt).
4. *Hintergrund:* In Runde 20 wurden Werkbank-Gradient (Oszi) und FG-Verlauf
   ersatzlos entfernt – Nutzerwunsch geht zurück auf „wieder haben".

**Ask-User-Antworten (bindend, Runde 21, nachgefragt wo nötig):**
1. Skalieren: **vier Ecken**.
2. Geräte: Proportionen behalten (unverändert), nur verkleinern bis zum Gerät.
3. Übrige Fenster: globale Behandlung, Startgröße am Inhalt, Panels frei skalierbar.

**W42 Fensterbreite folgt der Skalierung.** `DeviceFit` meldet jetzt neben dem
Naturmaß auch die **angezeigte** Größe (`dispW/dispH`); `fitWindowSize()` rechnet
daraus Fenster = *angezeigtes* Gerät + Chrome. Auf knappen Bildschirmen geht die
Breite mit, statt Lücken zu lassen. Sobald der Nutzer selbst an der Größe zieht
(Größe ≠ gemerkte Fit-Größe), fasst der Fit nichts mehr an – nur noch die Grenzen
werden gepflegt. Beim Laden eines Projekts werden Geräte-Fenster einmalig neu
ausgerichtet (`deviceFit: 0`).

**W43 Vier Eck-Griffe.** `resizeRect()` (neu: `src/lib/windows/geometry.ts`) rechnet
Zug an NW/NE/SW/SE mit Anker in der **Gegen**ecke; Geräte-Fenster halten über die
Diagonalprojektion exakt ihre Proportionen, Panels sind frei. Griffe 14 px (oben,
damit die Titel-Knöpfe frei bleiben) bzw. 18 px (unten) mit passenden Cursorn
(`nwse-resize`/`nesw-resize`). Untergrenze jetzt **320×240** (Geräte) bzw. 240×180
(Panels) – auf knappen Bildschirmen bleibt Verkleinern dadurch tatsächlich möglich.
Obergrenze bleibt die Startgröße am Inhalt („nur verkleinern, nie Leerraum").

**W43b Kein Aufblitzen mehr.** Position und Größe laufen während Zug/Skalierung
ausschließlich über `transform`/`width`/`height`; beim Loslassen werden **exakt
dieselben Werte** ins DOM geschrieben und anschließend in den Store übernommen –
es gibt keinen Frame mit abweichender Position mehr.

**W44 Hintergrund zurück (Nutzerwunsch).** Oszi: `BENCH_BG` (Werkbank-Gradient aus
oszi v2) wieder aktiv; FG: eigener dunkler Verlauf wieder aktiv. Damit der Look
„schöner Rahmen" statt „Lücke" ist, sitzt das Gerät in einem schmalen, symmetrischen
Werkbank-Rahmen (`BENCH_PAD = 12`, im Fit als `pad` enthalten, Innenabstand in den
Adaptern) – Fenster = Gerät + 2×12 + Chrome.

**Verifikation (Runde 21):**
- `./node_modules/.bin/tsc --noEmit` clean · `npx --no-install eslint src scripts`
  clean · `npm test` alle PASS (**neu: `scripts/windowtest.ts`** – 14 Prüfungen der
  Fenster-Geometrie: Startgröße mit/ohne Werkbank-Rahmen, knapper Bildschirm
  (Breite 1352 bei Höhe 692), Vier-Ecken-Anker, Proportionen, Deckel = Gerät,
  Bildschirmklemme, Panel-Mindestmaß) · `npx --no-install next build` ✓ (7/7).
- DOM-Smoke (jsdom, danach gelöscht), 6/6 PASS: vier Eck-Griffe mit korrekten
  Cursorn, Position über `transform`, NW-Zug mit Anker in der Gegenecke und
  Proportion, Deckel 1446×750 (Gerät + Rahmen), tiefes Verkleinern auf 463×240,
  und – für das Aufblitzen entscheidend – nach dem Loslassen steht **derselbe**
  Transform-Wert im DOM wie im Store.
- Dev-Server (Live-Vorschau) auf Port 3000, `/` HTTP 200.

## §22 — Runde 22: Geräte-Prüfung Oszi + FG-2500 (Aufdruck vs. Bildschirminhalt)

**Nutzer-Befunde (Runde 22):** (1) FG: gesteckte Leitung wird am Gerät nicht angezeigt –
„da wurde glaube ich nicht ganz portiert". (2) Oszi: die Beschriftung unter den BNC-Buchsen
ändert sich je nach Netz/Kanal – soll sie nicht. **Regel des Nutzers: „bei den Geräten darf
sich nur der Bildschirminhalt ändern und nicht das, was in echt nur aufgedruckt ist – die
Hardware soll sich nicht ändern."** (3) FG-Drehknopf klingt beim schnellen Drehen „komisch
und ruckelt". (4) Oszi Single/Stop: Skalierungsänderung erzeugt aus einem Signal eine
0-V-Linie, „wie wenn die Simulation im Aus-Zustand beim Anpassen neu gemessen wird".

**Ursachenanalyse (belegt im Code):**
1. *Oszi-Aufdruck:* `src/components/oszi2/Oscilloscope.tsx` Z. 636 druckt
   `sourceLabel(p.target) · {p.atten}X` unter jede Buchse. Mit der Multispice-Verdrahtung
   wird `p.target` zum **Netznamen** (N001 …) – im Original stand dort ein fester
   Prüfpunkt (TP1/GEN/COMP). Also: Portierungsfehler, nicht Originalverhalten.
2. *Single/Stop-Neumessung:* `Engine.step()` hat einen `run === 'stop'`-Zweig, der bei
   `keyChanged` (Änderung von `s.ch`, `s.tdiv`, `s.hDelay`, `acq.mode`, **`env.probes`**)
   **neu akquiriert**. `settingsKey()` enthält u. a. `env.probes`; `connectProbeWire`
   schreibt die Verdrahtung um → Key ändert sich → im Stop/Single wird neu gemessen –
   bei pausierter Simulation also 0 V. Ein echtes Oszi nutzt im Stop den **Speicher**.
3. *FG-Drehknopf:* `Knob.onTurn` erzeugt pro Raste einen eigenen WebAudio-`uiTick()`
   (`for i < Math.min(|steps|, 6)`). Beim schnellen Drehen (Trackpad/Mausrad liefert
   große Deltas) starten alle Rastgeräusche **gleichzeitig** → Phasing/Verzerrung, und
   das Rendering läuft pro Mausrad-Event (kein rAF, keine Batchung) → Ruckeln.
4. *FG-Kabel:* Der Port hat `CableLayer`/`cables.ts` bewusst weggelassen (Patchfeld der
   Demo). Ersetzt werden soll das nur für die Anzeige „hier steckt eine Leitung" –
   weiterhin Tooltip + jetzt sichtbarer Stecker.

**Ask-User-Antworten (bindend, Runde 22):**
1. Oszi-Buchsen: **fest „CH1…CH4"**; die Dämpfung (1X/10X) wandert als Etikett auf den
   **Stecker**.
2. Netzname: **nur im Tooltip** (Hardware unverändert), kein Text im Display.
3. FG-Kabel: **Stecker + Kabelstummel + Original-Steckgeräusche** (`uiPlug`/`uiUnplug`).
4. Oszi Stop/Single: **Datensatz halten** – V/div ändert nur den Maßstab des
   gespeicherten Signals, t/div wird im Stop ignoriert, neu gemessen erst wieder mit Run.

**W45 Oszi-Aufdruck fest.** Unter der BNC steht `CH1…CH4`; der Stecker (bzw. die freie
Buchse) trägt das Dämpfungs-Etikett `1X`/`10X`. Netzverbindung weiterhin nur im Tooltip
und im Bildschirminhalt (MATH/Cursor/Mess-Quellen dort wie gehabt).

**W46 Stop/Single hält den Datensatz.** `settingsKey()` ohne `env.probes` und ohne
`s.ch`; im Stop-Zweig wird **nicht** neu akquiriert (nur der gespeicherte Datensatz
gerendert, V/div/Position als reine Darstellung). Neu messen erst bei Run/Single.

**W47 FG-Drehknopf.** Rastgeräusche werden ge-batcht (max. 1 pro ~28 ms, harte Grenze),
die Drehung wird pro Frame (rAF) verrechnet statt pro Event – kein gleichzeitiges
Anschlagen vieler Ticks mehr, gleichmäßiger Klang und flüssige Bewegung.

**W48 FG-Stecker sichtbar.** `FgScope` leitet aus der Netzliste ab, welche Buchse belegt
ist (Netz = `netResult.pinNets[instId:pin]`, `*_nc*`/`0` = frei, wie beim Patchfeld);
das Panel zeichnet Stecker + Kabelstummel (`Plug`) an belegten Buchsen, hält die
Trefferfläche der Buchse frei (Klick bleibt am Panel) und spielt beim Stecken/Ziehen
`uiPlug`/`uiUnplug`.

**Verifikation:** Pflicht-Checks (tsc/eslint/npm test/build) + neue Scratch-Tests:
Engine-Test (Stop + geänderte vdiv → gleicher Datensatz, Run → neue Akquise) und
Panel-Test (Buchsen-Aufdruck fest, Stecker nur bei belegter Buchse).

### §22.1 — Umsetzungsstand Runde 22 (2026-09-30) ✅

**W45 Oszi-Aufdruck ist fest.** Unter den BNC-Buchsen steht jetzt immer `CH1…CH4`
(vorher `sourceLabel(p.target) · {p.atten}X`, mit der Verdrahtung also der Netname
wie „N001 · 10X" – ein Portierungsfehler). Das Dämpfungs-Etikett `1X`/`10X` wanderte
wie am echten Tastkopf **auf den Stecker** (farbiger Aufdruck auf dem Steckergehäuse),
der Netname steht nur noch im Tooltip. Im DOM-Smoke belegt: sichtbarer Text enthält
„CH1…CH4" und kein „N001", der Tooltip schon.

**W46 Stop/Single hält den Datensatz.** Ursache: `Engine.step()` akquirierte im
`run === 'stop'`-Zweig bei jedem `keyChanged` neu, und `settingsKey()` enthielt
`env.probes` (die Verdrahtung) – schon ein umgesteckter Tastkopf löste also eine
Neumessung aus (bei pausierter Simulation: 0 V). Jetzt: `settingsKey` ohne
`env.probes`, und der Stop-Zweig misst grundsätzlich **nicht** neu; V/div und
Position wirken nur als Darstellung auf den gespeicherten Datensatz. Neu aufgenommen
wird erst bei Run/Single. Test (`tsx`, danach gelöscht): im Stop ändern Skalierung
und Umstecken nichts (Datensatz identisch, `newAcq = false`), Run nimmt wieder auf.

**W47 FG-Drehknopf ruckelt/klingt nicht mehr komisch.** Zwei Ursachen: (a) pro Raste
ein eigenes WebAudio-`uiTick()` – beim schnellen Drehen schlugen bis zu sechs Ticks
gleichzeitig an (Phasing/Verzerrung); (b) pro Mausrad-Event ein React-Update und ein
`turn()`-Aufruf. Jetzt: höchstens ein Rastgeräusch je 28 ms, Rasten werden gesammelt
und **einmal pro Frame** verrechnet (Mausrad und Ziehen) – gleichmäßiges Ratscheln,
flüssige Bewegung.

**W48 FG-Stecker sichtbar (Portierungs-Nachtrag).** Der Port hatte `CableLayer`/
`cables.ts` bewusst weggelassen (Patchfeld der Demo) – dadurch war an den Buchsen
nicht zu sehen, ob eine Messleitung steckt. `FgScope` leitet die Belegung aus der
Netzliste ab (`instId:0/1`, `*_nc*`/`0` = frei) und das Panel zeichnet an belegten
Buchsen einen **BNC-Stecker mit Kabelstummel** in Aderfarbe (`fg2/CablePlug.tsx`,
reine Anzeige, `pointer-events: none` – der Klick bleibt an der Buchse). Beim Abziehen
(Aufnehmen) bzw. Aufstecken (Zurücklegen) spielen die **Original-Steckgeräusche**
`uiUnplug`/`uiPlug`.

**Nutzerregel umgesetzt:** „nur der Bildschirminhalt darf sich ändern, nicht der
Aufdruck." Deshalb entfiel auch die in Runde 19 gebaute dynamische Beschriftung unter
den FG-Buchsen („→ N001"/„offen"); Verbindung zeigt jetzt der Stecker, der Netname
steht im Tooltip. „in der Hand" bleibt als Bedien-Rückmeldung (wie das aufleuchtende
Lämpchen), ebenso die LEDs der Tasten.

**Verifikation (Runde 22):**
- `./node_modules/.bin/tsc --noEmit` clean · `npx --no-install eslint src scripts`
  clean · `npm test` alle PASS (inkl. 14 Fenster-Geometrie-Prüfungen) ·
  `npx --no-install next build` ✓ (7/7 statisch)
- Scratch-Tests (danach gelöscht), 10/10 PASS: Engine hält im Stop den Datensatz
  (Skalierung + Umstecken ohne Neuaufnahme, Run nimmt wieder auf); DOM-Smoke: Aufdruck
  `CH1…CH4` fest, kein Netname im sichtbaren Text, Netname im Tooltip, Dämpfungs-Etikett
  am Stecker, FG-Stecker nur bei echter Verbindung (nicht bei `0`/offen).
- Portierungs-Notizen gelesen: `function generator/PORTING.md` (Abschnitt „Patchfeld/
  Messleitungen" und „Frontpanel-Realismus" = Grundlage für W47/W48). Eine
  Portierungs-MD zu `oszi v2/` liegt im Repo **nicht** vor (nur die FG-Datei) – die
  Oszi-Regeln (Aufdruck fest, Stop = Speicher) sind aus dem 1:1-Code von `oszi v2`
  abgeleitet und im Audit dokumentiert.

## §23 — Bestandsaufnahme Runde 23 (nur Analyse, keine Änderung am Verhalten)

**Auftrag:** „Leitungsverlegung und Bauteilanordnung — mach dir selber ein Bild, vielleicht
findest du schon das, was ich meine (noch nichts ändern)." Untersucht wurden Code
(`Canvas.tsx`, `state/editor.ts`, `lib/schematic/*`) und das Verhalten über einen
Scratch-Lauf gegen die Store-/Modell-API (Zahlen unten sind gemessen, nicht geschätzt).

### Leitungsverlegung

**L1 · Raster-Falle im Auto-Router (schwer).** `routeOrthogonal()` (tools.ts) rastet
Start **und** Ende immer auf das 10-px-Raster — unabhängig vom Schalter „Raster
einrasten" (der nur den Mauszeiger betrifft). Liegt ein Pin nicht auf dem Raster
(Bauteil mit ⇧+G frei gezogen, importiert, per JSON gesetzt), beginnt/endet die
Leitung bis zu ~7 px daneben. Messung: Pins bei (273,197)/(473,203) → Leitung
(270,200)…(470,200), Abstand je 4,2 px, Netze **beide `_nc`** – die Leitung hängt in
der Luft, ohne Warnung. Mit `autoRoute = false` wird die L-Route aus den exakten
Pins gebaut (dann verbunden, aber ggf. quer durchs Symbol).

**L2 · Kein Verbindungspunkt (Junction) gezeichnet.** Verbindungen entstehen im
Modell über gleiche Koordinaten **und** über Punkte, die auf einem Segment liegen
(`pointOnSegment`, model.ts) — gezeichnet werden aber nur Polylinien. Messung:
Leitung endet mitten auf einer anderen → Netz `N001` (elektrisch verbunden), aber kein
Punkt im Bild. Damit ist optisch nicht unterscheidbar, ob ein T-Kontakt verbunden ist
oder eine Kreuzung nur aussieht wie eine Verbindung. Kreuzt eine Leitung eine andere
genau in einem Knickpunkt, sind sie sogar verbunden, ohne dass es sichtbar wäre.

**L3 · Keine Leitungs-Hygiene.** Zweimal dieselben Pins verbinden → zwei Leitungen
zwischen denselben Punkten (0 Fehler, 0 Warnungen); zweimal derselbe Pin → Leitung mit
zwei identischen Punkten (Länge 0). Es gibt kein „Aufräumen"/„redundante Leitung
entfernen", und `buildNets` prüft nur unbekannte Bauteile, Faults, fehlende Masse und
„keine simulierbaren Teile".

**L4 · Bearbeitung nur punktweise.** Es lassen sich nur einzelne Stützpunkte ziehen
(mit Führungslinien/Snap); kein Segment-Verschieben, kein Punkt einfügen/entfernen per
Doppelklick, kein Orthogonalisieren/Glätten, kein Warnen beim Abreißen einer
Verbindung. Offene Pins sind im ERC nicht gemeldet; ERC-Marker werden per
Textsuche an Bauteile geheftet (Fehlerobjekte sind Strings ohne Koordinaten).

**L5 · Was funktioniert.** Der A*-Router umgeht Bauteile nachweislich (Test: Hindernis
in der Mitte → Route läuft darunter durch, die einfache L-Route würde schneiden);
Leitungen führen beim Verschieben eines Bauteils rechtwinklig nach (`orthoFollow`,
W2/W26, Hindernis-Ausweichen für die Knickvariante); beim Ziehen eines Punktes
erscheinen Ausrichtungs-Führungen.

### Bauteilanordnung

**B1 · Drehen/Spiegeln reißt die Verdrahtung ab (schwer).** `rotateSelection`/
`mirrorSelection` ändern nur `rot`/`mirror`; Leitungen werden nicht nachgeführt.
Messung: Pin (270,200) → nach 90° (300,170), Leitungsende bleibt bei (270,200) →
42,4 px Abstand, Netz kippt von `N001` zu `r1_nc0`. Keine Warnung, kein Hinweis.

**B2 · Keine Kollisions-/Überlappungsprüfung.** Zwei Bauteile exakt übereinander
(identische BBoxen) → 0 Fehler, 0 Warnungen; Ziehen erlaubt das jederzeit.

**B3 · Keine Ausricht-/Verteil-/Aufräum-Befehle.** Menü „Bearbeiten" bietet nur
Undo/Redo, Kopieren/Einfügen/Duplizieren, Alles auswählen, Löschen. Es fehlen
Ausrichten (links/oben/mitte), Verteilen/gleicher Abstand, Aufräumen/Auto-Layout,
„Leitungen neu verlegen". Vorhanden ist immerhin das Figma-artige Führungslinien-
Einrasten beim Ziehen (Kanten/Mitten, Schwelle 8 px).

**B4 · Einfügen immer +20/+20 px.** `pasteClipboard`/`duplicateSelection` verschieben
starr um 20 px (2 Raster), d. h. die Kopie kann auf einer Nachbar-BBox landen; bei
mehrfachem Einfügen gibt es keine Kaskade.

**B5 · Platzierung.** Über die Bibliothek rastet die Platzierung im Canvas ein; der
Store (`addInstance`) rastet nicht → programmatische/importierte Platzierung kann
krumme Koordinaten erzeugen (siehe L1).

### Nebenbei aufgefallen (nicht angefasst)
- `oszi v2/PORTIERUNG.md` lag im main-Branch (dort per „Add files via upload"
  nachgereicht) und wurde in unseren Branch übernommen — damit ist die Doku im
  Branch vorhanden und gelesen.
- **Abweichung zur Doku (bewusst, Nutzerentscheidung R22):** §10.1/§10.2 der
  PORTIERUNG.md sagt „`settingsKey` serialisiert `env.probes` … Beibehalten" und „im
  Stop wird bei geänderten Settings neu erfasst". Runde 22 hat auf Nutzerwunsch das
  Gegenteil umgesetzt (Stop hält den Datensatz, `env.probes` ist aus dem Key
  entfernt). Eine doku-konforme Variante wäre: `probes` im Key lassen, aber im Stop
  nur dann neu erfassen, wenn die Simulation läuft (dann gäbe es keine 0-V-Linie aus
  pausierter Simulation und trotzdem die von der Doku gewünschte Neuaufnahme).
  Entscheidung offen.

## §23.1 — Fixplan Runde 23: Leitungsverlegung + Bauteilanordnung

**Auftrag:** „Plane die Fixes und arbeite sie der Reihe nach ab, wichtigste zuerst."
Reihenfolge deshalb nach Risiko: erst, was die Elektrik still falsch macht, dann
Optik/Bedienung. Jeder Block wird einzeln verifiziert (tsc, eslint, `npm test`, build).

### Neue Messung vorweg (verschärft L1 erheblich)
Die **Beispielschaltungen sind teils elektrisch tot**: In den 8 `PRESETS` liegen 67 von
220 Leitungsenden 2–9 px neben dem Pin (die Beispiele wurden mit gerundeten Koordinaten
geschrieben, die Pins liegen aber nicht immer auf dem 10er-Raster). Folge laut `buildNets`:
`astable555` = 8 von 17 Netzen ohne Verbindung, `logic-counter` = 6 Netze ganz ohne Pin.
Prototyp „Enden auf Pins rasten" (Toleranz 15 px, Geometrie bleibt orthogonal, gemessen):
**0 leere Netze in allen 8 Beispielen**, `astable555` nc 8→1, `logic-counter` nc 20→4 (Rest
= echte unbeschaltete Bauteil-Pins).

**Korrektur zur Bestandsaufnahme §23/L4:** „kein Punkt einfügen/entfernen" war falsch —
Doppelklick auf ein Segment fügt einen Stützpunkt ein, Doppelklick auf einen Griff löscht
ihn. Offen sind nur Segment-Verschieben und ein Aufräum-/Begradigungsbefehl.

### Stufe A — elektrisch (unsichtbare Fehler zuerst)
- **W49 · Leitungsenden an Pins rasten (L1).** Neues `snapWiresToPins(doc, tol)` in
  `model.ts`: jedes Leitungsende, das ≤ 15 px neben einem Pin liegt, wandert exakt auf den
  Pin, das Nachbarsegment wird orthogonal mitgezogen (Knick einfügen oder Nachbarpunkt
  verschieben). Angewendet auf Beispiele (`PRESETS`) und Importe (SPICE/LTspice) mit
  Logzeile „N Leitungsenden an Pins ausgerichtet". Gespeicherte Nutzerdokumente werden
  **nicht** still verändert. Zusätzlich: `addInstance` rastet aufs Raster (B5).
- **W50 · Auto-Router exakt am Pin (L1).** `routeOrthogonal` rastet nicht mehr absolut aufs
  Raster, sondern legt das Gitter durch den Startpunkt (Offset-Gitter) und hängt am Ende
  ein kurzes, exaktes L bis zum Pin an (Variante ohne Bauteilschnitt gewählt). Damit gibt
  es keine 2–9-px-Lücken mehr, auch bei Off-Grid-Pins.
- **W51 · Netzprüfung sichtbar (L1/L3).** `buildNets` meldet zusätzlich: „Leitungsende ohne
  Anschluss", „Leitung ohne Länge" (2× derselbe Punkt), „Leitung doppelt vorhanden"
  (gleiche Endpunkte/Geometrie) – gedeckelt, damit das Fehlerfenster lesbar bleibt. Offene
  Enden bekommen zusätzlich eine kleine Markierung auf dem Canvas (offener Kreis), damit der
  Fehler dort auffällt, wo er entsteht.
- **W52 · Drehen/Spiegeln zieht Leitungen nach (B1).** `rotateSelection`/`mirrorSelection`
  merken sich die Pin-Positionen vor der Transformation, setzen betroffene Leitungsenden auf
  die neuen Pin-Positionen und führen die Knicke orthogonal nach (Hindernis-Ausweichen wie
  W2/W26). Bleibt ein Ende ohne Pin, wird es als offen markiert (Warnung) statt still zu
  brechen.

### Stufe B — Optik/Bedienung
- **W53 · Verbindungspunkte zeichnen (L2).** `buildNets` liefert die Punkte, an denen
  elektrisch ≥ 3 Anschlüsse zusammenkommen (T-Kontakt, Kreuzung, Pin auf Segment); der
  Canvas zeichnet dort gefüllte Punkte in Leitungsfarbe. Damit ist ein T sichtbar verbunden
  und eine Kreuzung nicht mehr „unsichtbar verbunden".
- **W54 · Segment verschieben (L4).** Ein Segment lässt sich (abseits der Griffe) greifen
  und senkrecht zu seiner Richtung ziehen; die Nachbarsegmente strecken sich, Raster-Snap
  und Undo inklusive.
- **W55 · Anordnen/Aufräumen (B3/B4).** Menü „Bearbeiten": Ausrichten (links/rechts/oben/
  unten/mitte waagerecht/mitte senkrecht), Verteilen (waagerecht/senkrecht), „Leitungen
  begradigen" (Stützpunkte aufs Raster, Segmente exakt orthogonal). Einfügen bekommt eine
  Kaskade: die Kopie landet nicht mehr auf der Vorlage.
- **W56 · Rest (B2/B5).** Überlappungswarnung, wenn zwei Bauteile sich fast deckungsgleich
  überlagern; `addInstance` rastet (siehe W49).

## §23.2 — Umsetzung Runde 23 (W49–W56, alles verifiziert)

**Reihenfolge wie geplant:** erst die elektrisch gefährlichen Sachen (A), dann Optik/Bedienung
(B). Verifikation: `tsc --noEmit` ✓, `eslint src scripts` ✓ (0 Treffer), `npm test` ✓
(neu dabei: `scripts/wiretest.ts`, 39 Prüfungen), `next build` ✓.

### Stufe A — elektrisch
- **W49 · `snapWiresToPins` (model.ts, Toleranz 15 px).** Enden ≤ 15 px neben einem Pin
  wandern exakt auf den Pin, das Nachbarsegment wird orthogonal mitgezogen
  (`attachWireEnd` + `cleanWirePoints`). Angewendet beim Erzeugen der Beispiele und nach
  SPICE-/LTspice-Import; gespeicherte Nutzerdokumente bleiben unangetastet (dort repariert
  auf Wunsch der Menüpunkt **„Leitungen prüfen & reparieren"**). `addInstance` rastet
  jetzt ebenfalls aufs Raster (B5).
  - Wirkung, gemessen: die 8 Beispiele hatten **67 von 220 Leitungsenden 2–9 px neben dem
    Pin**; `astable555` 8 von 17 Netzen ohne Verbindung, `logic-counter` 6 Netze ganz ohne
    Pin, `buck` hatte den **MOSFET-Drain nicht an der Versorgung**. Nach dem Rasten:
    `openEnds = 0`, keine leeren Netze, alle Beispiele mit echten Netzen
    (`logic-counter` 35 → 15 Netze = die vorher getrennten Teile sind jetzt verbunden).
  - Datenfehler, die die neue Prüfung gefunden hat und die behoben sind: VCC-Schiene in
    `astable555` endete bei x = 700 im Nichts (jetzt bis zum letzten Abzweig 500).
- **W50 · Auto-Router endet exakt am Pin.** Das A*-Gitter wird vom Startpunkt aufgespannt
  (Offset-Gitter statt absolutem Raster) und der Gitterpunkt am Ende wird **in
  Startrichtung** gewählt; die kurzen Reststrecken (≤ halbe Rasterweite) werden als
  exaktes L angeschlossen, Variante ohne Bauteilschnitt. Nachweis: Pins (273,197)/(473,203)
  ⇒ Route beginnt/endet exakt dort, bleibt orthogonal, umgeht die BBox; auf dem Raster
  unverändert gerade.
- **W51 · Netzprüfung sichtbar.** `buildNets` meldet zusätzlich „Leitungsende ohne
  Anschluss (x, y) – hängt in der Luft", „Leitung ohne Länge", „Leitung doppelt vorhanden"
  (gedeckelt auf 12 + Sammelzeile) und liefert `openEnds` an den Canvas, der offene Enden
  als kleinen roten Kreis markiert (nicht während des Ziehens). Testfall mit 6 Leitungen:
  4 offene Enden, alle drei Warnungsarten erkannt.
- **W52 · Drehen/Spiegeln reißt nicht mehr ab.** Vor der Transformation werden die
  Pin-Positionen festgehalten (`collectPins`), Leitungsenden darauf exakt neu gesetzt
  (`reattachWiresToPins`, orthogonal nachgezogen) und die Zahl der mitgeführten Enden
  geloggt. Nachweis: nach 90° sitzen beide Enden exakt auf den neuen Pins, Netz bleibt
  verbunden (vorher 42,4 px Lücke, Netz `r1_nc0`).

### Stufe B — Optik/Bedienung
- **W53 · Verbindungspunkte.** Die alte Punkte-Heuristik („derselbe Punkt in ≥ 2 Leitungen")
  ist ersetzt: `buildNets` liefert echte Verbindungspunkte (Grad ≥ 3: T-Kontakt, Kreuzung,
  Pin auf Leitung), Canvas zeichnet sie bildschirmkonstant. Eine Ecke aus zwei
  Leitungsenden ist bewusst **kein** Punkt. Beispiele: 15 Verbindungspunkte, 0 Fehlpunkte.
- **W54 · Segment verschieben.** Segment greifen und senkrecht ziehen (Raster-Snap,
  Nachbarsegmente strecken sich, Undo-fähig, neuer Store-Befehl
  `setWireSegmentOffset`). `Alt`-Ziehen behält das bisherige Mitziehen der ganzen Auswahl;
  in einer Mehrfachauswahl mit Bauteilen bleibt es ebenfalls beim Verschieben der Auswahl.
- **W55 · Anordnen/Aufräumen.** Neu im Menü „Bearbeiten": Ausrichten (links/oben/mittig),
  Verteilen (gleicher Abstand), **Leitungen begradigen (⇧L)** und **Leitungen prüfen &
  reparieren**. Das Kontextmenü von Bauteilen bietet den vollen Satz (⇤ ⇥ ⇧ ⇩ ↔ ↕ +
  Verteilen waagerecht/senkrecht), das Kontextmenü einer Leitung jetzt echtes „Leitung
  begradigen (Raster + rechte Winkel)" statt des alten Mittelpunkte-Wegwerfens. Einfügen
  bekommt eine Kaskade: +20 px pro weiterer Einfügung und zusätzlich so lange weiter, bis
  die Kopie auf keinem fremden Bauteil mehr liegt.
- **W56 · Überlappungswarnung.** Bauteile, die sich zu ≥ 90 % überdecken, werden gemeldet
  (Schwelle bewusst streng: angrenzende Symbole wie Masse an der Quelle sind normal und
  lösen nicht aus – geprüft, alle 8 Beispiele warnungsfrei).

### Neue Befunde (aus der Reparatur sichtbar geworden, nicht in dieser Runde gefixt)
- **`buck`-Beispiel rechnet nicht durch.** Nach der Reparatur ist der Schaltregler
  elektrisch korrekt verdrahtet (vorher hing der MOSFET-Drain in der Luft, deshalb
  „konvergierte" die Analyse über getrennte Teilnetze). Jetzt bricht die Transientenanalyse
  mit „Keine Konvergenz (Newton-Raphson Grenze erreicht)" ab – geprüft mit Schrittweiten
  von 2e-5 bis 5e-7 s, mit 2 kHz/5 kHz PWM, mit langsameren Gate-Flanken und mit
  stärkerem FET: immer derselbe Abbruch. Das ist ein **Simulationskern-Thema** (steifes
  Schalten von MOSFET + Schottky-Diode im Fest-Schritt-MNA), kein Verdrahtungsfehler →
  offener Punkt für eine eigene Runde; `scripts/presettest.ts` (nicht Teil von `npm test`)
  zeigt es.
- `emitterschaltung`: Masse-Symbol grenzt direkt an die Quelle (84 % Überdeckung) – bewusst
  unter der Meldeschwelle, optisch unauffällig.

---

## §24 — Runde 24: Kreuzungen wie in Multisim, Oszi-Doku mit Standbild, buck-Konvergenz

**Auftrag (wörtlich):** „das mit den kreuzungen soll so wie in multisim sein" · „die doku soll
eingehalten werden mit ausnahme wenn das bild steht, also bei stop oder single. wie bei einem
echten oszi halt." · „Bitte finde danach die Ursache für deinen Befund den du genannt hast. Und fixe
ggf." · „Bitte beachte, dass du alles, was du machst dokumentiert werden soll."

**Reihenfolge:** erst die Ursache des buck-Befunds (blockiert das Vertrauen in den Simulator), dann
das Kreuzungsmodell (ändert die Netze), dann die Oszi-Akquise. Verifikation: `tsc --noEmit` ✓,
`eslint src scripts` ✓, `npm test` ✓ (jetzt inkl. `scripts/ozsitest.ts` + `scripts/presettest.ts`),
`next build` ✓.

### 24.1 · buck-Konvergenz — Ursachen und Fixes (W57–W59, `src/lib/sim/engine.ts`)

Der in §23.2 als offener Punkt notierte Abbruch („Keine Konvergenz (Newton-Raphson Grenze
erreicht)", FAIL t = 2,51e-4 s) hatte **drei** Ursachen; alle drei sind behoben.

- **W57 · Dioden-Stamp mit Bahnwiderstand `rs` war zahlenmäßig kaputt.**
  Vorher: `geff = 1/(1/gd + rs)` und `ieqEff = (id − gd·vd)·(geff/gd)`. Bei großen Strömen ist
  `id − gd·vd` die Differenz zweier riesiger Zahlen → die Kennlinie wurde grob falsch.
  Nachweis (`scripts/_tmp_bucktrace2.ts`, dt 1 µs): bei gate = 0 (t = 221 µs) sprang der
  Schaltknoten auf **SW = −5,401 V** und `extra.id` stand still auf **0,272 A**, obwohl 6,05 A
  durch die Spule flossen — die 1N5819 fiel also mit 5,4 V ab statt ≈ 1 V.
  Fix: die innere Sperrschichtspannung `vj` wird so bestimmt, dass `vd = vj + I(vj)·rs` gilt
  (Newton auf eine Unbekannte, ≤ 50 Schritte, danach das übliche `pnjlim`); gestempelt wird
  `geff = 1/(1/gd + rs)`, `ieqEff = id − geff·vd`, Zustand `extra.vj`. Nachher an derselben
  Stelle: **SW = −1,038 V bei 6,426 A** = vj (≈ 0,4 V) + 6,43 A · 0,1 Ω — physikalisch richtig.
- **W58 · fehlende Drain-Source-Klemmung im MOSFET.** Ohne sie machte der Newton-Schritt zwischen
  den Iterationen Sprünge von 24 V auf −257 V (Oszillation FET ↔ Diode). Fix: `limvds(vnew, vold)`
  nach SPICE3 direkt vor `fetlim`; im M-Fall wird `vds` geklemmt und als `limited` gemeldet.
- **W59 · Divergenz wurde als Konvergenz akzeptiert.** `converged()` prüfte nur *relative*
  Toleranzen — je größer der Wert, desto leichter „konvergiert". Dadurch konnte ein entgleister
  Schritt mit 1e17 V als gültig durchgehen (der Buck „lief" bei 2e-6 s bis ±1e18 V). Zwei Fixes:
  1. **SANE_LIMIT = 1e9:** Knotenspannungen/Ströme über 1e9 gelten als Nicht-Konvergenz → der
     Schritt wird verworfen und kleiner wiederholt.
  2. **Zustands-Rollback (`savePoint`/`restorePoint`):** ein verworfener Schritt startet wieder
     exakt beim letzten akzeptierten Zustand (`x`, `vprev`, `extra`, `outputs`), vorher lief er aus
     dem entgleisten Iterationsstand weiter.

**Messung (`scripts/_tmp_buckcheck.ts`, `runTransient`, stopTime 20 ms, VOUT/SW/N002):**

| stepTime | vor W57–W59 | nach den Fixes |
|---|---|---|
| 2e-5 s | FAIL (5 steps/11 rej, Endwert 4,81 V) | OK · 1003 steps/2 rej · Endwert **9,92 V** |
| 1e-5 s | FAIL | OK · 2008/5 · **9,81 V** |
| 2e-6 s | „OK", aber VOUT ±1e18 (Endwert −3,6e17) | OK · 10034/25 · **11,09 V** |
| 1e-6 s | FAIL | OK · 20007/6 · **10,81 V** |

Dazu die beiden Dauerläufe: adaptiver Schritt bis 20 ms **ohne Boom**, fester Schritt 2e-6
über 40 000 Schritte **ohne Boom** (vorher Ausreißer auf SW = −3,58e17 bei t = 2,3 ms).
`scripts/presettest.ts` ist jetzt grün: `PASS buck … tran=true | N001:23.99..24.00 N002:0.00..34.00
SW:-1.35..24.00 VOUT:0.23..16.08`. Beide Prüfskripte sind in `npm test` aufgenommen; die
Temporärskripte (`_tmp_buck*.ts`) werden vor dem Commit gelöscht.

### 24.2 · Kreuzungen wie in Multisim (W61)

Bisher galt: **jeder** Leitungs-Stützpunkt, der auf einer fremden Leitung lag, war leitend —
ohne Punkt im Bild, also unsichtbar verbunden. Jetzt gilt die Multisim-Regel: **nur mit Punkt
ist die Kreuzung leitend.**

- **Modell** (`src/lib/schematic/model.ts`): neues `SchematicDoc.junctions` (Liste ausdrücklicher
  Verbindungspunkte). `buildNets` verbindet nur noch an **Anschlussstellen**: Leitungsenden, Pins,
  Netzlabels und gesetzten Verbindungspunkten. Ein Knick mitten in einer Leitung ist keine
  Anschlussstelle — kreuzen sich dort zwei Leitungen, bleiben die Netze getrennt. Die Ausgabe
  `junctions` liefert die Punkte fürs Zeichnen (T-Kontakte automatisch, ausdrückliche Punkte immer;
  ein Punkt ohne Leitung wird gemeldet).
- **Zeichnen** (`src/state/editor.ts`): `addWire` setzt automatisch einen Punkt, wenn ein
  Leitungsende auf einer anderen Leitung landet (T-Kontakt). Eine Überkreuzung erzeugt keinen
  Punkt. Dieselbe Automatik greift, wenn ein Bauteil beim Setzen automatisch an eine bestehende
  Leitung angeschlossen wird.
- **Kontextmenü** (Canvas, Leitung): an einem Treffpunkt zweier Leitungen erscheint
  **„Verbindungspunkt setzen (Kreuzung verbinden)"** bzw. **„…entfernen"**; der Store-Befehl
  `toggleJunction` schnappt auf den exakten Treffpunkt (`wireJunctionCandidates`).
- **Kopieren/Einfügen** nimmt die Punkte auf den kopierten Leitungen mit.
- **Altbestand** (`src/lib/storage.ts`): `isDoc` akzeptiert das neue Feld; `migrateDoc` trägt beim
  Laden an allen Stellen einen Punkt nach, die vorher tatsächlich leitend waren (Stützpunkt auf
  fremder Leitung). Eine reine Kreuzung mitten auf zwei Leitungen war auch vorher nicht leitend
  und bekommt deshalb keinen Punkt — gespeicherte Schaltungen ändern ihr Verhalten also nicht,
  sehen aber jetzt wie in Multisim aus.
- **Tests** (`scripts/wiretest.ts`, 17 neue Prüfungen): Kreuzung ohne Punkt getrennt, mit Punkt
  verbunden; T-Kontakt verbindet und bekommt einen Punkt; Migration erhält den Altkontakt und
  erfindet keinen Punkt an reiner Kreuzung; `addWire`-Automatik inkl. Gegenprobe; `toggleJunction`
  setzt/entfernt.

### 24.3 · Oszi-Doku mit Ausnahme Stop/Single (W60)

`oszi v2/PORTIERUNG.md` §10.1 verlangt `env.probes` im `settingsKey`; Runde 22 hatte den Eintrag
entfernt, damit im Stop keine 0-V-Linie entsteht — damit war die Doku-Absicht aber auch im **Run**
verloren. Jetzt sind beide Anforderungen getrennt:

- `settingsKey` enthält wieder `env.probes` (`src/components/oszi2/engine.ts`): Umstecken oder
  Skalieren der Messleitung löst im **Run** eine neue Aufnahme aus, die Mittelung beginnt neu.
- **Stop und Single halten das Bild** (wie am echten Gerät): im Stop wird nicht neu gemessen,
  Skalieren/Position wirken nur auf den gespeicherten Datensatz. Die Änderung wird in
  `pendingKeyChange` vorgemerkt und beim nächsten Run eingelöst (frische Aufnahme, neuer
  Mittelungsdurchlauf).
- **Test** (`scripts/ozsitest.ts`, 13 Prüfungen, in `npm test`): Schlüssel reagiert auf Leitung und
  V/div; im Run Neuaufnahme beim Umstecken; im Stop keine Neuaufnahme und unveränderter Datensatz
  (R22-Schutz); Vormerkung greift beim Wiederanlauf; Single→Stop hält ebenfalls.
- `PORTIERUNG.md` §10.1/§10.2 sind entsprechend als bewusste Port-Anpassung kommentiert.

### 24.4 · Verifikation

`./node_modules/.bin/tsc --noEmit` ✓ · `npx --no-install eslint src scripts` ✓ ·
`npm test` ✓ (importtest, simtest, check-pin-congruence, windowtest, wiretest inkl. W61, ozsitest,
presettest — alle grün) · `npx --no-install next build` ✓.

### 24.5 · Hinweise

- Die drei Temp-Skripte der Fehlersuche wurden nach der Verifikation entfernt; die dauerhaften
  Prüfungen sind `scripts/wiretest.ts` (W49–W61), `scripts/ozsitest.ts` (W60) und
  `scripts/presettest.ts` (jetzt mit Exit-Code).
- Der Buck rechnet jetzt durch, aber der Startvorgang ist langsam (VOUT erreicht erst nach
  mehreren ms die Nähe des Sollwerts). Rein kosmetisch für die Anzeige, nicht Teil dieser Runde.

