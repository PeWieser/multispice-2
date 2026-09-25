# Redesign Plan – Handcrafted, Minimal, Multisim-like

## 1. Leitbild
- **Wenig visuelles Rauschen:** Keine generischen Buttons, kein Circuit-Logo in Topbar, keine dauerhaft offenen Panels. Canvas ist König.
- **Vorbild:** Notion (Whitespace, Typografie), VS Code (Activity-Bar + Command-Palette), Multisim (Component-Toolbar + Probes), Apple Pages (minimale Topbar).
- **Startzustand:** Nur Canvas + minimale Topbar + Statusbar. Bibliothek, Inspector, Bottom, Instrumente geschlossen. Floating Palette per Cmd+K.

## 2. Theme – System mit Override
- `theme: "system" | "dark" | "light"` in editor.ts
- Initial: `system`
- `useEffect` in Workbench:
  - Wenn `system`: `matchMedia('(prefers-color-scheme: dark)').matches ? dark : light`, Listener auf change
  - Wenn `dark`/`light`: direkt setzen
- Menü Ansicht → Theme: System / Dunkel / Hell, speichert in localStorage
- `data-theme` Attribut wie bisher, aber aus resolvedTheme abgeleitet

## 3. Neue Shell
### Topbar (h-9, minimal, ohne Logo)
- Links: Datei (Neu, Öffnen, Speichern, Import, Export) als Text-Menü, kein Icon
- Mitte: Transport (▶/⏸/■) als winzige, einzigartige Icons (kein lucide Play generisch, sondern handcrafted SVG: Dreieck mit abgerundeten Ecken)
- Rechts: Undo/Redo (dezente Pfeile), View Toggles (Raster, Strom-Pfeile, Farben), Theme, Bibliothek öffnen (⌘K), Inspector öffnen
- Keine Borders, nur hairline bottom, Hintergrund var(--panel), kein Logo

### Component Strip (h-8, unter Topbar, Multisim-artig)
- Horizontale Liste der Hauptkategorien: R, C, L, D, Q, U, Logik, Quellen, Messen
- Jede Kategorie als kleines, einzigartiges Symbol (Widerstand-Zickzack, Kondensator-Striche, etc.) + Tastaturkürzel
- Klick öffnet Floating Library gefiltert auf Kategorie
- Rechts: Suche (Cmd+K) die direkt Library öffnet

### Canvas
- Vollbild, kein Chrome
- Stromdarstellung:
  - Default: aus (keine Farben, nur neutrales Grau)
  - Toggle: Ansicht → Stromfluss (V) – zeigt animierte Punkte auf Leitungen, Richtung = Stromrichtung, Geschwindigkeit = |I| / Skala, Farbe = var(--accent)
  - Toggle: Ansicht → Spannungsfarben (C) – zeigt bisherigen Farbverlauf, aber überarbeitet: dezenter, nur bei Simulation
- Probes:
  - Neue Doc-Entität `MeasurementProbe` (siehe unten)
  - Tool: Probe (P) – Subtypen per Rechtsklick oder Toolbar-Dropdown: Spannung, Strom, Leistung, Differenz, Referenz, Digital
  - Platzierung: Klick auf Leitung → Probe erscheint als kleines Label direkt auf Leitung, zeigt live Wert (V, A, W)
  - Rechtsklick auf Leitung → Kontextmenü: Probe hinzufügen (Spannung/Strom/Leistung), Farbe ändern
  - Probes sind Teil des Docs (persistiert), können selektiert, verschoben, gelöscht werden
  - Automatisch in Analysen: Wenn Probe vorhanden, wird deren Netz in Analyse-Dialog als Default vorgeschlagen und im Grapher automatisch geplottet

