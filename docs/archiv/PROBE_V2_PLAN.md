# Probes V2 – Multisim-like Leader + Permanent Window + Alt Hover (Ziel 3)

## Ist-Zustand (nach Phase 1)

- `drawProbe`: Kreis/Diamond/Square direkt auf Wire, Label Box 18px rechts daneben
- `nearestNetName` 24px, auto-assign net
- Live Werte in Box neben Probe, aber nur wenn `live` und nur ein Wert (oder mehrere bei periodic)
- Kein Leader (Pfeil/Lupe) der vom Symbol auf Wire zeigt – Symbol liegt direkt auf Wire
- Kein permanentes Fenster mit allen Messwerten (außer BottomPanel LiveStrip, aber das ist Graph, nicht Tabelle)
- Kein Alt+Hover über Wires für Messwerte
- Hit Radius 14px, auf Mobile zu klein
- Kein Flackern-Check, aber Boxen können bei Zoom springen

## Recherche – Multisim Probe UI im Detail

### Multisim Desktop
- **Probe Symbol**: Kleines Icon (z.B. gelbes Dreieck für V, blaues für I) liegt NICHT auf Wire, sondern 20-30px daneben. Von Icon geht eine dünne Linie (Leader) mit Pfeilspitze auf die Wire.
- **Messbox**: Neben Icon eine Box mit Werten, die dauerhaft stehen bleibt (auch wenn Simulation gestoppt). Box hat Titel (PR1), dann V, I, P, etc. Bei periodic: mehrere Zeilen (Vdc, Vrms, Vpp, Freq).
- **Hover**: Wenn Simulation läuft und Maus über Wire, zeigt Tooltip V/I ohne Probe (Quick Probe).
- **Alt Hover**: In manchen Versionen Alt+Maus über Wire zeigt alle Netze in der Nähe.

### Multisim Live (Browser)
- **Probe**: Kreis mit Buchstabe, Leader Linie zum Wire, Box daneben. Box bleibt.
- **Grapher**: Probes müssen vorhanden sein, sonst kein Graph. Auto-Output.
- **Messfenster**: Rechts in Config Pane: Liste aller Probes mit aktuellen Werten, aktualisiert live.

### Andere Tools (LTSpice, KiCad)
- LTSpice: Beim Hover über Wire zeigt StatusBar Spannung, über Bauteil Strom. Alt zeigt Leistung.
- KiCad: Keine Live Probes, aber DRC zeigt Net Namen.

## Geplanter Umbau – Probe V2

### 1. Datenmodell Erweiterung

```ts
interface MeasurementProbe {
  // bestehend...
  anchorX?: number; // Punkt auf Wire (wo Leader hinzeigt)
  anchorY?: number;
  offsetX?: number; // Offset vom Anchor zum Symbol (z.B. 30, -20)
  offsetY?: number;
  leader?: "arrow" | "line" | "magnifier"; // Stil der Leader Linie
}
```

- `anchor`: wird beim Platzieren auf nearest Wire Punkt gesetzt, bleibt aber beim Verschieben der Probe erhalten (Probe Body kann separat verschoben werden, Anchor bleibt auf Wire – wie in Multisim)
- `offset`: Standard 30px rechts-oben, aber user kann Probe Body draggen, Anchor bleibt
- `leader`: Default "arrow" für V/I, "line" für REF, "magnifier" für D (Lupe)

### 2. Canvas Rendering – Leader + Offset

**Neues `drawProbeV2`:**

```ts
// 1. Anchor Punkt (auf Wire)
const ax = probe.anchorX ?? probe.x;
const ay = probe.anchorY ?? probe.y;
// 2. Body Punkt (wo Symbol ist)
const bx = probe.x;
const by = probe.y;

// Leader Linie
ctx.strokeStyle = col + "88";
ctx.lineWidth = 1.2/zoom;
ctx.setLineDash([]);
ctx.beginPath();
ctx.moveTo(ax, ay);
ctx.lineTo(bx, by);
ctx.stroke();
// Pfeilspitze am Anchor
drawArrowHead(ctx, ax, ay, angle(ax,ay,bx,by), col);

// Body wie bisher, aber bei bx,by
// Box mit Werten bei bx+18, by
```

- **Lupe**: Für Digital Probe: Kreis mit Lupe Icon, Leader ist gestrichelt
- **Pfeil**: Für Current: Leader hat Pfeil in Richtung des Stroms
- **Farben**: Leader in Probe Farbe, 50% Opacity

