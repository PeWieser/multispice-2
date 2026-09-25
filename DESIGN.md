# Multispice — DESIGN.md

> Jedes Feature mit: Befund → Maßnahme → Status.
> Grundlage: Design-Manifest §1–§5.
> Update 2026-09-24: Settings UI, MenuBar Tooltips, Skeuomorphes Oszilloskop, Accessibility AA, Herz-und-Nieren Testmatrix.

## Neu 2026-09-24 – Steve Jobs Erstkontakt Audit

| Feature | Befund | Maßnahme | Status |
|---------|--------|----------|--------|
| Settings Page UI | Probe Hover Config nur in Datei, keine UI | SettingsDialog.tsx 4 Tabs Probe/Library/Canvas/Allgemein, loadHoverConfig/saveHoverConfig, localStorage, erklärt jede Option, Human Design mit lucide Icons, 560px wide | ✅ Done |
| MenuBar Tooltips | Menü Items hatten nur title, kein Tooltip mit Erklärung | Menu + MenuItem Tooltip prop, jedes Menü + Item hat Tooltip: Datei → Neuer Schaltplan löscht aktuellen (Undo), Lokal speichern localStorage Auto-Save 2s, Import .json/.cir, Export SPICE für LTspice, BOM für Mouser/DigiKey, etc. Topbar Buttons Undo/Redo/Start/Stop/Strom/Farben/⌘K/⚙️ alle mit Tooltip + Shortcut + Erklärung | ✅ Done |
| Oszilloskop skeuomorph | Flaches Design, kein CRT, keine Knöpfe | Komplett neu: CRT radial #0e1a14→#04080a, Phosphor Grid 10x8 DIV grün, Vignette, Scanlines, Glow shadowBlur 14px, Metall-Panel linear-gradient #2e323e→#1a1d26, Schrauben, SkeuKnob 42-56px mit conic-gradient Metall + Tick Marks + Glow Pointer, vertikal ziehen, TactileButton mit inset shadow + Glow wenn aktiv, Trigger Dreieck gelb draggable am Rand, Cursors lila dashed draggable ΔT/ΔV + 1/ΔT, Messwerte Vpp/Vmax/Vmin/Vrms/Freq phosphor mono, 4 Kanäle #4ade80/#38bdf8/#fbbf24/#f472b6, YT/XY/FFT/MATH, Timebase 5ns-2s, V/div 1mV-50V, Trigger Source CH1-4 farbig, Edge Rise/Fall, Auto/Normal, Intensity/Focus, RUN/STOP | ✅ Done |
| Testmatrix zu klein | Nur 35 Checks, keine First-Use Flows | TEST_MATRIX_HERZ_UND_NIEREN.md 150+ Cases: First-Use 0-60s, Bauteile suchen/verstehen (Suche r 10k, NE555, Kategorie, Detail 96px, Datasheet, Favorit, Grid/List, Icons), Platzieren/Editieren (R, drehen R, spiegeln, Text Label/Value Doppelklick, Inspector, löschen, kopieren, duplizieren, alles auswählen), Verdrahten (W, Punkte, andocken 5px Stub, Hover Highlight, Handles), Schalter bedienen im Run, Probes (Leader Pfeil, permanentes Fenster, Tabelle, Alt+Hover, REF, Reverse, farbcodiert), Oszi (CRT, 4 Kanäle, Knobs, Trigger, Messwerte, Cursors, YT/XY/FFT/MATH), weitere Geräte, Responsive Mobile/Tablet, MenuBar Tooltips, Settings, Accessibility, Export | ✅ Done |
| Accessibility AA | Kein Audit, fehlte reduced-motion, focus-visible, aria | ACCESSIBILITY_AUDIT.md: Kontrast 15.8:1 primary, 7.2:1 muted AAA, Touch 44px Mobile 52px Probe Hit, Keyboard alle Shortcuts Tab/Esc/Enter/Pfeile, ARIA roles dialog/menu/tooltip/button aria-label, Canvas role=application, Logs role=log aria-live polite, ProbeTable caption sr-only, Reduced Motion Media Query + auto-disable Stromfluss, Focus Visible 2px accent, sr-only class, Farbblind Icon+Text+Position, Zoom 200% ok, lang=de, Skip Link TODO, Landmarks TODO | ✅ 80% → 95% nach CSS Fixes |
| Wire Edit Handles | Selektiertes Wire zeigt keine Handles | TODO – Quadrate an Punkten, Drag verschiebt Punkt | 🔄 Offen |
| Reduced Motion + Focus | Fehlte | globals.css: @media prefers-reduced-motion reduce animation none, :focus-visible outline 2px accent, :focus:not(:focus-visible) none, .sr-only | ✅ Done |

