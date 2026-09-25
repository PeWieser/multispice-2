# Multisim-like Probes – Recherche, Plan & Implementierung

## 1. Recherche (NI Multisim Docs)

### Quellen
- https://www.ni.com/en/shop/electronic-test-instrumentation/application-software-for-electronic-test-and-instrumentation-category/what-is-multisim/multisim-designers/accurately-evaluate-circuits-with-probes-in-multisim.html
- https://pltw.multisim.com/help/components/probes/
- https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z0000019UclSAE
- Duke Pratt Wiki – Bilder Multisim0201/0203/0204

### Multisim Probe-Arten (Desktop & Live)

1. **Voltage Probe** – misst V gegen GND oder selektierte Voltage Reference Probe. Platziert auf Wire, zeigt Box mit V. Double-tap → Config: Voltage Reference Dropdown.
2. **Current Probe** – clamp-artig, grüner Pfeil zeigt Flussrichtung. Rechtsklick → Reverse Probe Direction ändert Vorzeichen. Zeigt A.
3. **Voltage + Current** – kombiniert V·A in einer Box.
4. **Power Probe** – W = V·I, Rautensymbol.
5. **Differential Probe** – V+ Probe + Ref Probe per Klick wählen, zeigt ΔV = Vprobe – Vref. Linie zwischen beiden.
6. **Reference Probe** – REF Symbol (Ground-artig), dient als gemeinsame Referenz für andere Probes. Muss selektiert werden im Dropdown.
7. **Digital Probe** – zeigt 1/0/X basierend auf Schwellen (TTL: low 0.8V, high 2.0V konfigurierbar). Farbe: H grün, L rot, X gelb.
8. **Measurement Probe** (in Live: Probe Settings) – konfigurierbare Parameter: Vdc, Vrms, Vpp, Vavg, Freq, Idc, Irms, Ipp, Power. Checkbox **Periodic** für RMS/Peak/Frequenz-Berechnung (nutzt History).
9. **Verhalten**
   - Mindestens 1 Probe Hinweis: Multisim zeigt Warning wenn keine Probe platziert.
   - Auto-Output in Analyses & Grapher: Probes werden automatisch als Output-Knoten vorgeschlagen (Analog Grapher vs Digital Grapher).
   - Probe Settings global + lokal: Globaler Dialog für alle Probes, lokale Überschreibung per Doppelklick.
   - Docking an Wire/Net: Probe tip snapt an nächstes Netz, Linie zur Leitung.
   - Farbkodiert: V gelb/amber, I blau/cyan, P violett, REF grau, D grün – wie Multisim Live.

## 2. Gap-Analyse (vorher)

- Vorher: Kreis mit Buchstabe, nur V/A/W/ΔV/REF/D, kein Richtungspfeil, keine REF-Dropdown Logik, keine Differential-Linie, keine periodic RMS/PP/Freq, kein Power=V*I mit Ref, kein Digital Schwellen UI, kein Auto-Docking, kein Auto-Grapher, kein Farb-Mapping Multisim-like, kein Kontextmenü Reverse.
- Model fehlte: direction, rotation, periodic, show Mask, thresholds, ref als Probe-ID.

## 3. Design-Entscheidung (multispice-2)

### Modell-Erweiterung `src/lib/schematic/model.ts`
```ts
export type ProbeKind = "voltage" | "current" | "power" | "diff" | "ref" | "digital" | "voltage_current";
export interface ProbeShow { vdc?, vrms?, vpp?, vavg?, freq?, idc?, irms?, ipp?, power? }
export interface MeasurementProbe {
  id, kind, x, y, net?, ref?, color?, name?,
  direction?, rotation?, periodic?, show?, thresholds?{low,high}, x2?, y2?
}
```
- direction 0/1 für Current Reverse
- rotation für Icon Drehung
- periodic boolean für RMS/Freq
- show Mask für konfigurierbare Parameter
- thresholds für Digital
- x2/y2 für Diff zweiter Punkt (zukünftig)

### Storage Migration `src/lib/storage.ts`
- migrateDoc setzt Defaults: direction 0, rotation 0, periodic false, show {vdc:true}, thresholds {0.8,2.0}

### Editor `src/state/editor.ts`
- addMeasurementProbe setzt farbcodierte Defaults je kind:
  V #fbbf24 amber, I #22d3ee cyan, V·A #f59e0b, W #a78bfa purple, ΔV #f472b6 pink, REF #94a3b8 gray, D #4ade80 green
- auto-assign net via nearest net search (28px Radius)
- auto-add net zu legacy probes `s.probes` für Grapher (slice -12)
- refreshNets: falls probe.net stale, nearest net neu setzen (silent)
- updateMeasurementProbe: nach net Änderung ebenfalls legacy probes erweitern
- Log-Hinweis Multisim-like