**Hit Test:**
- Probe Body Hit: Radius 14 (Desktop) / 24 (Mobile)
- Anchor Hit: Radius 8 – wenn Anchor getroffen, dann Probe selektieren + Anchor draggen?
- Leader Hit: Linie Hit Test (Abstand <6px)

**Drag Verhalten:**
- Drag Body: nur Body verschieben, Anchor bleibt → Leader wird länger/kürzer
- Drag Anchor: Anchor verschieben (snapt zu nearest Wire), Body bleibt relativ
- Doppelklick Body: Inspector
- Doppelklick Anchor: zeigt Net Name

### 3. Permanentes Messfenster – Probe Table

**Neues Panel: `ProbeTable`**

- Ort: 
  - Desktop: Rechts unter Inspector oder als eigenes Floating Window (wie Instrument)
  - Tablet: Bottom Sheet Tab "Probes" erweitert
  - Mobile: Fullscreen Tabelle
- Inhalt: Tabelle aller Probes, live aktualisiert

| Name | Typ | Netz | Vdc | Vrms | Vpp | Freq | Idc | Power | REF |
|------|-----|------|-----|------|-----|------|-----|-------|-----|
| V1   | V   | N001 | 5.0V| 3.5V | 10V | 1kHz | —   | —     | GND |
| A1   | A   | N002 | —   | —    | —   | —    | 10mA| —     | —   |

- Features:
  - Sortierbar nach Name/Typ/Netz
  - Filter: Nur V, Nur I, etc
  - Export CSV
  - Klick auf Row → selektiert Probe im Canvas + zentriert
  - Live Update: bei `engine.lastState` Änderung, alle 100ms
  - Wenn Simulation gestoppt: Werte bleiben stehen (letzter Wert), grau hinterlegt
  - Wenn keine Probe: Hinweis "Mindestens 1 Probe empfohlen – Platziere V Probe via Toolbar"

**Implementierung:**
- `src/components/ProbeTable.tsx`
- Nutzt `useEditor(s=>s.doc.probes)` + `engine.lastState`
- Berechnet Werte wie in `drawProbe` (V-Vref, I*dir, etc) + periodic via `engine.channel`
- Für Mobile: als Bottom Sheet mit `position: sticky` Header

### 4. Alt+Hover Messwerte

**Verhalten:**
- Wenn `sim.running` und `Alt` gehalten und Maus über Wire/Net:
  - Zeige Tooltip neben Cursor: `Net: N001, V=5.0V, I=10mA (geschätzt), P=50mW`
  - Tooltip hat kleinen Pfeil, bleibt solange Alt gehalten + Maus über Wire
  - Bei Alt+Hover über Bauteil Pin: zeige Pin Spannung + Strom durch Bauteil
- **Implementierung in Canvas:**
  - `onMouseMove`: wenn `e.altKey` und `sim.running`, dann `nearestNetName` + `hitWire` → zeige Tooltip State
  - Tooltip als HTML Overlay (nicht Canvas), damit lesbar und kein Flackern
  - Position: Cursor + 12px offset, mit Collision Detection (nicht über Rand)
  - Style: `background: var(--panel-solid)`, `border: 1px solid var(--border)`, `box-shadow`, `rounded`, `p-2`, `mono text-[11px]`
  - Inhalt: Net Name, V, I (aus `netCurrentMap`), Power, Frequenz falls periodic (via channel)

**Human Design:**
- Alt ist bewusst gewählt: nicht stört normalen Hover, nur wenn User explizit will
- Tooltip verschwindet nicht bei leicht daneben: hat 200ms Delay beim Verlassen, bleibt wenn Maus über Tooltip
- Kein Flackern: Throttle auf 50ms, nur wenn Net sich ändert
- Auf Mobile: kein Alt, stattdessen Long Press auf Wire → zeigt Tooltip (da Alt nicht vorhanden)

### 5. Human Design – Anti-Nervig & Lesbarkeit

**Checkliste:**

- **Lesbarkeit**:
  - Probe Box: min 11px Mono, Kontrast AA (Text auf Panel-Solid), Border in Probe Farbe 88% Opacity
  - Leader Linie: 1.2px, nicht zu dünn, nicht zu dick
  - Probe Table: 12px, tabular-nums, Zeilenhöhe 32px (44px auf Mobile)
  - Alt Tooltip: 11px, max 200px Breite, kein Text Overflow

