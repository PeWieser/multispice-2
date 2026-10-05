# Sprints — Weg zu „Multisim fürs Web" in Apple-Qualität

> Lebendes Log: Nach jedem Sprint wird hier eingetragen, was gemacht wurde
> (Stichpunkte) und was noch offen ist (Tabelle unten). Details je Sprint im
> Audit-Protokoll (`STEVE_JOBS_QUALITY_AUDIT.md`, §42 ff.).
> Stand: S5.10–S5.24 ✅ (2026-10-05).
> Details je Sprint im Audit-Protokoll (§42 ff., Rest: §50–§60).

## Sprint 1 — Vertrauen (✅ abgeschlossen 2026-10-03)

Ziel: Kein erfundenes Ergebnis mehr, keine irreführende Bezeichnung mehr,
Doku ≡ Code.

- [x] S1.1 Transferfunktion: Rin/Rout echt (Testquellen-Methode)
- [x] S1.2 Sensitivität: AC-Modus echt (mit Frequenzfeld)
- [x] S1.3 Pol-/Nullstellen: echt (Levy-Anpassung + Güte) + PN-Karte im Grapher
- [x] S1.4 AC-Matrix: F/H/J/SCR/TRIAC/VSWITCH linearisieren + Warnungen
- [x] S1.5 Network Analyzer: echte S-Parameter (Z₀, S11/S21)
- [x] S1.6 On-Page-Verbinder als Bauteil + ehrliche Blatt-Doku
- [x] S1.7 DESIGN.md ≡ Code (Gerber-Anspruch raus, Nicht-Ziele rein)
- [x] S1.8 Doku-Archiv (`docs/archiv/`)
- [x] Grapher-Renderer für tf/sensitivity/pz/sparams (statt JSON-Dump)
- [x] Tests gegen analytische Werte + Verifikation (tsc/eslint/test/build)

**Gemacht:**
- TF: Rin/Rout per Testquelle im Kleinsignal-OP (statt 1 kΩ/50 Ω-Dummies);
  Dialog-Hinweis + eigene TF-Karte im Grapher.
- Sensitivität AC an wählbarer Testfrequenz; automatisches `ac=1` wird als
  Warnung offengelegt; Tabellen-Renderer im Grapher.
- PZ per Levy-Fit an echtem AC-Sweep: Güte (dB), Pruning-Warnung,
  Außerband-Zählung; PN-Karte + Liste im Grapher.
- AC-Matrix: F/H/JFET/SCR/TRIAC/VSWITCH linearisiert; Digital-Bausteine
  erzeugen ehrliche Warnungen (1-nS-Näherung).
- Neue `sparams`-Analyse (Z₀, S11/S21, Port-Z); Network Analyzer läuft echt.
- `onpage_connector`-Bauteil (gleicher Name = gleiches Netz, pro Tab);
  Inline-Rename per Doppelklick; README/Doku ehrlich zu Blättern.
- DESIGN.md: Gerber-Fiktion gestrichen, Nicht-Ziele dokumentiert;
  13 überholte Docs nach `docs/archiv/` (mit Index); TEST_MATRIX als
  maßgebliche UI-Matrix bestätigt.
- `scripts/sprint1test.ts`: 41 Checks gegen analytische Werte, in `npm test`
  verdrahtet; `simtest.ts` + Szenarien-Runner melden Exit-Code 1 bei Fehlern;
  101 Szenarien in die Testkette aufgenommen (zuvor unverifiziert).
- Verifikation: `tsc` ✅, `eslint` ✅, `npm test` ✅ (alle Ketten grün);
  `next build` scheitert nur am Google-Fonts-Fetch (Sandbox offline,
  pre-existing, unberührt von Sprint 1).

## Sprint 2 — Gefühl (✅ abgeschlossen 2026-10-04)

Ziel: Die App fühlt sich an wie Hardware, nicht wie eine Webseite.

