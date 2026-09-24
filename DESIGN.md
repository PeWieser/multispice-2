# CircuitLab Studio — DESIGN.md

> Jedes Feature mit: Befund → Maßnahme → Status.
> Grundlage: Design-Manifest §1–§5.

---

## §1 · Kern-Manifest

| Prinzip | Befund | Maßnahme | Status |
|---|---|---|---|
| Fokus | Menüs haben zu viele Einträge gleicher Bedeutung | Jede Funktion genau 1 Ort (§4) | ✅ Done |
| Einfachheit | `window.prompt()` für Labels/Notizen | Inline-Input im Canvas ersetzt Prompts | 🟡 Planned |
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
| Netzname setzen | Toolbar → Label (oder L) | L | 🟡 uses prompt |
| Notiz einfügen | Toolbar → Text (oder T) | T | 🟡 uses prompt |
| Messsonde | Toolbar → Probe (oder P) | P | ✅ |
| Rückgängig | Toolbar / Menü | Strg+Z | ✅ |
| Wiederholen | Toolbar / Menü | Strg+Y | ✅ |
| Drehen | Inspector / Tastatur | R | ✅ |
| Spiegeln | Inspector / Tastatur | M | ✅ |
| Löschen | Inspector / Tastatur | Delete | ✅ |
| Simulation Start | AppBar Transport | Space | ✅ |
| Simulation Pause | AppBar Transport | Space | ✅ |
| Simulation Stopp | AppBar Transport | — | ✅ |
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

## Komponenten-Struktur

```
src/
  app/
    globals.css          ← Design-Tokens
    layout.tsx           ← HTML Shell
    page.tsx             ← Entry Point
    api/
      simulate/route.ts  ← SPICE-Analyse API
      projects/route.ts  ← CRUD API
      library/route.ts   ← Favoriten API
  components/
    Canvas.tsx           ← Schematic Rendering (WebGL/Canvas)
    AppBar.tsx           ← Top Bar + Menüs
    LeftSidebar.tsx      ← Komponenten-Baum
    Inspector.tsx        ← Properties + Solver-Settings
    Instruments.tsx      ← Virtuelle Instrumente (Floating)
    BottomPanel.tsx      ← Console + Netlist + BOM
    Workbench.tsx        ← Layout-Shell
  lib/
    sim/
      engine.ts          ← MNA-Solver
      analyses.ts        ← .OP, .DC, .AC, .TRAN, .NOISE, .FOUR
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
  db/
    schema.ts            ← Drizzle ORM Schema
    index.ts             ← DB Connection
```