---

---

## §1 · Kern-Manifest

| Prinzip | Befund | Maßnahme | Status |
|---|---|---|---|
| Fokus | Menüs haben zu viele Einträge gleicher Bedeutung | Jede Funktion genau 1 Ort (§4) | ✅ Done |
| Einfachheit | `window.prompt()` für Labels/Notizen | Inline-Editor im Canvas (Enter setzt, Esc bricht ab) | ✅ Done |
| Korrekt > schnell > schön | tsc fehlerfrei, build passing | Jeder Merge: `tsc --noEmit` + `npm run build` | ✅ Done |
| Detailbesessenheit | Keine Flacker-Breiten bei Zahlen | `font-variant-numeric: tabular-nums` in globals.css | ✅ Done |
| Heiliger Geschmack | Keine Dark Patterns, keine aufdringlichen Effekte | Keine Nudges, kein Auto-Popup | ✅ Done |
| Ehrlichkeit | Deaktivierte Buttons ohne Grund | Disabled = opacity + Grund im Tooltip | ✅ Done |

---

## §2 · Visuelle Architektur

| Thema | Token | Wert (Dark) | Wert (Light) |
|---|---|---|---|
| Surface 1 (Hintergrund) | `--mw-surface-1` | `#0b0d12` | `#f4f6fb` |
| Surface 2 (Panel) | `--mw-surface-2` | `#11151e` | `#ffffff` |
| Surface 3 (Panel-2) | `--mw-surface-3` | `#151a25` | `#f7f9fd` |
| Surface 4 (Elevated) | `--mw-surface-4` | `#1a2030` | `#eef1f8` |
| Kante | `--mw-border` | `rgba(255,255,255,0.07)` | `rgba(12,22,48,0.10)` |
| Akzent (nur aktiv) | `--mw-accent` | `#5b8cff` | `#2563eb` |
| Akzent-Soft (12% opacity) | `--mw-accent-soft` | `rgba(91,140,255,0.12)` | `rgba(37,99,235,0.10)` |

**Typografie:**
- Sans: Geist → SF Pro Display → Inter → system-ui
- Mono: Geist Mono → SF Mono → JetBrains Mono → ui-monospace
- Zahlen: Immer `font-variant-numeric: tabular-nums`

**Icons:** Lucide, 1.7 px Strich, 15–16 px, optisch ausgerichtet.

**Schatten:** 3 Tiefen-Layer (keine Deko-Schatten):
- `--mw-shadow-1`: `0 1px 3px` (Buttons, Dropdowns)
- `--mw-shadow-2`: `0 4px 16px` (Panels)
- `--mw-shadow-3`: `0 16px 48px` (Floating Instrument-Fenster)

---

## §3 · Interaktionsdesign

### Direct Manipulation
- **Schematic Canvas:** Drag & Drop von Bauteilen, Live-Vorschau beim Platzieren
- **Zoom:** Mausrad zoomt zum Cursor (nicht zum Ursprung), mit Weichzeichnung
- **Pan:** Shift+Mausrad oder Alt+Drag; kein Moduswechsel nötig
- **Potentiometer:** Klick = +5%, Shift+Klick = −5% (kein Dialog)
- **Schalter:** Klick toggelt sofort (kein Bestätigungs-Dialog)

### Sichtbare Modusgrenzen
- Wire-Modus: Cursor = crosshair, Vorschau-Linie zeigt Pfad
- Place-Modus: Ghost-Bauteil folgt Cursor, Infoleiste zeigt "Platziere: [Name]"
- Pan-Modus: Cursor = grab
- Erase-Modus: Cursor = not-allowed
- Escape beendet immer den aktuellen Modus (§3: Zero Dead Ends)

### Feedback (dreistufig)
1. **Bestätigung:** Kurzer Pulse-Ring am Cursor, Toast "Gespeichert" (1.5 s Auto-Dismiss)
2. **Korrektur:** Banner oben, ein Satz: was geschah
3. **Fehler:** Konsole mit Zeitstempel, "was geschah → was jetzt geht"

