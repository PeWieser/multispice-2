> **Überholt (2026-10):** Durch den UI-Qualitätsdurchgang ersetzt. Maßgeblich ist `DESIGN.md` §2.

# Steve-Jobs-Qualitätsaudit — Runde 3 („Insanely great oder nicht shippen“)

> Datum: 2026-09-25 · Branch `arena/01a0d95e-multispice-2` · Stand: nach Build-Fix (PR #2)
> Vorgänger (archiviert unter `docs/archiv/`): `DESIGN_AUDIT_STEVE_JOBS.md` (Detail-Runde), `FINAL_AUDIT_STEVE_JOBS.md` (Funktionsabgleich Multisim)
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

---

## §25 — Runde 25: Netz zeichnen wie in Multisim (Pin anklicken), Anschluss-Magnet, kein Fadenkreuz

**Auftrag (wörtlich):** „manche Bauteile sind leicht verschoben, was zu schrägen leiterbahnen bzw. am
Anfang nicht verbundenen pins führt. Also das soll so funktionieren. Ich platziere über die library
zwei bauteile. Dann klicke ich einmal mit der maus auf einen pin, worauf ich im netzmodus bin und
direkt ausgehend von dem pin ein netz zeichne, wenn ich auf einen anderen pin oder netz klicke, bin
ich aus dem modus raus und die leitung verbunden. klicke ich auf die leinwand, wo nichts ist, wird
hier ein eckpunkt gesetzt, wie in multisim. mit esc will ich aus jedem modi raus. ausserdem hasse ich
das fadenkreuz, das soll weg. beim zeichnen will ich was sinnvoll ist, wie einen stift, oder eine art
drahtrolle (stilisiert). ein fadenkreuz macht halt null sinn."

### 25.0 · Prüfung: woher kommen „leicht verschoben" und „nicht verbundene Pins"?

Gemessen über alle 410 Bauteile der Bibliothek (2098 Pins, `_tmp`-Skript, danach gelöscht):
**alle Pins liegen exakt auf dem 10-px-Raster** — die Symbole sind also in Ordnung. Die Ursachen
liegen woanders:

1. **Beispielschaltungen haben krumme Koordinaten.** `astable555` und `arduino-blink` je 2 Bauteile
   neben dem Raster (→ 4 Pins off-grid), `logic-counter` 2 (→ 2 Pins); zusätzlich liegen in mehreren
   Beispielen 1–7 Leitungsenden nicht exakt auf einem Pin und es gibt einzelne **schräge Segmente**
   (`astable555`, `arduino-blink`). Das sind genau die „leicht verschobenen Bauteile" und „schrägen
   Leiterbahnen" aus dem Bericht.
2. **Der Anschluss beim Zeichnen ist zu pingelig.** Verbunden wird nur, wenn der Klickpunkt < 1 px
   neben Pin/Leitung liegt (`pointOnSegment`-Toleranz). Ein Klick 3 px neben der Leitung, „auf" einen
   Pin oder ans Leitungsende erzeugt deshalb ein **offenes Ende** („am Anfang nicht verbundener Pin").
3. **Der Netzmodus ist kein Modus.** Heute: Pin anklicken startet nur mit vorher gewähltem
   Werkzeug `W`; jeder weitere Klick **beendet** die Leitung und startet eine neue (statt Ecken zu
   setzen); es gibt keinen Magneten, keine Hervorhebung des Ziels und keinen Abschluss „auf Netz".
4. **Modus-Ausstieg ist unvollständig.** `Esc` räumt nur Leitung + Platzieren + Probe; Bauteil-/
   Proben-Platzieren, Messleitungs-Pick, Text-/Label-Eingabe und Rechtsklick-Menü bleiben teils offen.
5. **Fadenkreuz** steht an drei Stellen im Code (`Canvas.tsx` Z. 1387/1564/1855) — ersatzlos weg.

### 25.1 · Arbeitspakete

- **W62 · Geometrie-Bereinigung.** Neues `normalizeDocGeometry(doc)` in `model.ts`: Bauteile aufs
  Raster rücken (Pins liegen dann garantiert auf dem Raster), Leitungsenden auf Pins rasten,
  Segmente rechtwinklig machen, doppelte Punkte entfernen. Angewendet auf die Beispiele beim Bau,
  nach Import und über den Menüpunkt „Leitungen prüfen & reparieren". Damit sind die Beispiele
  sauber und alte Pläne reparierbar.
- **W63 · Netzmodus wie in Multisim.** Neuer Zeichenzustand (`netDraft`) statt der bisherigen
  Klick-Kette:
  - Klick auf einen **Pin** (auch im Auswahlmodus, ohne vorher `W` zu drücken) startet den Modus,
    Anker = exakter Pin-Punkt.
  - Vorschau läuft **rechtwinklig** mit (Rubber-Band, Ecke kippt je nach Mausposition).
  - Klick auf **leere Fläche** = **Eckpunkt** setzen (bleibt im Modus, wie in Multisim).
  - Klick auf **anderen Pin / Leitung / Verbindungspunkt** = exakt anschließen, Leitung ist ein
    Objekt mit allen Ecken, Modus endet.
  - `Esc`, Doppelklick oder Rechtsklick beendet den Modus (Verhalten siehe Frage unten).
- **W64 · Anschluss-Magnet.** Beim Zeichnen wird in bildschirmkonstanter Toleranz (≈ 12 px, zoom-
  unabhängig) das beste Ziel gesucht: **Pin → Verbindungspunkt → Leitung (Fußpunkt)**. Der
  Vorschau-Endpunkt springt exakt auf das Ziel, das Ziel wird hervorgehoben (Ring + Netzname).
  Beim Abschluss auf einer fremden Leitung wird automatisch ein **Verbindungspunkt** gesetzt (W61).
- **W65 · Cursor.** Fadenkreuz restlos raus. Über Pin/Leitung: „Ziel"-Cursor (Magnet), beim Zeichnen
  ein Stift- oder Drahtrollen-Cursor als SVG (Form nach Nutzerantwort).
- **W66 · Esc verlässt jeden Modus.** Ein zentraler `exitAllModes()`: Zeichnen, Platzieren (Bauteil),
  Proben-Setzen, Messleitungs-Pick, Text-/Label-Eingabe, Kontextmenü, Auswahlrahmen → Auswahlmodus.
- **Tests:** `scripts/wiretest.ts` um W62/W63/W64-Prüfungen erweitern (Anschluss-Magnet trifft Pin
  3 px daneben exakt; Ecke setzen erzeugt einen Punkt; Klick auf Leitung erzeugt Verbindungspunkt und
  Verbindung; Geometrie-Normalisierung der Beispiele: 0 Pins off-grid, 0 schräge Segmente,
  0 offene Enden) sowie ein Test, dass die Beispiele nach W62 unverändert funktionieren
  (`presettest`).
### 25.2 · Rückfragen und Antworten (bindend)

| Frage | Antwort |
|---|---|
| Welcher Cursor ersetzt das Fadenkreuz? | **Stift** (schräger Bleistift, Spitze am Anschlusspunkt) |
| Netz auch auf leerer Leinwand beginnen? | **Ja, mit `W`** und Klick ins Leere |
| Was macht `Esc` mit der angefangenen Leitung? | **Verwerfen** – die Leitung wird nicht gespeichert |

### 25.3 · Umsetzung (W62–W66, alles verifiziert)

- **W62 · Geometrie-Bereinigung** (`src/lib/schematic/netdraw.ts` → `normalizeDocGeometry`):
  Bauteile aufs Raster, Leitungsenden auf Pins (`snapWiresToPins`), Segmente rechtwinklig
  (`straightenWirePoints`). Angewendet beim Bau der Beispiele (`tools.ts`), nach jedem Import
  (`importers.ts`) und über **„Leitungen prüfen & reparieren"** (`editor.ts`), das jetzt auch
  die ausgewählten Bauteile aufs Raster holt. Ergebnis, gemessen über die 8 Beispiele:
  **0 verschobene Bauteile, 0 Off-Grid-Pins, 0 schräge Segmente, 0 offene Enden** (vorher:
  `astable555` und `arduino-blink` je 2 verschobene Bauteile + je 1 schräges Segment,
  `logic-counter` 2, insgesamt 7–13 lose Enden).
- **W63 · Netzmodus** (`netClick` in `netdraw.ts`, verdrahtet in `Canvas.tsx`):
  1. Klick auf einen **Pin** (auch ohne vorher `W` zu drücken) öffnet den Modus, Anker ist der
     exakte Pin-Punkt; die Vorschau läuft sofort rechtwinklig mit.
  2. Klick auf **leere Fläche** = **Eckpunkt**, der Modus bleibt offen (wie in Multisim).
  3. Klick auf **Pin / Verbindungspunkt / Leitung** = exakter Anschluss, eine Leitung mit allen
     Ecken entsteht, der Modus endet (Werkzeug zurück auf Auswahl).
  4. `Esc` **verwirft** die angefangene Leitung, `Esc`/Rechtsklick/Doppelklick beenden den Modus.
     Mit `W` darf ein Netz auch auf freier Fläche beginnen.
  - Bewusst **nicht** geändert: im Auswahlmodus startet ein Klick auf eine Leitung **kein** Netz
    (sonst wäre das Ziehen an Leitungsgriffen, W54, kaputt) – geprüft.
- **W64 · Anschluss-Magnet** (`findNetTarget`): bildschirmkonstante 14 px, Priorität
  **Pin → Verbindungspunkt → Leitung (Fußpunkt)**. Der Vorschau-Endpunkt springt exakt auf das
  Ziel, das Ziel wird mit Ring und Namen hervorgehoben; ein Klick 3 px neben einem Pin verbindet
  jetzt korrekt. Endet die Leitung auf einer fremden Leitung, setzt `addWire` automatisch einen
  **Verbindungspunkt** (W61) – die Kreuzung ist damit sichtbar und leitend.
- **W65 · Cursor** (`src/components/cursors.ts`): Fadenkreuz restlos entfernt. Beim Zeichnen und
  über einem möglichen Anschluss zeigt ein **Stift** (Spitze am Zeiger) die Tätigkeit; wer eine
  Messleitung in der Hand hat, sieht einen **Bananenstecker** (vorher Fadenkreuz im Oszi-Fenster).
  Die übrigen Zeiger (Leitungsgriff „copy/grab", Pan, Löschen) bleiben wie gehabt.
- **W66 · `Esc` verlässt jeden Modus**: Zeichnen (verworfen), Bauteil-/Proben-Platzieren,
  Messleitungs-Pick, Auswahlrahmen und Rechtsklick-Menü → zurück zur Auswahl. Ein Werkzeugwechsel
  beendet ein angefangenes Netz ebenfalls (kein unsichtbarer Zustand). Dialoge (Bibliothek,
  Einstellungen) hatten `Esc` schon.
- **Werkzeugleiste:** Die Schaltfläche „Leitung" zeigt jetzt ✎ statt ∿ – sie ist der Einstieg in
  denselben Modus (Pin anklicken geht auch ohne sie).
- **Tests** (`scripts/wiretest.ts`, 20 neue Prüfungen): Geometrie-Bereinigung (Bauteil aufs Raster,
  Ende exakt am Pin, keine schrägen Segmente, Beispiele sauber), Magnet (Pin 3 px daneben, Fußpunkt
  auf der Leitung, Priorität, Verbindungspunkt, kein Ziel in der Ferne), Klickfolge
  „Pin → Ecke → Pin" (rechtwinklig, beide Pins im selben Netz), Anschluss mitten auf einer Leitung
  (+ Verbindungspunkt), Gegenprobe Auswahlmodus/Leitungswerkzeug.

### 25.4 · Verifikation

`tsc --noEmit` ✓ · `eslint src scripts` ✓ · `npm test` ✓ (142 Prüfungen, 0 Fehler) ·
`next build` ✓ · Vorschau `/` HTTP 200.

---

## §26 — Runde 26: Abzweig per Doppelklick, Werkzeugleiste mit Symbolen, Begradigen räumt Ecken, untere Leiste mit Dateireitern

**Auftrag (wörtlich):** „sobald man mit dem cursor auf eine Leitung doppelklickt, man ab dort eine
Leitung ziehen kann. zudem soll in der titelleiste, also da wo probes usw. sind, noch
zeichenwerkzeuge sein (z.b. für knotenpunkte, stiftwerkzeug aktivieren usw.). die symbole für die
bauteile sollen ohne beschriftung sein, dafür mit besseren symbolen (kleine wiederstände, gnd usw.).
… Wenn ich einen zusätzlichen punkt einfüge, also aus einer graden leitung eine mit ecke mache und
diese wieder begradige, dann soll der eckpunkt gelöscht werden, also wieder zu einer linie gemacht
werden. … Auch ist mir noch aufgefallen, dass das zoomtool rechts unten dauerhaft unter der leiste
rechts verschwindet. Verschiebe zudem die dateileiste, mit den geöffneten dokumenten nach unten. die
untere leiste, mit den tooltips darf bis auf die elemente rechts verschwinden und eben durch die
dateileiste ersetzt werden. diese funktioniert auch noch nicht (das + macht nichts)."

### 26.0 · Prüfung: wo sitzt was heute?

- **Doppelklick auf eine Leitung** fügt heute einen Stützpunkt ein
  (`Canvas.tsx` `onDoubleClick`: „Double-click on wire segment adds point"). Ein Abzweig ist damit
  nicht möglich – genau das soll sich ändern.
- **Titelleiste** = `ComponentStrip.tsx`: Bibliothek, sechs Schnellbauteile (R, C, L, Diode, VDC,
  GND – jeweils Kategorie-Symbol **plus Textkürzel**) und die Probe-Knöpfe (V, A, V·A, W, ΔV, REF, D).
  Zeichenwerkzeuge gibt es dort nicht; die stecken nur im Handy-Streifen (`MobileBottomToolbar`).
- **Begradigen** (`straightenWirePoints`) rastet aufs Raster und macht rechte Winkel, **behält aber
  jeden Stützpunkt** – ein per Griff gezogener Eckpunkt bleibt als Knick stehen (`wiretest` W55
  prüft genau das).
- **Zoom-Bedienfeld** liegt in `Canvas.tsx` bei `absolute bottom-3 right-3`; die **Geräteleiste**
  (`Instruments.tsx` `DeviceBar`) ist ein dauerhaft sichtbarer 44 px breiter Streifen
  `absolute top-0 right-0 bottom-0 z-20` im selben Container → deckt das Zoom-Feld dauerhaft zu.
- **Dateileiste** = `SheetTabs` ganz oben: ein einziger Reiter mit dem Dokumentnamen und ein `+`
  **als `<span>`** (ohne Funktion); Kommentar im Code: „heute ein Blatt, Leiste ist vorbereitet".
  Die **untere Leiste** = `StatusBar` mit langem Hinweistext (Tooltips) links und den Messwerten,
  Zoom, Zeit, Auto-Save rechts.
- Der Store hat bereits `newDocument()` (leeres Blatt) – darauf kann ein echtes `+` aufsetzen.

### 26.1 · Arbeitspakete

- **W67 · Abzweig per Doppelklick.** Doppelklick auf eine Leitung startet ein neues Netz an genau
  diesem Punkt (Fußpunkt, gerastet): Vorschau läuft von dort, Klick auf Pin/Leitung schließt an,
  Klick ins Leere setzt Ecken, `Esc` verwirft. Die bisherige Funktion „Doppelklick fügt Stützpunkt
  ein" entfällt dafür (Punkte setzt man weiter über den Mittel-Griff, W54).
- **W68 · Werkzeugleiste.** Der Streifen oben bekommt links die Zeichenwerkzeuge
  (Auswahl, Stift/Netz, Knotenpunkt, Netzname, Notiz, Löschen) und behält rechts die Probes. Der
  Knotenpunkt ist ein neues Werkzeug: Klick setzt/entfernt einen Verbindungspunkt (W61), mit
  Vorschau-Ring am nächsten Treffpunkt zweier Leitungen.
- **W69 · Bauteil-Symbole ohne Beschriftung.** Statt Kategorie-Symbol + Kürzel zeigen die
  Schnellbauteile jetzt echte Schaltsymbol-Glyphen (Widerstand als Zickzack, Kondensator, Spule,
  Diode, Spannungsquelle, Masse) – ohne Text, Name nur als Tooltip.
- **W70 · Begradigen räumt Ecken.** `straightenWirePoints` reduziert auf den kürzesten Weg:
  liegen die Enden auf einer Achse, wird die Leitung wieder **eine Gerade** (der eingefügte
  Eckpunkt verschwindet); sonst bleibt genau **ein** Knick, weitere Stützpunkte fallen weg.
- **W71 · Zoom sichtbar.** Das Zoom-Bedienfeld wird so platziert, dass die Geräteleiste es nicht
  mehr verdeckt (genaue Platzierung nach Nutzerantwort).
- **W72 · Untere Leiste = Dateireiter.** `SheetTabs` wandert nach unten und wird echt: mehrere
  geöffnete Blätter als Reiter, `+` legt ein neues Blatt an, Klick wechselt, `×` schließt. Der
  Hinweistext der Statusleiste entfällt; die rechten Elemente (Prüfung, Zeitskalierung,
  Koordinaten, Zoom, Simulationszeit, Auto-Save) bleiben in derselben Zeile.
### 26.2 · Rückfragen und Antworten (bindend)

| Frage | Antwort |
|---|---|
| Was soll das `+` in der Dateileiste tun? | **Neues leeres Schaltblatt** (neuer Reiter) |
| Wohin mit dem Zoom-Bedienfeld? | **Rechts unten, links neben der Geräteleiste** |

### 26.3 · Umsetzung (W67–W72, alles verifiziert)

- **W67 · Abzweig per Doppelklick.** Doppelklick auf eine Leitung öffnet an dieser Stelle ein neues
  Netz: Anker ist der exakte Fußpunkt auf der Leitung (gerastet), die Vorschau läuft von dort,
  Klick auf Pin/Leitung schließt an, Klick ins Leere setzt Ecken, `Esc` verwirft. Die alte
  Doppelklick-Funktion „Stützpunkt einfügen" entfällt dafür; Punkte setzt man weiter über den
  Mittel-Griff (W54) oder – beim Ziehen – über die Griffe.
- **W68 · Zeichenwerkzeuge in der Kopfleiste.** Der Streifen oben zeigt jetzt links die Werkzeuge
  **Auswahl · Stift (Netz zeichnen, `W`) · Knotenpunkt · Netzname (`L`) · Notiz (`T`) · Löschen (`E`)**
  und rechts weiterhin die Probes. Der Stift ist das bisherige Leitungswerkzeug (Netz darf auf
  freier Fläche beginnen), der **Knotenpunkt** ist neu: Klick setzt bzw. entfernt den
  Verbindungspunkt an der nächsten Kreuzung zweier Leitungen (W61), ein Ring zeigt vorher das Ziel
  (grün = setzen, rot = entfernen). Auf schmalen Fenstern weichen die Probes dem Platzbedarf aus.
  Die Werkzeuge gibt es auch im Handy-Streifen.
- **W69 · Bauteil-Symbole ohne Beschriftung.** Die sechs Schnellbauteile zeigen jetzt echte
  Schaltzeichen (`src/components/PartGlyphs.tsx`: Widerstand als Zickzack, Kondensator, Spule,
  Diode, Spannungsquelle, Masse) statt Kategorie-Symbol + Textkürzel; der Name steht im Tooltip und
  als `aria-label`.
- **W70 · Begradigen räumt Ecken.** `straightenWirePoints` reduziert auf den kürzesten Weg: liegen
  Anfang und Ende auf einer Achse, wird die Leitung wieder **eine Gerade** (der zusätzlich gesetzte
  Eckpunkt verschwindet), sonst bleibt genau **ein Knick** (längere Achse zuerst). Punkte, an denen
  etwas hängt (T-Kontakt zu einer anderen Leitung, Pin, Netzlabel, Verbindungspunkt), sind
  geschützt (`contactKeep`) – sonst hätte das Zusammenziehen z. B. in `ce-amp` einen T-Kontakt in ein
  offenes Ende verwandelt (gemessen und behoben: W49/W62-Prüfungen wieder 0 offene Enden).
  Gilt für „Leitung begradigen" (Menü/Kontextmenü), ⇧L und für die Geometrie-Reinigung W62.
- **W71 · Zoom sichtbar.** Das Zoom-Bedienfeld (+ / − / FIT) sitzt jetzt `right-52px` – links neben
  der 44 px breiten Geräteleiste, in derselben Ecke, und wird nicht mehr verdeckt.
- **W72 · Dateileiste unten.** Der frühere obere Blatt-Reiter wandert nach unten (`SheetTabs.tsx`):
  geöffnete Blätter als Reiter, `+` legt ein **neues leeres Schaltblatt** an (Store: `newDocument`
  hält das bisherige Blatt in der Liste), Klick wechselt (Store: `openSheet` → `applyDoc` setzt
  Netzprüfung und Simulation neu auf, Undo startet beim Blatt neu), `×` schließt einen Reiter, das
  letzte Blatt bleibt offen. Die Reiter tragen den aktuellen Blattnamen (auch nach dem Umbenennen
  im Inspector). Der lange Bedienhinweis („Tooltips") der unteren Leiste ist entfallen; die
  Elemente rechts (Prüfung, Zeitskalierung, Koordinaten, Zoom, Simulationszeit, Auto-Save) bleiben
  in derselben Zeile, dringende Hinweise (Messleitung in der Hand) erscheinen weiterhin.
  **Bewusste Grenze:** Die Blätter liegen im Arbeitsspeicher, das Auto-Save schreibt weiterhin das
  aktive Blatt – Reiter überleben den Neustart noch nicht (im Code vermerkt).
- **Tests** (`scripts/wiretest.ts`, 7 neue Prüfungen): W70 (geradlinig → zwei Punkte, versetzt →
  genau ein Knick, T-Kontakt geschützt und elektrisch weiter verbunden) und W72 (neues Blatt in der
  Liste, leer und aktiv, Wechsel öffnet das alte Blatt samt Netzprüfung, Undo startet neu).

### 26.4 · Verifikation

`tsc --noEmit` ✓ · `eslint src scripts` ✓ · `npm test` ✓ (150 Prüfungen, 0 Fehler) ·
`next build` ✓ · Commit `b445f43` gepusht, PR #4-Kommentar `issuecomment-5930492955` · Vorschau `/` HTTP 200; im gerenderten HTML sind die neuen Werkzeugknöpfe
(Auswahl/Stift/Knotenpunkt/Netzname/Notiz/Löschen), die Bauteil-Symbole ohne Beschriftung und die
Dateileiste („Neues Schaltblatt", Reiter mit Schließen-Knopf) vorhanden.

### 26.5 · Hinweise

- Der Knotenpunkt lässt sich jetzt auch ohne Werkzeug setzen: Rechtsklick auf eine Leitung →
  „Verbindungspunkt setzen/entfernen" (W61) bleibt bestehen.
- Beim Blattwechsel werden offene Gerätefenster geschlossen (sie gehören zum Blatt).
- Die Bauteil-Symbole im Streifen sind bewusst einfach gehalten (24 px-Raster, currentColor) und
  lassen sich später um weitere Schnellbauteile ergänzen.

---

## §27 — PR-Merge: Konflikt mit `main` gelöst, CI-Lint repariert

**Auftrag:** „Please merge the pull request."

### 27.1 · Warum PR #4 nicht direkt mergebar war

- **Konflikt:** `main` hat seit dem Branch-Punkt (`16dcceb`) genau einen Commit mehr –
  `0ffccd6` „Add files via upload" mit der Datei **`oszi v2/PORTIERUNG.md`** (486 Zeilen). Unser
  Zweig enthält dieselbe Datei (als Arbeitsgrundlage übernommen und in Runde 24 um die
  W60-Anmerkungen in §10.1/§10.2 ergänzt). Beide Seiten haben sie unabhängig angelegt → Git sieht
  einen **add/add-Konflikt**, GitHub meldete `CONFLICTING`.
  **Lösung:** `git merge origin/main`, Konflikt mit **unserer** Fassung aufgelöst – sie ist eine
  Obermenge (506 statt 486 Zeilen, die 8 W60-Zeilen kommen hinzu, sonst identisch). Damit ist auch
  die vom Nutzer hochgeladene Datei vollständig in `main` enthalten, der Merge also verlustfrei.
  - Hinweis: Ein früherer Versuch scheiterte an „refusing to merge unrelated histories" – der
    lokale Klon war **shallow** (`git rev-parse --is-shallow-repository` → true). Nach
    `git fetch --unshallow origin` ist `16dcceb` wieder die gemeinsame Basis.
- **CI `verify` schlug fehl** – und zwar in jedem Lauf seit Runde 19, immer am Schritt **„Lint"**
  (`npx eslint .`), während Typen, Build und Tests übersprungen wurden. Ursache: `eslint.config.mjs`
  ignorierte `reference/**`, `reference 2/**` und `oszi v2/**`, **nicht aber `function generator/`** –
  obwohl dieser Referenzordner in `tsconfig.json` ausdrücklich ausgeschlossen ist und nicht zum
  Build gehört. Damit fand der Lint Fehler im Vorbild (u. a. `react-hooks/refs` in
  `function generator/src/components/FunctionGenerator.tsx` und `Knob.tsx`).
  **Lösung:** `function generator/**` in die ESLint-Ignores aufgenommen (die Vorbild-Dateien selbst
  bleiben unangetastet). Damit ist `npx eslint .` identisch zur bisherigen lokalen Prüfung
  (`eslint src scripts`).

### 27.2 · Verifikation (jeder CI-Schritt lokal nachgefahren)

| Schritt (CI) | Befehl | Ergebnis |
|---|---|---|
| Typen | `npx tsc --noEmit` | ✓ exit 0 |
| Lint | `npx eslint .` | ✓ exit 0 (vorher: 10 Fehler, alle aus `function generator/`) |
| Build | `npx next build` | ✓ exit 0 |
| Tests | `npm run test --silent` | ✓ exit 0, 155 Prüfungen, 0 Fehler |

### 27.3 · Merge

Der Merge-Commit `d518ffa` bringt `main` in den Zweig; der PR ist danach inhaltlich konfliktfrei und
die Checks laufen grün. Gemerged wird als **Merge-Commit** (wie PR #3), der Zweig bleibt erhalten,
damit diese Arena-Session weiterarbeiten kann.

---

## §28 — Runde 27: Toolleiste (Amber), Zoom-Bedienfeld, Netz-Zeichnen, orthogonales Leitungs-Editing & Leinwand-Handling wie in Multisim

**Auftrag:** Prüfung und Überarbeitung der Menüleiste/Werkzeugleiste (Bauteile, Library, Probes) sowie
des gesamten Leinwand-Handlings (Netze zeichnen und bearbeiten wie in Multisim), inkl. der
Nutzer-Vorgaben aus der Rückfrage.

### 28.0 · Verbindliche Nutzer-Entscheidungen (Ask-User & Direktvorgaben)

| Thema | Entscheidung |
|---|---|
| Farbgebung der oberen Toolleiste | **Warmer Bernstein-/Amber-Akzent (`warm_amber`)** statt kaltem Blau – passend zur Auswahlfarbe auf dem Plan |
| Zoom-Menü rechts unten | **Vertikal getrennt (`split_vertical`)**: oben `[+]` und `[−]` mit exakt zentrierten Icons und Trennlinie, darunter mit Abstand ein optisch abgesetzter `[FIT]`-Knopf |
| Bibliothek beim Bauteil-Wählen | **Automatisch schließen (`auto_close`)**, sobald man ein Bauteil zum Platzieren auswählt, damit die Leinwand frei ist |
| Leitung im freien Raum beenden | **Doppelklick beendet die Leitung im Leeren (`dblclick_ends`)**; `Esc` und Rechtsklick verwerfen weiterhin die angefangene Leitung |

### 28.1 · Arbeitspakete (W73–W81)

- **W73 · Toolleiste, Schnellbauteile, Bibliothek & Menüleiste (M1–M6):**
  - Aktive Werkzeuge und Schnellbauteile in `ComponentStrip.tsx` und `DrawingTools.tsx` nutzen den
    warmen Amber-Ton (`var(--wire-sel)`) statt des bisherigen Blaus (`var(--accent)` mit fehlendem
    `--accent-contrast`).
  - Probe-Knöpfe bleiben auch auf mittleren Fensterbreiten erreichbar (kein hartes Ausblenden unter
    `1024 px`).
  - `ResistorGlyph` in `PartGlyphs.tsx` folgt der eingestellten Symbolnorm (IEC-Rechteck vs.
    ANSI-Zickzack); Schnellbauteile um NPN-Transistor und OPV ergänzt.
  - Werkzeug-Anzeige synchronisiert: sobald auf der Leinwand ein Netz gezogen wird (`netDraft`),
    leuchtet „Stift" aktiv; Klick auf „Auswahl" bricht ein laufendes Netz zuverlässig ab.
  - `LibraryPalette` schließt sich automatisch, sobald ein Bauteil zum Platzieren gewählt wird.
  - `MenuBar`: `Geräte → Funktionsgenerator` startet wie das Oszi die Bauteil-Platzierung
    (`setPlacing("funcgen")`); `Wizards …` sowie `Drehen`/`Spiegeln` und alle Ausrichten-/Verteilen-
    Richtungen im Desktop-Menü ergänzt.
- **W74 · Zoom-Bedienfeld rechts unten (`ZoomButtons` in `Canvas.tsx`):**
  - Zwei getrennte Blöcke übereinander: oben `[+]` und `[−]` als quadratische `32×32`-Buttons mit
    exakt mittigen SVG-Icons (`Plus`/`Minus`) und feiner Trennlinie; darunter abgesetzt der
    `[FIT]`-Knopf mit eigenem Rahmen und abgesetzter Fläche.
- **W75 · Bauteil-Ghost vor dem Absetzen drehen/spiegeln & Drag-and-Drop Auto-Connect (M2/M3):**
  - `placingRot` und `placingMirror` im Store: während ein Bauteil zum Platzieren am Zeiger hängt,
    drehen `R`/`⇧R`/`⌘R` und spiegelt `M` die Vorschau am Zeiger (statt zufällig ausgewählte
    Bauteile im Hintergrund zu drehen); `addInstance` übernimmt Orientierung und Spiegelung.
  - Drag & Drop aus der Bibliothek nutzt dieselbe Auto-Connect-/In-Line-Logik wie das Klick-Platzieren.
- **W76 · Bauteil in Leitung einsetzen trennt die Leitung auf (In-Line-Split wie in Multisim, E4):**
  - Wird ein Bauteil so auf eine durchgehende Leitung gesetzt, dass zwei seiner Pins auf demselben
    Leitungssegment liegen, wird das Segment zwischen den beiden Pins aufgetrennt (Reihenschaltung
    statt Kurzschluss).
- **W77 · Netz zeichnen wie in Multisim (W1–W4):**
  - Doppelklick auf eine Leitung startet zuverlässig einen Abzweig (W67), ohne dass der erste Klick
    ein `+`-Mittel-Handle auslöst oder der zweite Klick einen Stützpunkt löscht.
  - `buildNetPath` / `previewNetPath` berücksichtigt die Pin-Auswärtsrichtung und umgeht
    Bauteil-Hindernisse; die einmal eingeschlagene Knick-Orientierung bleibt stabil (und lässt sich
    per `Leertaste` beim Zeichnen wenden).
  - Doppelklick auf freie Fläche (oder Klick auf den letzten Eckpunkt) beendet das Netz als offenen
    Leitungszug; `Esc` und Rechtsklick verwerfen es.
- **W78 · Streng orthogonale Leitungs-Bearbeitung ohne Pin-Abriss (E1/E2):**
  - Beim parallelen Ziehen eines Leitungssegments (`setWireSegmentOffset`) bleiben Endpunkte, die auf
    einem Bauteil-Pin (oder T-Kontakt) sitzen, fest verankert und bilden automatisch eine orthogonale
    90°-Stufe.
  - Beim Ziehen an Eckpunkten oder am mittleren `+`-Griff wandern die anliegenden Segmente streng
    orthogonal (90°) mit – es entstehen keine schrägen/diagonalen Linien mehr und kein Pin reißt ab.
- **W79 · Ein Undo-Schritt pro Zug statt History-Flutung (E3):**
  - Ziehen von Bauteilen, Leitungssegmenten, Leitungspunkten und Probe-Ankern legt genau **einen**
    Undo-Snapshot zu Beginn des Zugs an (`Strg+Z` macht den gesamten Zug auf einmal rückgängig).
- **W80 · T-Abzweige wandern mit & Junction-Hygiene (E5):**
  - Endet eine Leitung per T-Kontakt / Junction auf einer mitbewegten Leitung, wandert der
    Anschlusspunkt samt Junction orthogonal mit.
  - Beim Löschen oder Umbauen von Leitungen werden verwaiste `junctions` (ohne Leitungskontakt)
    automatisch bereinigt.
- **W81 · Labels & Notizen greifbar, Probes auf langen Segmenten & Direkt-Wertedit (E6–E8):**
  - Hit-Test, Auswahl, Verschieben, Doppelklick-Umbenennen, Kontextmenü und Löschen für `doc.labels`
    und `doc.notes`.
  - Probes rasten per Fußpunkt-Projektion auf jedem Leitungssegment ein (auch mitten auf langen
    Leitungen) und aktualisieren beim Verschieben ihrer Pfeilspitze (`probeAnchorDrag`) sofort das
    zugeordnete Netz.
  - Doppelklick auf den Bauteilwert/-namen unter dem Symbol öffnet direkt das Inline-Wertfeld;
    Doppelklick auf das Symbol öffnet den Inspector. Der „Faults"-Block im Kontextmenü wandert von
    der Leitung zum Bauteil.

## §28.2 — Umsetzung Runde 27 (W73–W81, alles verifiziert)

- **Verifikation:**
  - `./node_modules/.bin/tsc --noEmit`: 0 Fehler
  - `npx --no-install eslint src scripts`: 0 Fehler / 0 Warnungen
  - `npm test`: alle 7 Suiten grün (`importtest`, `simtest`, `check-pin-congruence`, `windowtest`, `wiretest` inkl. neuer W73–W81-Prüfungen, `ozsitest`, `presettest`)
  - `npx --no-install next build`: Produktions-Build erfolgreich

---

## §29 — Runde 28: Raster-Konsistenz, `orthoFollow` am Ausgang (`OUT`) & Multisim-Probes (W82–W87)

### §29.1 — Ursachenanalyse & Plan (W82–W87)

- **W82 · Leitung löst sich beim Verschieben des Widerstands an `OUT` (`orthoFollow` in `src/lib/schematic/ortho.ts`):**
  - *Ursache 1:* Bei einer geraden 2-Punkt-Leitung (`pts.length === 2`, wie die Leitung `(460, 270) → (590, 270)` zwischen `U1.OUT` und `R3` in `astable555`) ergab `const inner = idx === 0 ? 1 : pts.length - 2` für `idx === 1` (das bewegte Ende an `R3`) den Wert **`inner = 0`**. Dadurch fügte `pts.splice(inner, 0, bend)` den Knickpunkt **vor Index 0** (also vor dem festen Pin `U1.OUT`) ein statt zwischen Index 0 und Index 1 (`pts.splice(1, 0, ...)`). Index 0 wanderte auf `(460, 280)` (abgerissen vom Ausgangs-Pin `(460, 270)`) und zwischen `(460, 270)` und `(590, 280)` entstand ein schräges Segment.
  - *Ursache 2:* Wenn zwei horizontal/vertikal verbundene Pins gegeneinander verschoben werden, legte `pickBend` den einzelnen L-Knick direkt auf die Koordinate des festen Pins (`{ x: a.x, y: end.y }`), sodass die Leitung quer durch das Bauteilgehäuse (`U1`) lief; beim Zurückschieben auf gleiche Höhe blieben zudem kollineare Zwischenpunkte stehen.
  - *Lösung:* In `orthoFollow` bleibt das nicht bewegte Ende (`fixedIdx`) unantastbar auf seiner Koordinate; bei `pts.length === 2` wird bei ausreichendem Achsenabstand (`>= 2 * GRID`) eine saubere orthogonale Z-Stufe in der Mitte (`midX`/`midY` auf `GRID = 10` gerundet) bzw. ein hindernisfreier L-Knick an Index `1` eingefügt, und abschließend bereinigt ` orthoFollow` kollineare/doppelte Zwischenpunkte in-place, sodass beim Zurückschieben wieder eine glatte 2-Punkt-Gerade entsteht.
- **W83 · Bauteil- und Leitungs-Raster (`GRID = 10`) ohne „halbe Rasterfelder" (`Canvas.tsx`, `editor.ts`):**
  - *Ursache 1 (Bauteile nicht gleichauf):* Beim Ziehen von Bauteilen in `Canvas.tsx` (`sr.dragging`) suchte `_alignGuides` nach den **Grafik-Bounding-Box-Kanten** (`instanceBounds`: `b.x`, `b.y`, `b.x + b.w/2`, `b.y + b.h/2`). Da Schaltsymbole (Widerstand `h = 14 → y - 7`, LED `y - 22 .. y + 10 → Mitte y - 6`, NE555 `y - 48`) asymmetrische bzw. Nicht-10er-Kanten haben, verschob `dx += guideX - (selMinX + dx)` gezogene Bauteile **vom 10-px-Raster herunter** auf krumme Koordinaten (`...3`, `...5`, `...7`).
  - *Ursache 2 (Leitungen um ein halbes Rasterfeld verschoben):* Durch die vom Raster gezogenen Bauteile landeten auch deren Pins und Leitungen auf halben Rasterfeldern (`...5`), und `wireSegDrag` addierte nur ein relatives `dy = Math.round((sp.y - sr.dragStart.y) / GRID) * GRID` auf `orig`, statt das gezogene Segment selbst auf die Rasterlinie `sp.y` (`...0`) einzurasten. Ebenso richteten `alignSelection` und `distributeSelection` nach Grafik-Bounding-Boxen ohne Raster-Snap aus.
  - *Lösung:*
    1. Beim Ziehen von Bauteilen (`sr.dragging`) rastet der Bauteil-Ursprung `(inst.x, inst.y)` immer exakt auf Vielfache von `GRID = 10` ein; `_alignGuides` vergleicht ausschließlich Raster-Ursprünge (`other.x`, `other.y`) und Pin-Positionen (`pinPosition`), niemals krumme Grafik-Bounding-Box-Ränder, und verbiegt `dx`/`dy` niemals auf Nicht-Vielfache von `GRID`.
    2. Beim Ziehen eines Leitungssegments (`wireSegDrag`) rastet die neue Segmentposition direkt auf die Rasterlinie `sp.y` (horizontal) bzw. `sp.x` (vertikal) ein (`dy = sp.y - sa.y` bzw. `dx = sp.x - sa.x`, jeweils auf `GRID` gerundet).
    3. `alignSelection` und `distributeSelection` in `editor.ts` richten Bauteil-Ursprünge streng auf Vielfachen von `GRID = 10` aus und führen angeschlossene Leitungen über `orthoFollow` sauber mit.
- **W84 · Sichtbares Gitter (`showGrid`), `normalizeDocGeometry` & `PRESETS` (`Canvas.tsx`, `netdraw.ts`, `tools.ts`, `editor.ts`):**
  - *Ursache:* `Canvas.tsx` schaltete das sichtbare Gitter bereits bei `view.zoom < 1.1` (also auch beim Standard-Zoom `1.0`!) auf `step = GRID * 5 = 50 px` um, während alle Snaps auf `GRID = 10 px` liefen. Zudem führte `normalizeDocGeometry` erst `snapWiresToPins` und danach `straightenWirePoints` aus und ließ `doc.labels` (z. B. `OUT` bei `(460, 268)` in `astable555`, `IN` bei `(200, 245)` in `noninv-opamp`) sowie `restoreLocalProject()` unnormalisiert.
  - *Lösung:* Ab `view.zoom >= 0.45` zeichnet `Canvas.tsx` durchgängig das `GRID = 10`-Raster als feines Gitter und jede 5. Linie (`50 px`) als Hauptlinie (`--grid-strong`), sodass jedes sichtbare kleine Kästchen exakt 1 Bewegungsschritt (`10 px`) ist. `normalizeDocGeometry` rundet auch `doc.labels`, `doc.junctions` und `doc.probes` aufs Raster und rastet Leitungsenden abschließend noch einmal per `snapWiresToPins` ein; `restoreLocalProject()` normalisiert geladene Altstände automatisch.
- **W85 · Multisim-Probes: Permanentes Anzeigefeld & einheitliche Darstellung (`drawProbe` in `Canvas.tsx`):**
  - *Ursache:* Bisher zeigte `drawProbe` bei gestoppter Simulation (`live === null`) überhaupt keine Messwert-Box, sondern nur ein winziges schräges Fähnchen am Ende eines Strichs; bei laufender Simulation schwebte rechts neben dem Fähnchen zusätzlich eine unverbundene Box. Außerdem trug `addMeasurementProbe` das Netz gleichzeitig in das alte `st.probes`-Array ein, wodurch `Canvas.tsx` an `net.points[0]` einen zweiten lila Geisterkreis zeichnete.
  - *Lösung:* Echte NI-Multisim-Darstellung:
    1. Am Ankerpunkt `(anchorX, anchorY)` auf der Leitung sitzt der farbige Messkontakt mit Pfeilspitze (bzw. bei Strom-/Leistungssonde zusätzlich ein klarer Strom-Richtungspfeil entlang der Leitung).
    2. Eine saubere Leader-Linie verbindet den Messpunkt `(anchorX, anchorY)` direkt mit dem **immer sichtbaren** Sonden-Anzeigekästchen bei `(probe.x, probe.y)` (Standard-Offset `(+30, -30)` exakt auf dem `GRID = 10`-Raster).
    3. Das Anzeigekästchen zeigt oben/links den farbigen Sonden-Header (`V1`, `I1`, `P1` … + Netzname wie `OUT` oder `unverbunden`) und darunter die Messwerte (`V(dc)`, `V(rms)`, `V(p-p)`, `f`, `I`, `P` im Live-Betrieb bzw. `Bereit` vor Simulationsstart).
    4. Keine doppelten lila Geisterkreise (`st.probes`) mehr für Netze, die bereits eine `MeasurementProbe` besitzen.
- **W86 · Multisim-Probes: Live-Ghost beim Platzieren (`Canvas.tsx`, `editor.ts`):**
  - *Ursache:* Der Platzier-Ghost zeichnete die Probe ohne `anchorX/anchorY` direkt am Cursor, sprang beim Klick aber plötzlich um `(+32, -28)` weg; zudem überschrieb `Canvas.tsx` nach `addMeasurementProbe` das Netz noch einmal mit `nearestNetName(world)`.
  - *Lösung:* Schon in der Platzier-Vorschau (`st.tool.startsWith("probe")`) rastet die Messspitze (`anchorX, anchorY`) per `resolveNearestNetPoint` live auf der nächsten Leitung oder dem nächsten Pin ein, zeigt den Leuchtring auf der Leitung und das Sonden-Kästchen im Rasterabstand `(+30, -30)` samt Live-Messwert – exakt deckungsgleich mit der platzierten Sonde.
- **W87 · Multisim-Probes: Hit-Testing, freies Verschieben des Anzeigekästchens & Umstecken der Messspitze (`Canvas.tsx`, `editor.ts`):**
  - *Ursache:* `hitTestProbe` prüfte nur einen 16-px-Kreis um `(pr.x, pr.y)` und verfehlte das Anzeigekästchen; `moveSelection` verschob beim Ziehen einer ausgewählten Probe auch `anchorX/anchorY` mit (sodass die Messspitze von der Leitung abriss!), während beim Verschieben eines Bauteils `onMovedPin(pr)` fälschlich `(pr.x, pr.y)` statt `(pr.anchorX, pr.anchorY)` prüfte.
  - *Lösung:*
    1. `hitTestProbe` trifft das gesamte Anzeigekästchen der Probe in Welt-/Screen-Koordinaten, und `hitTestProbeAnchor` erkennt gezielt Klicks auf die Messspitze `(anchorX, anchorY)` (auch ohne vorherige Auswahl).
    2. Zieht man das **Anzeigekästchen** einer Probe, wandert nur das Kästchen `(pr.x, pr.y)` auf dem `GRID = 10`-Raster, während die Messspitze `(anchorX, anchorY)` fest auf ihrer Leitung bleibt!
    3. Zieht man die **Messspitze** `(anchorX, anchorY)` (`probeAnchorDrag`), rastet sie mit Magnet-Fang auf jedem Pin oder Leitungssegment ein und aktualisiert sofort `probe.net`.
    4. Wird hingegen das **Bauteil oder die Leitung** verschoben, auf der `(anchorX, anchorY)` sitzt, wandert die gesamte Probe (`anchorX/Y` + `x/y`) automatisch mit.

### §29.2 — Umsetzung Runde 28 (W82–W87, alles verifiziert)

- **Geänderte Dateien:**
  - `src/lib/schematic/ortho.ts`: W82 – `orthoFollow` fügt Knickpunkte bei 2-Punkt-Leitungen immer an Index `1` (statt Index `0`) ein, schützt das feste Leitungsende unverrückbar am Ziel-Pin, ignoriert in `segHitsBox` das Padding des eigenen Start-/End-Bauteils (außer beim Entlangschrammen an der Gehäusekante) und entfernt am Ende doppelte/kollineare Zwischenpunkte in-place (`cleanInPlace`).
  - `src/lib/schematic/netdraw.ts`: W84 – `normalizeDocGeometry` rundet auch `doc.labels`, `doc.junctions` und `doc.probes` aufs `GRID = 10`-Raster und rastet nach `straightenWirePoints` alle Leitungsenden erneut per `snapWiresToPins` auf Bauteil-Pins ein.
  - `src/lib/schematic/tools.ts`: W84 – Rohkoordinaten in `astable555` und `noninv-opamp` (`268`, `244`, `292`, `316`, `245`, `275`) direkt auf Vielfache von `GRID = 10` gesetzt.
  - `src/state/editor.ts`: W83–W87 – `moveSelection` hält Probe-Messspitzen beim Verschieben des Anzeigekästchens fest auf ihrer Leitung und führt Probes mit, wenn die Leitung/das Bauteil unter der Messspitze bewegt wird; `alignSelection` und `distributeSelection` richten Bauteile streng auf dem `GRID = 10`-Raster aus; `addMeasurementProbe` legt Sonden im Rasterabstand `(+30, -30)` ab; `removeMeasurementProbe` und `deleteSelection` räumen auch `st.probes` auf; `restoreLocalProject` normalisiert geladene Altstände.
  - `src/components/Canvas.tsx`: W83–W87 – Sichtgitter ab `zoom >= 0.45` immer im echten `GRID = 10`-Schritt (mit 50-px-Hauptlinien); kein krummer Grafik-Bounding-Box-Snap mehr beim Ziehen von Bauteilen; `wireSegDrag` rastet Segmente direkt auf die Rasterlinie `sp.y`/`sp.x` ein; `drawProbe`, `hitTestProbe`, `hitTestProbeAnchor` und Probe-Ghost im echten NI-Multisim-Stil (permanentes Anzeigekästchen mit Header + Messwerten auch vor Simulationsstart, durchgehende Leader-Linie vom Kästchenrand zur Messspitze, kein doppelter lila Geisterkreis).
  - `scripts/wiretest.ts`: Automatisierte Regressionstests für `W82–W87`.
- **Verifikation:**
  - `./node_modules/.bin/tsc --noEmit`: 0 Fehler
  - `npx --no-install eslint src scripts`: 0 Fehler / 0 Warnungen
  - `npm test`: alle 7 Suiten grün
  - `npx --no-install next build`: Produktions-Build erfolgreich

---

## §30 — Runde 29: Werkzeugleiste, Radiergummi-Cursor, Netzname/Notiz/Wert-Edit, Bauteil-Auswahl & gut lesbare Probe-Kästen (W88–W93)

### §30.1 — Ursachenanalyse & Plan (W88–W93)

- **W88 · Werkzeugleiste optisch differenzieren & Radiergummi zum Stift gruppieren (`DrawingTools.tsx`, `ComponentStrip.tsx`):**
  - *Ursache:* Bauteile, Zeichenwerkzeuge und Probes sahen in der Leiste alle wie identische graue Einzelkästchen (`h-8 w-9 rounded-lg`) aus; das Auswahlwerkzeug nutzte das Vierfach-Pfeil-Icon `Move` statt eines Auswahlzeigers, und der Radiergummi (`erase`) saß am Ende der Textgruppe statt beim Stift (`wire`).
  - *Lösung:*
    1. `Auswahl` erhält das klare Zeiger-Icon `MousePointer2`.
    2. `Stift` (`Pencil`), `Radiergummi` (`Eraser`) und `Knotenpunkt` (`Network`) bilden gemeinsam eine verbundene **Leitungs-Werkzeugkapsel** (Segmented Control mit gemeinsamem Rahmen und Innentrennlinien).
    3. `Netzname` (`Tag`) und `Notiz` (`StickyNote`) bilden eine eigene verbundene **Beschriftungs-Kapsel**.
    4. Die **Probes** erhalten eine eigenständige Pill-/Badge-Optik (`rounded-full`) mit farbigem Typ-Badge in der jeweiligen Sondenfarbe, sodass Bauteile, Werkzeuge und Messsonden auf den ersten Blick unterscheidbar sind.
- **W89 · Eigener Radiergummi-Cursor (`ERASER_CURSOR`) statt Stift-Cursor (`cursors.ts`, `Canvas.tsx`):**
  - *Ursache:* In `Canvas.tsx` prüfte `const drawing = (Boolean(sr.netDraft) || st.tool === "wire" || sr.netHover !== null) && st.tool !== "junction"`. Sobald man mit dem Radiergummi (`st.tool === "erase"`) über eine Leitung oder einen Pin fuhr, war `sr.netHover !== null` und der Cursor wechselte auf `PEN_CURSOR` (Stiftsymbol).
  - *Lösung:* Neuer `ERASER_CURSOR` in `src/components/cursors.ts`; `PEN_CURSOR` erscheint nur noch beim aktiven Netzzeichnen (`sr.netDraft`, `st.tool === "wire"` oder `st.tool === "select"` über einem freien Pin/Knotenpunkt), während `st.tool === "erase"` durchgängig den `ERASER_CURSOR` zeigt.
- **W90 · Sinnvolle Tastenkürzel für `V`, `A` und `Esc` (`Canvas.tsx`, `DrawingTools.tsx`, `ComponentStrip.tsx`):**
  - *Ursache:* `V` wechselte ins Auswahlwerkzeug (`select`), während `A` die Strom-Probe (`current`) auswählte – widersprüchlich zu den Probe-Buttons `V` und `A`.
  - *Lösung:* `V` wählt die Spannungs-Probe (`voltage`), `A` die Strom-Probe (`current`) (erneutes Drücken schaltet sie wieder aus); `Esc` wechselt jederzeit ins Auswahlwerkzeug (`select`).
- **W91 · Netzbenennung (`label`), Notizen (`text`) und Doppelklick-Wertänderung (`value`) reparieren (`Canvas.tsx`, `importers.ts`):**
  - *Ursache 1 (`label` / `text` / `value` Input schloss sich sofort):* `onPointerDown` rief `setPointerCapture` auf dem `<canvas>` auf und mountete noch während `pointerdown` das `<input autoFocus onBlur={...} />`. Beim Loslassen der Maustaste (`pointerup` / Fokus-Rückgabe an Canvas) feuerte sofort `onBlur` mit leerem Text und schloss das Eingabefeld in derselben Millisekunde wieder.
  - *Ursache 2 (Widerstandswert per Doppelklick):* `hitTestInstance` prüfte nur die Symbol-Box (`b.y .. b.y + b.h + 6`), während Name und Wert bei `b.y + b.h + 14 .. + 26` darunter stehen; ein Doppelklick auf das Symbol selbst öffnete zudem nur den Inspector statt des Wert-Editors.
  - *Lösung:*
    1. Schutzzeit (`editingOpenedAt`) + explizite Fokussierung per `editInputRef` verhindern, dass das losgelassene Maus-Event das soeben geöffnete `<input>` per `onBlur` sofort wieder schließt.
    2. Im `label`- und `text`-Modus zeigt der Canvas schon beim Bewegen der Maus eine Live-Vorschau am Zeiger; im `label`-Modus rastet der Klickpunkt per Magnet auf die nächste Leitung ein.
    3. Doppelklick auf ein Bauteil mit numerischem Hauptwert (z. B. Widerstand, Kondensator, Spule, Quelle) **oder** auf seinen Namen/Wert darunter öffnet direkt das Inline-Werteingabefeld (`10k`, `470`, `4u7` …); `parseSpiceValue` akzeptiert auch Einheiten (`Ω`, `Ohm`, `F`, `H`, `V`, `A`, `Hz`) und Kommas (`4,7k`).
- **W92 · Bauteilwert optisch mitauswählen & störenden Kasten im Auswahlrahmen entfernen (`Canvas.tsx`):**
  - *Ursache:* In `drawInstance` blieb der Bauteilwert (`10kΩ`) bei `selected === true` grau (`--text-mute`) und lag außerhalb des gestrichelten Auswahlrahmens. Zudem zeichnete `sr.marquee` in der Mitte des aufgezogenen Auswahlrahmens ein Rechteck mit ungültigem `ctx.fillStyle = "var(--panel-solid)"` (schwarzer eckiger Kasten).
  - *Lösung:* Bei ausgewähltem Bauteil leuchtet auch der Werttext in `--wire-sel` mit und der gestrichelte Auswahlrahmen umschließt Symbol + Name + Wert gemeinsam. Der eckige Kasten in der Mitte von `sr.marquee` entfällt.
- **W93 · Probe-Kästen deutlich größer und optimal lesbar (`Canvas.tsx`, `editor.ts`):**
  - *Ursache:* `drawProbe` nutzte `9px` / `9.5px` Schrift und `15px` Headerhöhe (`boxScreenW >= 84px`), was auf dem Schaltplan zu klein zum Ablesen war.
  - *Lösung:* Deutlich größere Typografie und Boxmaße in `drawProbe` (Header `12px bold`, Typ-Badge `22×16px`, Messwerte `13px semibold`, Zeilenhöhe `18px`, Mindestbreite `132px`, Standard-Offset `(+40, -40)` auf dem Raster) sowie angepasster `hitTestProbe`.

### §30.2 — Umsetzung Runde 29 (W88–W93, alles verifiziert)

- **Geänderte Dateien:**
  - `src/components/DrawingTools.tsx`: W88/W90 – Auswahlwerkzeug mit `MousePointer2` (`Esc`) statt `Move`-Icon; `[Stift | Radiergummi | Knotenpunkt]` in einer gemeinsamen Leitungs-Kapsel (Segmented Control) und `[Netzname | Notiz]` in einer zweiten Beschriftungs-Kapsel.
  - `src/components/ComponentStrip.tsx`: W88/W90 – Klare optische Trennung der drei Bereiche: Schnell-Bauteile als Schaltzeichen-Kacheln, Zeichenwerkzeuge als Segmented-Control-Kapseln und Messsonden als farbige Sonden-Pills (`rounded-full`) mit farbigem Typ-Badge (`V`, `A`, `V·A`, `W`, `ΔV`, `REF`, `D`).
  - `src/components/cursors.ts`: W89 – Eigener `ERASER_CURSOR` für das Radiergummi-Werkzeug.
  - `src/lib/schematic/importers.ts`: W91 – `parseSpiceValue` unterstützt Einheiten (`Ω`, `Ohm`, `R`, `Hz`, `F`, `H`, `V`, `A`, `W`, `s`), `µ` sowie deutsches Dezimalkomma (`4,7k`).
  - `src/state/editor.ts`: W93 – Standard-Offset neuer Probes auf `(+40, -40)` im `GRID = 10`-Raster gesetzt.
  - `src/components/Canvas.tsx`: W89–W93 – `ERASER_CURSOR` beim Radiergummi (kein `PEN_CURSOR` mehr über Leitungen/Pins); `V` = Spannungs-Probe, `A` = Strom-Probe, `Esc` = Auswahl; Fokus-Schutz (`editingOpenedAt` + `editInputRef`) und Verzicht auf `setPointerCapture` beim Öffnen des Inline-Editors (`label`, `text`, `value`), Live-Vorschau für `label`/`text` und Doppelklick-Werteingabe direkt auf Bauteilen/Widerständen; Werttext bei Bauteil-Auswahl in `--wire-sel` mit hervorgehoben und vom Auswahlrahmen umschlossen; eckiger Kasten in der Mitte von `sr.marquee` entfernt; `drawProbe` und `hitTestProbe` deutlich vergrößert (`12px`/`13px` Monospace, `minW = 132px`).
  - `scripts/wiretest.ts`: Automatisierte Regressionstests für `W88–W93`.
- **Verifikation:**
  - `./node_modules/.bin/tsc --noEmit`: 0 Fehler
  - `npx --no-install eslint src scripts`: 0 Fehler / 0 Warnungen
  - `npm test`: alle 7 Suiten grün
  - `npx --no-install next build`: Produktions-Build erfolgreich

---

## §31 — Runde 30: Dokumentenname oben links weg, Einrichtungs-Wizard weg, 1 untere Leiste statt 3 Balken & luftige Werkzeugleiste (W94–W97)

### §31.1 — Ursachenanalyse & Plan (W94–W97, bestätigt per `ask_user`)

- **W94 · Dokumentenname oben links in der Menüleiste entfernen (`MenuBar.tsx`):**
  - *Ursache:* In `MenuBar.tsx` stand vor dem Menüpunkt `Datei` noch `<span className="mr-2 hidden max-w-[140px] truncate text-[11px] text-mute lg:inline">{docName}</span>` (redundant zu den Schaltblatt-Reitern unten).
  - *Lösung:* Den Dokumentennamen oben links ersatzlos entfernen, sodass die Menüleiste sauber mit `Datei` beginnt.
- **W95 · Einrichtungs-Wizard („Leere Leinwand – los geht's!") bei neuem Dokument entfernen (`Canvas.tsx`):**
  - *Ursache:* Bei leerem Dokument (`doc.instances.length === 0 && doc.wires.length === 0`) legte `Canvas.tsx` eine große Willkommens-Karte mitten über das leere Schaltblatt.
  - *Lösung:* Das Onboarding-Overlay in `Canvas.tsx` ersatzlos entfernen – ein neues Schaltblatt ist sofort frei und bereit zum Zeichnen.
- **W96 · Unten von 3 gestapelten Balken auf 1 einzige schlanke Leiste reduzieren (`BottomPanel.tsx`, `SheetTabs.tsx`, `StatusBar.tsx`, `Workbench.tsx`, `MenuBar.tsx`):**
  - *Nutzer-Entscheidung (`ask_user`):*
    1. `bottom_bar_layout = hide_panel_tabs_until_opened`: Unten gibt es dauerhaft **nur noch 1 einzige Leiste** (links die Schaltblatt-Reiter `+` / Blätter, rechts der Status). `BottomPanel` hat im eingeklappten Zustand (`bottomOpen === false`) **keine eigene 34-px-Leiste** mehr (`return null`), sondern öffnet sich nur bei Bedarf über das obere Menü (`Ansicht` / `Analysen`) oder über den Prüfungs-Button unten rechts.
    2. `bottom_status_items = minimal_sim_and_erc`: Doppelte Zoom-%-Anzeige, Auto-Save-Uhrzeit und `x/y`-Koordinaten entfallen. Unten rechts bleiben nur der **Prüfungs-Status** (`✓ Prüfung ok` / `⚠ Hinweise` / `✕ Fehler`, öffnet/schließt das untere Panel) sowie die **Simulations-Geschwindigkeit / Simulationszeit**.
- **W97 · Obere Werkzeugleiste (`ComponentStrip.tsx`, `DrawingTools.tsx`) entzerren (`reduce_quick_parts_and_probes`):**
  - *Nutzer-Entscheidung (`ask_user`):*
    1. Schnell-Bauteile auf die **5 wichtigsten Grundbauteile** reduzieren (`R`, `C`, `L`, `VDC`, `GND` – alle weiteren Bauteile über `Bibliothek`).
    2. Messsonden entschlacken: Direkt sichtbar stehen **`V`** und **`A`**, während die Spezial-Sonden (`V·A`, `W`, `ΔV`, `REF`, `D`) in einem sauberen Dropdown-Menü **`Sonden ▾`** gebündelt werden.
    3. Höhere Leiste (`h-11` / `44 px`) und großzügige Abstände zwischen allen Gruppen und Buttons, damit nichts mehr gequetscht wirkt.

### §31.2 — Umsetzung Runde 30 (W94–W97, alles verifiziert)

- **Geänderte Dateien:**
  - `src/components/MenuBar.tsx`: W94/W96 – Dokumentenname oben links vor `Datei` entfernt; im Menü `Ansicht` direkten Umschalter für `Auswertung & Konsole (unten)`, `SPICE-Netzliste öffnen` und `Stückliste (BOM) öffnen` ergänzt.
  - `src/components/Canvas.tsx`: W95 – Einrichtungs-Wizard („Leere Leinwand – los geht's!") bei leerem/neuem Dokument komplett entfernt.
  - `src/components/BottomPanel.tsx`: W96 – Im geschlossenen Zustand (`!bottomOpen`) rendert `BottomPanel` überhaupt keine Leiste (`return null`), sondern erscheint nur bei Bedarf.
  - `src/components/StatusBar.tsx`: W96 – Verschmilzt die Schaltblatt-Reiter (`+` und geöffnete Blätter) auf der linken Seite und den stark entschlackten Status (`✓ Prüfung ok` + Simulations-Geschwindigkeit/Zeit, ohne Zoom-%, Auto-Save-Uhrzeit und `x/y`-Koordinaten) auf der rechten Seite zu **einer einzigen schlanken 30-px-Leiste**.
  - `src/components/Workbench.tsx`: W96 – Separates `<SheetTabs />` entfernt, sodass unten dauerhaft nur 1 einzige Leiste steht.
  - `src/components/ComponentStrip.tsx` & `src/components/DrawingTools.tsx`: W97 – Schnell-Bauteile auf die 5 Grundelemente (`R`, `C`, `L`, `VDC`, `GND`) reduziert; Messsonden auf `V` + `A` + Portal-Dropdown `Sonden ▾` (`V·A`, `W`, `ΔV`, `REF`, `D`) gebündelt; Leistenhöhe (`h-11`), Abstände (`gap-3` / `gap-2.5`) und Button-Maße spürbar luftiger gestaltet.
- **Verifikation:**
  - `./node_modules/.bin/tsc --noEmit`: 0 Fehler
  - `npx --no-install eslint src scripts`: 0 Fehler / 0 Warnungen
  - `npm test`: alle 7 Suiten grün
  - `npx --no-install next build`: Produktions-Build erfolgreich

---

## §32 — Runde 31: Kein Stift-Cursor beim Leitung-Verschieben, feste Status-Symbole rechts unten, verschiebbare Datei-Tabs, funktionierende Beispiel-Simulationen & klare Stromrichtung beim Ampere-Messen (W98–W99)

### §32.1 — Ursachenanalyse & Plan (W98–W99)

- **W98a · Kein Stift-Cursor beim Überfahren oder Verschieben von Leitungen (`Canvas.tsx`):**
  - *Ursache:* `findNetTarget` liefert auf Leitungen `{ kind: "wire" }`. In `onPointerMove` prüfte die Cursor-Logik `st.tool === "select" && sr.netHover !== null` **vor** `!sr.dragging` und ohne Beschränkung auf `sr.netHover.kind === "pin"`. Dadurch erschien beim Überfahren und sogar während des Ziehens (`wireSegDrag`, `wirePointDrag`, `sr.dragging`) einer Leitung der `PEN_CURSOR`.
  - *Lösung:* Während jeder Zieh-Geste (`dragging`, `wireSegDrag`, `wirePointDrag`, `probeAnchorDrag`) ist `sr.netHover = null` und der Cursor zeigt `"ns-resize"` / `"ew-resize"` bzw. `"grabbing"`. Im `select`-Modus ohne aktiven `netDraft` erscheint `PEN_CURSOR` ausschließlich über einem Bauteil-Pin (`sr.netHover?.kind === "pin"`), während über Leitungssegmenten der Verschiebe-Cursor (`"ns-resize"` / `"ew-resize"`) erscheint.
- **W98b · Symbole unten rechts bei laufender Simulation fest verankern (`StatusBar.tsx`):**
  - *Ursache:* Das Textfeld für die Simulationszeit (`t = ...` vs. `bereit`) hatte keine feste Breite mehr; durch wechselnde Stringlängen (`1.2 ms` → `100.4 ms`) wackelten der Geschwindigkeitsregler und das Prüfungs-Symbol in jedem Frame.
  - *Lösung:* Feste Breite und tabellarische Ziffern (`w-[98px] tabular-nums text-right` für die Zeit, `w-[44px] tabular-nums` für den Geschwindigkeitsfaktor), sodass alle Symbole unten rechts bei laufender Simulation absolut ruhig stehen.
- **W98c · Datei-Tabs unten per Drag & Drop verschiebbar (`editor.ts`, `StatusBar.tsx`, `SheetTabs.tsx`):**
  - *Lösung:* Neue Store-Aktion `reorderSheets(fromId, toId)` in `src/state/editor.ts` sowie Drag-&-Drop-Handler (`draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd`) auf den Schaltblatt-Reitern in `StatusBar.tsx` und `SheetTabs.tsx`.
- **W98d · Simulation in den Beispielen (insb. 555 Blinker, OPV, Arduino, 4-Bit-Zähler) reparieren (`model.ts`, `netdraw.ts`, `tools.ts`, `editor.ts`, `realtime.ts`):**
  - *Ursache:* `normalizeDocGeometry` rief `straightenWirePoints` auf allen Leitungen auf. `straightenWirePoints` reduzierte mehrteilige orthogonale Umleitungen (z. B. die 4-Punkt-Umleitungen um den NE555 in `astable555`) auf einen einzigen L-Knick und drehte 3-Punkt-L-Knicke um. Dadurch liefen die Leitungen in `astable555` mitten durch `U1.GND` (`380,310`), `U1.CTRL` (`460,310`) und `U1.DIS` (`380,250`) und schlossen `C1` nach Masse sowie `R1` nach `VCC` kurz – der 555-Blinker konnte nicht schwingen. Zudem speicherte Auto-Save diesen kurzgeschlossenen Stand im `localStorage`.
  - *Lösung:*
    1. Neue Funktion `orthogonalizeWirePoints` in `src/lib/schematic/model.ts`, die Punkte aufs Raster zieht und nur tatsächlich schräge Segmente rechtwinklig macht, bestehende orthogonale Umwege/Ecken aber erhält. `normalizeDocGeometry` nutzt `orthogonalizeWirePoints`.
    2. Alle 8 Presets in `src/lib/schematic/tools.ts` auf exakte `GRID = 10`-Pin-Koordinaten gebracht (0 Kurzschlüsse, 0 offene Enden).
    3. `restoreLocalProject` in `src/state/editor.ts` erkennt, falls im `localStorage` noch ein durch den früheren Bug kurzgeschlossenes Standard-Beispiel liegt, und stellt automatisch die intakte Vorlage wieder her.
- **W99 · Deutliche Stromrichtung beim Ampere-/Strommessen & vorzeichenrichtige Messung (`Canvas.tsx`, `editor.ts`):**
  - *Ursache:* Der Strompfeil an der Messspitze war winzig (`17 px` ohne Beschriftung), richtete sich auf senkrechten Leitungen nicht automatisch entlang der Leitung aus (`rotation = 0°`), und `netCurrentMap` teilte Bauteilströme pauschal durch `part.pins.length` ohne Berücksichtigung der Flussrichtung entlang des gemessenen Leitungssegments.
  - *Lösung:*
    1. Automatische Ausrichtung (`inferWireAngleAt`) entlang des Leitungssegments (`0°` waagerecht, `90°` senkrecht) beim Platzieren und Verschieben einer Strom-/Leistungs-/V·I-Sonde.
    2. Großes, kontrastreiches **Stromrichtungs-Badge (`I ━━━▶`) + Messzangen-Ring** direkt an der Messspitze auf der Leitung sowie Richtungspfeil (`→`, `↓`, `←`, `↑`) im Sonden-Kästchen.
    3. KCL-basierte vorzeichenrichtige Berechnung des Zweigstroms entlang der Pfeilrichtung (`+I` in Pfeilrichtung, `−I` gegen die Pfeilrichtung).
    4. Doppelklick auf eine Stromsonde (oder Rechtsklick → „Stromrichtung umkehren (⇄)") kehrt die Messrichtung sofort um 180° um.

### 32.2 Ergebnisse Runde 31 (W98–W99)

- **W98a (`src/components/Canvas.tsx`)**: Während `wireSegDrag`, `wirePointDrag`, `probeAnchorDrag` und `sr.dragging` wird `sr.netHover = null` gesetzt und der passende Verschiebe-Cursor (`"ns-resize"`, `"ew-resize"`, `"grabbing"`) erzwungen. Im Auswahlmodus (`select` ohne `netDraft`) springt der Anschluss-Magnet nur noch auf Bauteil-Pins (`kind === "pin"`) an – beim Überfahren oder Verschieben von Leitungen erscheint niemals mehr der Stift-Cursor (`PEN_CURSOR`).
- **W98b (`src/components/StatusBar.tsx`)**: Die Elemente unten rechts besitzen feste Breiten mit `tabular-nums` (`min-w-[100px]` für die Prüfung, `w-[44px]` für die Geschwindigkeit, `w-[96px]` für die Simulationszeit), sodass während der laufenden Simulation kein einziges Symbol mehr wackelt oder springt.
- **W98c (`src/state/editor.ts`, `src/components/StatusBar.tsx`, `src/components/SheetTabs.tsx`)**: `reorderSheets(fromId, toId)` erlaubt das freie Umsortieren der Schaltblatt-Reiter in der unteren Leiste per Drag & Drop.
- **W98d (`src/lib/schematic/model.ts`, `src/lib/schematic/netdraw.ts`, `src/lib/schematic/tools.ts`, `src/lib/sim/realtime.ts`, `src/state/editor.ts`)**: `normalizeDocGeometry` nutzt `orthogonalizeWirePoints` statt `straightenWirePoints`, damit mehrknickige Umgehungsleitungen nicht über Bauteil-Pins gefaltet werden. Alle 8 Vorlagen sind auf `GRID = 10` ausgerichtet (0 Fehler, 0 Warnungen, 0 offene Enden, 0 Kurzschlüsse), `rebuild()` befüllt sofort `currents`/`power`, und `restoreLocalProject()` heilt automatisch früher im `localStorage` gespeicherte kurzgeschlossene Vorlagen.
- **W99 (`src/components/Canvas.tsx`, `src/state/editor.ts`)**: `inferWireAngleAt` richtet Strom-/Leistungs-/V·A-Sonden automatisch entlang waagerechter (`0°`) und senkrechter (`90°`) Leitungen aus; `drawProbe` zeichnet an der Messspitze eine Stromzangen-Hülse samt leuchtendem Richtungs-Pfeil-Schild, zeigt den Richtungspfeil (`→`, `↓`, `←`, `↑`) im Kästchen und berechnet den Zweigstrom vorzeichenrichtig in Pfeilrichtung (Umkehren per Doppelklick oder Kontextmenü).
- **Verifikation**: `./node_modules/.bin/tsc --noEmit`, `npx --no-install eslint src`, `npm test` (inkl. Abschnitt 21 für `W98–W99`) und `npx --no-install next build` laufen fehlerfrei durch.

---

## §33 — Runde 32: Touch-Optimierung bei unveränderter Maus- und Tastatursteuerung (W100–W105)

### 33.1 Ursachenanalyse & Plan (W100–W105)

Die Maus- und Tastatursteuerung (`e.pointerType === "mouse"`) bleibt zu 100 % unverändert. Für Touch-Geräte (`e.pointerType === "touch"`, iPad, Tablet, Smartphone, Touch-Laptop) werden folgende 6 Punkte gezielt optimiert:

1. **W100 — Saubere Trennung von 1-Finger- und 2-Finger-Touch-Gesten (`src/components/Canvas.tsx`)**:
   - **Pinch-to-Zoom & 2-Finger-Pan ohne Geister-Aktionen**: Sobald ein zweiter Finger aufsetzt (`e.touches.length >= 2`), werden laufende 1-Finger-Gesten (`sr.dragging`, `sr.panning`, `sr.marquee`, `wireSegDrag`, `wirePointDrag`, `probeAnchorDrag`, `longPressTimer`) sofort abgebrochen (`pinching = true`), damit beim Zoomen mit zwei Fingern niemals versehentlich ein Bauteil verschoben oder ein Leitungs-Eckpunkt gesetzt wird.
   - **1-Finger-Pan auf freiem Hintergrund bei Touch (`pan_on_touch`)**: Zieht man im Auswahl-Modus (`select`) mit dem Finger (`e.pointerType === "touch"`) auf freiem Hintergrund, schwenkt die Arbeitsfläche (`sr.panning = true`); ein kurzer Tipp auf freien Hintergrund hebt wie gewohnt die Auswahl auf. Mit der Maus (`e.pointerType === "mouse"`) bleibt es unverändert beim Auswahlrahmen (`sr.marquee`).
   - **Zuverlässiger Long-Press (500 ms) & Doppeltipp auf allen Touch-Geräten**: Long-Press (Kontextmenü + Vibrations-Feedback) und Touch-Doppeltipp (< 320 ms, < 24 px für Inline-Werteingabe, Stromrichtungs-Umkehr und Leitungsabschluss) prüfen `e.pointerType === "touch"` statt `window.innerWidth < 768`, sodass auch iPads, große Tablets und Touch-Notebooks unterstützt sind.

2. **W101 — Großzügigere Touch-Fangradien (`src/components/Canvas.tsx`)**:
   - Nur bei `e.pointerType === "touch"` werden die Treffer- und Magnetradien vergrößert (Pin-/Leitungs-Magnet `22 / zoom` statt `14 / zoom`, Leitungs-Eckgriffe `20 / zoom` statt `12 / zoom`, Leitungssegmente `14 px` statt `8 px`, Sonden-Messspitze `18 / zoom` statt `10 / zoom`). Für die Maus bleiben sämtliche Radien unverändert.

3. **W102 — Kontextuelle Touch-Schnellaktionsleiste (`touch_only`, `src/components/Canvas.tsx`)**:
   - Sobald der Nutzer per Touch (`e.pointerType === "touch"`) interagiert, erscheint am unteren Canvas-Rand eine kompakte, kontextsensitive Schnellaktionsleiste für Aktionen, die am Desktop über Tastenkürzel laufen:
     - **Beim Platzieren eines Bauteils (`tool === "place"`)**: `↻ 90°`, `↺ -90°`, `⇆ Spiegeln`, `✕ Abbrechen`
     - **Beim Platzieren einer Sonde (`placingProbeKind`)**: `✕ Sonde ablegen`
     - **Beim Zeichnen eines Netzes (`netDraft !== null`)**: `↱ Knick wenden`, `✓ Hier beenden`, `✕ Abbrechen`
     - **Bei aktiver Auswahl (`selection.length > 0`)**: `↻ 90°`, `⇆ Spiegeln`, `✎ Wert / Eigenschaften` (oder `⇄ Stromrichtung` bei Stromsonden), `⎘ Duplizieren`, `🗑 Löschen`, `✕ Fertig`
   - Sobald wieder eine Maus (`e.pointerType === "mouse"`) bewegt oder geklickt wird, blendet sich die Touch-Aktionsleiste automatisch aus.

4. **W103 — Touch-Sortierung der Datei-Tabs & Touch-Platzierung aus Bibliothek/Schnell-Leiste (`src/components/StatusBar.tsx`, `src/components/SheetTabs.tsx`, `src/components/Workbench.tsx`)**:
   - Datei-Tabs unten unterstützen neben HTML5-Drag-and-Drop (Maus) auch Touch-Ziehen (`onTouchStart`, `onTouchMove`, `onTouchEnd` via `document.elementFromPoint` + `data-sheet-id`), damit Reiter auch auf iOS/Android verschoben werden können.
   - Auf Smartphones (`isMobile`) schließt sich das Bibliothek-BottomSheet automatisch, sobald ein Bauteil zum Platzieren angetippt wird (`libraryOpen` wird in `setPlacing` zurückgesetzt), damit man es sofort auf dem Schaltplan absetzen kann.

5. **W104 — Abgerundete Mobile-Werkzeugleiste & größere Touch-Eckgriffe an Instrumenten (`src/components/Workbench.tsx`, `src/components/Instruments.tsx`)**:
   - In `MobileTopBar` und `MobileBottomToolbar` stehen auf Smartphones zusätzlich Undo/Redo, Grundbauteile (`R`, `C`, `L`, `VDC`, `GND`), Beschriftung (`L`, `T`) und Geräte-Schnellzugriff (Oszi / FG) bereit.
   - Die vier Resize-Ecken der schwebenden Instrumenten-Fenster (`Instruments.tsx`) erhalten eine vergrößerte Touch-Trefferfläche, ohne das sichtbare Erscheinungsbild für Mausnutzer zu verändern.

### 33.2 Ergebnisse Runde 32 (W100–W104)

- **W100 (`src/components/Canvas.tsx`)**:
  - Beim Aufsetzen eines 2. Fingers (`onTouchStart` mit `e.touches.length >= 2`) werden laufende 1-Finger-Aktionen (`sr.dragging`, `sr.panning`, `sr.marquee`, `wireSegDrag`, `wirePointDrag`, `probeAnchorDrag`, `longPressTimer`) sofort abgebrochen (`pinching: true`) und `endGesture()` aufgerufen.
  - Im Auswahl-Modus (`select`) schwenkt 1-Finger-Ziehen auf freiem Hintergrund bei Touch (`e.pointerType === "touch"`) den Schaltplan (`pan_on_touch`), während die Maus (`e.pointerType === "mouse"`) unverändert den Auswahlrahmen (`sr.marquee`) aufzieht.
  - Long-Press (500 ms) für das Kontextmenü und Doppeltipp (< 320 ms, < 26 px) funktionieren auf allen Touch-Geräten über `e.pointerType === "touch"`.
- **W101 (`src/components/Canvas.tsx`)**: Vergrößerte Fangradien ausschließlich bei `e.pointerType === "touch"` (Magnet `22 / zoom`, Leitungsgriffe `20 / zoom`, Leitungssegmente `14 px`, Sonden-Anker `18 / zoom`); Maus-Radien bleiben 1:1 unverändert.
- **W102 (`src/components/Canvas.tsx`)**: Kontextuelle Touch-Schnellaktionsleiste (`touch_only`), die nur nach Touch-Interaktion (`isTouchActive`) erscheint und beim Platzieren (`↻ 90°`, `↺ -90°`, `⇆ Spiegeln`, `✕ Abbrechen`), beim Netzzeichnen (`↱ Knick wenden`, `✓ Hier beenden`, `✕ Abbrechen`) sowie bei aktiver Auswahl (`↻ 90°`, `⇆ Spiegeln`, `⇄ Richtung`, `✎ Wert`, `⚙ Inspector`, `⎘ Kopie`, `🗑 Löschen`, `✕`) alle Tastatur-Aktionen direkt per Fingertipp bereitstellt.
- **W103 (`src/components/StatusBar.tsx`, `src/components/SheetTabs.tsx`, `src/state/editor.ts`)**: Datei-Tabs unten unterstützen neben HTML5-Drag-and-Drop auch Touch-Ziehen (`onTouchStart`/`onTouchMove`/`onTouchEnd` über `data-sheet-id`), und `setPlacing(partId)` schließt automatisch `libraryOpen`.
- **W104 (`src/components/Workbench.tsx`, `src/components/Instruments.tsx`)**: `MobileTopBar` enthält Undo/Redo-Buttons, `MobileBottomToolbar` bietet alle Zeichenwerkzeuge und die 5 Grundbauteile (`R`, `C`, `L`, `VDC`, `GND`), die doppelte `StatusBar` im `BottomSheet` wurde entfernt, und die Titelleiste der Instrumenten-Fenster besitzt `touchAction: "none"`.

---

## §34 — Runde 33: Physikalisch sinnvolle, gut sichtbare und sprungfreie Stromanimation (W105–W107)

### 34.1 Ursachenanalyse & Physikalische Einordnung (W105–W107)

1. **Physikalische Frage (Geschwindigkeit vs. Menge/Dichte der Ladungsträger)**:
   - In einem metallischen Leiter ist die **Ladungsträgerdichte $n$ konstant** (der Draht ist immer gleichmäßig mit freien Leitungselektronen gefüllt; bei größerem Strom entstehen nicht „mehr Elektronen“ im Draht).
   - Nach $I = n \cdot e \cdot A \cdot v_d$ ist die **Stromstärke $I$ proportional zur Driftgeschwindigkeit $v_d$** der Ladungsträger.
   - Würde man die Anzahl/den Abstand der Punkte dynamisch mit $I(t)$ ändern, würden bei Wechselstrom oder beim Laden/Entladen eines Kondensators ständig Punkte auf der Leitung aufploppen und verschwinden (was erneut ein Springen verursacht).
   - **Sinnvolle Darstellung**: Fester, gleichmäßiger Punktabstand (`SPACING = 22 px` entlang der Leitung = konstante Ladungsträgerdichte $n$), während die **Geschwindigkeit** stetig mit der Stromstärke $|I|$ skaliert (komprimierte logarithmische Kennlinie von $\sim 14\,\text{px/s}$ bei $\mu\text{A}$ bis $\sim 120\,\text{px/s}$ bei $\text{A}$, damit sowohl Basisströme im $\mu\text{A}$-Bereich als auch Lastströme im $\text{mA}/\text{A}$-Bereich ohne Stroboskop-Effekt gleichzeitig erkennbar sind). Bei sehr kleinen Strömen blendet die Deckkraft sanft ein/aus; bei $I = 0$ kommen die Ladungsträger ruhig zum Stehen.

2. **W105 — Ursache des „Springens“ bei Stromumkehr oder Stromänderung (`src/components/Canvas.tsx`)**:
   - **Ursache**: Bisher wurde die Punktposition über `offset = (_flowPhase * speed * dir) % totalLen` aus der **Gesamtzeit seit Simulationsstart** (`_flowPhase`) berechnet. Sobald `dir` von $+1$ auf $-1$ wechselte (oder `speed` sich änderte), sprang `_flowPhase * speed * dir` schlagartig auf einen völlig anderen Modulo-Wert!
   - **Lösung**: Wir speichern pro Leitung `wire.id` eine eigene kontinuierliche Phase `phasePx` (`Map<string, number>`) und **integrieren** in jedem Frame nur das Weg-Inkrement:
     $$\text{phasePx}_{k+1} = (\text{phasePx}_k + \text{dir} \cdot \text{speed}(|I|) \cdot \Delta t) \bmod \text{SPACING}$$
     Kehrt sich der Strom um, wechselt nur das Vorzeichen des winzigen Frame-Inkrements $\Delta x$ – die Ladungsträger bremsen an Ort und Stelle ab und laufen exakt von ihrer aktuellen Position aus in die Gegenrichtung zurück.

3. **W106 — Vollständige Pin-Ströme inkl. Mehrpol-Bauteilen (NE555, OPV, Transistoren) & KCL-Bilanz (`src/components/Canvas.tsx`)**:
   - **Ursache**: Bisher wurden für die Stromanimation nur 2-polige Bauteile (`part.pins.length === 2`) ausgewertet. Lag ein Zweig zwischen einem IC-Pin (z. B. `U1.DIS` oder `U1.OUT` beim NE555) und einem Knoten, fehlte der IC-Pin als Quelle/Senke.
   - **Lösung**: Unbestimmte IC-/Mehrpol-Pins eines Netzes erhalten per Kirchhoffschem Knotensatz (KCL) automatisch den aus den angeschlossenen Zweipolen resultierenden Bilanzstrom $-\sum I_{\text{bekannt}}$ (bzw. `engine.sim.pinCurrent`), sodass alle Zweige (auch `DIS`, `OUT`, Transistor-Kollektor/Emitter/Basis) korrekt durchflossen werden.

4. **W107 — Deutlich bessere Sichtbarkeit der fließenden Ladungsträger (`src/components/Canvas.tsx`)**:
   - **Ursache**: Bisher wurden kleine mattgraue Punkte (`#94a3b8`, Radius `2 px`, Abstand `60 px`) ohne Kontrastrand direkt auf die blaue Leitung gezeichnet.
   - **Lösung**: Gleichmäßiger Abstand (`22 px`) und kontrastreiche Ladungsträger-Perlen (leuchtendes Goldgelb `#fde047` bei Elektronenfluss bzw. Warmweiß `#ffffff` bei technischer Stromrichtung, eingefasst von einem dunklen Kontrastrand `#0f172a` mit Radius `2.9 px`), die sich im Dark- und Light-Mode sowie auf jeder Leitungsfarbe klar abheben.

### 34.2 Ergebnisse Runde 33 (W105–W107)

- **W105 (`src/components/Canvas.tsx`)**: Jede Leitung besitzt in `flowState._wirePhases` eine eigene kontinuierlich integrierte Phase `phasePx` (`phase_k+1 = (phase_k + dir * speed * dt) % 22`). Bei Richtungsumkehr oder Stromänderung ändert sich nur das infinitesimale Frame-Inkrement `dir * speed * dt` – es gibt keinerlei Positions-Sprünge mehr.
- **W106 (`src/components/Canvas.tsx`)**: T-Abzweige mitten auf Leitungssegmenten werden beim Aufbau des Leitungsgraphen automatisch verknüpft, und Mehrpol-Bauteile (NE555, OPV, BJT, MOSFET) erhalten per KCL den Gegenstrom der angeschlossenen Zweipole, sodass ein stetiges Knotenpotential `phi` über 24 Relaxationsschritte die Flussrichtung auf allen Zweigen bestimmt.
- **W107 (`src/components/Canvas.tsx`)**: Ladungsträger werden im festen Abstand `FLOW_SPACING = 22 px` als kontrastreiche Perlen (`#fde047` mit dunklem Rand `rgba(15,23,42,0.88)`, Radius `2.85 px`) gezeichnet.

---

## §35 — Runde 34: Entschlackte Menüs, Einstellungen im macOS-Stil & einheitliche Symbole auf Mobilgeräten (W108–W110)

### 35.1 Ursachenanalyse & Plan (W108–W110)

1. **W108 — Menüs (`MenuBar.tsx`) entschlacken, insbesondere „Bearbeiten“ und „Ansicht“**:
   - **Ursache**: Im Menü „Bearbeiten“ standen 22 Einträge (inkl. 8 einzelner Ausrichten-/Verteilen-Befehle mit internem Label `Anordnen (W55)` sowie `Leitungen prüfen & reparieren`). Im Menü „Ansicht“ standen permanente Grundeinstellungen wie `Stromrichtung: − nach +`, `System (Auto)` / `Dunkel` / `Hell`, `Blattrand`, `Lineale` sowie lose Checkboxen (`Strom`, `Farben`) rechts in der Menüleiste.
   - **Lösung**:
     - **Bearbeiten** wird auf die klassischen Kernbefehle reduziert: `Rückgängig`, `Wiederholen`, `Kopieren`, `Einfügen`, `Duplizieren`, `Alles auswählen`, `Drehen (+90°)`, `Drehen (−90°)`, `Spiegeln`, `Leitungen begradigen`, `Löschen`.
     - **Ansicht** enthält nur noch die schnellen Ansichts-Umschalter: `Einpassen (F)`, `Stromfluss animieren`, `Spannungsfarben`, `Bibliothek`, `Inspector`, `Auswertung & Konsole`, sowie `Einstellungen …` (`⌘,`).
     - Grundeinstellungen wie **Stromrichtung** (`Elektronenfluss − → +` vs. `Technisch + → −`), **Erscheinungsbild** (`System`, `Dunkel`, `Hell`), **Lineale**, **Blattrand** und **Live-Werte** wandern komplett in die Einstellungen (`SettingsDialog.tsx`).
     - Die losen Checkboxen `Strom` / `Farben` und der doppelte `⌘K`-Button rechts in der `MenuBar` werden entfernt; dort steht nur noch das Zahnrad-Icon für die Einstellungen.

2. **W109 — Professioneller Einstellungs-Dialog im macOS-Stil ohne Tipps (`SettingsDialog.tsx`)**:
   - **Ursache**: `SettingsDialog.tsx` enthielt Marketing-/Entwickler-Textkästen (`💡 Tipp`, `✨ Wow-Details`, `♿ Accessibility`), funktionslose Dummy-Selects/Checkboxen und einfache Standard-Checkboxen.
   - **Lösung**: Kompletter Neubau im **macOS System-Settings-Stil**:
     - Zwei-Spalten-Layout mit linker Sidebar (`Allgemein`, `Arbeitsfläche`, `Simulation`, `Messsonden`) und rechten **Grouped-Inset-Cards**.
     - Echte **macOS Toggle-Switches** und **macOS Segmented Controls** (u. a. für `Erscheinungsbild`, `Stromrichtung: Elektronen (− → +) / Technisch (+ → −)` und `Schaltzeichen-Norm: Auto / IEC / ANSI`).
     - Keinerlei Tipps, keine „Wow-Details“-Boxen und keine funktionslosen Dummy-Steuerelemente.

3. **W110 — Einheitliche Symbole auf dem Smartphone wie am Desktop (`Workbench.tsx`, `ComponentStrip.tsx`)**:
   - **Ursache**: `Workbench.tsx` nutzte auf Smartphones (`isMobile`) eine eigene `MobileBottomToolbar` mit Text-Zeichen (`"↖"`, `"✎"`, `"⌫"`, `"◉"`, `"R"`, `"C"`) statt der echten `DrawingTools`-Icons (`MousePointer2`, `Pencil`, `Eraser`, `GitCommitHorizontal`, `Tag`, `StickyNote`), `PartGlyph`-Schaltzeichen und farbigen Sonden-Pills aus `ComponentStrip.tsx`.
   - **Lösung**: Auf Smartphones wird dieselbe `ComponentStrip` mit `<DrawingTools />` (horizontal scrollbar) verwendet wie auf Tablet und Desktop – damit sind der Auswahl-Cursor (`MousePointer2`), Stift, Radiergummi, Knotenpunkt, Bauteil-Schaltzeichen und die Probe-Symbole (`V`, `A`, `▾`) auf allen Geräten zu 100 % identisch.

### 35.2 Ergebnisse Runde 34 (W108–W110)

- **W108 (`src/components/MenuBar.tsx`)**:
  - Das Menü **Bearbeiten** wurde von 22 auf 11 klare Standardbefehle entschlackt (`Rückgängig`, `Wiederholen`, `Kopieren`, `Einfügen`, `Duplizieren`, `Alles auswählen`, `Drehen (+90°)`, `Drehen (−90°)`, `Spiegeln`, `Leitungen begradigen`, `Löschen`).
  - Das Menü **Ansicht** enthält nur noch die schnellen Ansichts-Umschalter (`Schaltplan einpassen`, `Stromfluss animieren`, `Spannungsfarben`, `Bibliothek`, `Inspector`, `Auswertung & Konsole`, `Einstellungen …`); Grundeinstellungen wie `Stromrichtung`, `Erscheinungsbild`, `Lineale`, `Blattrand` und `Live-Messwerte` wurden in die Einstellungen verschoben.
  - Die losen Checkboxen (`Strom`, `Farben`) rechts in der Menüleiste wurden entfernt.
- **W109 (`src/components/SettingsDialog.tsx`)**:
  - Kompletter Neubau im **macOS System-Settings-Stil** (linke Sidebar `Allgemein`, `Arbeitsfläche`, `Simulation`, `Messsonden` + rechte Grouped-Inset-Cards mit echten macOS-Toggle-Switches und macOS-Segmented-Controls).
  - Alle Tipp-Kästen (`💡 Tipp`, `✨ Wow-Details`, `♿ Accessibility`) und funktionslosen Dummy-Steuerelemente wurden entfernt.
  - Unter `Simulation` lässt sich die **Stromrichtung** (`Elektronen (− → +)` vs. `Technisch (+ → −)`) direkt per Segmented Control umschalten.
- **W110 (`src/components/Workbench.tsx`, `src/components/ComponentStrip.tsx`)**:
  - Die abweichende `MobileBottomToolbar` (mit Text-Symbolen `"↖"`, `"✎"`, `"⌫"`, `"◉"`, `"V"`, `"A"`) wurde durch `<ComponentStrip tools={<DrawingTools />} />` ersetzt, sodass Cursor-, Werkzeug-, Bauteil- und Sonden-Symbole auf dem Smartphone exakt mit der Desktop-Ansicht übereinstimmen.

---

## §36 — Runde 35: Einheitliche Fenster-Kopfleiste, einzeilige Menüs, dezenter & physikalisch exakter Stromfluss & Bauteile-Editor (W111–W115)

### 36.1 Ursachenanalyse & Plan (W111–W115)

1. **W111 — Einheitliche Fenster-Kopfleiste für alle Fenster & Dialoge (`SettingsDialog.tsx`, `ui.tsx`)**:
   - **Ursache**: `SettingsDialog.tsx` hatte oben links einen roten macOS-Schließpunkt (`#ff5f57`) und einen zentrierten Titel, während `LibraryPalette` und `Instruments` ihre Fenstertitelleiste mit Icon + Titel links und dem `X`-Schließen-Button rechts darstellen.
   - **Lösung**: `SettingsDialog.tsx` und `Dialog` (`ui.tsx`) erhalten exakt dieselbe obere Fensterleiste wie die übrigen App-Fenster (`h-9`, `borderBottom: 1px solid var(--border)`, links Icon + Titel, rechts `<button className="btn px-1 py-0.5 h-6"><X size={13} /></button>`).

2. **W112 — Keine Zweizeiler in den oberen Dropdown-Menüs (`ui.tsx`, `MenuBar.tsx`)**:
   - **Ursache**: In `Menu` (`ui.tsx`) fehlte `w-max`, und in `MenuItem` fehlte `whitespace-nowrap`. Dadurch brachen längere Menüeinträge zusammen mit dem Shortcut-Hint bei 248 px Breite auf zwei Zeilen um.
   - **Lösung**: `Menu` erhält `w-max min-w-[220px]` und `MenuItem` erhält `whitespace-nowrap` auf Button und Label-Span; alle Menübezeichnungen in `MenuBar.tsx` bleiben prägnant und garantiert einzeilig.

3. **W113 — Dezenteres Farbdesign der Stromfluss-Animation (`Canvas.tsx`)**:
   - **Ursache**: Die Ladungsträger-Perlen (`r = 2.85 px`, `#fde047` mit fast schwarzem Rand und voller Deckkraft `1.0`) wirkten farblich zu grell und dominant.
   - **Lösung**: Kleinere, feinere Perlen (`r = 2.0 px`), gedämpfte warme Bernsteinfarbe (`#f59e0b` / `#e2e8f0`) mit sanfter Transparenz (`maxAlpha = 0.68`) und dezentem Konturrand (`rgba(15, 23, 42, 0.45)`).

4. **W114 — Physikalisch exakter Stromfluss (Spannungsquelle Minuspol & NE555 LED bei ausgeschaltetem Ausgang, `engine.ts`, `Canvas.tsx`)**:
   - **Ursache A (Minuspol der Spannungsquelle)**: Masse-Netze (`"0"`) bestehen im Schaltplan oft aus mehreren grafisch getrennten Leitungs-Inseln (jeweils ein Bauteil-Pin zu einem eigenen `GND`-Symbol mit `pins.length === 1`). Bisher wurden alle Pins von Netz `"0"` global in einen Topf geworfen und `GND`-Symbole (`pins.length === 1`) als `isMultiPin` behandelt, wodurch sich auf einzelnen Masse-Zweigen (z. B. `V1−` zu `GND1`) das Vorzeichen umkehren konnte.
   - **Ursache B (Strom in der LED bei ausgeschaltetem Ausgang in `astable555`)**:
     1. In `engine.ts` (`TIMER555`) war `vOutIdeal` bei `q = 0` auf `0.1 V` statt `vGnd` (`0 V`) gesetzt und `pinCurrent(d, 2)` gab `+iout` statt `-iout` zurück (obwohl `pinCurrent` positiv *in* das Bauteil hinein definiert ist).
     2. In `Canvas.tsx` lag die Anzeigeschwelle bei `1e-9 A` (1 nA!). Dadurch reichte schon der winzige numerische Sperr-/Leckstrom einer gesperrten LED aus, um sichtbare Strompunkte in die ausgeschaltete LED wandern zu lassen.
     3. Außerdem wurde die Stromstärke `mag` bisher pro Gesamtnetz (`netMag`) statt pro einzelnem Leitungszweig bestimmt, sodass selbst unbelastete Stichleitungen (z. B. zu hochohmigen Komparator-Eingängen `TRIG`/`THRES`) animiert wurden.
   - **Lösung**:
     1. In `engine.ts` liefert `TIMER555` bei `q = 0` echten Low-Pegel (`vGnd`), und `pinCurrent` liefert für alle Mehrpol-Bauteile (`TIMER555`, `Q`, `M`, `J`, `OPAMP`, `COMPARATOR`, `POT`, `VREG`) vorzeichenrichtig den Strom *in* den jeweiligen Pin hinein.
     2. In `Canvas.tsx` wird die KCL-Bilanz **pro zusammenhängender Leitungs-Komponente (Connected Component im Draht-Graphen `adj`)** gelöst: `GND`-Pins (`partId === "gnd"`) nehmen exakt den Rückstrom ihrer jeweiligen Leitungs-Insel auf, und aus dem gelösten linearen Kirchhoff-System $\sum_{v \in N(u)} (\phi(u) - \phi(v)) = I_{\text{inj}}(u)$ ergibt sich auf jedem Draht der echte physikalische Zweigstrom $I_{\text{wire}} = \Delta \phi$ in Ampere.
     3. Die Sichtbarkeitsschwelle wird auf physikalisch sinnvolle `10 µA` (`1e-5 A`) angehoben – unterhalb von `10 µA` (Sperrströme, hochohmige Eingänge, ausgeschalteter Ausgang) steht der Stromfluss komplett still.

5. **W115 — Eigener Bauteile-Editor mit Gehäuse & Pin-Zuweisung (`src/lib/library/customParts.ts`, `src/components/PartEditorDialog.tsx`, `LibraryPalette.tsx`, `MenuBar.tsx`)**:
   - Neuer Bauteile-Editor im einheitlichen Fenster-Design:
     - Auswahl des **Gehäuses / Footprints** (`DIP-8`, `DIP-14`, `DIP-16`, `SOIC-8`, `TO-220`, `TO-92`, `SOT-23`, `0805`, `Eigenes IC`),
     - Interaktive **Pin-Zuweisung** (Pin-Nummer, Name, Gehäuseseite `Links`/`Rechts`/`Oben`/`Unten`, elektrische Funktion) mit **Live-Schaltzeichen- & Gehäuse-Vorschau**,
     - Speicherung in der Bauteil-Bibliothek (`localStorage` + sofortige Registrierung in `PARTS` / `PART_MAP` unter `Eigene Bauteile`), direkt erreichbar über die Bibliothek (`+ Neues Bauteil`) und das Menü `Datei → Bauteil-Editor …`.

### 36.2 Ergebnisse Runde 35 (W111–W115)

- **W111 (`src/components/SettingsDialog.tsx`, `src/components/ui.tsx`)**: Alle Dialoge und Fenster (`SettingsDialog`, `Dialog`, `PartEditorDialog`, `LibraryPalette`, `Instruments`) nutzen nun dieselbe obere Fensterleiste (`h-9`, `borderBottom: 1px solid var(--border)`, Titel links, `X`-Button rechts).
- **W112 (`src/components/ui.tsx`, `src/components/MenuBar.tsx`)**: `Menu` (`w-max min-w-[220px]`) und `MenuItem` (`whitespace-nowrap`) verhindern jeglichen Zeilenumbruch in den oberen Dropdown-Menüs.
- **W113 (`src/components/Canvas.tsx`)**: Dezentere Ladungsträger-Perlen (`r = 2.0 px`, warme Bernsteinfarbe `#f59e0b` bzw. `#cbd5e1` mit sanfter Deckkraft `0.32..0.68` und feinem Rand `0.85 px`).
- **W114 (`src/lib/sim/engine.ts`, `src/components/Canvas.tsx`)**:
  - Die Totem-Pole-Ausgangsstufe des `TIMER555` speist bei `q = 1` (`HIGH`) ihren Laststrom echt aus `VCC` (`nVcc`) nach `OUT` (`nOut`) und zieht bei `q = 0` (`LOW`) `OUT` direkt nach `GND` (`0 V`). Dadurch ist der Strom durch die LED bei ausgeschaltetem Ausgang exakt `0 A`.
  - In `Canvas.tsx` wird das Kirchhoff-System pro zusammenhängender Leitungs-Insel (Connected Component im Draht-Graphen `adj`) gelöst; `GND`-Symbole nehmen exakt den Rückstrom ihrer jeweiligen Leitungs-Insel auf, und hochohmige Steuereingänge (`TRIG`, `THR`, `RST`, `IN+`, `IN-`, `Gate`) erhalten keinen künstlichen Ausgleichsstrom.
  - Die Anzeigeschwelle liegt bei `10 µA` (`1e-5 A`), sodass Leck-/Sperrströme unterdrückt werden.
- **W115 (`src/lib/library/customParts.ts`, `src/components/PartEditorDialog.tsx`, `src/components/LibraryPalette.tsx`, `src/components/MenuBar.tsx`, `src/components/Workbench.tsx`)**:
  - Vollständiger Bauteile-Editor mit Gehäuse-Vorlagen (`DIP-8`, `SOIC-8`, `DIP-14`, `DIP-16`, `TO-220`, `SOT-23`, `0805`), frei konfigurierbarer Pin-Zuweisung (Name, Seite, elektrische Funktion), Live-Schaltzeichen- & Gehäuse-Vorschau und Speicherung in der Bibliothek.

---

## §37 — Runde 36: Kompakte Inline-Textfelder mit Einheit, edles Notiz-Design & Windows-Desktop-App-Workflow mit rahmenlosen Multi-Fenstern (W116–W118)

### 37.1 Ursachenanalyse & Plan (W116–W118)

1. **W116 — Inline-Textfelder auf dem Canvas (Widerstandswert, Netzname, Notiz) nicht mehr über die volle Bildschirmbreite & mit Einheit (`Canvas.tsx`, `globals.css`)**:
   - **Ursache**: Die globale CSS-Klasse `.input` in `src/app/globals.css` setzt `width: 100%` außerhalb von `@layer utilities` und überschrieb dadurch in Tailwind v4 die Klasse `w-48` des Inline-Editors in `Canvas.tsx`. Zudem fehlten beim Bearbeiten eines Bauteilwerts das Bauteil-Label (`R1`, `C1` …) und die physikalische Einheit (`Ω`, `F`, `H`, `V`, `A`, `Hz`).
   - **Lösung**:
     - Das Inline-Editor-Popover auf dem Canvas erhält eine feste, kompakte Breite (`width: auto` mit expliziter `style={{ width: ... }}`), ein solides, abgedunkeltes Panel-Design mit warmem Bernstein-Fokusrahmen (`var(--wire-sel)`), links das Bauteil-/Typ-Badge (`R1`, `NET`, `NOTIZ`), rechts direkt im Feld das **Einheiten-Badge** (`Ω`, `F`, `H`, `V`, `A`, `Hz`) und einen Bestätigungs-Button (`↵`).

2. **W117 — Neues, hochwertiges Notiz-Design auf dem Schaltplan (`Canvas.tsx`)**:
   - **Ursache**: Notizen (`doc.notes`) wurden bisher nur als nackter grauer Text (`ctx.fillText`) ohne Karte, ohne Akzent und ohne mehrzeilige Darstellung auf den Hintergrund gezeichnet; auch die Vorschau und die Trefferfläche waren rudimentär.
   - **Lösung**:
     - Notizen werden als technische **Laborbuch-Callout-Karten** gezeichnet: abgerundetes Kärtchen (`var(--panel-solid)` mit feinem Rahmen `var(--border-strong)` und sanftem Schatten), links ein **3 px breiter warmer Bernstein-Akzentstreifen** (`#f59e0b`), oben links ein dezentes `NOTIZ`-Kopf-Badge + Pin-Ankerpunkt, klare Typografie (`var(--text)`) und Unterstützung für mehrzeiligen Text (`\n` bzw. Wortumbruch).
     - Sowohl die Platzier-Vorschau (`tool === "text"`) als auch der Klick-/Doppelklick-Hit-Test prüfen die gesamte Kartenfläche.

3. **W118 — Zusätzlicher GitHub-Workflow & Electron-Shell für Windows-Desktop-App mit rahmenlosen iTunes-Stil-Fenstern (`.github/workflows/windows-app.yml`, `desktop/`, `Workbench.tsx`, `Instruments.tsx`, `LibraryPalette.tsx`)**:
   - **Anforderung (`ask_user` bestätigt)**:
     - Web-App bleibt 100 % wie bisher.
     - Zusätzliche Workflow-Datei `.github/workflows/windows-app.yml`, die auf `windows-latest` aus dem Projekt eine echte Windows-Desktop-App (Portable `.exe` + NSIS-Installer `.exe`) baut und als GitHub-Artifact bereitstellt.
     - Sowohl das **Hauptfenster** als auch die **Messgeräte / Inspector** und die **Bibliothek** laufen unter Windows als **eigene rahmenlose Windows-Fenster (`frame: false`)** ohne Standard-Windows-Titelleiste, stattdessen mit einer eigens designten, ziehbaren Custom-Window-Bar im **iTunes-für-Windows-Stil** (gebürsteter/ dunkler Studio-Header mit integrierten Fenster-Buttons Minimieren/Maximieren/Schließen).
     - Live-Synchronisation zwischen Hauptfenster und ausgelagerten Geräte-/Bibliotheksfenstern über `BroadcastChannel("multispice-desktop-sync")` + Electron-IPC.

### 37.2 Umsetzung & Verifikation (`W116–W118`)

- **`W116` (`src/components/Canvas.tsx`)**:
  - Das nackte `<input className="input mono absolute z-40 w-48">` (das wegen `.input { width: 100% }` über die gesamte Bildschirmbreite gestreckt wurde) wurde durch ein kompaktes, schwebendes **Inline-Popover-Kärtchen** (`width: 196 px` für Bauteilwerte/Netznamen bzw. `248 px` für Notizen) ersetzt.
  - Oben links zeigt ein Kontext-Badge den Bauteil-Bezeichner (`R1`, `C1`, `V1` …) bzw. `NET` oder `NOTIZ`, rechts daneben den Parameternamen (z. B. `Widerstand`, `Kapazität`, `Netzname`).
  - Im Eingabefeld selbst wird rechtsbündig direkt die **physikalische Einheit (`Ω`, `F`, `H`, `V`, `A`, `Hz`)** als festes Einheiten-Badge eingeblendet.
- **`W117` (`src/components/Canvas.tsx`)**:
  - Notizen (`doc.notes`) werden als hochwertige **Laborbuch-Notizkarten** gezeichnet: abgerundetes Kärtchen (`var(--panel-solid)` mit feinem Schatten und Rahmen), links ein **3,5 px breiter warmer Bernstein-Akzentstreifen (`#f59e0b`)**, oben ein dezentes `NOTIZ`-Kopf-Badge und darunter klar lesbarer ein- oder mehrzeiliger Notiztext (`var(--text)`).
  - Sowohl die Live-Vorschau beim Platzieren (`tool === "text"`) als auch `getNoteBounds` / `hitTestNote` verwenden exakt die neue Kartengeometrie.
- **`W118` (`src/components/DesktopTitleBar.tsx`, `src/components/Workbench.tsx`, `src/components/Instruments.tsx`, `src/components/LibraryPalette.tsx`, `desktop/main.cjs`, `desktop/preload.cjs`, `.github/workflows/windows-app.yml`)**:
  - Web-App bleibt zu 100 % unverändert.
  - In der Windows-Desktop-App (Electron) öffnen das **Hauptfenster**, alle **Messgeräte / Inspector** (`StandaloneInstrumentView`) und die **Bauteile-Bibliothek** (`LibraryPalette standalone`) als echte, eigenständige **rahmenlose Windows-OS-Fenster (`frame: false`)** ohne Standard-Windows-Titelleiste.
  - Jedes Fenster besitzt oben die maßgeschneiderte **`DesktopTitleBar`** im Stil von **iTunes für Windows** (gebürstete dunkle Metall-Optik, ziehbar per `-webkit-app-region: drag`, integriertes LCD-Statusfenster im Hauptfenster und eigene Minimieren-/Maximieren-/Schließen-Buttons).
  - `.github/workflows/windows-app.yml` baut auf `windows-latest` den statischen Next.js-Export (`out/`) und paketiert mit `electron-builder` sowohl die **Portable `.exe`** als auch den **NSIS-Installer `.exe`** als GitHub-Actions-Artefakt (`MultiSpice-Windows-App`).

---

## §38 — Runde 37 (`W119–W123`): Windows-Workflow-Überwachung & Umfangreiches Bauteil-Studio (Transistor-Innenschaltung, Symbol-Zeicheneditor, Gehäuse & Pin-Mapping)

### 38.1 Analyse & Plan (`W119–W123`)

1. **`W119` — Windows-App GitHub-Actions-Workflow reparieren & per Check-Annotations überwachen (`.github/workflows/windows-app.yml`, `desktop/package.json`)**:
   - **Ursache des Fehlers in Run `37038326578`**: In `electron-builder` ist `${target}` in `win.artifactName` keine gültige Substitutions-Variable (`Unknown substitution: target`); `artifactName` muss pro Target (`portable.artifactName` und `nsis.artifactName`) definiert werden. Zudem legen wir eine saubere, statische `desktop/package.json` im Repository ab statt sie in PowerShell per `ConvertTo-Json` zu serialisieren.
   - **Überwachung per Annotations/Kommentar**: Da die Sandbox den Zip-Download von `results-receiver.actions.githubusercontent.com` blockiert, gibt der Workflow Baufortschritt, etwaige Fehlermeldungen und die erzeugten `.exe`-Artefakte samt Dateigröße als GitHub-Actions-Annotations (`::notice title=...::` / `::error title=...::`) aus, die direkt über `gh run view` ausgelesen werden können.

2. **`W120` — Umfangreiche Transistor-/Subcircuit-Innenschaltung im Bauteil-Studio (`src/lib/library/customParts.ts`, `src/components/PartEditorDialog.tsx`)**:
   - Eigene Bauteile können eine vollständige **Innenschaltung (Subcircuit / Makromodell)** aus Transistoren (`NPN`, `PNP`, `NMOS`, `PMOS`), Dioden (`Diode`, `Zener`), Komparatoren/OpAmps, Widerständen (`R`), Kondensatoren (`C`), Spulen (`L`) und Quellen (`V`, `I`) besitzen.
   - **Drei Wege zum Aufbau**:
     1. **Vom aktuellen Schaltplan übernehmen**: Liest alle Bauteile, Leitungen und Netzlabels vom Canvas ein und wandelt Netzlabels automatisch in Ein-/Ausgangs-Pins um.
     2. **Interaktiver Innenschaltungs-Baukasten**: Direktes Hinzufügen/Bearbeiten interner Transistoren, Widerstände usw. samt Knoten-Verbindungen und Live-Topologie-Schaltbild.
     3. **Fertige Transistor-Innenschaltungs-Vorlagen**: u. a. **NE555 mit 3× 5 kΩ-Spannungsteiler, Komparatoren, Flip-Flop, NPN-Entladetransistor (`DISCH`) und Push-Pull-Transistor-Endstufe (`OUT`)**, **Diskreter Operationsverstärker (NPN/PNP-Differenzstufe)**, **CMOS-Inverter (PMOS + NMOS)**, **Darlington-Transistorstufe** und **Transistor-Konstantstromquelle**.
   - **Echte MNA-Simulation**: `compileSubcircuitToDevices` expandiert die Innenschaltung für jede platzierte Instanz mit isolierten internen Knoten (`${inst.id}__sub_${node}`) und direkt angebundenen Außen-Pins in echte Simulator-Devices.

3. **`W121` — Interaktiver Symbol-Zeicheneditor (`SymbolCanvasEditor` in `src/components/PartEditorDialog.tsx`)**:
   - Grafische Zeichenfläche mit Raster zum **selber Zeichnen und Beschriften** von Schaltsymbolen:
     - Werkzeuge für **Auswählen/Verschieben**, **Linie/Polylinie (Dreieck/Pfeil)**, **Rechteck (gefüllt/ungefüllt, abgerundet)**, **Kreis**, **Bogen**, **freie Text-Beschriftung** (Größe & Ausrichtung) sowie **freies Platzieren/Verschieben der Ein- und Ausgangspins**.
     - Schnellgeneratoren (Standard-IC-Block, Transistor-Kreis, Verstärker-Dreieck, Leeres Blatt) als Startpunkt.

4. **`W122` — Ein-/Ausgangs-Pins & Gehäuse-Editor (`src/components/PartEditorDialog.tsx`)**:
   - Jeder Pin besitzt Name, Pin-Nummer, elektrische Rolle (`IN`, `OUT`, `I/O`, `VCC`, `GND`, `PASSIVE`), optionale Symbol-Markierung (`Invertiert ○`, `Takteingang ▷`), Position/Seite und den **zugeordneten Knoten der Innenschaltung**.
   - Interaktive Gehäuse-Draufsicht (`DIP-8`, `DIP-14`, `DIP-16`, `SOIC-8`, `TO-220`, `TO-92`, `SOT-23`, `QFP-16`, `Custom`) mit Pin-1-Markierung und Pin-Zuordnung.

5. **`W123` — Bauteil-Verwaltung, Nachbearbeiten, JSON-Import/Export & Inspector-Integration**:
   - Bestehende eigene Bauteile können jederzeit im Bauteil-Studio geladen, geändert, dupliziert, gelöscht oder als JSON exportiert/importiert werden.
   - Direkt aus dem Inspector kann ein ausgewähltes eigenes Bauteil im Bauteil-Studio geöffnet werden.

### 38.2 Umsetzung & Verifikation (`W119–W123`)

- **`W119` (`desktop/package.json`, `.github/workflows/windows-app.yml`)**:
  - Statische `desktop/package.json` mit getrennten `portable.artifactName` (`${productName}-${version}-Portable.${ext}`) und `nsis.artifactName` (`${productName}-${version}-Setup.${ext}`) angelegt (behebt den `Unknown substitution: target`-Fehler in `electron-builder`).
  - Workflow gibt Baufortschritt, Fehler-Logs und die erzeugten `.exe`-Artefakte samt Dateigröße als GitHub-Actions-Annotations (`::notice::` / `::error::`) aus, sodass der Lauf direkt über `gh run view` überwacht werden kann.
- **`W120–W123` (`src/lib/library/customParts.ts`, `src/components/PartEditorDialog.tsx`, `src/components/Inspector.tsx`, `src/components/Workbench.tsx`)**:
  - **4-Tab-Bauteil-Studio**:
    1. **Innenschaltung (Transistoren & Knoten)**: Interaktiver Subcircuit-Baukasten (`NPN`, `PNP`, `NMOS`, `PMOS`, `R`, `C`, `L`, `Diode`, `Zener`, `Komparator`, `OPV`, `Quellen`) mit Live-Topologie-Vorschau, direktem Import vom Haupt-Schaltplan (*„Vom Schaltplan übernehmen“*) und 4 kompletten Transistor-Innenschaltungs-Vorlagen (darunter **NE555 Timer mit 3× 5 kΩ-Spannungsteiler, NPN-Darlington-Threshold, PNP-Trigger/Reset, NPN-Open-Collector-Entladetransistor Q14 an DIS und Totem-Pole-Transistor an OUT**).
    2. **Schaltsymbol zeichnen & beschriften**: Interaktiver Vektor-Zeicheneditor (`SymbolCanvasEditor`) auf dem 10-px/5-px-Raster für Linien, Rechtecke, Kreise, Bögen, freie Beschriftungen und ziehbare Pin-Ankerpunkte.
    3. **Ein-/Ausgangs-Pins & Gehäuse**: Pin-Konfigurator mit elektrischer Rolle (`IN`, `OUT`, `I/O`, `VCC`, `GND`), Pin-Markierungen (`Invertiert ○`, `Takt ▷`), Gehäuseseite, Knoten-Mapping zur Innenschaltung und physischer Gehäuse-Draufsicht (`PackageTopView` für `DIP-8`, `SOIC-8`, `DIP-14`, `DIP-16`, `TO-220`, `TO-92`, `0805`).
    4. **Parameter & Verwaltung**: Eigene Bauteil-Parameter, JSON-Export/Import und direkter Sprung aus dem Inspector (*„Im Bauteil-Studio bearbeiten“*).

---

## §39 — Runde 38 (`W124–W129`): Puristische Fensterleiste, Widerstand-Doppelklick nur auf Wert, Windows-Bibliotheksfenster-Fix, Library-Aufräumen, Dock-Entfernung & Windows-Favicon/Ladeanimation

### 39.1 Analyse & Plan (`W124–W129`)

1. **`W124` — Fensterbalken (`DesktopTitleBar.tsx`) komplett ohne Icon & ohne Text, minimal vom Rest abhebend (macOS-Stil)**:
   - **Anforderung**: „Einmal soll nichts im Fenstertitel stehen. Kein Icon, kein Text. Und der fensterbalken soll sich nicht so sehr vom Rest abheben. maximal minimal. Wie bei macos.“
   - **Lösung**:
     - `DesktopTitleBar.tsx` enthält keinerlei Icon, keinen Titeltext und kein Statusdisplay mehr, sondern nur noch die ziehbare Fläche (`-webkit-app-region: drag`) und rechts die dezenten Fenstersteuerung-Buttons (`Minimieren`, `Maximieren`, `Schließen`).
     - Die Hintergrundfarbe ist `var(--panel-solid)` mit einer hauchdünnen `1px solid var(--border)`-Unterkante (ohne metallischen Farbverlauf), sodass sie nahtlos mit dem Fenster verschmilzt.

2. **`W125` — Doppelklick auf Widerstandskörper (nicht auf den Wert) darf nicht das Wertefenster öffnen (`src/components/Canvas.tsx`)**:
   - **Ursache**: In `onDoubleClick` (und beim Touch-Doppeltipp in `onPointerDown`) wurde `const hit = hitTestInstance(...) ?? findInstanceByValueLabel(...)` ausgewertet und für jedes getroffene Bauteil mit numerischem Hauptwert das Inline-Wertefeld (`setEditing({ kind: "value", ... })`) geöffnet.
   - **Lösung**:
     - Nur ein Doppelklick **gezielt auf das Wert-/Bezeichner-Label unterhalb des Bauteils** (`findInstanceByValueLabel(st.doc, world)`) öffnet das Inline-Wertefeld (`setEditing({ kind: "value", ... })`).
     - Ein Doppelklick auf das **Bauteilsymbol selbst** (`hitTestInstance(st.doc, world.x, world.y)`) öffnet dagegen den Inspector (`openInstrument("inspector")`) bzw. bei Oszilloskop/Funktionsgenerator das jeweilige Messgerät.

3. **`W126` — Windows-App: Bibliothek-Fenster schließt sich nicht mehr sofort wieder & zeigt kein Hauptfenster-Aufblitzen (`src/components/DesktopTitleBar.tsx`, `src/components/Workbench.tsx`, `desktop/main.cjs`, `desktop/preload.cjs`)**:
   - **Ursache**:
     1. Beim Öffnen des Kindfensters `/?desktopWindow=library` lieferte `useSyncExternalStore` im ersten SSR-Hydrations-Tick den Server-Snapshot `""` (`role === "main"`). Dadurch lief `useDesktopMultiWindowSync("main")` im Kindfenster an, sah `libraryOpen === false` und rief `bridge.closeChildWindow("library")` auf – das Kindfenster schloss sich selbst sofort wieder!
     2. Zudem zeigte `out/index.html` bis zur Client-Hydration kurzzeitig das vor-gerenderte Hauptfenster.
   - **Lösung**:
     - `preload.cjs` und `DesktopTitleBar.tsx` lesen `window.location.search` direkt aus; `useDesktopMultiWindowSync` prüft `window.location.search` synchron in jedem Effect und ruft `closeChildWindow("library")` nur noch auf, wenn `libraryOpen` im Hauptfenster von `true` auf `false` wechselt (`wasLibraryOpenRef.current && !libraryOpen`).
     - `desktop/main.cjs` akzeptiert `open-child` / `close-child` ausschließlich vom `mainWindow` (`event.sender.id === mainWindow.webContents.id`) und zeigt Kindfenster erst nach `multispice:child-ready` (sobald `LibraryPalette` bzw. `StandaloneInstrumentView` gemountet ist), sodass niemals das Hauptfenster aufblitzt.

4. **`W127` — Bibliothek (`src/components/LibraryPalette.tsx`): Listen/Grid-Umschalter oben rechts & Anfasser-Icon (`Grip`) oben links entfernen**:
   - `<Grip size={12} />` oben links sowie der funktionslose Listen-/Grid-Umschalter-Button oben rechts werden komplett aus `LibraryPalette.tsx` entfernt.

5. **`W128` — Fenster-ins-Dock-Einrasten überall entfernen (`src/components/Instruments.tsx`, `src/state/editor.ts`)**:
   - Der Dock-Button (`PanelBottom`) in der Titelleiste aller Gerätefenster sowie die untere Dock-Leiste in `InstrumentLayer` werden vollständig entfernt; alle Fenster bleiben immer freie, unabhängige Fenster.

6. **`W129` — Schnellerer Start der Portable-Version, Repo-Favicon statt Standard-Logo & minimalistische Ladeanimation (`desktop/package.json`, `desktop/main.cjs`, `.github/workflows/windows-app.yml`)**:
   - `portable` erhält `"compression": "store"` (bzw. schnelles Entpacken ohne schwere LZMA-Dekomprimierung beim Start).
   - Das Repo-Favicon (`public/favicon.png`, `512×512`) wird als Windows-App- und Fenster-Icon (`icon.png` in `build.win.icon` und `BrowserWindow({ icon })`) eingebunden.
   - Beim Start zeigt `desktop/main.cjs` sofort eine minimalistische Ladeansicht mit dem Repo-Favicon und einem feinen Ladebalken auf `#0d1017`, bis die App bereit ist.

### 39.2 Umsetzung & Verifikation (`W124–W129`)

- **`W124` (`src/components/DesktopTitleBar.tsx`)**:
  - Kein Icon, kein Text und kein mittleres Display mehr in der Titelleiste; Hintergrund `var(--panel-solid)` mit einer hauchdünnen `1px solid var(--border)`-Unterkante (minimal vom Rest abhebend wie bei macOS) und dezenten Fensterbuttons rechts.
- **`W125` (`src/components/Canvas.tsx`)**:
  - `onDoubleClick` unterscheidet strikt zwischen `bodyHit = hitTestInstance(...)` und `valueLabelHit = findInstanceByValueLabel(...)`: Nur ein Doppelklick gezielt auf den Wert unter dem Widerstand öffnet das Inline-Wertefeld; ein Doppelklick auf den Widerstandskörper selbst öffnet den Inspector.
- **`W126` (`src/components/DesktopTitleBar.tsx`, `desktop/main.cjs`, `desktop/preload.cjs`)**:
  - Kindfenster (`?desktopWindow=library` / `?desktopWindow=instrument`) lösen beim ersten SSR-Hydrations-Tick niemals `closeChildWindow("library")` aus (`wasLibraryOpenRef` + strikte URL-/Sender-Prüfung `event.sender.id === mainWindow.webContents.id`) und werden erst nach `multispice:child-ready` sichtbar geschaltet.
- **`W127` (`src/components/LibraryPalette.tsx`)**:
  - Anfasser-Icon (`Grip`) oben links und der Listen-/Grid-Umschalter oben rechts entfernt.
- **`W128` (`src/components/Instruments.tsx`)**:
  - Dock-Button (`PanelBottom`) und untere Dock-Leiste komplett entfernt.
- **`W129` (`desktop/main.cjs`, `desktop/package.json`, `.github/workflows/windows-app.yml`)**:
  - `public/favicon.png` (`512×512`) als Windows-`.exe`- und Fenster-Icon eingebunden, `"compression": "store"` für verzögerungsfreien Start der Portable-Version aktiviert und sofortiges minimalistisches Splash-Fenster (`createSplashWindow`) mit Repo-Favicon und feiner Ladeanimation beim Programmstart ergänzt.

---

## §40 — Runde 39 (`W130–W136`): Echtes Datei-Speichern mit Auto-Save nach Erstspeicherung, Vektor-Druck & PDF-Export, Bibliotheks-Klickverhalten, echtes Klicken-Halten-Ziehen, blitzfreie Kindfenster, proportionale Gerätefenster & sofortiger Portable-Splash

### 40.1 Analyse & Plan (`W130–W136`)

1. **`W130` — Echtes Datei-Speichern, Öffnen & automatisches Nachspeichern nach dem ersten Speichern (Windows & Browser)**:
   - **Ursache**:
     - Bisher schrieb `Datei → Lokal speichern (⌘S)` nur in `localStorage` (`multispice.project.v1`), erzeugte aber keine echte Datei auf der Festplatte.
     - Zudem lauschte der lokale HTTP-Server in `desktop/main.cjs` auf `server.listen(0, "127.0.0.1")` (zufälliger Port pro Start), wodurch sich der `localStorage`-Origin bei jedem Neustart der Windows-App änderte.
   - **Lösung**:
     - **Fester Port + native AppData-Persistenz unter Windows**: `desktop/main.cjs` nutzt einen festen Vorzugsport (`17531`, Fallback `17532..17545`) und spiegelt den Arbeitsstand zusätzlich nach `app.getPath("userData")/workspace-state.json`.
     - **Echtes Speichern & Speichern unter (`Strg+S` / `Strg+Umschalt+S`)**:
       - Beim **ersten Speichern** (`Strg+S` oder `Datei → Speichern`) öffnet sich unter Windows der native Windows-Speicherdialog (`dialog.showSaveDialog`, `.msx.json`) bzw. im Browser die File System Access API (`window.showSaveFilePicker`, mit `.msx.json`-Download-Fallback).
       - Sobald die Datei **einmal gespeichert** (oder über `Datei → Öffnen …` geöffnet) wurde, merkt sich MultiSpice den Dateipfad (`currentFilePath` in Windows) bzw. das Datei-Handle (`activeBrowserFileHandle` im Browser).
       - **Ab diesem Moment speichert der Auto-Save (`scheduleAutosave`) jede Änderung automatisch direkt in diese Datei nach** (zusätzlich zum Arbeitskopie-Speicher), und ein erneutes `Strg+S` schreibt sofort ohne erneuten Dialog in dieselbe Datei. `Speichern unter …` (`Strg+Umschalt+S`) fragt jederzeit nach einem neuen Speicherort.

2. **`W131` — Drucken (`Strg+P`) & PDF-/Datei-Export in Browser und Windows-App reparieren**:
   - **Ursache**:
     - `PrintSheet` in `Workbench.tsx` versuchte kurz vor `window.print()` per `c.toDataURL("image/png")` einen Screenshot des (oft dunklen) Canvas in ein `<img>` zu laden, das beim Öffnen der Druckvorschau oft noch nicht dekodiert war.
     - `exportPdf` in `src/lib/export/sheet.ts` rief `window.open("", "_blank")` auf – in Electron (`desktop/main.cjs`) blockierte `setWindowOpenHandler(() => ({ action: "deny" }))` jedes `about:blank`-Popup komplett!
   - **Lösung**:
     - `PrintSheet` rendert das gestochen scharfe, papierweiße Vektor-Schaltblatt (`docToSvg(doc, { frame: false })`) **synchron als Inline-SVG** direkt im DOM – sofort bereit für `Strg+P` und `window.print()`.
     - In der Windows-App (`desktop/main.cjs`) erzeugt `Export PDF` über `webContents.printToPDF({ landscape: true, pageSize: "A4", printBackground: true })` + nativen Speicherdialog eine echte `.pdf`-Datei direkt auf der Festplatte, und `Drucken …` öffnet über ein sauberes Vektor-Druckfenster verlässlich den nativen Windows-Druckdialog.

3. **`W132` — Bibliothek schließt sich nicht beim einfachen Klick auf ein Bauteil, sondern nur beim Klicken & Ziehen oder über den „Platzieren“-Button (`src/components/LibraryPalette.tsx`)**:
   - Ein einfacher Klick auf eine Bauteilzeile (`PartRow`) wählt das Bauteil aus (Detailansicht rechts + Platzier-Vorbereitung), **lässt die Bibliothek aber offen**.
   - Erst ein Klick auf den **„Als … platzieren (Enter)“-Button** (oder `Enter` / Doppelklick) oder das **Klicken, Gedrückthalten und Herausziehen** eines Bauteils auf den Schaltplan schließt die Bibliothek.

4. **`W133` — Echtes „Klicken, gedrückt halten und Ziehen“ (Click-Hold-Drag) ohne Zwischendurch-Loslassen (`src/components/LibraryPalette.tsx`, `src/components/ComponentStrip.tsx`, `src/components/Instruments.tsx`, `src/components/Canvas.tsx`, `src/components/oszi2/Oscilloscope.tsx`, `src/components/fg2/FunctionGenerator.tsx`)**:
   - **Bauteile aus Bibliothek, Schnellleiste (`R`, `C`, `L`, `VDC`, `GND`) und Geräteleiste (`Oszi`, `FG`)**: Drückt man die Maustaste auf ein Bauteil, hält sie gedrückt und zieht auf den Canvas (> 5 px), hängt das Bauteil sofort als Live-Schaltzeichen-Vorschau am Zeiger (die Bibliothek schließt sich dabei automatisch) und wird beim **Loslassen der Maustaste auf dem Canvas** direkt platziert!
   - **Leitungen auf dem Canvas**: Drückt man auf einen Bauteil-Pin, hält die Maustaste gedrückt, zieht zu einem anderen Pin/Netz und lässt los, wird die Leitung sofort beim Loslassen fertig verbunden (ein kurzer Klick ohne Ziehen startet weiterhin das schrittweise Eckpunkt-Verlegen).
   - **BNC-Tastköpfe (Oszi) & Ausgangskabel (FG-2500)**: Reagieren bereits bei `onPointerDown`, sodass man ein Kabel anklicken, gedrückt halten, direkt auf Klemme/Schaltplan ziehen und beim Loslassen anschließen kann.
   - **Gerätefenster ziehen**: `data-no-drag` auf dem äußeren Gehäuse-Container von Oszi & FG entfernt, zodat man Gerätefenster im Browser überall am freien Gehäuse sofort per Klicken-Halten-Ziehen bewegen kann.

5. **`W134` — Windows-App: Kein kurzes Aufblitzen des MultiSpice-Hauptfensters beim Öffnen neuer Kindfenster (`desktop/main.cjs`, `src/components/DesktopTitleBar.tsx`, `src/components/Workbench.tsx`)**:
   - **Ursache**: `out/index.html` enthält das vor-gerenderte HTML des Hauptfensters (`role === "main"`), und der 450-ms-Fallback in `main.cjs` blendete das Kindfenster bereits ein, bevor React `?desktopWindow=...` fertig hydriert hatte.
   - **Lösung**:
     - Der HTTP-Server in `desktop/main.cjs` injiziert in `<head>` ein synchrones Inline-Skript/Style: Sobald `location.search` `desktopWindow=` enthält, bleibt `body` auf `opacity: 0` (`background: #0d1017`), bis die Kind-Ansicht (`LibraryPalette` / `StandaloneInstrumentView`) in React gemountet ist, das Attribut entfernt und `multispice:child-ready` sendet. Zudem wird der frühe 450-ms-Fallback durch einen reinen Sicherheits-Timeout (3500 ms) ersetzt.

6. **`W135` — Geräte nie im Vollbild öffnen (außer vom User angepasst) & beim Skalieren immer proportional (`desktop/main.cjs`, `src/components/DesktopTitleBar.tsx`, `src/components/Instruments.tsx`, `src/components/DeviceFit.tsx`)**:
   - **Startgröße**: Geräte öffnen sich unter Windows niemals maximiert/vollbildartig, sondern in einer kompakten, freischwebenden Größe (max. ~62 % der Bildschirmbreite/-höhe unter exakter Wahrung des Seitenverhältnisses), sofern der Nutzer das Fenster zuvor nicht selbst vergrößert oder maximiert hat (Benutzer-Fenstergrößen werden pro Gerätetyp in `userData` gespeichert).
   - **Proportionale Skalierung**: Sowohl im Browser (`Instruments.tsx`) als auch unter Windows (`desktop/main.cjs` via `setAspectRatio` + `will-resize`-Handler sowie `DeviceFit` in `StandaloneInstrumentView`) behalten Geräte beim Skalieren immer exakt ihr Seitenverhältnis bei.

7. **`W136` — Windows Portable: Sofortiger Ladebildschirm beim Doppelklick (`desktop/make-splash-bmp.cjs`, `desktop/package.json`, `.github/workflows/windows-app.yml`)**:
   - **Ursache**: Der NSIS-Wrapper der Portable-`.exe` entpackt vor dem Start von `MultiSpice.exe` das Archiv nach `%TEMP%`; erst danach startete `main.cjs`.
   - **Lösung**:
     - `desktop/make-splash-bmp.cjs` erzeugt beim Build eine native 24-Bit-BMP-Grafik (`splash.bmp`) im dunklen MultiSpice-Design mit dem Repo-Favicon und Ladebalken.
     - Über `portable.splashImage: "splash.bmp"` und `portable.unpackDirName: "MultiSpice-1.0.0-Runtime"` in `desktop/package.json` zeigt Windows **sofort beim Doppelklick (< 50 ms)** auf win32-Ebene den Ladebildschirm an, noch während die Portable-Laufzeit vorbereitet wird, und übergibt danach nahtlos an das animierte Splash-Fenster in `main.cjs`.

### 40.2 Umsetzung & Verifikation (`W130–W136`)

- **`W130` (`desktop/main.cjs`, `desktop/preload.cjs`, `src/lib/storage.ts`, `src/lib/schematic/openFile.ts`, `src/state/editor.ts`, `src/components/MenuBar.tsx`)**:
  - Fester lokaler Port (`17531..17535`) + native `%APPDATA%/MultiSpice/workspace-state.json`-Spiegelung (`saveAppData` / `loadAppDataSync`) für Arbeitskopie, Projektliste, Favoriten und eigene Bauteile.
  - Echte Datei-Speicherung (`saveProjectToFile` & `autoSaveToBoundFile`) per nativem Windows-Dialog (`window.multispiceDesktop.saveFile`) bzw. File System Access API (`window.showSaveFilePicker` / Blob-Download-Fallback) im Browser.
  - Sobald eine Datei einmal gespeichert oder geöffnet wurde (`activeDesktopFilePath` bzw. `activeBrowserFileHandle`), speichert `scheduleAutosave()` jede Änderung automatisch nach 1,5 s direkt in diese Datei nach.
- **`W131` (`src/lib/export/sheet.ts`, `src/components/Workbench.tsx`, `src/components/MenuBar.tsx`, `src/components/ui.tsx`, `desktop/main.cjs`)**:
  - `PrintSheet` rendert synchron ein papierweißes Vektor-SVG (`docToSvg(doc, { frame: false, paperColor: "#ffffff" })`) statt eines asynchronen Canvas-Screenshots.
  - `exportPdf` und `printSchematicSheet` nutzen unter Windows `multispice:print-svg` (`webContents.printToPDF` bzw. nativer Windows-Druckdialog) und im Browser ein synchrones Vektor-Druckblatt.
  - `downloadText` und `downloadBlob` nutzen unter Windows den nativen Speicherdialog und geben im Browser `ObjectURL`s erst nach 1500 ms frei.
- **`W132` (`src/components/LibraryPalette.tsx`, `src/components/DesktopTitleBar.tsx`)**:
  - Einfacher Klick auf eine Bauteilzeile (`onSelectPart`) wählt das Bauteil lediglich zur Vorschau in der Bibliothek aus und schließt die Bibliothek **nicht**.
  - Erst der Klick auf „Als … platzieren (Enter)“, die `Enter`-Taste oder das direkte Klicken-und-Ziehen (`onStartDragPart`) schließt die Bibliothek und startet die Platzierung.
- **`W133` (`src/components/Canvas.tsx`, `src/components/LibraryPalette.tsx`, `src/components/ComponentStrip.tsx`, `src/components/Instruments.tsx`, `src/components/OsziScope.tsx`, `src/components/FgScope.tsx`, `src/components/oszi2/Oscilloscope.tsx`, `src/components/fg2/Bnc.tsx`)**:
  - Echtes Klicken, gedrückt halten, Ziehen und Loslassen (`pointerdown` → `pointermove` > 5 px → `pointerup`) für Bauteile aus Bibliothek, Schnellleiste und Geräteleiste direkt auf den Schaltplan.
  - Im Auswahlmodus (`select`) greift der Pin-Magnet nur eng am Pin-Anschluss (`7 px`), sodass der gesamte Bauteilkörper frei zum direkten Klicken-Halten-Ziehen bleibt; zieht man von einem Pin mit gedrückter Maustaste zu einem Ziel-Pin/Netz, verbindet sich die Leitung sofort beim Loslassen.
  - BNC-Buchsen an Oszilloskop und Funktionsgenerator nehmen Tastköpfe/Kabel direkt bei `onPointerDown` auf und schließen sie beim Loslassen (`onPointerUp`) auf Klemme oder Schaltplan an.
  - `data-no-drag` auf dem äußeren Gehäuse von Oszi und FG entfernt, damit freie Gehäuseflächen das Fenster sofort ziehen.
- **`W134` (`desktop/main.cjs`, `src/components/DesktopTitleBar.tsx`)**:
  - Synchroner `<head>`-Boot-Shield (`CHILD_BOOT_SHIELD`, `data-ms-child-boot="1"`) hält Kindfenster unsichtbar, bis React die Kind-Ansicht gemountet hat und `notifyChildReady()` aufruft – kein kurzes Aufblitzen des Hauptfensters mehr.
- **`W135` (`desktop/main.cjs`, `src/components/DesktopTitleBar.tsx`, `src/components/Instruments.tsx`, `src/components/DeviceFit.tsx`, `src/components/OsziScope.tsx`, `src/components/FgScope.tsx`)**:
  - Geräte öffnen unter Windows niemals im Vollbild (außer vom Nutzer zuvor so skaliert/maximiert; Fenstergrößen werden pro Gerät in `userData` persistiert) und skalieren in Browser wie Windows immer streng proportional (`setAspectRatio` + `will-resize` + `DeviceFit`).
- **`W136` (`desktop/make-splash-bmp.cjs`, `desktop/package.json`, `.github/workflows/windows-app.yml`)**:
  - Nativer 24-Bit-BMP-Splash (`portable.splashImage: "splash.bmp"`) + persistentes Laufzeitverzeichnis (`portable.unpackDirName: "MultiSpice-1.0.0-Runtime"`) für sofortigen Ladebildschirm direkt beim Doppelklick auf die Portable-`.exe`.

---

## §41 — Runde 40 (`W137–W140`): Einziger animierter Taskbar-Splash mit humorvollen Statusmeldungen (sofort ab Doppelklick), echte Windows-Fenstertitel in der Taskleiste & bereinigter Schaltungs-Assistent ohne AI-Slop

### 41.1 Analyse & Plan (`W137–W140`)

1. **`W137` — Ein einziger, animierter Ladebildschirm im Taskbar (sofort ab Doppelklick, ohne doppeltes Aufpoppen) & humorvolle Textmeldungen statt Ladebalken (`desktop/portable-launcher.cs`, `desktop/main.cjs`, `desktop/package.json`, `.github/workflows/windows-app.yml`)**:
   - **Ursache**:
     - `electron-builder`s `portable.splashImage` zeigte zuerst ein statisches, nicht animiertes NSIS-BMP ohne Taskleiste, und danach öffnete `desktop/main.cjs` (`createSplashWindow`) ein zweites Ladefenster (`skipTaskbar: true`) mit Ladebalken.
   - **Lösung**:
     - `portable.splashImage` wird entfernt.
     - Für die **Portable-`.exe`** baut der Workflow einen nativen Win32/.NET-Starter (`desktop/portable-launcher.cs` via `csc.exe`, auf jedem Windows 10/11 ohne Zusatz-Abhängigkeiten lauffähig), der **sofort beim Doppelklick (< 50 ms)** als echtes Fenster in der Windows-Taskleiste (`ShowInTaskbar = true`, Titel `"MultiSpice"`, mit App-Icon) erscheint, einen sanft rotierenden Amber-Ring um das MultiSpice-Logo animiert und **ohne Ladebalken** alle ~1,2 s humorvolle Labor-Statusmeldungen durchwechselt (z. B. *„Lötkolben wird auf 350 °C vorgeheizt …“*, *„Magischen Rauch in die ICs füllen …“*, *„Oszilloskop-Strahl entknoten …“*, *„Widerstände nach Farbringen sortieren …“*, *„Kirchhoffsche Knotenregeln höflich durchsetzen …“*).
     - Im Hintergrund entpackt der Starter beim Erststart das unkomprimierte App-Archiv nach `%LOCALAPPDATA%\MultiSpice\Runtime-1.0.0` und startet `MultiSpice.exe --portable-splash-pid=<PID>`.
     - Erkennt `desktop/main.cjs` `--portable-splash-pid=<PID>`, öffnet es **kein zweites Splash-Fenster**, sondern beendet den Starter-Splash exakt in der Millisekunde, in der das MultiSpice-Hauptfenster sichtbar wird (`mainWindow.show()`).
     - Wird `MultiSpice.exe` direkt gestartet (z. B. aus dem NSIS-Installer `Setup.exe`), zeigt `createSplashWindow()` in `desktop/main.cjs` denselben einzigen, animierten, in der Taskleiste sichtbaren (`skipTaskbar: false`) Ladebildschirm mit denselben humorvollen Textmeldungen (ohne Ladebalken).

2. **`W138` — Eigene Windows-Fenstertitel für alle geöffneten Geräte- und Werkzeugfenster in der Taskleiste (`desktop/main.cjs`, `src/components/DesktopTitleBar.tsx`, `src/components/Workbench.tsx`)**:
   - **Ursache**: Sobald ein Electron-`BrowserWindow` `out/index.html` lud, überschrieb Chromium den in `new BrowserWindow({ title })` gesetzten Fenstertitel automatisch mit `<title>MultiSpice</title>` aus `index.html`.
   - **Lösung**:
     - In `desktop/main.cjs` unterbindet `win.on("page-title-updated", (e) => e.preventDefault())` das Überschreiben durch das statische HTML-Tag und hält den echten Fenstertitel (`"Oszilloskop"`, `"Funktionsgenerator"`, `"Digitalmultimeter"`, `"Bode-Plotter"`, `"Logikanalysator"`, `"Wattmeter"`, `"Frequenzzähler"`, `"Bauteil-Bibliothek"`, `"Inspector"`, `"Bauteil-Studio"`) fest; zusätzlich erlaubt der IPC-Kanal `multispice:set-title` dynamische Titel-Updates.
     - In `src/components/DesktopTitleBar.tsx` setzt jedes Fenster `document.title` und `window.multispiceDesktop?.setWindowTitle(...)` passend zu seiner Rolle (z. B. `"Oszilloskop"`, `"Bauteil-Bibliothek"`, bzw. im Hauptfenster `"MultiSpice – <Projektname>"`).

3. **`W139` — Schaltungs-Assistent (`src/components/WizardsDialog.tsx`) komplett von AI-Slop, Emojis, „wie Multisim“ und „MVP“-Texten befreien & vollständig verdrahtete Schaltungen erzeugen**:
   - Alle Emojis (`⏰`, `✨`, `📉` usw.), sämtliche „wie Multisim“- und „Multisim hat 20+ Wizards. Für MVP...“-Texte sowie die überladenen Untertitel in der linken Seitenleiste werden restlos entfernt.
   - Klare, sachliche deutsche Oberfläche (`Schaltungs-Assistent`), gegliedert in übersichtliche Kategorien, mit präziser Live-Berechnung der Bauteilwerte (`R1`, `R2`, `C`, `f`, `Verstärkung`, `U_aus`) und Generierung sauber verdrahteter, direkt simulierbarer Schaltungen (mit echten Parameter-Schlüsseln `r`, `c`, `l`, `v`, `freq`, `amp` und orthogonalen Leitungen).

4. **`W140` — Weitere sichtbare „Multisim“-/„MVP“-Reste und Emojis in UI-Komponenten bereinigen (`src/components/Canvas.tsx`, `src/components/Inspector.tsx`, `src/components/Instruments.tsx`, `src/components/ProbeTable.tsx`, `src/components/LibraryPalette.tsx`)**:
   - Alle verbleibenden sichtbaren Textstellen wie `„Probe setzen – Multisim“`, `„Multisim Style“`, `„Multisim Hinweis“`, `„Wie in Multisim“`, `„Für MVP zeigt AC-Kurve“` in `Canvas.tsx`, `Inspector.tsx`, `Instruments.tsx` und `ProbeTable.tsx` werden durch klare, professionelle deutsche Fachbegriffe ersetzt.

### 41.2 Umsetzung & Verifikation (`W137–W140`)

- **`W137` (`desktop/portable-launcher.cs`, `desktop/pack-portable.cjs`, `desktop/main.cjs`, `desktop/package.json`, `.github/workflows/windows-app.yml`)**:
  - `portable.splashImage` (`splash.bmp`) entfernt, sodass niemals ein zweites Ladefenster nach dem ersten aufpoppt.
  - Die Portable-`.exe` besitzt einen nativen Win32/.NET-Starter (`portable-launcher.cs`), der **sofort beim Doppelklick (< 40 ms)** als echtes Fenster in der Windows-Taskleiste (`ShowInTaskbar = true`, Titel `"MultiSpice"`, App-Icon) erscheint, einen sanft rotierenden Amber-Ring um das MultiSpice-Logo animiert und **ohne Ladebalken** alle ~1,2 s humorvolle deutsche Labor-Statusmeldungen anzeigt.
  - Der Starter übergibt `--portable-splash-pid=<PID>` an `MultiSpice.exe`; `desktop/main.cjs` überspringt in diesem Fall sein eigenes Splash-Fenster und schließt den Starter-Splash exakt beim Einblenden des Hauptfensters (`mainWindow.show()`).
  - Beim direkten Start der installierten Version (`Setup.exe`) zeigt `createSplashWindow()` in `desktop/main.cjs` denselben einzigen, animierten Taskbar-Ladebildschirm (`skipTaskbar: false`) mit humorvollen Textmeldungen ohne Ladebalken.
- **`W138` (`desktop/main.cjs`, `desktop/preload.cjs`, `src/components/DesktopTitleBar.tsx`, `src/components/Workbench.tsx`)**:
  - `lockWindowTitle(win, title)` (`page-title-updated` -> `preventDefault()`) und `multispice:set-title` sorgen dafür, dass jedes geöffnete Windows-Fenster in der Taskleiste beim Hovern seinen echten Namen zeigt (`"Oszilloskop"`, `"Funktionsgenerator"`, `"Digitalmultimeter"`, `"Bauteil-Bibliothek"`, `"Inspector"` bzw. `"<Schaltplanname> – MultiSpice"`).
- **`W139` (`src/components/WizardsDialog.tsx`)**:
  - Komplett überarbeiteter **„Schaltungs-Assistent“** ohne Emojis, ohne „wie Multisim“, ohne „MVP“-Hinweise und ohne überladene Seitenleisten-Beschreibungen; erzeugt vollständig verdrahtete, direkt simulierbare Schaltungen mit exakter Live-Dimensionierung.
- **`W140` (`src/components/Canvas.tsx`, `src/components/Inspector.tsx`, `src/components/Instruments.tsx`, `src/components/ProbeTable.tsx`, `src/components/LibraryPalette.tsx`)**:
  - Alle sichtbaren „Multisim“-/„MVP“-Texte und Emojis in Kontextmenüs, Inspector, Messpunkt-Tabelle und Geräte-Hinweisen bereinigt.





## §42 — Sprint 1 („Vertrauen"): Ehrliche Simulation, echte Übertragungsgrößen, aufgeräumte Doku (S1.1–S1.8)

> Datum: 2026-10-03 · Branch `arena/01a1028e-multispice-2` · Auftrag: Deep-Dive-Fazit
> („100-%-Multisim-Alternative" + „Apple-Qualität") → Sprint 1 aus der Roadmap.
> Regel: Erst Plan ins Audit, dann Implementierung; Verifikation vor jedem Commit
> (`tsc`, `eslint`, `npm test`, `next build`).

### 42.1 Befund (Code-geprüft, keine Schätzung)

- **S1.1** `runTransferFunction` gibt `inputResistance: 1000, outputResistance: 10`
  hartcodiert zurück; nur die Verstärkung (finite Differenz) ist echt.
- **S1.2** `runSensitivity` ignoriert `mode: "ac"` (immer DC), die UI bietet AC an.
- **S1.3** `runPoleZero` gibt hartcodierte „Dummy poles/zeros for demo" zurück.
  Schlimmster Vertrauensbruch im Repo: erfundene Analyseergebnisse.
- **S1.4** `buildAcMatrix`: `F`/`H`/`J`/`SCR`/`TRIAC`/`VSWITCH` fallen in
  `default: break` und werden im AC-Kleinsignal **still** ignoriert.
  (Hintergrund: `operatingPoint()` ruft `updateEvents()` auf — die
  `st.extra.on`-Zustände von VSWITCH/SCR/TRIAC sind nach dem OP gültig und
  damit linearisierbar. F/H nutzen im DC-Kern eine Sense-Leitwert-Näherung
  `gsense = 1e6`, die sich in AC exakt nachbilden lässt.)
- **S1.5** Der „Network Analyzer" plottet reinen AC-Gain, spricht aber von
  S11/S21 — ohne Port-Normierung, ohne Z₀.
- **S1.6** `onpage_connector`/`offpage_connector` existieren nur als
  `partId`-Zeichenkette in `buildNets` (Mechanismus vollständig), aber als
  **kein platzierbares Bauteil**; Blätter („Sheets") sind unabhängige
  Dokumente und werden einzeln simuliert. Off-Page über Blätter ist damit
  heute unmöglich; die alten Audit-Docs behaupten das Gegenteil.
- **S1.7** `DESIGN.md` verspricht einen Gerber-Export („RS-274X Platzhalter");
  im Code existiert kein Gerber. Doku ≠ Wahrheit.
- **S1.8** ~20 Audit-/Plan-`.md`s an der Repo-Wurzel, teils widersprüchlich
  („92 %", „Steve würde veröffentlichen"). Niemand weiß, was gilt.
- Nebenbefund: Der Grapher zeigt `tf`/`sensitivity`/`pz`/`param`/`fourier`/
  `noisefigure` als rohen JSON-Dump.

### 42.2 Plan (S1.1–S1.8)

- **S1.1 Transferfunktion** (`analyses.ts`): Verstärkung wie bisher (finite
  Differenz am OP); Rin/Rout zusätzlich per **Testquellen-Methode** am
  linearisierten OP (unabhängige Quellen nullen, Teststrom einprägen,
  U/I messen). Ergebnis: `{ gain, inputResistance, outputResistance, ok }`.
- **S1.2 Sensitivität** (`analyses.ts` + `analysis_defs.ts`): AC-Modus =
  normierte Sensitivität von |H(f)| an einer wählbaren Frequenz
  (neues Feld, nur im AC-Modus relevant); DC wie bisher. Modus wird
  ausgewertet, nicht ignoriert.
- **S1.3 Pol-/Nullstellen** (`analyses.ts` + Def): Echte Extraktion per
  **Levy-Anpassung** einer rationalen Funktion an den gemessenen
  AC-Frequenzgang (Ordnung wählbar, Default 2) + **Durand-Kerner**-
  Nullstellensuche; dazu die **Anpassungsgüte** (RMS-Fehler in dB), damit
  die Näherung ehrlich bleibt. Grapher: PN-Karte (SVG) + Liste + Güte.
- **S1.4 AC-Vervollständigung** (`analyses.ts` + `runner.ts`): JFET wie
  MOSFET linearisieren (gm/gds aus OP-Spannungen); F/H als gesteuerte
  Quellen mit `gain·gsense` + Sense-Leitwert (konsistent zum DC-Kern);
  VSWITCH/SCR/TRIAC mit OP-Schaltzustand als Leitwert; Warnungen für
  Näherungen (`DIGITAL`/`GATE`/`MCU`/`TIMER555` als 1 nS gegen Masse,
  Schalter im OP-Zustand) über `report.warnings` in die Konsole.
- **S1.5 S-Parameter** (`analyses.ts` + `Instruments.tsx`): `runSParams`
  (Quelle Vs=2 mit Serien-Z₀, Last-Z₀ am Ausgang; S11 aus Zin,
  S21 = V2) + Geräte-UI mit Z₀-Einstellung, |S11|/|S21| in dB + Phase.
- **S1.6 Verbinder** (`catalog.ts` + Docs): `onpage_connector` als echtes
  Bauteil (1 Pin, Namens-Parameter, keine Devices — reine Netzbindung);
  Off-Page/blattübergreifend = Roadmap Sprint 3 (eigene User-Entscheidung,
  siehe SPRINTS.md). Tab-Begriff „Schaltblätter" wird nach User-Antwort
  entweder behalten (echte Blätter, Sprint 3) oder ehrlich umbenannt.
- **S1.7 DESIGN.md ≡ Code**: Gerber-Anspruch entfernen, Nicht-Ziele
  (PCB-Layout/Export, Multisim-Binärimport, 3D-Breadboard, Ladder)
  dokumentieren; jede Sprint-1-Änderung als Befund→Maßnahme eintragen.
- **S1.8 Doku-Archiv**: Überholte Audit-/Plan-Docs per `git mv` nach
  `docs/archiv/` (+ Hinweis-README); an der Wurzel bleiben README, DESIGN,
  MANIFEST, UEBERGABE, SPRINTS, STEVE_JOBS_QUALITY_AUDIT (Protokoll),
  CLOUDFLARE sowie die Test-/A11y-Referenzen.
- **Grapher**: eigene Renderer für `tf` (Kennwerte), `sensitivity`
  (Tabelle) und `pz` (PN-Karte) statt JSON-Dump.
- **Tests**: `scripts/simtest.ts` erweitern (TF an Spannungsteiler,
  S-Parameter an Dämpfungsglied, PZ am RC-Tiefpass, AC mit JFET/F/H/
  VSWITCH/SCR, Sensitivität AC/DC) — alles gegen analytische Werte.

### 42.3 Umsetzung & Verifikation (2026-10-03, Sprint 1 abgeschlossen)

- **S1.1** ✅ `runTransferFunction`: Verstärkung aus AC-Kleinsignal
  (der Kern liest `source.dc`, kein Perturbations-Hack nötig); Rin per
  Teststrom bei stromlos geschaltetem Eingang, Rout per Teststrom bei
  kurzgeschlossenem Eingang — verifiziert am Teiler (2 kΩ / 500 Ω exakt).
- **S1.2** ✅ `runSensitivity`: AC-Modus = normierte Sensitivität von |H|
  an wählbarer Testfrequenz (neues Feld `frequency`); ohne AC-Quelle wird
  `ac=1` an der Eingangsquelle gesetzt und als Warnung offengelegt.
- **S1.3** ✅ `runPoleZero`: Levy-Fit (Ordnung wählbar, Default 2) +
  Durand-Kerner; Güte in dB, Überordnung wird beschnitten (Warnung),
  Wurzeln außerhalb des Sweep-Bands gezählt (`outside`). Verifiziert am
  RC-Tiefpass (Pol −1000 exakt) und RLC-Bandpass (Paar −5000 ± j31225).
- **S1.4** ✅ AC-Matrix: JFET (gm/gds), F (Steuerklemmen in Reihe —
  das Sense-Element ist das interne Amperemeter, keine `gsense`-Näherung
  nötig; behebt zugleich den Phantom-Branch), H, VSWITCH/SCR/TRIAC
  (Ron/Roff aus OP). Abweichung vom Plan (§42.2): F/H ohne `gsense`,
  dafür exakt. Digital-Bausteine → ehrliche Warnung (1-nS-Näherung).
- **S1.5** ✅ `runSParams` (neu, eigene Analyse-Definition mit Z₀-Feld):
  Vs=2 mit Serien-Z₀, Last-Z₀; S11 aus Zin, S21 = V2. Network Analyzer
  konfiguriert Ports/Z₀/Sweep und plottet echte S11/S21 (dB + Phase).
- **S1.6** ✅ `onpage_connector` als virtuelles Bauteil (keine Devices,
  reine Netzbindung; gleicher Name = gleiches Netz, pro Tab);
  Inline-Umbenennung per Doppelklick + Platzhalter im Editor. README/
  DESIGN ehrlich zu Blättern; Richtungsentscheid → Sprint 3.
- **S1.7** ✅ DESIGN.md: Gerber-Zeilen gestrichen (Code enthielt null
  Gerber-Zeilen), Nicht-Ziele dokumentiert, Sprint-1-Tabelle
  (Befund→Maßnahme) eingetragen.
- **S1.8** ✅ 13 Docs per `git mv` nach `docs/archiv/` (+ Index-README);
  Wurzel: README, DESIGN, MANIFEST, UEBERGABE, SPRINTS, Audit-Protokoll,
  CLOUDFLARE, TEST_MATRIX, CIRCUIT_TEST_MATRIX, ACCESSIBILITY_AUDIT.
  `TEST_MATRIX_HERZ_UND_NIEREN.md` war ein älteres Duplikat (Inhalt ⊂
  TEST_MATRIX.md + §16 dort) → archiviert.
- **Grapher** ✅ Renderer für `tf` (Kennwert-Karten), `sensitivity`
  (Tabelle), `pz` (PN-Karte + Liste + Güte), `sparams` (Bode + CSV).
- **Tests** ✅ Abweichung vom Plan: statt `simtest.ts` zu erweitern, neue
  Suite `scripts/sprint1test.ts` (41 Checks gegen analytische Werte, alle
  grün); `simtest.ts` + Szenarien-Runner melden Exit-Code 1 bei Fehlern;
  101 Szenarien (`circuit_scenarios_full.ts`, 101/101 grün verifiziert) in
  `npm test` aufgenommen — zuvor liefen sie in keiner Kette.
- **Verifikation**: `tsc --noEmit` ✅ · `eslint src` ✅ ·
  `npm test` ✅ (alle 9 Ketten grün, 230+ PASS) · `next build` ❌ nur durch
  Google-Fonts-Fetch (Sandbox offline; pre-existing, `layout.tsx`
  unberührt von Sprint 1) — kein Code-Fehler.
- **Offen aus Sprint 1**: visuelle Verifikation im Dev-Server (Sandbox:
  kein Server verfügbar); Build-Check mit Netz.
- **Nachtrag 2026-10-04 (Blatt-Entscheid, User)**: Tabs = unabhängige
  Entwürfe. Umgesetzt: Nutzer-Texte „Schaltblatt/Schaltblätter/Blatt" →
  „Entwurf/Entwürfe" (StatusBar, MenuBar-Logs, Editor-Logs, Export-Titel,
  Verbinder-Beschreibung); totes Duplikat `SheetTabs.tsx` gelöscht;
  toter `offpage_connector`-Ast aus `buildNets` entfernt; CIRCUIT_TEST_MATRIX-
  Zeile korrigiert. Behalten: interne Bezeichner (`sheets`, `SheetEntry`,
  `openSheet`, `PrintSheet` — kein Nutzer-Nutzen beim Umbau), Zeichenblatt-
  Metapher (Blattrand, Titelstempel, „Blatt 1/1" als Einblatt-Konvention),
  Datenblatt/ShortcutSheet (fachlich korrekt). Historische „Schaltblatt"-
  Stellen in diesem Protokoll (§§1–41) bleiben als Log unverändert.

---

## §43 · Sprint 2 — Gefühl (Plan, 2026-10-04)

Ziel: Die App fühlt sich an wie Hardware, nicht wie eine Webseite.
Jeder Befund unten ist code-geprüft (Datei:Zeile sinngemäß).

### 43.1 Befund

- **S2.1** `editor.ts:runAnalysis` ist `async`, blockiert aber den Main-Thread:
  `runAnalysisLocal` läuft synchron (nur ein `setTimeout(0)`-Yield vorher,
  Kommentar: „bevor der Kernel den Main-Thread belegt"). Kein Worker im Repo
  (`grep -ri worker src` leer). Lange Analysen (Monte-Carlo, Sweeps) frieren
  das UI ein; kein Fortschritt, kein Abbrechen. Sim-Lib ist worker-fähig:
  kein `window`/`document` in `src/lib/sim/*` (nur FFT-„window"-Namensvetter),
  `SchematicDoc` ist plain data (structured-clone-fähig).
- **S2.2** Grapher-Fehlerzustand ist roher Text (`Grapher.tsx`: `✕ {error}`).
  Der Kern liefert nur Flachtexte („Singulaere Matrix …?", „Keine Konvergenz
  …"), keine Verdächtigen (`SolveResult`: nur `ok/iterations/message`).
  Mechanismus für „zeigen" existiert: `setView({x,y,zoom})` + `NetInfo.points`
  (Canvas-Koordinaten je Netz) — „Zoom to error" nutzt das für Instanzen.
- **S2.3** Kein First-Run-State (`localStorage`-Keys: theme/symbolStyle/
  favorites/probeHover/projekte — kein Run-Flag). Aber: DESIGN §1 verbietet
  Nudges/Auto-Popups („Heiliger Geschmack"). Ein Spotlight muss strikt
  einmalig, non-modal und wegklickbar sein, sonst bricht es das Manifest.
- **S2.4** `RealtimeEngine.tick` rechnet `realtimeFactor` aus — zeigt ihn aber
  nirgends außer einer Inspector-Debug-Zeile (in Exponentialschreibweise!).
  Überlast wird still weggeworfen: `maxStepsPerFrame`-Clamp + `stepAccumulator
  > 1 → reset` ohne Zähler. Adaptive Erholung existiert nur pro Schritt
  (Sub-Stepping bei Nicht-Konvergenz), nicht bei Zeitüberlast.
- **S2.5** 8 Presets (`tools.ts`), aber nur als Text-Menüs (Home-Palette +
  Menü „Vorlagen"). Kein Bild, keine Beschreibung sichtbar. `docToSvg`
  (Export-Renderer) existiert und kann ehrliche Thumbnails liefern.
- **S2.6** `Workbench`: `if (!mounted) return null` — buchstäblich Leere bis
  zur Hydrierung. `page.tsx` rendert Workbench direkt, kein `loading.tsx`,
  kein Skeleton.
- **Korrektur zu S2.6 (2026-10-04, vor Implementierung):** Das `mounted`-Gate
  sitzt im Print-Portal (`PrintSheet`), nicht im Boot-Pfad — der Befund war
  falsch. Richtig: `output: export` ohne `force-dynamic` prerendert die volle
  Workbench (Chrome + Default-Entwurf); einzige echte Lücke ist der
  `<canvas>` ohne Bitmap bis zum ersten rAF-Draw (Hintergrund-Blitz
  `--app` → `--canvas`). Plan entsprechend reduziert, s. §43.3.

### 43.2 Plan (S2.1–S2.6)

- **S2.1 Worker** (`src/lib/sim/analysis.worker.ts` + Wrapper):
  Protokoll `{id, kind, doc, payload} → {progress} | {result} | {error}`;
  Next-Standard `new Worker(new URL(..., import.meta.url))`; bei jedem
  Fehler (SSR, Blockade, Export-Edge) Fallback auf `runAnalysisLocal`.
  Fortschritt: grob (gestartet/fertig) + opt-in `onProgress` für die
  Schleifen-Analysen (Transient, Monte-Carlo, Sweeps); Abbrechen per
  `terminate()` + frischer Worker. UI: Fortschrittsbalken + Abbrechen-Button
  im Grapher-Kopf. Tests auf `runAnalysisLocal` bleiben gültig (Fallback =
  derselbe Codepfad); Worker-Protokoll per Typcheck, kein DOM nötig.
- **S2.2 Konvergenz-State** (`engine.ts` + `runner.ts` + `Grapher.tsx`):
  `SolveResult.suspects?: string[]` — Nicht-Konvergenz: Top-3-Knoten nach
  letztem Newton-Update |Δx|/tol (SPICE-Standard); singulär: Diagonale vor
  `solve()` snapshotten, Null-Diagonalen → Namen (sonst ehrlich „kein
  einzelner Knoten eingrenzbar"). Durchreichen: OP/Transient/DC-Sweep →
  `AnalysisReport.suspects` + `convergence.kind`. Grapher: gestaltete
  Fehlerkarte (Titel, Verdächtigen-Chips, „Problemknoten zeigen" →
  `setView` auf `NetInfo.points`-Zentroid + pulsierender Canvas-Marker
  `spotlight` im Store, auto-clear). Echtzeit-OP-Fehler nutzt denselben Marker.
- **S2.3 Spotlight** (Manifest-konform): Key `multispice.firstRun.done`;
  wenn fehlt: non-modaler Puls-Ring an ▶ (`data-testid`/Anker) + Hinweis-Chip
  mit ×, verschwindet bei erstem Start/Klick/Esc; danach nie wieder.
  DESIGN-Eintrag, warum das kein Nudge ist (einmalig, non-blockierend).
- **S2.4 Überlast ehrlich** (`realtime.ts` + `StatusBar.tsx`):
  `LiveState += {overload, effectiveSampleRate, droppedSec}`; Clamp und
  Accumulator-Reset zählen statt schweigen; adaptiv: bei Dauer-Clamp dt
  vergröbern (sampleRate halbieren bis 5 kHz, mit Hysterese zurück) —
  offengelegt als Badge + einmaliger Log. StatusBar: `×1,0`/`×0,3`-Chip
  (rot bei Überlast, Tooltip erklärt); Inspector-Zeile in ×-Format.
- **S2.5 Galerie** (`PresetGallery.tsx`): Dialog/Grid, Thumbnails per
  `docToSvg(preset.build())` (derselbe Renderer wie der Export — ehrlich),
  Name + Beschreibung + „Laden"; Einstieg als erster Menüpunkt „Galerie …"
  unter „Vorlagen". Memo auf Öffnen (8× SVG ist billig, aber nicht gratis).
- **S2.6 Boot-Skeleton**: `!mounted`-Zweig rendert SSR-sicheres statisches
  Skelett (Menü-/Canvas-Platzhalter, Puls) statt `null` — kein Store-Zugriff,
  ersetzt durch Hydrierung. Kein `loading.tsx` nötig (eine Seite, kein Routing).
- **Tests**: `scripts/sprint2test.ts` — Verdächtige an konstruierter
  singulärer/nicht-konvergenter Netzliste; Überlast+Adaption per kleinem
  `maxStepsPerFrame`; alle Presets bauen + `docToSvg` nicht-leer. Worker,
  Spotlight, Skeleton: Typcheck + manuelle Prüfung (DOM/Threading).

### 43.3 Umsetzung & Verifikation (2026-10-04, Sprint 2 abgeschlossen)

- **S2.1** ✅ `analysis.worker.ts` (Protokoll progress/result/error) +
  `analysis_client.ts` (`runAnalysisTask` mit synchronem Fallback +
  `worker`-Flag). Fortschritt: `ProgressFn` in 8 Schleifen-Analysen
  (tran/ac/dc/noise/mc/worstcase/temp/param, 2-%-gedrosselt), Callback hängt
  der Worker an (structured-clone-sicher). Editor: eine Analyse zur Zeit
  (alte wird terminiert), Fortschrittsbalken + Abbrechen im Grapher,
  einmaliger Fallback-Hinweis im Log.
- **S2.2** ✅ `SolveResult.{failure, suspects}`: singulär = Null-Diagonalen
  vor `solve()` (max. 3), nicht-konvergent = Top-3 nach normiertem
  Newton-Update (nicht-finite Updates → Rang 1). Durchgereicht: OP/Tran/
  DC/Sens/TF → `AnalysisReport.{convergence, suspects}`; Runner hebt
  `ok:false` in `errors` (der Grapher prüfte `.ok` nie — Fehler zeigten
  leere Diagramme). Grapher: Fehlerkarte (Titel je Klasse, Hinweis,
  Verdächtigen-Chips, „Problemknoten zeigen" → `setView` + pulsierender
  Canvas-Marker `spotlight`, Auto-Clear 6 s/Klick; `I()`-Zweige zoomen aufs
  Bauteil). Echtzeit-OP-Fehler markiert Netz-Verdacht ebenso.
- **S2.3** ✅ `FirstRunSpotlight`: Puls-Ring an `[data-spot="start-sim"]`
  (Desktop- + Mobil-▶) + Chip mit ×; Key `multispice.firstRun.spotlightDone`;
  weg bei Start/Klick/Esc, nie wieder. Manifest: non-modal, non-blockierend
  (pointer-events-none außer ×), kein Timer-Nag. Lint: kein setState im
  Effekt-Body (rAF/Listener/Store-Subscription).
- **S2.4** ✅ `LiveState.{overload, effectiveSampleRate, droppedSec}`:
  Clamp/Accumulator-Reset zählen statt schweigen; adaptiv: nach 30
  Clamp-Frames Rate halbieren (min. 5 kHz), nach 240 ruhigen Frames zurück;
  Laufzeit-Änderung der Rate wird sofort übernommen. StatusBar: `×1,0`-Chip
  (rot bei Überlast, `~` bei Adaption, Tooltip mit Rate + verworfenen
  Sekunden); Inspector-Zeile in ×-Format. Zwei Test-Funde: rtf-Init 1 bis
  zur ersten Messung (sonst Fehlalarm beim Start), Messfenster-Neustart in
  `rebuild` (sonst Leerlauf eingerechnet).
- **S2.5** ✅ `PresetGallery`: Dialog/Grid, Thumbnails per
  `docToSvg(preset.build())` (Export-Renderer — ehrlich), Name +
  Beschreibung + Laden; Einstieg „Galerie mit Vorschau …" in Menü + Palette
  (Desktop + Mobil). Untertitel korrigiert: `loadPreset` ersetzt den Reiter
  (Undo stellt her) — kein falsches Versprechen.
- **S2.6** ✅ Plan reduziert (s. Korrektur §43.1): Canvas-Element mit
  `background: var(--canvas)` — pre-draw = post-draw-Ton, kein Blitz, keine
  visuelle Änderung nach Hydrierung. Kein `loading.tsx` (eine Route).
- **Tests** ✅ `scripts/sprint2test.ts` (18 Checks, alle grün, in `npm test`
  verdrahtet): singulär an V-Schleife mit `rser: 0` (Funde: 1-nΩ-Default
  fängt reale Schleifen zu Recht; globales gmin fängt Knoten → Zweige als
  Verdächtige), Nicht-Konvergenz via `maxIter: 1`, Runner-Hebung,
  Fortschritt direkt + via Runner, Überlast/Adaption/droppedSec, 8/8
  Galerie-Thumbnails. Worker/Spotlight/Boot: Typcheck + manuell (DOM/Threading).
- **Verifikation**: `tsc --noEmit` ✅ · `eslint src` ✅ · `npm test` ✅
  (alle 10 Ketten grün, 260 PASS) · `next build` weiterhin nur
  Google-Fonts-Fetch (Sandbox offline, pre-existing).
- **Offen aus Sprint 2**: visuelle Prüfung (Worker-Balken, Fehlerkarte,
  Spotlight, Galerie, ×-Chip) im Dev-Server; Build-Check mit Netz.

---

## §44 · Sprint 3 — Struktur (Plan, 2026-10-04)

Ziel: Multisim-Parität im Aufbau großer Entwürfe. Befunde code-geprüft.
User-Entscheide (2026-10-04): Busse **voll** (Splitter + dynamische Pins),
Hierarchie = **Custom-Parts + Ausbau**.

### 44.1 Befund

- **S3.1** Bus = nur lila Farbe: `Wire.isBus/busName/busWidth` existieren als
  Daten, Canvas malt nur Farbe um (Strichstärke gleich), `buildNets`
  ignoriert Busse vollständig (Bus-Leitung leitet als normales Netz!).
  Einzige UI: Kontextmenü-Toggle „Als Bus markieren". Kein Tap, kein
  Splitter, keine Breite. Dynamische Pins: `PinDef` statisch; `.pins`-Zugriffe
  breit gestreut (Canvas ~12 Stellen), aber Funnels existieren:
  `pinPosition(inst, idx)` (model.ts), `getPartSymbol(part, style)`,
  `instanceBounds(inst)` — dort hängt Dynamik ein.
- **S3.2** Custom-Parts mit Subcircuit-Expansion existieren
  (`compileSubcircuitToDevices`, 14 Element-Kinds, keine Verschachtelung)
  + `extractSubcircuitFromSchematic` (ganzes Blatt, partId-Substring-
  Heuristik: `pId.includes("npn")` …). Kein „Auswahl als Bauteil", kein
  exaktes Mapping, Limits undokumentiert.
- **S3.3** Re-Annotate existiert nicht (`grep` leer). `Instance` hat kein
  Label-Herkunfts-Flag (manuell vs. auto nicht unterscheidbar). Labels werden
  als Device-IDs referenziert (Analyse-Meta im Speicher, Instrumente transient).
- **S3.4** `PinDef` = nur name/x/y — keine elektrischen Typen. ERC heute:
  unbekanntes Bauteil (E), Faults (W), keine Devices (W), kein GND (W),
  offene Enden (W51, max. 12), Verbindungspunkte (Info). Kein Regelsatz-Dok.
- **S3.5** Importe: SPICE-Netzliste (nur R/C/L/V/I/D/Q/M) + LTspice .asc.
  Kein KiCad. SPICE E/G/F/H/J fallen still unter „übersprungen" (nur Notiz).
- **S3.6** vcvs/vccs/ccvs/cccs existieren als Bibliotheks-Bauteile
  („Quellen/Abhängige Quellen", 4 Pins OUT±/CTRL±, Engine-kompatibel:
  F misst intern per gsense über CTRL — Reihenschaltung ist korrekter
  Gebrauch). Item de facto erledigt — braucht nur Verifikation + Test.

### 44.2 Plan (S3.1–S3.6)

- **S3.1 Busse voll** (`catalog.ts` + `model.ts` + Canvas):
  Semantik (ehrlich, dokumentiert): Bus-Leitung = visuelles Bündel +
  Deklaration (`busName`, `busWidth`); elektrisch wirken NUR Tap/Splitter
  per Namensbindung (`NAME[i]`); geometrische Berührung verbindet NICHT.
  Katalog: `PartDef.pinsFor?(params)` + `symbolFor?(params, style)` +
  Helfer `partPins/partSymbol`; `pinPosition`/`instanceBounds`/`buildNets`/
  Canvas-Instanz-Stellen nutzen die Helfer (Library-Vorschau: Defaults).
  Bauteile: `bus_tap` (1 Pin, params bus/bit → Netz `bus[bit]`);
  `bus_splitter` (params bus/width 2/4/8/16; Pins BUS + 0..w−1; BUS-Pin = NC/
  visueller Anker, dokumentiert). `buildNets`: Tap/Splitter-Bit-Pins in die
  Namens-Union (wie S1.6-Verbinder); Validierung: Bit ≥ Breite → Warnung,
  Tap ohne Deklaration → Hinweis. Bus-Draht: dick violett + Namensschild.
- **S3.2 Custom-Parts = Hierarchie (festgelegt + ausgebaut)**:
  Entscheid dokumentieren (DESIGN + Dialog-Hinweis). Ausbau:
  „Auswahl als Bauteil speichern" (Kontextmenü/Part-Studio): neues
  `extractSubcircuitFromSelection(doc, ids)` — exaktes partId-Mapping für
  R/C/L/D/Q/M (Heuristik nur Fallback), Schnittstellen-Netze → Pins,
  interne Netze → `INT_n`; PartEditor mit Vorausfüllung öffnen. Limits
  dokumentiert: keine Verschachtelung, 14 Kinds, Quellen als Elemente ok.
- **S3.3 Re-Annotate** (`editor.ts` + Menü): `reannotate()` — pro Ref-Präfix
  in Leserichtung (y, dann x) neu nummerieren, undo-fähig; Analyse-State
  zurücksetzen (Labels referenziert) + Log; alle Labels (kein
  Herkunfts-Flag — dokumentiert). Menü Bearbeiten → „Neu nummerieren".
- **S3.4 Pin-Typen + ERC** (`catalog.ts` + `model.ts` + DESIGN):
  `PinDef.electrical?`: input/output/inout/power_in/power_out/passive/nc.
  Regeln (nur wenn BEIDE Pins typisiert — keine False Positives bei 400
  untypisierten Teilen; Masse-Netz „0" von Konflikt ausgenommen):
  E1 Ausgang-gegen-Ausgang (Fehler), W1 typisierter Eingang offen, W2
  power_in offen. Seed-Typen: gnd, vdc/vac/idc/iac, opamp/comparator,
  555,117xx-VREG?, Logik-Gatter (Bestand prüfen). Regelsatz als DESIGN-Tabelle.
- **S3.5 KiCad + SPICE-Coverage** (`importers.ts` + DESIGN): `.kicad_sch`
  S-Expr-Minimal-Parser (Symbole R/C/D/Q/V/I + Drähte + Netzlabels +
  Power-Symbole; Limits dokumentiert). SPICE_MAP += E/G/F/H/J (Teile
  existieren) + Coverage-Tabelle in DESIGN (Buchstabe → Teil/Limit).
- **S3.6 E/G/F/H**: Verifikation (platzierbar, Kategorie) + Regressionstest
  (4-Pin-Verdrahtung → Devices; F-Reihen-Nutzen dokumentiert).
- **Tests**: `scripts/sprint3test.ts` — Tap-Bindung/Trennung, Splitter-Pins
  je Breite + Bit-Netze, Re-Annotate-Reihenfolge, ERC E1/W1/W2 + Stille bei
  untypisiert, SPICE-E-Import, KiCad-Minimal, E/G/F/H-Expansion.

### 44.3 Umsetzung & Verifikation (2026-10-04, abgeschlossen)

- **S3.1 Busse**: umgesetzt wie geplant (`pinsFor/symbolFor`-Funnel,
  `bus_tap`, `bus_splitter` 2/4/8/16, Namensbindung `BUS[i]`, Bus-Draht
  leitet nicht + dick violett mit Schild, Breiten-/Bit-Prüfung).
- **S3.2 Hierarchie**: `extractSelectionAsPart` („Auswahl als Bauteil…",
  exakte Ports, GND global, Fehler statt Stillem, kein Nesting) +
  Hierarchie-Entscheid (Custom-Parts, keine Subsheet-Blöcke). Bonus-Fund:
  `newDocument` verlor Änderungen seit dem letzten Reiterwechsel
  (Datenverlust!) — Rückschreibung ergänzt, Regression in S3.2-Tests.
- **S3.3 Re-Annotate**: `reannotateLabels` + Menüpunkt, wie geplant.
- **S3.4 ERC**: umgesetzt als E1–E4 (alle Warnungen; Plan-Abweichung: kein
  Fehler-Level, kein W1/W2-Naming — dokumentiert in DESIGN). Kalibrierung:
  MCU-Pins GPIO/passiv; Vorlagen ERC-still (555-CTRL 10 n, Zähler-RST→GND).
- **S3.5**: SPICE E/G/F/H/J abgedeckt; KiCad-Minimal-Parser
  (Symbole/Drähte/Dots/Labels/Texte, Drehungs-Suche, Pin-Snap, ehrliche
  Skip-Hinweise); Router-Fix gegen geteilte Knicke (stiller Kurzschluss
  über Ketten-Union behoben). W61-Lücke bleibt Known Limit (Warnung statt
  Dot-Zwang; echte Behebung = Sprint-5-Kandidat).
- **S3.6**: E/G/F/H-Abbildung verifiziert (E-Folger 1 V → 2 V im OP-Test).
- **Verifikation**: `tsc` + `eslint` sauber; `npm test` (11 Skripte inkl.
  neuem `sprint3test.ts`, 41 Checks) 2× vollständig grün; alle 8 Vorlagen
  ERC-still (W98d).

## §45 · Sprint 4 — Modelle (Plan, 2026-10-04)

Ziel: Genauigkeit für reale Entwürfe. Befunde code-geprüft.

### 45.1 Befund

- **S4.1** OPAMP-Transient = flache tanh-Verstärkung + Sättigung; AC hat
  dagegen den Einpol-GBW (`buildAcMatrix`, `gbw`-Param) — TRAN und AC
  widersprechen sich oberhalb der Eckfrequenz. Slew-Werte stehen in der
  OPV-Tabelle (`opamps[].slew`), werden aber nicht an Devices gereicht.
- **S4.2** Diode: `cjo` fix + `tt·gd`-Diffusion (nur transient); keine
  Sperrschicht-Gradierung, kein IS-Temp (nur `vt=kT/q` skaliert). BJT:
  Ebers-Moll + Early, `cje/cjc` fix, kein TF/TR, kein IS/BF-Temp.
- **S4.3** MOSFET Level 1, `cgs/cgd` fix, kein Temp, kein Bulk-Knoten.
  JFET: gar keine Kapazitäten, kein Temp.
- **S4.4** Monte-Carlo streut R/C/L + Q.bf; Worst-Case nur R/C/L
  (Single-Key). Halbleiter-Streuung fehlt (IS, VTO, KP …).
- **S4.5** Relais = R-Spule + VSWITCH mit Von/Voff-Hysterese
  (`updateEvents`, auch im OP) — de facto fertig, braucht Verifikation.
  FUSE = reines R, `irated` ungenutzt, kein I²t.
- **S4.6** Trafo ideal (`lp/ratio/k`), kein Wicklungs-R, keine Sättigung,
  keine Kernverluste. Kein T-Element.

### 45.2 Plan (S4.1–S4.6)

- **S4.1 OPV transient** (`engine.ts` + `catalog.ts`): Target aus
  tanh-Stufe, dann Pol 1. Ordnung (tau = A0/2π·GBW, Backward-Euler,
  Zustand in `extra`, Commit in `acceptTimestep`) + Slew-Begrenzung
  (|Δv| ≤ SR·dt, Jacobian aus linearem Anteil). DC/OP unverändert.
  Katalog: `slew`-Param (Defaults aus Tabelle) + Durchreichen.
  COMPARATOR bleibt statisch (dokumentiert). Konsistenz AC↔TRAN testen.
- **S4.2 Temp + Kapazitäten D/Q**: IS(T) = IS·(T/Tnom)^XTI·exp(−EG/k·
  (1/T−1/Tnom)), BF(T) = BF·(T/Tnom)^XTB (Engine-Default XTB = 0 wie
  SPICE, Katalog setzt xtb = 1,5 explizit ≈ +0,5 %/K, dokumentiert).
  Sperrschicht: CJO·(1−vd/VJ)^−MJ mit FC-Grenze; BJT zusätzlich
  MJE/MJC/VJE/VJC + TF/TR-Diffusion (gm·tf). SPICE-Defaults
  (MJ = 0,5, MJE = 0,33 …). Kapazitäts-Chord statt Ladungsformulierung
  (dokumentierter Kompromiss). AC nutzt dieselben Helfer am OP.
- **S4.3 MOSFET-Temp + Meyer**: VTO(T) = VTO − vto_tc·(T−Tnom)
  (Default 2 mV/K, dokumentierte Näherung), KP(T) = KP·(T/Tnom)^−BEX
  (Default BEX = 1,5). Meyer: intrinsisches Cox·W·L nach Bereich auf
  GS/GD partitioniert (Cutoff 0 / Triode je 1/2 / Sättigung 2/3 + 0) +
  Overlap CGSO/CGDO·W; cox = 0 → fixe cgs/cgd (rückwärtskompatibel).
  Kein Bulk-Knoten → kein CGB (Bulk = Source, dokumentiert). JFET:
  Temp (beta/vto) + fixe cgs/cgd (war ganz ohne). AC am OP gleich.
- **S4.4 Streuung** (`analyses.ts`): MC-Tabelle += D/LED/ZENER/SCHOTTKY.is,
  Q.is, M.vto+kp, J.beta+vto; Worst-Case auf Param-Listen
  generalisieren + gleiche Params. Streu-Tabelle in DESIGN. Seed bleibt.
- **S4.5 Relais + Sicherung**: Relais-Verifikation (OP + TRAN,
  Hysterese) + Regressionstest. Sicherung: I²t-Akkumulator in
  `acceptTimestep`, löst bei `i2t` (Default 1 A²s), latchend bis
  Rebuild (wie echt: ersetzen = Neustart), danach roff; `extra.blown`
  + Strommeldung. Löst nur in TRAN/Echtzeit (OP hat keine Zeit —
  dokumentiert).
- **S4.6 Trafo + T-Element**: Trafo: rp/rs seriell, rcore parallel
  primär (Default ∞ = aus), isat-Knie Lp(i) = Lp/(1+|ip|/isat)
  (Chord, isat = 0 → aus). AC: rp/rs/rcore linear (Sättigung dort
  ungesättigt, dokumentiert). TLINE neu: Z0 + td (len/vf), Bergeron
  mit interpolierter Delay-Line (`outputs[]`, nur akzeptiert), transient;
  OP = durchverbunden; AC exakt (verlustlose Telegraphengleichung);
  neues Katalogteil „Übertragungsleitung".
- **Tests**: `scripts/sprint4test.ts` — OPV-Ecke TRAN-vs-AC, Slew,
  D-Vf-Drift (≈ −2 mV/K), Q-BF-Temp, M-VTO-Temp, Meyer-Regionen,
  MC-σ + Seed-Repro, Worst-Case-Sensitivitäten, Relais-Hysterese,
  Fuse-Trip + Latch, Trafo rp/Sättigung, TLINE-Laufzeit + AC-Phase.
  Volle Suite grün halten.

### 45.3 Umsetzung & Verifikation (wird nach Implementierung ergänzt)

| Item | Test | Ergebnis |
|------|------|----------|
| S4.1 | Folger LM741 (GBW 1 MHz, slew=0) TRAN 100 kHz / 3 MHz + Slew-Rampe (PWL-Kante) + AC-Ecke | 0.995 / 0.316 = Theorie, Rampe 0.50 V/µs bei SR 0.5, Ecke 1.00 MHz — PASS. Fix dabei: OP hinterlegt vi/ve (Schritt-1-Clamp); GBW-Test mit SR slew-begrenzt → slew=0 |
| S4.2 | 1N4148 @1 mA Vf-Drift 27→77 °C; NPN Ic(T); Depletion-Einheit | −2.03 mV/K (Th. −2), Ic +29 % (BF 200→252), FC-Grading 1.697×/fix — PASS |
| S4.3 | NMOS Rds(T) 27→125 °C; Meyer-Einheit; AC-f3dB mit/ohne TOX | ×1.47 (Th. ~1.5), Regionen exakt, 23.3/17.1 MHz (Th. 22.7/17.1) — PASS |
| S4.4 | MC/WC NPN-Stufe (BF/IS); MC-Diode (IS); WC-Sensitivitäten | σ=0.093 V, Ecken 2.59/3.69 V, Q1 „bf+is" gelistet, Dioden-σ 2.75 mV (Th. 2.6) — PASS |
| S4.5 | Relais Anzug/Abfall (Katalog-VSWITCH); Sicherung 9.5 A/1 A | 4.01/1.99 V (Th. 4/2), Auslösung 45.2 ms (Th. ~45), hält bei IN — PASS |
| S4.6 | Trafo rp-DC + Sättigungsknie (Stromrampe); TLINE TRAN/AC/OP | −1.000 A (Th.), Knie 3.67× = Th., Laufzeit 1.01 µs, AC \|H\|=1/−45°, OP durch — PASS |

## §46 · Sprint 5 — Feinschliff (Audit 2026-10-04, REVIEW OFFEN)

### 46.1 Befund

- **S5.1 Dateien**: `Canvas.tsx` 4010, `editor.ts` 2072, `Instruments.tsx`
  1698 Zeilen — ungeteilt (Render/Hit-Test/Pointer/Overlays vermischt).
- **S5.2 Inspector**: nutzt `ui/`-Primitives nur teilweise; Zahlenformat
  (`formatValue`/`parseValue` in `catalog.ts`) ohne 4k7-Eingabe, Einheiten
  (Ω/µ) inkonsistent.
- **S5.3 Tastatur**: kein Pfeil-Platzieren (nur Maus); Esc-Handler in 8+
  Komponenten ohne definierte Kette, ungetestet.
- **S5.4 A11y**: `role=status/log` punktuell (BottomPanel, Toasts); keine
  Schaltungs-Zusammenfassung für Screenreader, kein Sim-Status-Live-Text.
- **S5.5 Link-Teilen**: fehlt ganz (nur Datei-Speichern).
- **S5.6 Wizards**: SPRINTS.md sagt „7 → ~12" — real sind es BEREITS 12
  (Filter/CE/555 alle vorhanden), aber 0 Tests, Builder nicht extrahiert.
  Zählziel überholt → stattdessen: Verifikation + Lücken schließen.
  Lehrer-Modus + Beschreibungsbox fehlen.
- **S5.7 Grapher**: keine Mess-Panel pro Kurve (nur Cursor?), kein
  Kurven-Rechnen (A−B, RMS …).
- **S5.8 Sweeps**: kein Nested Sweep, keine Batched Analyses, kein
  Verzerrungs-Sweep (THD-vs-Pegel/Frequenz).
- **S5.9 W61**: Ketten-Union verbindet weiter an geteilten Knicken (nur
  Warnung seit S3; echte Behebung offen).

### 46.2 Plan (S5.1–S5.9) — wartet auf Review

- **S5.1 Datei-Aufteilung** (ohne Verhaltensänderung, Suite = Beweis):
  `Canvas/` (Render/Hit-Test/Pointer/Overlays), `editor/` (Store/Slices),
  `Instruments/` (Oszi/Messleitungen/Panels).
- **S5.2 Inspector-Primitives + Zahlen**: Inspector vollständig auf
  `ui/` (Field/Dialog/Menu/Tooltip); `lib/format.ts` neu (4k7/2µ2-Ein-
  gabe, Ω/µ/°-Ausgabe); alle numerischen Anzeigen darüber.
- **S5.3 Tastatur**: Bauteil per Pfeile bewegen + Enter platzieren
  (Esc bricht ab); definierte Esc-Kette
  Overlay → Messleitung → Auswahl → Werkzeug; Test der Kette.
- **S5.4 Screenreader**: Zusammenfassung („3 Widerstände, 1 OPV, …,
  2 Netze, ERC still") + Live-Region Sim-Status (läuft/fertig/fehler);
  sichtbare Tests der Texte (kein E2E nötig).
- **S5.5 Link-Teilen**: Schaltung komprimiert (deflate+base64) in URL-Hash;
  Limit ehrlich (etwa „> 100 kB → Datei statt Link"); Öffnen per Hash.
- **S5.6 Wizards/Lehrer/Box**: Builder nach `lib/wizards/` extrahieren,
  alle 12 bauen + OP-konvergieren im Test; max. 2 Lücken-Wizards nach
  Review-Wunsch; Lehrer-Modus (Sperr-Code: Werte/Faults verstecken +
  Plan sperren); Beschreibungsbox-Bauteil mit Live-Werten (`{V(OUT)}`).
  Review-Entscheide (2026-10-04): Plan freigegeben; Lehrer-Sperre =
  4-stelliger Zahlencode; neue Wizards = LED-Vorwiderstands-Rechner +
  Schmitt-Trigger (Hysterese-Rechnung); Postprozessor MIT FFT-Anzeige.
- **S5.7 Grapher**: Mess-Panel pro Kurve (Min/Max/Mittel/RMS/f−3dB) +
  Postprozessor (A+B/A−B/A·B/A·B-Verhältnis in dB, RMS/AVG-Hüllkurve).
- **S5.8 Sweeps**: Nested Sweep (2 Parameter, Kurvenschar), Batched
  Analyses (DC+AC+TRAN in einem Lauf, ein Report), THD-Sweep
  (Klirrfaktor vs. Pegel via `runThd`).
- **S5.9 W61-Fix**: Ketten-Union nur noch an Anschlüssen/Dots; Regression
  (S3.4-Warn-Test wird Fix-Test); volle Suite grün halten.
- **Tests**: `scripts/sprint5test.ts` — Esc-Kette, Zahlenformat-Roundtrips,
  Wizard-Builds (12× OP-ok), Link-Roundtrip, Sweep-Kurvenzahlen,
  W61-Fix, SR-Text-Snapshots. Volle Suite grün halten.

### 46.3 Umsetzung & Verifikation (nach Review)

| Item | Test | Ergebnis |
|------|------|----------|
| S5.1 | tsc + volle Suite (11 Skripte + circuit_scenarios_full 50/50); Move-Diffs vs. HEAD byte-identisch | PASS. editor.ts 2072 → Barrel + 22 Module (16 Slices); Canvas 4010 → 3108 + geometry/hitTest/render (+5 Callbacks extrahiert, Draw-Loop/Pointer bleiben komponentengebunden — dokumentiert); Instruments 1698 → 218 + shared/meters/analyzers/sources/Window. Fix dabei: scheduleAutosave → store.ts (Modul-Init-Zyklus). |
| S5.2 | tsc + volle Suite (12 Skripte + circuit_scenarios_full 50/50); scripts/sprint5test.ts Block S5.2 (4 Checks) | PASS. lib/format.ts neu (parse/format aus catalog.ts, dort Re-Export); M-Fix: „1M"→1e6 (war Milli); ui/Field.tsx +Checkbox/+SliderField; Inspector auf Primitiven (ParamField-Dispatcher, Probe-/Solver-Sektionen, Buttons); nativ bleiben: Tabs, Inline-Label, Color, Textarea, Listen-Rows, Show-Grid (layout-/listen-spezifisch). |
| S5.3 | tsc + volle Suite; sprint5test-Block S5.3 (Ketten-Wahrheitstabelle) | PASS. lib/keyboard.ts neu (resolveEscape: Overlay→Messleitung→Auswahl→Werkzeug); Canvas-Esc nutzt Kette (ein Druck = eine Ebene, löst W66-Nuke ab); W36-Listener aus Instruments.tsx entfernt (vereinheitlicht); Ghost per Pfeile (Raster, ⇧ 5-fach) + Enter platzieren (⇧ = weiter); Shortcuts-Hilfe ergänzt. |
| S5.4 | tsc + volle Suite; sprint5test-Blöcke S5.4 (3 Checks: Labels, Zusammenfassung, Sim-Texte) | PASS. lib/a11y.ts neu (summarizeCircuit „3× Widerstand, …, ERC still", simLiveText läuft/fertig/fehler, completionNote, analysisLabel); Canvas-aria-label dynamisch; ScreenReaderStatus-Live-Region in Mobile-/Desktop-Layout. |
| S5.5 | tsc + volle Suite; sprint5test-Blöcke S5.5 (3 Checks: base64url, Codec, Hash+Limit) | PASS. lib/share.ts neu (deflate+base64url via fflate, isomorph; `#s=`-Format; Limit 100 000); Menü „Link teilen …" (Desktop+Mobil, Datei-Fallback + Toast über Limit); Hash-Öffnen beim Start (gewinnt gegen Auto-Save, nutzt loadTextContentInEditor). |
| S5.6 | tsc + volle Suite; sprint5test S5.6a–d (6 Checks) | PASS. (a) lib/wizards/ extrahiert (Move-Diffs vs. HEAD identisch), 12× Bau+OP-ok. (b) LED-Rechner (E12) + Schmitt-Trigger (±13,3 V Sättigung im Tran nachgewiesen); dabei formatValue-Nullenbug gefixt (150 Ω ≠ 15 Ω) + Regression. (c) Beschreibungsbox-Bauteil (pinlos, eigene Karte, {V}/{I}/{P}-Livewerte). (d) Lehrer-Modus: 4-Ziffern-Code (FNV-Hash, localStorage), Store-Guard in commit/setDoc/undo/redo/Preset/Neu, Canvas nur Pan/Zoom, Inspector-/Menü-/Wizard-Guards, Fehler-/Wert-Anzeige aus, Status-Schloss, Einstellungs-Bereich. |
| S5.7 | tsc + volle Suite; sprint5test S5.7 (2 Checks) | PASS. lib/measure.ts (Min/Max/Mittel/RMS, f−3dB) + lib/postprocess.ts (A+B/A−B/A·B/A-B-dB mit ehrlichem NaN an B=0, RMS/AVG-Hüllkurve, Resampling, FFT via spectrum()); Grapher: Mess-Panel in Tran- + AC-Ansicht, Postprozessor-Bereich mit eigenem Plot (FFT logarithmisch). |