- [x] S2.1 Web Worker für Analysen (Kernel auslagern) + Fortschritt + Abbrechen
- [x] S2.2 Konvergenzfehler als gestalteter Zustand (Verdächtige + „Problemknoten zeigen")
- [x] S2.3 First-Run-Spotlight auf ▶ (einmalig, Manifest-konform)
- [x] S2.4 Echtzeit-Überlast ehrlich anzeigen (×-Faktor) + adaptive Zeitschrittweite
- [x] S2.5 Beispiel-Galerie mit Vorschaubildern
- [x] S2.6 Boot (reduziert: Canvas-Ton statt Skeleton — Seite prerendert, s. Audit §43)
- [x] Tests + Verifikation (tsc/eslint/test/build)

**Gemacht:**
- Analysen laufen im Web Worker (UI bleibt flüssig) mit Fortschritt +
  Abbrechen; synchroner Fallback mit einmaligem Hinweis.
- Konvergenzfehler als Fehlerkarte (Klasse, Erklärung, Verdächtige,
  Marker auf der Leinwand); Kern diagnostiziert Null-Diagonalen +
  Newton-Updates; `.ok` wird endlich geprüft (keine leeren Diagramme mehr).
- First-Run-Spotlight auf ▶: einmalig, non-modal, non-blockierend.
- StatusBar-×-Chip + adaptive Zeitschrittweite + Verworfen-Zähler;
  Inspector in ×-Format.
- Beispiel-Galerie mit echten SVG-Vorschaubildern (8/8).
- Canvas-Boot-Ton gegen Aufblitzen (S2.6-Befund korrigiert: kein Skeleton nötig).
- `scripts/sprint2test.ts`: 18 Checks, alle grün, in `npm test` verdrahtet.
- Verifikation: `tsc` ✅, `eslint` ✅, `npm test` ✅ (260 PASS);
  `next build` nur Google-Fonts-Fetch (Sandbox offline, pre-existing).

## Sprint 3 — Struktur (✅ abgeschlossen 2026-10-04)

Ziel: Multisim-Parität im Aufbau großer Entwürfe.

- [x] **Richtungsentscheid Blätter** (entschieden 2026-10-04): Tabs =
      unabhängige Entwürfe — UI-Texte umbenannt („Entwurf/Entwürfe"),
      toter `SheetTabs`-Duplikat gelöscht, `offpage_connector`-Ast aus
      `buildNets` entfernt (kein blattübergreifend, kein Off-Page-Bauteil)
- [x] S3.1 Busse voll (User-Entscheid): Tap/Splitter, dynamische Pins, Deklaration + Validierung
- [x] S3.2 Custom-Parts = Hierarchie (User-Entscheid): „Auswahl als Bauteil", exaktes Mapping, Limits-Doku
- [x] S3.3 Re-Annotate (Leserichtung, undo-fähig)
- [x] S3.4 Pin-Typen + dokumentierter ERC-Regelsatz
- [x] S3.5 KiCad-Import (`.kicad_sch`) + SPICE-Coverage (E/G/F/H/J)
- [x] S3.6 E/G/F/H-Bauteile verifizieren + testen (de facto vorhanden)
- [x] Tests + Verifikation (tsc/eslint/test/build)

**Gemacht:**
- Bus-Tap + Bus-Splitter (2/4/8/16 Bit, dynamische Pins) per Namensbindung
  (`D[3]`); Bus-Draht leitet nicht (dick violett + Schild); Breiten-Prüfung.
- „Auswahl als Bauteil…" (`extractSelectionAsPart`): exakte Ports, GND
  global, Fehler statt Stillem, kein Nesting.
- „Referenzen neu nummerieren" (Bearbeiten-Menü): pro Präfix leserichtig
  ab 1, freie Namen bleiben, Undo-fähig.
- ERC E1–E4 + Pin-Typen; kalibriert (MCU = GPIO/passiv); alle 8 Vorlagen
  ERC-still (555-CTRL 10 n, Zähler-RST→GND); W98d grün.
- `.kicad_sch`-Minimal-Parser (Drehungs-Suche, Pin-Snap, ehrliche Limits);
  SPICE E→vcvs, G→vccs, F→cccs, H→ccvs, J→jfet (+ Modell-Heuristiken).
- Router-Fix: keine geteilten Knicke zwischen Netzen (stiller Kurzschluss
  behoben); W61-Lücke als Known Limit mit Warnung (Sprint-5-Kandidat).
- E/G/F/H-Abbildung verifiziert (E-Folger 1 V → 2 V im OP-Test).
- Bonus-Fix: `newDocument` schrieb Entwurf nicht zurück (Datenverlust).
- `scripts/sprint3test.ts`: 41 Checks, alle grün, in `npm test` verdrahtet.

## Sprint 4 — Modelle (abgeschlossen 2026-10-04)

Ziel: Genauigkeit für reale Entwürfe.

- OPV transient: Boyle-Pol (τ = A0/2π·GBW) + Slew-Clamp; Folger
  0.995/0.316 = Theorie, Rampe 0.50 V/µs, AC-Ecke 1.00 MHz; slew-Params
  + TL07x-Einzelteile im Katalog.
- BJT/Diode: IS(T)/BF(T) nach SPICE-2G (Vf-Drift −2.03 mV/K),
  gradierte Sperrschichten (FC) + TT/TF/TR-Diffusion (Chord).
- MOSFET: VTO(T)/KP(T), Meyer-Caps aus TOX + CGSO/CGDO-Überlapp
  (Rds ×1.47 @125 °C, AC-f3dB 23.3/17.1 MHz).
- MC/Worst-Case: Q→BF+IS, D→IS, M→VTO+KP, J→BETA+VTO
  (korreliert pro Device); tol-Params im Katalog.
- Relais-Hysterese verifiziert (4.01/1.99 V, voff = vpull/2);
  Sicherung mit I²t-Integral (45.2 ms @9.5 A, hält bei IN).
- Trafo: rp/rs/rcore/isat-Knie (3.67× = Theorie); TLINE neu
  (Bergeron, 1.01 µs, AC −45°, OP durchverbunden).
- `scripts/sprint4test.ts`: 31 Checks, alle grün, in `npm test` verdrahtet.

## Sprint 5 — Feinschliff (Rest läuft seit 2026-10-05)

Ziel: Apple-Level im Detail, bei eigenem Look.

- [x] S5.1 Canvas/editor/Instruments aufgeteilt (§46, PASS)
- [x] S5.2 Inspector-Primitives + Zahlenformat (§46, PASS)
- [x] S5.3 Tastatur-Platzieren + Esc-Kette (§46, PASS)
- [x] S5.4 Screenreader-Zusammenfassung + Live-Region (§46, PASS)
- [x] S5.5 Link-Teilen (§46, PASS)
- [x] S5.6 Wizards/Lehrer-Modus/Beschreibungsbox (§46, PASS)
- [x] S5.7 Grapher Mess-Panel + Postprozessor (§46, PASS)
- [x] S5.8 Nested Sweep, Batched, THD-Sweep (§46, PASS)
- [x] S5.9 W61-Fix (§46, PASS)
- [x] S5.10 Fenster-Chrom einheitlich (§50, Nutzerwunsch 2026-10-05)
- [x] S5.11 Datensicherheit (§50, PASS)
- [x] S5.12 Zugang (§50, PASS)
- [x] S5.13 Bauteile/Medien (§50, PASS — LCD begründet zurückgestellt)
- [x] S5.14 Live-Steuerung wie in Multisim (Nutzerwunsch 2026-10-05, PASS)
- [x] S5.15 TEST_MATRIX-§14-Backlog (Nutzerwahl 2026-10-05, PASS)
- [x] S5.16 Steve-Theorie-Sweep: Buttons/Fenster/Bedienung (Nutzerfrage 2026-10-05, PASS)
- [x] S5.17 Detail-Review: Versprechen vs. Wirklichkeit (4 Nutzerbefunde 2026-10-05, PASS)
- [x] S5.18 Nutzer-Feinschliff: Auswahl-Sperre, Aktionszone, IC-Vorschau (3 Befunde 2026-10-05, PASS)
- [x] S5.19 UI/UX-Komplettsweep mit Wirkungsprobe: 8 Flächen geprüft, Hinweis-Boxen raus, Mobile-Bib repariert (PASS)
- [x] S5.20 Oszi-Skalenprüfung: Trigger/t/V auf allen Stufen, Archiv-Historie gegen „halbes Signal“ (PASS)
- [x] S5.21 Physikalisches Oszi-Rauschen: fest in Volt + ADC-Quantisierung (PASS)
- [x] S5.22 Netzlabels + Notizzettel + Ein-Rahmen-Eingabe (Nutzerbefunde 2026-10-05, PASS)
- [x] S5.23 Notizzettel 2.0: Einheitskarte, Scrollen, 3 Schriften (Nutzerbefunde 2026-10-05, PASS)
- [x] S5.24 Bibliothek + Wertfluss + Referenz (Nutzerwünsche 2026-10-05, PASS)

**Gemacht (Rest):**
- S5.10: `ui/WindowChrome.tsx` neu (`WINDOW_SHELL` + `WindowTitleBar`,
  Kanon h-9/Icon-Kachel/xs-medium/Aktionen+Close); Instrumente, Bibliothek
  (Radius 12→14, Kachel statt nacktem Icon, IconButton-Close) und Dialoge
  (h-11→h-9, Border ergänzt, Titel xs/medium) nutzen dieselbe Quelle.
  Verifikation: `tsc` ✅, `eslint` ✅, `npm test` ✅; Sichtprüfung Nutzer.
- S5.11: `saveHealth` (lokal/Datei) im Store, Auto-Save wertet das
  Datei-Ergebnis aus (vorher `void` = stille Veraltung); Status-Chip
  („Gesichert HH:MM“/„Datei veraltet“/Fehler, Klick = Retry) + `•` im
  Tab-/Fenstertitel; Backup-Generation (localStorage `.prev`, AppData
  `.bak`) mit `fromBackup`-Warnung; Desktop-Schreibvorgänge atomar
  (Tmp+Rename, `desktop/atomic.cjs`); `scripts/sprint5resttest.ts`
  (9 Checks: Migrate-Verträge, Crash-Fallback, Atomic). `tsc` ✅,
  `eslint` ✅, `npm test` ✅, `node --check` (main/atomic) ✅.
- S5.12: Kontrast-Verträge (12 Text- + 6 Grafik-Paare × 2 Themes gegen
  `globals.css`, alle AA — keine Variablen-Änderung nötig); Farb-Inventur
  (keine Rot/Grün-Allein-Codierung: Spannung orange/blau, Auswahl
  blau/amber + Griffe, Oszi-Kanäle beschriftet, Status immer Glyphe+Text);
  UI-Schriftgröße (Kompakt/Standard/Groß, Root-px, persistiert, auch im
  Lehrer-Modus); Touch-Trefferflächen (Statusleisten-Buttons + Tab-× auf
  24 px). iPad-Sichtprüfung: Nutzer (Checkliste in §50). `tsc` ✅,
  `eslint` ✅, `npm test` ✅.
- S5.13: WAV-Export (`lib/wav.ts`: native Sim-Rate, −1 dBFS, 2-M-Sample-Limit;
  Grapher-Auswahl + ehrlicher Toast); Symbol-Stilführer
  (`docs/symbol-stilfuehrer.md` + Lint-Test: 10-px-Pinraster, Text 7–13,
  kein `w`); 14-Segment-Anzeige (15 LED-Devices, Hex + ASCII, DP-Bit,
  Linien-Renderer); NTC (neue Engine-Device-Type, Beta-Gleichung, folgt
  Sim-Temperatur); LDR (Potenzgesetz, 1 Ω–100 MΩ, statisch dokumentiert).
  LCD zurückgestellt: ohne Digital-Bus-Schicht keine ehrliche Datenquelle
  (§52). `tsc` ✅, `eslint` ✅, `npm test` ✅ (sprint5resttest: 18 Checks).
- S5.14: Klicks auf Schalter/Taster/Poti wirken live in der Sim (Fix:
  Controls per Instanz-ID statt Label — vorher reine Deko); Taster
  momentan (Maus/Taste halten, Loslassen öffnet; Release bei Stopp/Blur);
  Tastenbelegung pro Bauteil (`params.key`, Badge `S1 [A]` am Symbol,
  gewinnt laufend gegen Editor-Kürzel); Poti-Schieber im Inspector ohne
  Rebuild (`setControlLive`); Strom/Leistung im Inspector per Geräte-ID
  (gleiche Bug-Familie); Hilfe-`?` ergänzt. `tsc` ✅, `eslint` ✅,
  `npm test` ✅ (sprint5resttest: 22 Checks).
- S5.15: §14-Backlog aufgearbeitet — verifiziert bereits-erledigt (Wire-Griffe,
  Hover, Library-Tasten, Reduced-Motion, Focus-Ring, Log-Live-Regions);
  Canvas-Tokens (Motor/Griffe/Flow-Grau/ERC/Sonden-Badge; `inkOn`-Helfer
  fixt echten Dunkel-Theme-Kontrast auf --err/--warn); LED/Segment-Rot als
  dokumentierte Hardware-Ausnahme (Lint S5.15a); Undo/Redo-Toast mit
  Gegenaktion + 5-s-Auto-Dismiss; Feedback-Kanon dokumentiert; Benchmark
  1001 Bauteile → OP 42 ms (`scripts/s515perf.ts`); E2E + Canvas-fps als
  Nutzer-Parcours übergeben. `tsc` ✅, `eslint` ✅, `npm test` ✅
  (sprint5resttest: 25 Checks).
- S5.16: Theorie-Sweep über ~330 Klick-Stellen — Kanon bestätigt (.btn/.tab/
  .tree-row/ToolButton/ui-Menü/Geräte-Skins, alle Dialoge aus ui-Schale,
  Menü-Pfeilnav, Esc-Kette, Fokus-Falle); 6 Befunde gefixt: PartEditor-Rot
  und Wahrheitstabellen-Weiß tokenisiert, Sonden-Badges + Leitungs-Header
  auf Theme-Variablen (helles Theme wich ab), `.row/.badge/.sep` zu
  `.ctx-*` gescopet (globale Klassennamen), BottomSheet-Esc. `tsc` ✅,
  `eslint` ✅, `npm test` ✅ (sprint5resttest: 28 Checks).
- S5.17: Vier Nutzerbefunde — ⌘-Loop in der Bibliothek (Badge + Treffer-Icon)
  plattformgerecht (Strg+K/Suche); „r 10k“ hält sein Versprechen
  (`lib/library/search.ts`: Wert-Token-Regel, Einmal-Vorbelegung
  `placingPreset`, nur bei Zahl als Hauptparameter); Kategorien starten
  eingeklappt; Fenster-Eckgriffe unsichtbar wie Bibliothek (Familien-Sweep:
  Rest adaptiert). `tsc` ✅, `eslint` ✅, `npm test` ✅
  (sprint5resttest: 30 Checks).
- S5.18: Auswahl-Sperre (`user-select: none` aufs Chrom, Opt-outs für
  Inputs/Logs/Messwerte — Ziehen/Slider markieren nichts mehr);
  Platzieren-Button + Vorbelegungs-Chip direkt unter Name/Vorschau
  (statt am Ende nach Pins); IC-Vorschaubilder (`lib/library/preview.ts`:
  BBox-Fit mit Strich-Kompensation statt starrer 48er-Box). `tsc` ✅,
  `eslint` ✅, `npm test` ✅ (sprint5resttest: 33 Checks).
- S5.19: Komplettsweep mit Wirkungsprobe (Bibliothek, Canvas, Inspector,
  Bottom/Grapher/Probes, Instrumente, Menüs, Dialoge, Toasts).
  Gefunden+gefixt: Hinweis-Box raus (Suchsyntax steht im Platzhalter,
  Zeilen mit Grab-Cursor); mobile Bib war kaputt (fixed-Fenster im Sheet,
  kein Platzieren, keine Tabs/Kategorien) → `fill`-Modus + Aktionsleiste +
  Bereichs-Tabs + Kategorie-Select; Grapher-Leerzustand mit Aktion
  („DC-Arbeitspunkt berechnen“); Touch-Toolbar Glyphen→Lucide.
  Für sauber befunden: ⌘-Familie (MenuItem/Kbd/Tooltip adaptieren zentral),
  Fokusfalle+Esc, Kontexmenü-Clamping, Toast, Slider-Styling, Modus-Banner.
  Bewusste Ausnahmen: Folge-Hinweise (Projekte, Extrahieren), Probe-Leerstand
  mit Buttons, Platzier-Log auf Desktop (einzige Affordanz dort).
  `tsc` ✅, `eslint` ✅, `npm test` ✅ (sprint5resttest: 36 Checks).
- S5.20: Oszi-Skalenprüfung (Nutzerbefund „bei t groß fehlt das halbe Signal“).
  Ursache: Sim-Historie nur ~2,9 s (fast+slow), Fenster bis 1500 s → linker
  Schirm lief in gehaltene Randwerte. Fix: Archiv-Tier in realtime.ts
  (zeitbasiert, ratenunabhängig: 16384 × 1/55 s ≈ 298 s), 3-stufiger Sampler,
  tdiv-Max 100→10 s/div (Spanne 150 s + H-Verzögerung sicher abgedeckt).
  Weiter gefunden+gefixt: H-Verzögerung unbegrenzt (→ scheinbares Einfrieren,
  jetzt ±1 Spanne an Knopf + Engine); Triggerpegel unbegrenzt (jetzt ±8 Divs,
  Netz-Trigger fest 0 V statt totem Knopf); Trigger-Suchfenster 0,25→0,05 s
  (löst Sim-Bandbreite sicher auf). Verifiziert korrekt: Kurven-/Marker-
  Geometrie, Clamp-Ränder, Invert, Zoom, Slope, Holdoff, Roll, Auto-Timeout.
  Offene Fidelity-Notiz: Rauschmodell σ ∝ V/div (konstant in Divs statt Volt).
  `tsc` ✅, `eslint` ✅, `npm test` ✅ (ozsitest: 32 Prüfungen).
- S5.21: Rauschmodell physikalisch (Nutzerwunsch: maximal realitätsnah).
  War: σ ∝ V/div (0,4 Divs Fuzz auf feiner Stufe, unruhig auf grober).
  Jetzt: festes Front-End-Rauschen 100 µVrms × Tastkopf-Faktor, davor/dahinter
  physikalische Kette (Rauschen→Filter→Quantisierung→Sättigung); 8-Bit-ADC
  (LSB über 8 Divs, HiRes mittelt dank Dither); BW-Limit √(20/70), nur wo das
  digitale Filter wirkungslos ist (kein Doppelzählen); Trigger analog
  (ohne Quantisierung). `tsc` ✅, `eslint` ✅, `npm test` ✅ (ozsitest: 36).
- S5.22: Drei Nutzerbefunde. (a) Netzlabels wie Multisim: gleichnamige
  Labels vereinen Netze virtuell (`buildNets`, case-insensitiv, erste
  Schreibweise gewinnt; leere Namen vereinen nichts; Label ≡ On-Page-
  Verbinder gleichen Namens → ein Netz). (b) Notizen als echte Zettel:
  Klebezettel-Optik (gelb, max. 232×150 px, darüber „…“), Text-Markup
  `**fett**`/`*kursiv*`/`__unter__` (`lib/notes/markup.ts`, DOM-frei),
  Direkteditor auf dem Zettel (contentEditable + B/I/U-Toolbar,
  Canvas-Kürzel schweigen beim Tippen, neue leere Notiz wird still
  verworfen); `kind:"text"`-Pfad aus InlineEditor/Canvas/Menü entfernt.
  (c) Eingabefeld: ein Rahmen statt Panel+Chip+Box, Breite folgt dem
  Inhalt (8–26 ch + Einheit) — kein 5-cm-Feld für vier Ziffern.
  `tsc` ✅, `eslint` ✅, `npm test` ✅ (wiretest +5, notetest neu: 28).
- S5.23: Zettel 2.0 (Nutzer: kein „…“, feste Größe, Schriftstufen). Jeder
  Zettel ist jetzt eine Einheitskarte (232×150), Überlauf scrollt innen
  (Mausrad über dem Zettel, dezente Leiste, kräftiger bei Auswahl/Schweben)
  statt zu kappen; Schrift in drei Stufen (S/M/L = 9/11/14, Wahl in der
  Editor-Leiste, reist per Undo mit dem Text); Optik: warmes Papier mit
  Verlauf, Lichtkante, umgeknickter Ecke (bleibt gelb wie angeklebt —
  dokumentierte Ausnahme im Canvas-Hex-Lint, wie LED-Emission).
  `tsc` ✅, `eslint` ✅, `npm test` ✅ (notetest: 41).
- S5.24: (a) Bibliotheks-Diät: Mitte ohne Kategoriezeile + ohne generierte
  Fülltexte, rechts ohne Badges, Pins einklappbar; neue Rubriken Sensoren
  (NTC/LDR) und Stromversorgung (Regler, GND/VCC). (b) Nach Platzieren von
  R/C/L + U/I-Quellen öffnet sofort das Wertfenster (Standard vorausgewählt,
  Enter ok, Esc behält Standard; ⇧-Serie läuft weiter). (c) Rad in Zahlen-
  feldern: Widerstand in E-Reihe-Schritten (E6/E12/E24 in Einstellungen →
  Bauteilwerte), Rest ±5 % (⇧ ±1 %); gilt für Inspector + Wertefeld, Entwurf
  bis Blur/Enter. (d) Referenz-Fenster über Hilfe: Farbcode, E-Reihen,
  Kerko-/SMD-Codes, Suffixe (live gerechnet/gespiegelt).
  `tsc` ✅, `eslint` ✅, `npm test` ✅ (referencetest neu: 58).

## Nicht-Ziele (bewusst)

- PCB-Layout/Transfer, Gerber-Export (kein Board-Editor → kein ehrlicher Export)
- Multisim-Binärimport (`.ms*`, proprietär)
- 3D-Bauteile/3D-Breadboard, Ladder-Diagramme, Agilent/Tek-Nachbauten,
  LabVIEW-VIs, ELVIS-Hardware