### Canvas `src/components/Canvas.tsx`
- drawProbe professionell:
  - V: Triangle tip + Kreis, amber, "V"
  - I: Kreis mit Pfeil, direction reversierbar, "A" Label, Pfeil dreht bei reverse
  - W: Diamond Raute, "W"
  - REF: Ground Symbol mit REF Text
  - D: Quadrat, "D", farbiger Dot für Level
  - Diff: zwei Kreise + ΔV
  - Selection Halo
  - Referenz-Linie: gestrichelte Linie zu REF Probe (wenn ref=pr_*) oder REF Net Punkt
  - Live Values: 
    - Voltage: V - Vref falls ref gesetzt, sonst V
    - Current: I mit direction invertiert
    - Power: (V-Vref)*I
    - Diff: V - Vref
    - Digital: H/L/X + farbiger Dot
    - Periodic: nutzt `engine.channel(net,2048)` + `rms`, `mean`, `peakToPeak`, `estimateFrequency` aus realtime.ts
    - show Mask steuert welche Zeilen angezeigt werden
    - Multi-line Box mit Name Prefix
- nearestNetName 24px für auto docking
- ContextMenu Probe erweitert:
  - Name + net
  - Eigenschaften… (Doppelklick)
  - Richtung umkehren (Current)
  - Typ ändern mit Multisim Labels
  - Referenz Dropdown: GND, REF Probes Liste, Net Liste
  - Anzeige: Periodic Toggle
  - Löschen

### Inspector `src/components/Inspector.tsx`
- Probe Panel wenn selectedProbe:
  - Name Input
  - Typ Dropdown (alle 7)
  - Farbe Color Picker
  - Net Dropdown auto
  - Richtung Reverse Checkbox
  - Rotation Slider -180..180
  - Referenz: Voltage Reference Dropdown (GND, REF Probes, Nets)
  - Messwerte Anzeige: Periodic Checkbox + Grid mit vdc, vrms, vpp, vavg, freq, idc, irms, ipp, power
  - Digital Thresholds low/high Inputs
  - Live Messwerte
  - Multisim Hinweis Box (mindestens 1 Probe, Reverse, REF-Link, etc)
  - Löschen Button
- Net Inspector zeigt Measurement Probes Liste + Quick Add Buttons
- Sim Tab zeigt Probe Settings Global Counts

### ComponentStrip `src/components/ComponentStrip.tsx`
- Alle 7 Probe Arten mit Farben und Tooltips
- Farbkodiert: V gelb, A blau, V·A orange, W violett, ΔV pink, REF grau, D grün
- Aktiver Zustand mit farbigem Hintergrund
- Hinweis Text: Multisim-like Features

### Analysis & Grapher
- `AnalysisDialog.tsx`: measurementProbeNets in suggestedOutputs, probePool = legacy + measurement, slice 0..8
- `BottomPanel.tsx` LiveStrip: zeigt doc.probes + legacy, nutzt probe.color für Linie, Label mit Name + net + V

## 4. Akzeptanz Checkliste

- [x] Optik wie Multisim: Pfeil/Triangle + Label-Box, farbcodiert V=gelb (#fbbf24), I=blau (#22d3ee), V·A orange (#f59e0b), W=violett (#a78bfa), REF=grau (#94a3b8), D=grün (#4ade80), Diff pink (#f472b6)
- [x] Voltage misst gegen GND oder selektierte REF-Probe (Dropdown, ref Feld kann Probe-ID oder Net Name sein, Berechnung V-Vref)
- [x] Current hat Richtungspfeil reversierbar (direction 0/1, ContextMenu + Inspector Checkbox, negiert I)
- [x] Power = V*I (mit REF berücksichtigt)
- [x] Digital zeigt 1/0/X mit Schwellen (low 0.8 high 2.0 konfigurierbar, farbiger Dot)
- [x] Differential = V+ - Vref automatisch (ΔV, gestrichelte Linie zu REF)
- [x] Measurement Probe zeigt konfigurierbare Parameter (ProbeShow Mask) + periodic Toggle (RMS, P-P, Avg, Freq via engine.channel)
- [x] Mindestens 1 Probe Hinweis (Inspector Box + Log)
- [x] Auto-Add zu Transient/AC Grapher Output (editor legacy probes + AnalysisDialog suggestedOutputs)
- [x] Probe Settings global + lokal (global counts in Sim Tab, lokal in Inspector)
- [x] Docking an Wire/Net (nearestNetName 24px, auto-assign in add + refreshNets, net Tracking)
- [x] Build+tsc grün (npm run build success, tsc --noEmit 0 errors)

## 5. Noch offen / Future

- x2/y2 für Diff zweiten Ankerpunkt visuell dragbar
- Current History für echte Irms/Ipp statt Approximation (RingBuffer für I)
- Power History für Prms
- Digital Grapher separater Bereich (wie Multisim digital vs analog)
- Probe Settings globaler Dialog mit Defaults für neue Probes
- Export Probes in SPICE .probe Anweisung

## 6. Testing

- `npm run build` ✓
- `npx tsc --noEmit` ✓
- Manuell: Probe platzieren → Inspector öffnet, Farbe/REF/Richtung ändern, Live Werte, Periodic an → Vrms/Vpp/Freq erscheinen, ContextMenu Reverse, REF-Link Linie sichtbar.