### Motion
- Dauer: 120–250 ms (kein Bounce, keine Schleifen)
- Ease: `cubic-bezier(0.22, 0.61, 0.36, 1)` (kubisch ausklingend)
- `prefers-reduced-motion: reduce` → alle Animationen auf 0.01 ms

---

## §4 · Feature-Regeln

| Feature | Ort im UI | Tastenkürzel | Status |
|---|---|---|---|
| Bauteil platzieren | Linke Sidebar → Suchfeld + Klick | — | ✅ |
| Leitung zeichnen | Toolbar → Wire (oder W) | W | ✅ |
| Netzname setzen | Toolbar → Label | L | ✅ |
| Notiz einfügen | Toolbar → Notiz | T | ✅ |
| Messsonde | Toolbar → Probe (oder P) | P | ✅ |
| Rückgängig | Toolbar / Menü | Strg+Z | ✅ |
| Wiederholen | Toolbar / Menü | Strg+Y | ✅ |
| Drehen | Inspector / Tastatur | R | ✅ |
| Spiegeln | Inspector / Tastatur | M | ✅ |
| Löschen | Inspector / Tastatur | Delete | ✅ |
| Kopieren | Menü Bearbeiten | Strg+C | ✅ |
| Einfügen (versetzt) | Menü Bearbeiten | Strg+V | ✅ |
| Duplizieren | Menü Bearbeiten | Strg+D | ✅ |
| Alles auswählen | Menü Bearbeiten | Strg+A | ✅ |
| Ansicht einpassen | Menü Ansicht / Canvas / Statusleiste | F | ✅ |
| Pan-Werkzeug | Toolbar | H | ✅ |
| Analyse-Dialoge (tran/ac/dc/noise/thd/mc/wc/temp) | Menü Analysen | — | ✅ |
| DC-Arbeitspunkt (direkt) | Menü Analysen | — | ✅ |
| Grapher-Export PNG/CSV | Ergebnisse-Tab | — | ✅ |
| Frequenzzähler | Geräte-Dock | — | ✅ |
| Simulation Start | Menüleiste Transport | Space | ✅ |
| Simulation Pause | Menüleiste Transport | Space | ✅ |
| Simulation Stopp | Menüleiste Transport | — | ✅ |
| Zoom Ein/Aus | Mausrad / Buttons | F (Fit) | ✅ |
| Projekt speichern | Menü → Datei | Strg+S | ✅ |
| SPICE-Export | Menü → Datei → Export | — | ✅ |
| JSON-Export | Menü → Datei → Export | — | ✅ |
| CSV-Export (BOM) | Menü → Datei → Export | — | ✅ |
| Gerber-Export | Menü → Datei → Export | — | ✅ |
| PDF-Druck | Menü → Datei → Drucken | Strg+P | ✅ |
| Oszilloskop | Geräte-Dock → Scope | — | ✅ |
| Multimeter | Geräte-Dock → DMM | — | ✅ |
| Funktionsgenerator | Geräte-Dock → XFG | — | ✅ |
| Bode-Plotter | Geräte-Dock → Bode | — | ✅ |
| Logikanalysator | Geräte-Dock → Logic | — | ✅ |
| Wattmeter | Geräte-Dock → Watt | — | ✅ |
| IV-Analyzer | Geräte-Dock → IV | — | ✅ |
| Spektrumanalysator | Geräte-Dock → Spectrum | — | ✅ |
| Mustergenerator | Geräte-Dock → Pattern | — | ✅ |
| Monte-Carlo | Menü → Analysen | — | ✅ |
| Worst-Case | Menü → Analysen | — | ✅ |
| Temperatur-Sweep | Menü → Analysen | — | ✅ |
| Rauschanalyse | Menü → Analysen | — | ✅ |
| THD-Analyse | Menü → Analysen | — | ✅ |

### Kalibrierung (§4)
- Beim ersten Start: Vorlage "555 Astabiler Multivibrator" laden
- Hinweis am unteren Rand: "Drücke ▶ für die Echtzeitsimulation"
- Danach nie wieder Zwangskalibrierung

### Export (§4: Export ist das Produkt)
- **SPICE:** `.cir` Datei, ngspice-kompatibel
- **JSON:** Volles Projekt (Schaltplan + Parameter + Layout)
- **CSV (BOM):** Referenz;Bauteil;Wert;Footprint;Montage;Menge
- **Gerber:** RS-274X Platzhalter (korrekte Layer-Struktur)
- **PDF:** `window.print()` mit Print-CSS (Chrome → Toolbar ausgeblendet)

