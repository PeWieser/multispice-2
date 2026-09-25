# Steve Jobs Perfektionismus Audit – Komplettes Detail Review

> "Wenn du mehrere coole oder geniale Ideen zu was findest oder dir einfallen, dann frag mich" – hier sind die Findings nach Durchgang mit Perfektionistenbrille.

## Philosophie

- **Human Design**: Programm verhält sich wie Mensch erwartet, nicht andersrum. Kein Verschwinden bei leicht daneben, große Hit Targets, sofortiges Feedback, kein Flackern, immer lesbar.
- **Einfachheit**: Eine Funktion = ein Ort, aber mit Begründung wenn mehrere Orte (z.B. Probe in Toolbar + Context + Inspector = Platzieren vs Editieren vs Details).
- **Klarheit**: Überall Hoverinfos, keine kryptischen Buchstaben, Icons + Farbe schneller als Text.

## Audit Durchgang – Alle Bereiche

### 1. Canvas – Herzstück

#### 1.1 IC Pins vs Leiterbahnen (Bug: verschoben)
- **Befund**: NE555 Pins bei -40,40, Symbol Linie -45 bis -35 (10px), Pin bei -40 mitten in Linie, nicht am Tip → Gap 5px, Wire endet nicht am Pin, sieht unfertig aus.
- **Maßnahme**: `icSymbol` auf 5px Stub geändert (`-w/2-5` bis `-w/2`), Pins bei -40 für w=70 und -60 für w=110 matchen jetzt Tip. `cmosComplex` von -65 auf -60 korrigiert. NE555 zurück auf -40.
- **Alternative**: 10px Stub behalten und alle Pins auf -65/-45 ändern – wäre auch ok, aber 5px ist cleaner, weniger visuelles Rauschen (Jobs: weniger ist mehr).
- **Status**: ✅ Fixed, Build grün, visuell getestet.

#### 1.2 Leiterbahnen Editieren nicht erkennbar
- **Befund**: Wire nur dünne Linie, kein Hover Highlight, keine Handles, kein Tooltip wie editieren. User klickt und nichts passiert sichtbar.
- **Maßnahme**: 
  - Hover Highlight: wenn `hitWire`, Linie dicker 2.8px + accent-2 Farbe #22d3ee
  - Selected: Handles 5px Quadrate an jedem Punkt, fill panel-solid, stroke accent, dragbar
  - Wire Point Drag: wenn Wire selektiert und Maus nahe Punkt (<10px Desktop, 18px Mobile), dragge nur diesen Punkt via `commit`
  - Probe Anchor Drag: Anchor separater Handle, dragbar
  - Tooltip: bei Hover über Wire (nicht laufend, nicht Alt) zeige "Leitung – Netz ?, Klick: auswählen (zeigt Handles), Drag Handle: Punkt verschieben, Drag Leitung: ganze Leitung, Rechtsklick: Probe/Löschen"
- **Alternative**: Wire Edit via Doppelklick öffnet Dialog – wäre mehr Klicks, schlechter (Jobs: Direct Manipulation > Dialog).
- **Status**: ✅ Fixed, Handles sichtbar, Edit discoverable.

#### 1.3 Probe Info Fenster Skalierung (Bug: größer bei kleiner Zoom bis unlesbar)
- **Befund**: `drawProbe` nutzte world coords für Box (20 world units) + inverse Font Scaling falsch (`11/Math.max(zoom,0.6)` + `scale(1/zoom)` + Position `14*zoom`). Bei Zoom 0.3 → Box riesig, Text unlesbar; bei Zoom 3 → Box winzig.
- **Maßnahme**: Komplett neu V3: `iz = 1/zoom`, Body und Box in `ctx.save(); ctx.scale(iz,iz);` dann screen sizes (radius 10 screen, box 11px mono, offset 20 screen). Leader Linie world coords mit Dicke `1.4*iz` konstant screen. Text immer 11px screen, kein Flackern.
- **Alternative**: Box in HTML Overlay statt Canvas – wäre lesbarer, aber mehr DOM, schlechtere Performance, und nicht im Canvas Export. Canvas Lösung mit iz ist besser.
- **Status**: ✅ Fixed, bei 0.15x bis 6x Zoom immer 11px lesbar.

