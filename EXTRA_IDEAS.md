# Extra Ideen – Festgehalten für spätere Durchläufe

User hat gesagt: "Halte die extra ideen fest in einer datei. Konzentriere dich in diesem Durchlauf auf den Kern."

## Library Extra
- Probe Gruppen (Power Supply Gruppe)
- Auto Farben bei vielen Probes aus Palette (8 Farben)
- Drag & Drop aus Library direkt auf Canvas (mit Ghost Preview)
- Recent Search History + Autocomplete Chips
- Breadcrumb Navigation
- Grid/List Toggle mit Animation
- User kann eigenen Datasheet Link hinzufügen (localStorage)
- Related Parts Vorschlag
- Virtualisierung mit react-window für Performance

## Responsive Extra
- Shake to Undo (Mobile)
- 2-Finger Tap Undo
- Pinch to Fit View
- On-Screen Joystick für Einhand-Bedienung (Portrait)
- Haptic Feedback bei Aktionen (vibrate)
- Device Pixel Ratio Begrenzung auf 2 für Mobile Performance
- Dvh statt vh für Browser UI
- Bottom Sheet mit Drag Handle und Swipe Down Close

## Probes Extra
- Probe Gruppen (z.B. Power Supply Gruppe mit V und I) – eigene Farbe, ein-/ausblendbar
- Probe Farben Auto aus Palette
- Probe Mini-Graph Sparkline (20x10) der letzten 1s in Probe Box
- Alt Hover mit Mini-Oszilloskop (50x30) statt nur Text
- Probe Snap to Grid + Pins
- Probe Export aller Werte als CSV (bereits in ProbeTable implementiert, aber auch als Button in Canvas)
- Probe Anchor Drag Handle separat (Body vs Anchor)
- Probe Table Sortierbar, Filter, Export
- Probe Table als Floating Window Option
- Probe Leader Stil Konfigurierbar (arrow/line/magnifier)
- Settings Page für Probe Hover Konfiguration (bereits angelegt in settings.ts)

## Human Design Extra
- Kein Verschwinden bei leicht daneben: ContextMenu bleibt bis Esc/Outside, Bottom Sheet nur bei Swipe >100px
- Hit Targets min 44x44 auf Mobile
- Lesbarkeit: 14px base auf Mobile, tabular-nums
- Kein Flackern: Throttle, will-change, transform statt left/top
- Feedback: Pulse Ring bei Tap, Toast mit Undo
- Touch: Long Press 500ms für Context Menu
- Keyboard: "/" fokussiert Suche, Cmd+K Library, Esc schließt

## Settings Page (vom User gewünscht)
- Ort: Menü Ansicht → Einstellungen oder eigenes Dialog
- Inhalt:
  - Theme (bereits vorhanden)
  - Probe Hover Config: Checkboxes für V,I,P,Freq,NetName
  - Library: Grid vs List Default, Show Datasheet Links
  - Canvas: Show Grid, Snap, AutoRoute, Current Flow, Voltage Colors
  - Performance: SampleRate, Temperature
- Persistiert in localStorage
- Noch nicht implementiert – für nächsten Durchlauf