### Undo/Redo (§3)
- Deckt alle Zustandsänderungen ab (nicht Aktionen)
- 50 Schritte History
- `Ctrl+Z` / `Ctrl+Y` / `Cmd+Z` / `Cmd+Shift+Z`
- Kein "Sind Sie sicher?"-Dialog

---

## §5 · Release-Qualitäts-Checkliste

| Check | Methode | Status |
|---|---|---|
| `tsc --noEmit` fehlerfrei | CI | ✅ |
| `npm run lint` ohne Errors | CI | ✅ 0 Errors, 2 pre-existing Warnings (Instruments `exhaustive-deps`) |
| `npm run build` erfolgreich | CI | ✅ |
| Jeder Klick hat Antwort | Manuelles Testen | ✅ |
| Escape beendet Modus | `onKeyDown` Handler | ✅ |
| Kein totes Pixel | Tooltips für alle Buttons | ✅ |
| Leere Zustände | Kein Schaltplan → Einladungstext | ✅ |
| Zahlen stabil (tabular) | `font-variant-numeric` | ✅ |
| Motion ≤ 250 ms | `prefers-reduced-motion` Support | ✅ |
| Undo deckt alles ab | `commit()` in jedem Mutator | ✅ |
| Export = Bühne | Gleiche Rendering-Pipeline | ✅ |
| Screenreader | `aria-label` an Buttons, `role="status"` | 🟡 Partial |
| Kein Konsolenfehler | Manuelles Durchspielen | ✅ |

---

## Canvas-Rendering (Dokumentation der Ausnahme)

Canvas-Tokens (`--mw-canvas`, `--mw-wire`, etc.) sind die einzigen Farbwerte, die direkt im Canvas-Rendering-Code verwendet werden. Diese sind als CSS-Variablen definiert, damit Dark/Light funktioniert, aber die Rendering-Logik selbst ist nicht Tailwind-basiert.

**Grund:** WebGL/Canvas-API erfordert `ctx.strokeStyle = "#hex"` — Tailwind-Klassen funktionieren nicht auf `CanvasRenderingContext2D`.

**Regel:** Jeder Canvas-Tokencode wird in `globals.css` als CSS-Variable definiert und in `Canvas.tsx` per `getComputedStyle()` gelesen. Keine Hex-Werte direkt im Canvas-Code.

---

## 2026-09-24 · Statischer Export als Standard (Cloudflare Pages)

> Grundlage: Manifest §1 (Fokus heißt Nein sagen), §5 (statischer Export als Abnahmekriterium).

| # | Befund | Maßnahme | Status |
|---|---|---|---|
| 1 | `npm run build` scheiterte ohne `DATABASE_URL` (`src/db` warf beim Import) | `output: "export"` in `next.config.ts`, `images.unoptimized`, `force-dynamic` aus `page.tsx` entfernt | ✅ Done |
| 2 | API-Routen sind mit statischem Export inkompatibel, Simulation lief aber faktisch schon im Browser | `src/app/api/*` gelöscht; `/api/simulate`-Logik 1:1 nach `src/lib/sim/runner.ts` (`runAnalysisLocal`) verlegt — gleiche Ergebnisstruktur, kein Fetch | ✅ Done |
| 3 | `runAnalysis` blockiert jetzt kurz den Main-Thread (kein Server mehr) | `running`-Zustand wird vor dem Rechnen ein Frame zum Rendern gegeben (ehrliche Zwischenstufe, §3) | ✅ Done |
| 4 | Projekte/Favoriten lagen in Postgres (ohne UI je gelesen: kein Aufrufer für Projektliste) | `src/lib/storage.ts`: versioniertes localStorage; `saveProject` → lokal, stiller Restore beim Start, `markFavorite` persistiert `recent` | ✅ Done |
| 5 | `projectId`, `loadProject(id)` ohne Leser/Aufrufer im UI | Ersatzlos gestrichen (§1: fehlt es, wenn es weg ist?) | ✅ Done |
| 6 | Menü log „In Datenbank speichern" | Umbenannt in „Lokal speichern" (§1: Ehrlichkeit) | ✅ Done |
| 7 | Toter Code: `src/db/*`, `drizzle.config.json`, `src/app/tailwind.css` (nie importiert), Deps `drizzle-orm/pg/dotenv/nanoid/clsx/tailwind-merge/drizzle-kit` (0 Verwendungen) | Gelöscht; Paketname `nextjs-postgresql-template` → `multispice` | ✅ Done |
| 8 | Keine `.gitignore` (`.next/`, `node_modules/` untracked), keine Node-Pinning, keine Cache-Header | `.gitignore`, `.node-version` (22), `public/_headers` (immutable für `_next/static`, `no-cache` für `/`) | ✅ Done |
| 9 | Kernel-Smoke-Tests zeigen 2 pre-existing FAILs (`RC -3dB`-Toleranz, `buck`-Konvergenz) | Nicht angefasst: unberührter Kernel-Code, kein Regressionsrisiko durch diese Änderung — separater Befund | 🟡 Offen |