#### 1.4 Tooltip Flackern
- **Befund**: Tooltip bei jedem MouseMove neu, auch wenn Net gleich → Flackern, nervig.
- **Maßnahme**: Throttle 200ms für Alt Hover, 300ms für Wire Hint, nur updaten wenn Net oder Lines sich ändern, Delay Hide 150-200ms.
- **Status**: ✅ Fixed.

### 2. Schnellzugriff Buchstaben nicht verständlich

- **Befund**: ComponentStrip zeigte nur "R", "C", "L", "D", "Q", "M", "U", "V", "GND", "555" – kryptisch, kein Icon, kein Desc. User versteht nicht was "Q" oder "M" bedeutet.
- **Maßnahme**: 
  - `QUICK` Array erweitert um `desc`: "Widerstand – begrenzt Strom, z.B. 10kΩ" etc.
  - Button jetzt `flex h-8 min-w-48px` mit `CategoryIcon` + Label (R, C, Diode, NPN, MOS, OpAmp, VDC, GND, 555) + `Tooltip` mit Name+Desc+Kategorie+Shortcut
  - Probes ebenfalls Tooltip mit Farbkodierung Erklärung
  - Höhe 10 statt 8, bessere Lesbarkeit, 44px Touch Target auf Mobile
- **Alternative**: Nur Icons ohne Text – wäre noch unverständlicher. Text + Icon + Tooltip ist beste Balance.
- **Status**: ✅ Fixed, jetzt verständlich.

### 3. Hoverinfos überall

- **Befund**: Viele Tools hatten nur `title` Attribute, kein richtiges Tooltip, kein Delay, flackerte, nicht auf Mobile.
- **Maßnahme**: 
  - `ui.tsx` neue `Tooltip` Komponente: 300ms Delay Show, 100ms Hide, max 260px, side top/bottom/left/right, pointer-events-none, rounded-lg, shadow-xl, panel-solid
  - `ToolButton` Komponente für Toolbar mit Tooltip `${label}\n${hint} (${kbd})`
  - `Toolbar.tsx` alle Tools mit Tooltip + Desc: Select, Wire, Label, Probe, Text, Erase, Pan + Grid/Snap/AutoRoute
  - `ComponentStrip.tsx` alle Quick Parts + Probes + Bibliothek Button mit Tooltip
  - `Canvas.tsx` Wire/Instance/Probe Hover Tooltip mit Edit Erklärung (kein Flackern)
- **Alternative**: Native title – zu langsam, nicht stylbar, flackert. Custom Tooltip besser.
- **Status**: ✅ Fixed, überall Hoverinfos.

### 4. Library

- **Befund**: Vorher nur Text, kein Preview, keine Beschreibung, kein Datasheet, keine Icons.
- **Maßnahme**: V2 mit SymbolPreview Canvas, CategoryIcon, Scoring Search, Detail Panel, Datasheet Links – siehe LIBRARY_RESEARCH_PLAN.
- **Noch offen**: Undo Toast für Favorit, Keyboard Navigation ↑↓, Virtualisierung – für nächsten Durchlauf.
- **Status**: ✅ Kern done, Polish TODO.

### 5. Responsive

- **Befund**: Kein Responsive, alles Desktop.
- **Maßnahme**: V2 mit Breakpoints, BottomSheet, Touch Handling – siehe RESPONSIVE_PLAN.
- **Status**: ✅ Kern done.

### 6. Probes

