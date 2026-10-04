# Sprints — Weg zu „Multisim fürs Web" in Apple-Qualität

> Lebendes Log: Nach jedem Sprint wird hier eingetragen, was gemacht wurde
> (Stichpunkte) und was noch offen ist (Tabelle unten). Details je Sprint im
> Audit-Protokoll (`STEVE_JOBS_QUALITY_AUDIT.md`, §42 ff.).
> Stand: Sprint 3 abgeschlossen (2026-10-04). Details im Audit-Protokoll (§44).

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

## Sprint 4 — Modelle (offen, laufend)

Ziel: Genauigkeit für reale Entwürfe.

- [ ] OPV: Slew-Rate + GBW auch transient
- [ ] BJT/Diode: Kapazitäten + Temperatur-Skalierung (IS/BF)
- [ ] MOSFET: Meyer-Caps + Temp-Modell (VTO/KP)
- [ ] Monte-Carlo/Worst-Case: Halbleiter-Streuung
- [ ] Relais: Spule schaltet Kontakt (Hysterese); Sicherung: I²t-Modell
- [ ] Übertrager: Sättigung/Verluste; Übertragungsleitung (T-Element)

## Sprint 5 — Feinschliff (offen, laufend)

Ziel: Apple-Level im Detail, bei eigenem Look.

- [ ] Canvas.tsx aufteilen (Render/Hit-Test/Pointer/Overlays), ebenso
      Instruments.tsx + editor.ts — ohne Verhaltensänderung
- [ ] Inspector auf `ui/`-Primitives + Zahlenformat-Modul (4k7, Ω/µ überall)
- [ ] Tastatur-Platzieren (Pfeile + Enter); Esc-Kette testen
- [ ] Screenreader-Zusammenfassung der Schaltung + Live-Region Sim-Status
- [ ] Link-Teilen (Schaltung als komprimierte URL)
- [ ] Wizards 7 → ~12 (Filter, CE-Bias, 555-Rechner); Lehrer-Modus
      (Werte/Faults verstecken, sperren); Beschreibungsbox mit Live-Werten
- [ ] Grapher: Mess-Panel pro Kurve + Rechen-Postprozessor
- [ ] Nested Sweep, Batched Analyses, Verzerrungs-Sweep
- [ ] Farbblind-Verifikation; UI-Schriftgröße; Touch-Parcours (iPad)
- [ ] Ungespeichert-Indikator + Crash-Recovery; Format-Migrationen testen
- [ ] Stilführer Symbole (Raster/Strich/Palette); LCD/Bargraph/14-Segment;
      Sensoren (NTC/LDR); WAV-Export

## Nicht-Ziele (bewusst)

- PCB-Layout/Transfer, Gerber-Export (kein Board-Editor → kein ehrlicher Export)
- Multisim-Binärimport (`.ms*`, proprietär)
- 3D-Bauteile/3D-Breadboard, Ladder-Diagramme, Agilent/Tek-Nachbauten,
  LabVIEW-VIs, ELVIS-Hardware