- **Kein Flackern**:
  - Canvas: `drawProbe` nutzt `Math.max(zoom,0.5)` für LineWidth, damit bei Zoom nicht flackert
  - Probe Box: Position berechnet mit `Math.round` für Pixel-Perfect
  - Alt Tooltip: nur bei Net Änderung neu rendern, nicht bei jedem MouseMove
  - Probe Table: `useMemo` für Werte, nur alle 100ms updaten (nicht 60fps)

- **Kein Verschwinden bei leicht daneben**:
  - Probe Hit Radius: 14px Desktop, 24px Mobile (größer)
  - ContextMenu: bleibt bis Esc/Outside Click, nicht bei MouseLeave
  - Probe Table Row: Hover bleibt 200ms nach Leave (via CSS `transition-delay`)
  - Alt Tooltip: bleibt 300ms nach Alt Loslassen, damit User noch lesen kann

- **Human Design – Erwartungskonform**:
  - Probe platzieren: Klick auf Wire → Probe erscheint mit Leader, nicht direkt auf Wire (erwartet wie Multisim)
  - Probe verschieben: Drag Body → Leader folgt, Anchor bleibt (erwartet: Probe ist wie Lupe, die auf Wire zeigt)
  - Probe löschen: Entf oder Rechtsklick → Löschen (erwartet)
  - Alt Hover: wie in LTSpice (Alt zeigt Power) – User die LTSpice kennen, erwarten Alt für extra Info
  - Probe Table: wie in Multisim – User erwarten Tabelle mit allen Werten

### 6. Performance

- Leader Linie: nur eine Linie pro Probe, kein Shadow
- Probe Table: virtualisiert wenn >20 Probes (react-window)
- Alt Hover: nur wenn Alt gedrückt, sonst kein Overhead

### Offene Fragen für dich

**Q1 – Leader Stil:**
- A) Immer Pfeil von Body zu Wire (wie Multisim) – klar, aber etwas mehr visuelles Rauschen
- B) Nur Linie, Pfeil nur bei Current Probe (weniger Rauschen, aber weniger klar)
- C) Lupe Icon für alle Probes (wie du sagst, Lupe/Pfeil) – sehr visuell, aber braucht Custom Icon

**Q2 – Probe Table Ort:**
- A) Als eigenes Floating Window (wie Instrumente) – flexibel, aber kann Canvas verdecken
- B) Als Tab im BottomPanel "Probes" (bestehend erweitern) – integriert, aber weniger Platz
- C) Als rechter Drawer unter Inspector (wie Multisim Live) – immer sichtbar, aber braucht Platz

**Q3 – Alt Hover Inhalt:**
- A) Nur V und I (einfach, wie LTSpice)
- B) V, I, P, Freq (wenn verfügbar) + Net Name (mehr Info, aber mehr Text)
- C) Konfigurierbar: User kann in Settings wählen was angezeigt wird

**Q4 – Anchor Drag:**
- A) Anchor ist fix auf Wire, Body kann draggen (einfach, wie Multisim)
- B) Anchor kann auch draggen und snapt zu neuem Wire (mächtiger, aber komplexer)
- C) Beides: Body Drag = nur Body, Anchor Drag = Anchor verschieben (via separatem Handle)

---

**Mein Vorschlag:** Q1=A (Pfeil immer, klar), Q2=B (BottomPanel erweitern, integriert), Q3=B (V,I,P,Freq – mehr Wert), Q4=C (beides, mit Handle).

---

## Coole zusätzliche Ideen (für dich zum Abnicken)

1. **Probe Gruppen**: User kann Probes gruppieren (z.B. "Power Supply" Gruppe mit V und I) – Gruppe hat eigene Farbe und kann ein-/ausgeblendet werden.
2. **Probe Farben Auto**: Wenn viele Probes, auto-assign Farben aus Palette (nicht nur gelb/blau, sondern 8 Farben).
3. **Probe Mini-Graph**: In Probe Box kleiner Sparkline (20x10) der letzten 1s des Signals – wie in Multisim Live Grapher Mini.
4. **Alt Hover mit Mini-Scope**: Bei Alt Hover nicht nur Text, sondern kleines Oszilloskop (50x30) des Signals.
5. **Probe Snap to Grid**: Anchor snapt zu Grid, aber auch zu Bauteil Pins (wie Wire).
6. **Probe Export**: Button "Export all probe values as CSV" – für Reports.

Sag mir welche davon rein sollen!