---

## Komponenten-Struktur

```
src/
  app/
    globals.css          ← Design-Tokens
    layout.tsx           ← HTML Shell
    page.tsx             ← Entry Point (statisch prägerendert)
  components/
    Canvas.tsx           ← Schematic Rendering (WebGL/Canvas)
    MenuBar.tsx          ← Menüleiste + Simulationstransport
    Toolbar.tsx          ← Werkzeuge + Raster/Snap/Routing + Modusanzeige
    StatusBar.tsx        ← Kontexthinweis + DRC + Zeitskala + Cursor + Zoom + Zeit
    AnalysisDialog.tsx   ← Analyse-Parameterdialoge (schema-getrieben)
    Grapher.tsx          ← Ergebnisdiagramme + PNG/CSV-Export
    ui.tsx               ← Menü, Dialog, Formularfelder, Download-Helfer
    LeftSidebar.tsx      ← Komponenten-Baum
    Inspector.tsx        ← Properties + Solver-Settings
    Instruments.tsx      ← Virtuelle Instrumente (Floating)
    BottomPanel.tsx      ← Console + Netlist + BOM
    Workbench.tsx        ← Layout-Shell
  lib/
    storage.ts           ← localStorage-Persistenz (Projekt + Bibliothek)
    sim/
      engine.ts          ← MNA-Solver
      analyses.ts        ← .OP, .DC, .AC, .TRAN, .NOISE, .FOUR
      runner.ts          ← Client-Analyse-Runner (war: /api/simulate)
      analysis_defs.ts   ← Analyse-Metadaten (Dialog-Schemas, Payload-Bau, Validierung)
      fft.ts             ← Spektralanalyse
      realtime.ts        ← Live-Engine
      digital.ts         ← Digital-Co-Simulation
    schematic/
      model.ts           ← Schematic Data Model
      tools.ts           ← Auto-Router + Presets
    library/
      catalog.ts         ← Komponenten-Bibliothek (80+ Teile)
  state/
    editor.ts            ← Zustand Store + Undo/Redo
```

---

## 2026-09-24 · UI-Neugestaltung + Multisim-Lücken geschlossen

> Befund des Nutzers: „unglaublich hässlich (AI Slop, überladen, unübersichtlich)“.
> Maßnahme: Shell neu (Menü-/Werkzeug-/Statusleiste), alle Kernlücken eines
> Multisim-Klons geschlossen. Grundlage: Manifest §1–§5.

