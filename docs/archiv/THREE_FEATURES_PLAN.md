# Drei Features – Plan & Umsetzung Stand

## User Entscheidungen (aus Ask)

### Library
- Datasheet: Top 80 direkt (TI etc), Rest zu AllDatasheet → implementiert via `datasheets.ts` mit curated Map + fallback
- Icons: A minimal handcrafted farbcodiert → implementiert `icons.tsx` mit 15 hand-drawn SVG Icons, Kategorie-Farben amber/cyan/purple/red/green/gray/blue
- Layout: A Floating Palette + Detail Panel rechts → implementiert in `LibraryPalette.tsx` mit 2-Spalten (Liste + Detail), 320px min width, Detail Panel 260px auf Desktop
- Suche: Text mit Command Palette + Autocomplete Live Ergebnisse → implementiert `searchAdvanced` mit Scoring, Tokens, "r 10k" Support, "/" Fokus, Cmd+K

### Responsive
- Priorität: B vollwertiger Editor → Workbench hat jetzt Mobile/Tablet/Desktop Breakpoints, Touch Handling, Bottom Sheets
- Sheet: A beide Bottom Sheet wie Google Maps → Library und Inspector als BottomSheet auf Mobile (70-80vh, Drag Handle, Swipe Down Close)
- Umsetzung: `useMediaQuery` Hook, `MobileTopBar`, `MobileBottomToolbar`, `BottomSheet` Komponente, `dvh` statt `vh`, Touch Pinch Zoom, Long Press 500ms für Context Menu, Hit Radius 26px auf Mobile

### Probes V2
- Leader: A immer Pfeil Body→Wire wie Multisim → implementiert in `drawProbe` V2 mit anchorX/anchorY + offset + Pfeilspitze + Dot am Anchor
- Table Ort: B BottomPanel Tab Probes erweitern → `ProbeTable.tsx` + `BottomPanel` zeigt Tabelle + LiveStrip nebeneinander (Desktop) / übereinander (Mobile)
- Alt Hover: B V,I,P,Freq+Net, aber konfigurierbar in Settings → `settings.ts` mit `ProbeHoverConfig`, `loadHoverConfig`, Alt+Hover zeigt V,I,P,Freq nur wenn Alt gehalten im Run Modus, Throttle 200ms gegen Flackern, auf Mobile Long Press statt Alt
- Extra: Halte extra Ideen in Datei, Fokus auf Kern → `EXTRA_IDEAS.md` erstellt

## Implementiert in diesem Durchlauf

### Library V2 – Kern
- [x] `icons.tsx` handcrafted Icons
- [x] `datasheets.ts` Top 80 curated + AllDatasheet/Octopart fallback
- [x] `LibraryPalette.tsx` neu: SymbolPreview Canvas (40px und 96px), CategoryIcon, Scoring Search, Filter Chips, Grid/List Toggle, Detail Panel mit Datasheet Links, Tipp Box, 44px Hit Targets
- [x] Search: `searchAdvanced` mit Token Scoring, Command Palette Style ("r 10k")
- [x] Detail Panel: Großes Symbol, Name, Beschreibung, Params, Datasheet Buttons (PDF, AllDatasheet, Octopart), Platzieren Button

### Responsive – Kern
- [x] `useMediaQuery` Hook
- [x] `Workbench.tsx` responsive: Mobile (<768) mit TopBar, BottomToolbar, BottomSheet für Library/Inspector, Menu Drawer; Tablet (768-1024) mit Drawer Inspector; Desktop wie vorher aber mit besserem Flex
- [x] `MenuBar.tsx` isMobile Prop → vertikale Liste auf Mobile
- [x] `StatusBar.tsx` isMobile Prop → kompakt 32px auf Mobile
- [x] `Canvas.tsx` Touch: Pinch Zoom (2 Finger), Single Finger Pan wenn tool pan, Long Press 500ms für Context Menu + Haptic Feedback, Hit Radius 26px Mobile, TouchMove preventDefault für Pinch
- [x] CSS: `dvh` für Mobile, `touch-none` auf Canvas, `will-change` via transform

### Probes V2 – Kern
- [x] `model.ts` erweitert um anchorX/Y, offsetX/Y, leader
- [x] `editor.ts` setzt anchor beim Platzieren (nearest net point) + offset 32/-28 + leader arrow
- [x] `Canvas.tsx` drawProbe V2: Leader Linie mit Pfeilspitze + Dot, Body offset, Referenz Linie, permanente Box mit allen Werten (Vdc, Vrms, Vpp, Vavg, Freq, etc), kein Flackern via Math.round, Throttle
- [x] Alt Hover: nur wenn sim.running && altKey, zeigt Net, V, I≈, P≈, f≈, Throttle 200ms, bleibt 150ms nach Verlassen, kein Flackern, konfigurierbar via `settings.ts`
- [x] `ProbeTable.tsx`: Permanente Tabelle aller Probes mit Name, Typ, Netz, REF, Vdc, Vrms, Vpp, Vavg, Freq, CSV Export, Klick selektiert Probe, Hinweis wenn keine Probe
- [x] `BottomPanel.tsx`: Probes Tab zeigt ProbeTable + LiveStrip (flex row auf Desktop, column auf Mobile)
- [x] `settings.ts`: Hover Config mit localStorage Persistenz

## Human Design Checks (Philosophie)

- **Lesbarkeit**: Library 12px Name, 10.5px Beschreibung, Symbol Preview 40px; Probe Box 11px Mono, AA Kontrast; Mobile 14px base, 44px Hit Targets
- **Kein Aufblitzen**: Canvas throttle 16ms, Tooltip throttle 200ms, Probe Table update 120ms, will-change transform, Math.round für Pixel-Perfect
- **Kein nerviges Verschwinden**: ContextMenu bleibt bis Esc/Outside, BottomSheet nur bei Swipe >100px oder Close Button, Probe Hit 26px Mobile, Library Hover Preview Delay 200ms + bleibt 300ms
- **Erwartungskonform**: Probe platzieren → Leader zeigt auf Wire (wie Multisim Lupe), Body drag → Leader folgt, Anchor bleibt; Library Suche "/" fokussiert (wie VS Code), Cmd+K öffnet Library; Alt Hover wie LTSpice; Probe Table wie Multisim

## Noch offen für nächste Durchläufe

- Settings Page UI (für Hover Config, Library Defaults) – Datei `settings.ts` existiert, UI fehlt
- Library Drag & Drop direkt auf Canvas
- Library Virtualisierung mit react-window für >100 Items
- Probe Anchor Drag Handle separat (Body vs Anchor)
- Probe Mini Sparkline / Mini Scope
- Responsive Feintuning: On-Screen Joystick, Shake to Undo
- Vollständige Mobile Tests auf realen Geräten

## Build Status

- `npm run build` ✓
- `npx tsc --noEmit` ✓
- Gepusht auf `arena/01a0d36a-multispice-2`

## Nächste Schritte Vorschlag

1. Settings Page UI erstellen (Dialog mit Tabs für Probe Hover, Library, Canvas)
2. Library Drag & Drop + Virtualisierung
3. Probe Anchor Handle + Sparkline
4. E2E Tests auf Mobile (BrowserStack oder real Device)