- **Befund**: Symbol direkt auf Leitung, kein Leader, kein permanentes Fenster, kein Alt Hover.
- **Maßnahme**: V2 mit Leader Pfeil, ProbeTable, Alt Hover – siehe PROBE_V2_PLAN + Fixes Skalierung.
- **Status**: ✅ Kern done, Skalierung fixed.

## Noch offene Baustellen nach Steve Jobs Brille

### Kritisch (muss vor Release)

- [x] Probe Skalierung – Fixed
- [x] IC Pin Alignment – Fixed
- [x] Wire Handles + Hover Highlight – Fixed
- [x] Schnellzugriff verständlich + Tooltips – Fixed
- [x] Hoverinfos überall (Toolbar, ComponentStrip) – Fixed
- [ ] MenuBar Tooltips: Menü Items haben noch kein Tooltip mit Erklärung (z.B. "Datei → Neuer Schaltplan – löscht aktuellen und startet leer")
- [ ] BottomPanel Tabs Tooltips: Console, Ergebnisse etc brauchen Erklärung
- [ ] Settings Page UI: Für Probe Hover Config (Datei existiert, UI fehlt) – User explizit gewünscht

### Mittel (sollte vor Release)

- [ ] Wire Edit: Doppelklick auf Wire Segment fügt neuen Punkt hinzu (wie in Figma) – macht Edit noch einfacher
- [ ] Library Undo Toast: Favorit entfernt → Toast mit Rückgängig
- [ ] Library Keyboard Nav: ↑↓ navigiert, Enter platziert
- [ ] Canvas Tokens: Noch einige hardcoded Hex in drawProbe/drawInstance – auf CSS Variablen umstellen für Dark/Light
- [ ] Feedback Vereinheitlichung: Alle Aktionen 100ms Pulse + Toast, nicht nur manche

### Nice to Have (nächster Durchlauf)

- [ ] Probe Mini Sparkline in Box
- [ ] Alt Hover Mini Scope
- [ ] Probe Gruppen
- [ ] Library Drag & Drop
- [ ] Virtualisierung

## Testmatrix Durchlauf – Update

| Test | Vorher | Nachher | Status |
|------|--------|---------|--------|
| T1 IC Pins | Gap 5px, Wire verschoben | Exakt am Tip, kein Gap | ✅ |
| T2 Schnellzugriff | Nur "R" | Icon + Label + Tooltip mit Desc | ✅ |
| T3 Suche "r 10k" | Simple includes | Scoring + Command Palette | ✅ |
| T4 Library Detail | Kein Detail | Großes Symbol 96px + Datasheet PDF | ✅ |
| T5 Mobile Library | Floating klein <44px | BottomSheet 80vh 44px Buttons | ✅ |
| T6 Probe Zoom 0.3x | Box riesig unlesbar | Box immer 11px lesbar | ✅ |
| T7 Alt Hover | Immer Tooltip, flackerte | Nur Alt+Running, Throttle, konfigurierbar | ✅ |
| T8 Probe Table | Nur Graph | Tabelle + Graph + CSV Export | ✅ |
| T9 Wire Handles | Keine Handles, nicht erkennbar | Handles 5px Quadrate, Hover Highlight, Tooltip erklärt Edit | ✅ |
| T10 Lesbarkeit | Flackern, unlesbar bei Zoom | Kein Flackern, immer lesbar, Human Design | ✅ |

## Fazit – Steve Jobs Zitat

> "Design is not just what it looks like and feels like. Design is how it works."

Vorher: sah ok aus, aber funktionierte nicht wie erwartet (Probe Box unlesbar, Pins verschoben, Wire Edit nicht erkennbar).
Nachher: funktioniert wie erwartet, ist verständlich, einfach, kein Flackern, kein Verschwinden bei leicht daneben.

Noch nicht perfekt, aber auf dem Weg. Nächste Schritte: MenuBar Tooltips, Settings Page UI, Wire Doppelklick Punkt hinzufügen.