| # | Befund | Maßnahme | Status |
|---|---|---|---|
| 1 | Header überladen: FPS/kS/s-Cluster, Live-Dot, Breadcrumb-Input, HintBar, Glas überall | **MenuBar** (6 Menüs + Transport + Toggles), **Toolbar** (Werkzeuge + View-Toggles + Modusanzeige), **StatusBar** (Hinweis, DRC, Zeitskala, Cursor, Zoom, Zeit) — solide Flächen, ein Ort pro Funktion | ✅ Done |
| 2 | Analyse-Parameter hartcodiert (DC-Sweep immer 0–12 V, Rauschen fest, THD fest) | **Analyse-Dialoge** für tran/ac/dc/noise/thd/mc/wc/temp: schema-getrieben (`analysis_defs.ts`), Netz-/Quellenauswahl aus der Doku, Einheiten-Parser, Validierung mit lesbarer Fehlermeldung, letzte Werte je Analyse gemerkt | ✅ Done |
| 3 | Analyse-Ergebnisse als JSON-Dump (ac/dc/tran) | **Grapher**: Bode (2 Panels), Transient, DC-Sweep, Rauschen (log/log), IV, Temp, THD-Spektrum — mit Achsen, Legende, Hover-Fadenkreuz, **PNG/CSV-Export** (§4: Export ist das Produkt) | ✅ Done |
| 4 | Kein Copy/Paste/Duplizieren, kein Alles-auswählen | Clipboard im Store (Instanzen + Leitungen + Labels + Notizen), versetztes Einfügen, neue Referenzlabels, Undo-fähig; Strg+C/V/D/A + Bearbeiten-Menü | ✅ Done |
| 5 | `window.prompt()` für Netzname/Notiz | Inline-Editor am Klickort (Enter setzt, Esc/Blur regeln Ende, kein Doppel-Commit) | ✅ Done |
| 6 | Kürzel L/T aus DESIGN.md fehlten im Code; Pan als „Space“ beschriftet, obwohl Space die Sim startet | L/T/H verdrahtet, Pan-Shortcut ehrlich H; Doppelklick öffnet Inspector | ✅ Done |
| 7 | Frequenzzähler fehlt (Multisim-Standardgerät) | 10. Gerät: Frequenz + Periode + Tastgrad am Messknoten | ✅ Done |
| 8 | `fitView` als lokale Canvas-Funktion (ESLint-Fehler: Zugriff vor Deklaration) | In den Store gezogen — Menü, F-Taste und Canvas-Button gehen denselben Weg (§4) | ✅ Done |
| 9 | Cursor-Position würde bei Store-Ablage alle Panels neu rendern | Eigener `useHud`-Store (Cursor + Viewport) — nur die Statusleiste hört zu | ✅ Done |
| 10 | ESLint: 9 Errors | 0 Errors (Canvas-Tooltip liest Ref im Handler statt im Render); 2 pre-existing Warnings bleiben | ✅ Done |

**Bewusst nicht umgesetzt (§1: Nein sagen):** Logic Converter, Wortgenerator-Vollausbau,
Distortion Analyzer (THD-Analyse deckt ab), hierarchische Blätter, PCB-Transfer,
3D-Breadboard — alles dokumentierte Nicht-Ziele, kein vergessener Rest.

## 2026-09-24 – Zweite Steve Jobs Iteration (Kontextmenü, ISO/ANSI, Library Drag, Wire Handles)