### Floating Library (Figma-artig)
- `LibraryPalette.tsx`
- State: `libraryOpen: boolean`, `libraryPos: {x,y}`, `librarySize: {w,h}`, `libraryFilter: string`
- Draggable via Header, resizable via Ecke, schließbar mit Esc/X
- Inhalt:
  - Suche oben (autofocus)
  - Tabs: Favoriten, Zuletzt, Alle, Kategorien
  - Liste mit Symbol-Vorschau (echtes Bauteil-Symbol, nicht generisches Icon) + Name + Ref
  - Klick: setzt `placingPartId`, Palette bleibt offen (Serie mit Shift)
  - Doppelklick: platziert sofort in Mitte und schließt nicht
- Shortcut: Cmd+K öffnet, Cmd+K nochmal fokussiert Suche

### Inspector (Floating, nicht Sidepanel)
- `Inspector.tsx` wird zu floating Window wie Library, aber erscheint nur bei Selektion
- Wenn ein Bauteil selektiert: kleines Popover nahe Bauteil oder als floating Window rechts unten
- Zeigt: Label, Wert, Parameter, Live-Messwerte (V, I, P) wenn Simulation läuft, inkl. Pin-Ströme für 555 etc.
- Kein dauerhaftes Sidepanel

### BottomPanel
- Start geschlossen (h=0)
- Öffnet automatisch bei Analyse-Ergebnis oder per Toggle
- Tabs reduziert: Konsole, Ergebnisse, Prüfung – Netlist und BOM in Menü Export verschoben

### InstrumentDock
- Entfernt. Instrumente sind nur über Menü Geräte oder Command-Palette erreichbar, öffnen als floating Windows (wie bisher InstrumentLayer, aber ohne permanente Dock-Leiste)

### StatusBar (h-22, ultra-minimal)
- Links: Kontext-Hinweis (Tool-Hilfe)
- Mitte: DRC (✓/✕), Cursor (x,y)
- Rechts: Zoom, Sim-Zeit, nur wenn relevant

## 4. Messpunkte-Thematik (Multisim Probes)
### Doc-Modell
```ts
export type ProbeKind = "voltage" | "current" | "power" | "diff" | "ref" | "digital";
export interface MeasurementProbe {
  id: string;
  kind: ProbeKind;
  x: number; y: number;
  net?: string; // für voltage/current
  ref?: string; // für diff/ref
  color?: string;
  name?: string;
}
```
- In `SchematicDoc` neues Feld `probes: MeasurementProbe[]`
- In `buildNets` werden Probes ignoriert (keine Devices), aber ihre Position wird genutzt um Netznamen zu finden
- In `editor.ts` neue Actions: `addProbe`, `updateProbe`, `removeProbe`, `toggleProbeAt`

### Rendering
- In Canvas `draw` nach Leitungen: Probes zeichnen
  - Voltage: kleines Dreieck + Label "V(Net) = 1.23V"
  - Current: Kreis mit Pfeil + "I = 10mA"
  - Power: Raute + "P = 12mW"
  - Diff: zwei Punkte mit Linie
  - Ref: Anker-Symbol
- Live-Werte aus `engine.lastState`
- Selektierbar, verschiebbar

### Interaktion
- Toolbar: Probe-Button mit Dropdown (Voltage/Current/Power/Diff/Ref)
- Rechtsklick auf Leitung: "Probe hinzufügen" → Untermenü
- Tastatur: P für Spannung, Shift+P für Strom, etc.