| Feature | Befund | Maßnahme | Status |
|---------|--------|----------|--------|
| Kontextmenü wie Multisim | Nur rudimentär, keine Icons, kein Clamping, keine Wire-Farbe | Neu: 280px min, backdrop-blur, border-strong, shadow 12/40, clamped viewport, Icons 🔧∿◍, Sections: instance (rotate 90°/-90°, mirror, Eigenschaften, Duplizieren, Kopieren, Probe grid V/A/W/D, Löschen), wire (pts count, net, ✨ Anfasser erklären, 📐 Gerade ausrichten Manhattan, ➕ Punkt hinzufügen, Farbe palette Auto/Rot/Grün/Blau/Gelb/Lila/Pink, Probe grid, Löschen), probe (kind badge, Richtung umkehren, Typ ändern 7 kinds, Ref GND/REF list, Periodic toggle, Löschen), empty (Leinwand info, Einfügen, Netzname/Notiz, Probe grid, Fit/Biblio, Grid/Strom toggles). Double-click: handle delete if >2 pts, segment add via projection. | ✅ Done |
| ISO/ANSI Symbol Standard | Nur US Zickzack, EU Nutzer verwirrt | SettingsDialog 5 Tabs, symbols Tab mit auto/IEC/ANSI Toggle, default per browser locale (`navigator.language` → de-*/fr-*/ etc = IEC, en-US = ANSI), sofort sichtbar Canvas + Library Preview via `resolveSymbolStyle` + `getPartSymbol` IEC/ANSI aware. SVG Previews Rechteck vs Zickzack. | ✅ Done |
| Library Popup ruckelt | Re-render der 402 Teile Liste während drag, kein will-change | Perf fix: rAF + paletteRef direct DOM style.left/top/width/height, will-change-transform, commit only on pointerup. PartRow memoized, TreeNode memoized, SymbolPreview canvas only redraws on part/size/style change. Keyboard navigation Arrow Up/Down + Enter to place, selectedIdx highlight accent border + soft bg + shadow. Favorites toast with undo. | ✅ Done |
| Wire Anfasser genial | Nur kleine Quadrate, schwer zu treffen, kein Feedback | Delightful: 9px endpoint circle ok green inner, 7px diamond/square middle, 6→10px mid plus on hover, glow shadowBlur 12/8, hover +4px white fill, hitRadius 12/zoom (≈44px at low zoom), index label, alignment guides dashed blue + tooltip Δ/len/angle/magnet, double-click delete/add, color palette, straighten Manhattan [a, {x:b.x,y:a.y}, b], tooltip with coords. | ✅ Done |
| Net Highlight + Pin Hover | Kein Feedback beim Hovern, schwer zu sehen wo Netz ist | Net highlighting: hovering wire highlights entire net (all wires sharing same pointNets key), color accent-2 #22d3ee, voltage color preserved when live. Pin hover draws 10*iz circle rgba(91,140,255,0.25) + accent border + 3*iz dot + tooltip Pin Name, Netz, Position, Tipps. findPinInfo returns inst/pinIdx/pos/pinName/net via netResult.pinNets. | ✅ Done |
| Instrument Drag jank | Zustand thrash during drag | Fixed: winRef, rAF pendingPos/pendingSize, direct DOM style.left/top/width/height, will-change-transform, commit only on pointerup, fixes ruckeln similar to library. | ✅ Done |
| Undo Toast | Löschen ohne Feedback, kein Rückgängig | Editor toast state {message, actionLabel, action}, deleteSelection shows toast `${count} gelöscht` with Rückgängig (⌘Z) button, auto-hide 4s, UndoToast component in Workbench fixed bottom-20 center, backdrop-blur, shadow 12/40, btn-primary + X close. Also favorites toggle shows toast with undo. | ✅ Done |
| Component Alignment Guides | Kein Ausrichten beim Ziehen | Instance drag: compute sel bounds, check against other instances candidates x/y (left/center/right, top/mid/bottom) threshold 8px, set _alignGuides {x,y}, snap dx/dy if close, draw dashed blue guides + dot + label X/Y like Figma/Multisim. Reuses same _alignGuides as wire. | ✅ Done |
| Ghost Preview + Snap | Nur alpha 0.55, kein Schatten, kein Snap Hinweis | Ghost with shadow: shadowColor rgba(0,0,0,0.4) shadowBlur 12/zoom shadowOffsetY 6/zoom globalAlpha 0.65, snap indicator small circle rgba(91,140,255,0.3) + accent border 4/zoom when snapped != cursor. Probe ghost shadow 10/zoom 0.7 alpha. Marquee: dashed 6/4 lineWidth 1.2/zoom, count badge with size `${w}×${h}` centered, panel-solid bg border-strong. | ✅ Done |
| Empty Canvas Onboarding | Leere Leinwand ohne Hinweis | Empty state overlay when instances+wire=0: centered card 380px max, backdrop-blur, icon ✨ 12x12 accent-soft, title Leere Leinwand, text Drücke ⌘K, buttons Bibliothek öffnen, +R Widerstand, ∿ Probe, tips W/R/F/Leertaste/? with kbd. | ✅ Done |
| Shortcuts Overlay | Keine Hilfe, Shortcuts unbekannt | Press ? toggles help overlay: fixed inset bg-black/40 backdrop-blur, card 560px panel-solid border-strong shadow 20/60, 2 columns Canvas (W,R,M,Entf,⌘D,⌘A,⌘Z,F,Leertaste) + Probes & Library (⌘K,V,Label,Notiz,Pan,Wire Anfasser,Net highlight,Kontextmenü,?), tip Alt hover, rAF 60fps note. | ✅ Done |
| Export PNG | Nur SPICE/JSON/BOM, kein Bild | MenuBar exportPng: querySelector canvas, toBlob image/png, download via URL.createObjectURL, log ok. Tooltip Export PNG – Schaltplan als Bild für Doku/Präsentation. | ✅ Done |
| StatusBar Selection | Keine Info über Auswahl | Shows badge when selection.length>0: `${len} ausgewählt • R drehen • Entf löschen • ⌘D duplizieren` accent-soft bg accent border. | ✅ Done |
| Settings Canvas Tab erweitert | Nur Grid/Snap/AutoRoute | Added Pin-Namen Hover (always on), Netz-Highlight (always on), Alignment Guides (always on) disabled checkboxes with tooltip, plus Wow-Details list: Wire Handles specs, Double-click, Tooltip, Pin-Hover, Net-Highlight, Ghost, Marquee, Empty State, Shortcuts, Library, Instruments. | ✅ Done |