## 5. Ströme – Animierte Pfeile
- In `editor.ts` neue View-Flags: `showCurrentFlow: boolean`, `showVoltageColors: boolean`, default false
- In Canvas:
  - Wenn `showCurrentFlow` und Simulation läuft: Für jede Leitung, finde Strom via `engine.deviceCurrent` oder `engine.lastState`? Für Drähte haben wir keinen Device-Strom, aber wir können Strom aus Netzen ableiten? Besser: Für jedes Wire-Segment, finde nächstes Device das diesen Net treibt und dessen Strom als Wire-Strom nutzen, oder nutze `engine.channel` für Net-Strom? Vereinfacht: Zeige animierte Punkte in Richtung des Spannungsgefälles oder basierend auf `engine.lastState.nets`? Für echte Stromrichtung brauchen wir Branch-Currents. Für Drähte: Wenn Wire zwischen zwei Pins, Strom = Strom des Bauteils das an Pin hängt. Wir können in `buildNets` für jeden Net die Summe der Ströme tracken? Einfacher: Zeige Punkte die sich von höherem Potential zu niedrigerem bewegen, Geschwindigkeit proportional zu |Vdiff|.
  - Besser: Nutze `engine.netNames()` und für jeden Net den Strom aus Devices die diesen Net als Node 0 haben.
  - Implementierung: In Canvas `draw`, wenn `showCurrentFlow`, für jedes Wire: finde `netName` via `pointNets`, finde ein Device das diesen Net nutzt, nimm dessen Strom, bestimme Richtung via Pin-Positionen, zeichne animierte Dots entlang Wire-Pfad mit `globalThis.__animPhase`.
- Toggle per View-Menü und Taste V

## 6. NE555 Pin-Ströme Fix
- Aktuell: `deviceCurrent` für TIMER555 gibt 0 zurück, Pin-Ströme nicht modelliert
- Fix: In `engine.ts` `deviceCurrent` für TIMER555: Berechne Ströme basierend auf internen Widerständen und Last
  - VCC: Strom = I_out + I_discharge + I_divider (5k+5k+5k = 15k)
  - GND: -VCC Strom
  - OUT: Strom aus `x[br]` (Branch Current)
  - DISCH: Strom aus Leitwert
  - TRIG, THRES, RESET, CTRL: Hochohmig, ca. 0.5µA Leckstrom, modelliert als 10MΩ gegen interne Referenz
- In `loadDevices` für TIMER555: Stampe hochohmige Widerstände für Eingänge gegen interne Knoten
- In `stampBehavioural` bereits OUT und DISCH, ergänze Eingänge

## 7. Bibliothek – Vollständigkeitscheck
- Aktuell 85 Bauteile, Multisim hat 55k, aber für Clone reichen ~150 gut gewählte
- Fehlende Kategorien:
  - Sources: mehr (AC, DC, PULSE, etc. haben wir, aber fehlen: 3-phase, AM, FM, etc. – haben wir via waveParams)
  - Basic: Variable R/C/L, etc. haben wir
  - Diodes: mehr Typen (z.B. 1N4001, 1N4148 haben wir, aber fehlen: 1N5817, Zener variabel, etc.)
  - Transistors: mehr BJT, MOSFET, JFET, IGBT
  - Analog: mehr OpAmps (LM324, TL082, etc.), Komparatoren, Timer, Regler
  - TTL: haben 74LS etc. aber nur Gatter, fehlen: 74HC, 74HCT, etc. als Familie-Option haben wir, aber nicht als eigene Bauteile
  - CMOS: 4000er Serie fehlt komplett
  - Indicators: 7-seg haben wir, aber fehlen: Bargraph, LCD, etc.
  - Power: haben Regler, aber fehlen: Sicherung, etc. haben wir
  - RF, MCU: haben 3 MCUs, reicht
- Plan: Ergänze 4000er CMOS (4011, 4069, etc.), mehr 74HC, mehr OpAmps (LM324, LM358 haben wir, TL084 haben wir, aber LM741 etc.), mehr Dioden, mehr Transistoren (2N2222, etc.), IGBT, Triac, Diac, etc.

## 8. Implementierungsreihenfolge
1. Theme System + Override
2. Editor State: neue Flags (showCurrentFlow, showVoltageColors), libraryOpen, measurementProbes
3. Model: MeasurementProbe in model.ts
4. Canvas: Strom-Pfeile, Probe-Rendering, Toggle
5. LibraryPalette (neu, floating)
6. Inspector (floating)
7. Workbench neu: minimale Topbar, ComponentStrip, nur Canvas, keine Sidepanels default
8. MenuBar überarbeiten: minimal, ohne Logo, einzigartige Icons
9. NE555 Fix
10. Bibliothek ergänzen
11. Build + Test + Push