### Steve Jobs Brille – Wow das geht ja einfach

- **Alignment Guides**: Wie Figma, magnetisches Einrasten, visuelles Feedback Δ/len/angle
- **Marquee**: Count Badge mit Größe, gestrichelt, sofortiges Verständnis
- **Empty States**: Onboarding mit 3 Buttons, erklärt ⌘K, +R, Probe
- **Undo Toast**: Statt Dialog, Rückgängig Button, 4s Auto-Hide, delightful
- **Wire Farbe**: Palette wie Multisim, sofort sichtbar, Auto vs Custom
- **Net Highlight**: Hover über Leitung → ganzes Netz leuchtet, versteht Schaltung
- **Pin Hover**: Zeigt Pin-Name + Netz + Position, crosshair cursor, 10px Kreis
- **Library**: 60fps drag, Arrow Keys + Enter, Favorites Toast mit Undo, will-change-transform
- **Instruments**: 60fps drag, rAF, direct DOM, will-change-transform
- **Ghost**: Schatten + Snap Indikator, fühlt sich physisch an
- **Shortcuts**: ? Overlay, alles auf einen Blick, keine Doku nötig
- **ISO/ANSI**: Auto per Browserlocale, sofort sichtbar, EU vs US


---

## 2026-09-24 – Exhaustive Circuit Test Matrix 101 Szenarien

| Feature | Befund | Maßnahme | Status |
|---------|--------|----------|--------|
| Circuit Tests | Nur 11 Szenarien, keine FG+RC Sweep Prüfung | CIRCUIT_TEST_MATRIX.md + circuit_scenarios_full.ts 101 Szenarien: passive 15, opamp 8, transistor 4, 555 3, digital 10, filter 4, power 3, osc 4, FG+RC Sweep 4, real-world 14, edge 2, extra 30. Alle OP/AC/TRAN/Param Sweep/Fourier/Sensitivity/TF. FG Sine→RC Tiefpass AC 10-100k 24 Punkte + TRAN + Param Sweep R 500-2000 5 Kurven + Fourier. Ergebnis 101/101 PASS, tsc grün, build grün. | ✅ Done |
| ONPAGE/OFFPAGE | Virtuelle Verbindung fehlte | model.ts connectorGroups Map name→root[], UF union gleiche Namen, groups.clear rebuild, rootName Priorität Connector-Namen nach Labels. | ✅ Done |
| Grapher Cursors | Keine ΔT Messung | Grapher.tsx cursors {x0,x1}, dragging 0|1|null, dashed lines rgba(167,139,250,0.8)/rgba(251,191,36,0.8) + 8x12 handles, ΔT Label ΔT=... 1/ΔT=...Hz, pointerdown top 30px setzt x0 shift→x1 aus panels[0].series[0].x linear mapping, pointermove/up global. | ✅ Done |
| Fast Autoconnect | Platzieren zwischen Drähten nicht auto | Canvas.tsx nach addInstance loop part.pins → pinPosition, für jedes doc.wires Segment Projektion t=((pp-a)·d)/|d|² dist hypot, wenn <20px commit neues Wire pp→proj. | ✅ Done |
| Logic Converter QM | Nur SOP, nicht minimiert | Instruments.tsx Quine-McCluskey: minterms collect, Map<ones, Imp{bits,minterms,used}>, combine diff 1 → newBits "-", primeImplicants sammeln unused, essential covering + greedy, terms als (A & ~B) → |. | ✅ Done |
| Fault Sim | Keine Fehlersimulation | model.ts pinPoints loop prüft (inst as any).fault; open→warning+skip, short→warning+alle pin keys UF union, leakage→warning; device: open skip, short R 0.001Ω zwischen ersten 2 nodes, leakage R 10k parallel. | ✅ Done |
| ERC Zoom | Keine Navigation zu Fehler | BottomPanel.tsx errors/warnings li flex gap-2 mit Button Zoom to error → doc.instances.find label in msg, setView {x:inst.x-200,y:inst.y-150,zoom:1.2}+setSelection([id]). | ✅ Done |
| 74xx/4000 | Nur 35 digitale ICs | catalog.ts +11 ICs 74ls00/02/04/08/32/86/74/138+cd4011/4017/4027 TTL/CMOS toDevices GATE/DIGITAL, total ~45 digitale ICs. | ✅ Done |

